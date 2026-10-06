import { describe, expect, it } from "vitest";

import { activate, activateHere, deactivate, readLicense, setBadgeHidden, validate, validateIfStale } from "../../src/plugin/license";
import { ensureRuntime, readRuntime } from "../../src/plugin/store";
import { shouldShowBadge } from "../../src/shared/license";
import { createFakeCtx, json, lsBody, PRODUCT } from "./fake-ctx";

const T0 = new Date("2026-06-01T00:00:00Z");
const at = (days: number) => new Date(T0.getTime() + days * 86_400_000);
const deps = (now: Date) => ({ product: PRODUCT, now: () => now });

async function activated(term: "annual" | "lifetime" = "annual") {
	const f = createFakeCtx({
		respond: () =>
			json(
				lsBody(
					{ activated: true },
					{ expires_at: term === "annual" ? "2027-01-01T00:00:00.000Z" : null },
					{ variant_id: term === "annual" ? 101 : 102 },
				),
			),
	});
	await ensureRuntime(f.ctx);
	const result = await activate(f.ctx, " KEY ", "example.com", deps(T0));
	expect(result).toEqual({ ok: true });
	return f;
}

async function badge(f: ReturnType<typeof createFakeCtx>) {
	return (await readRuntime(f.ctx))!.badge;
}

describe("license service", () => {
	it("activation stores the record, the key and hides the badge", async () => {
		const f = await activated();
		const record = await readLicense(f.ctx);
		expect(record).toMatchObject({ instanceId: "inst-1", instanceName: "example.com", valid: true, sites: 1, term: "annual" });
		expect(JSON.stringify(record)).not.toContain("KEY");
		expect(await f.ctx.settings.get("licenseKey")).toBe("KEY");
		expect(await badge(f)).toMatchObject({ hidden: true, licenseExpiresAt: "2027-01-01T00:00:00.000Z", devOnly: false });
	});

	it("rejections change nothing", async () => {
		const f = createFakeCtx({ respond: () => json({ activated: false, error: "license_key not found." }, 404) });
		await ensureRuntime(f.ctx);
		expect(await activate(f.ctx, "KEY", "example.com", deps(T0))).toMatchObject({ ok: false, error: "rejected", detail: "license_key not found." });
		expect(await readLicense(f.ctx)).toBeNull();
		expect(await f.ctx.settings.get("licenseKey")).toBeNull();
		expect((await badge(f)).hidden).toBe(false);
		expect(await activate(f.ctx, "  ", "example.com", deps(T0))).toMatchObject({ error: "empty-key" });
		expect(await activate(f.ctx, "KEY", null, deps(T0))).toMatchObject({ error: "no-host" });
	});

	it("a valid check keeps the badge hidden and refreshes the expiry", async () => {
		const f = await activated();
		f.respond(() => json(lsBody({ valid: true }, { expires_at: "2028-01-01T00:00:00.000Z" })));
		await validate(f.ctx, "example.com", deps(at(30)));
		expect(await badge(f)).toMatchObject({ hidden: true, licenseExpiresAt: "2028-01-01T00:00:00.000Z", graceUntil: null });
	});

	it("an expired or disabled license brings the badge back", async () => {
		for (const status of ["expired", "disabled"]) {
			const f = await activated();
			f.respond(() => json(lsBody({ valid: false, error: status }, { status }), 400));
			const record = await validate(f.ctx, "example.com", deps(at(1)));
			expect(record).toMatchObject({ valid: false, problem: status });
			expect((await badge(f)).hidden).toBe(false);
		}
	});

	it("the badge returns after expiry even if no check ever runs", async () => {
		const f = await activated();
		const b = await badge(f);
		expect(shouldShowBadge(b, new Date("2026-12-31T00:00:00Z"))).toBe(false);
		expect(shouldShowBadge(b, new Date("2027-01-02T00:00:00Z"))).toBe(true);
	});

	it("an outage under 7 days changes nothing; after 7 days a lifetime badge returns", async () => {
		const f = await activated("lifetime");
		f.respond(() => {
			throw new Error("offline");
		});
		const record = await validate(f.ctx, "example.com", deps(at(3)));
		expect(record).toMatchObject({ valid: true, unreachable: true });
		const b = await badge(f);
		expect(b.graceUntil).toBe(at(7).toISOString());
		expect(shouldShowBadge(b, at(6))).toBe(false);
		expect(shouldShowBadge(b, at(8))).toBe(true);

		f.respond(() => json(lsBody({ valid: true }, { expires_at: null }, { variant_id: 102 })));
		await validate(f.ctx, "example.com", deps(at(9)));
		const back = await badge(f);
		expect(back).toMatchObject({ hidden: true, licenseExpiresAt: null, graceUntil: null });
		expect(shouldShowBadge(back, at(100))).toBe(false);
	});

	it("an outage does not cut an annual license short", async () => {
		const f = await activated("annual");
		f.respond(() => new Response("down", { status: 502 }));
		await validate(f.ctx, "example.com", deps(at(20)));
		expect(shouldShowBadge(await badge(f), at(100))).toBe(false);
		expect(shouldShowBadge(await badge(f), new Date("2027-01-02T00:00:00Z"))).toBe(true);
	});

	it("binds the license to the activated domain", async () => {
		const f = await activated();
		const record = await validate(f.ctx, "copy.example.org", deps(at(1)));
		expect(record).toMatchObject({ valid: false, problem: "wrong-host" });
		expect((await badge(f)).hidden).toBe(false);
		expect(await setBadgeHidden(f.ctx, true, "copy.example.org", deps(at(1)))).toMatchObject({ ok: false, error: "needs-license" });

		f.respond((call) =>
			call.url.endsWith("/deactivate")
				? json({ deactivated: true })
				: json(lsBody({ activated: true, instance: { id: "inst-2", name: "copy.example.org" } })),
		);
		expect(await activateHere(f.ctx, "copy.example.org", deps(at(1)))).toEqual({ ok: true });
		expect(f.calls.map((c) => c.url.split("/").pop())).toEqual(["activate", "deactivate", "activate"]);
		expect(await readLicense(f.ctx)).toMatchObject({ instanceId: "inst-2", instanceName: "copy.example.org", valid: true });
	});

	it("notices a key changed from the generated settings page", async () => {
		const f = await activated();
		await f.ctx.settings.set("licenseKey", "OTHER");
		expect(await validate(f.ctx, "example.com", deps(at(1)))).toMatchObject({ valid: false, problem: "key-changed" });
		expect((await badge(f)).hidden).toBe(false);
	});

	it("deactivation frees the slot and shows the badge", async () => {
		const f = await activated();
		f.respond(() => json({ deactivated: true }));
		expect(await deactivate(f.ctx)).toEqual({ ok: true });
		expect(await readLicense(f.ctx)).toBeNull();
		expect(await f.ctx.settings.get("licenseKey")).toBeNull();
		expect((await badge(f)).hidden).toBe(false);
		expect(new URLSearchParams(f.calls.at(-1)!.body).get("instance_id")).toBe("inst-1");
	});

	it("keeps everything when deactivation cannot reach Lemon Squeezy", async () => {
		const f = await activated();
		f.respond(() => {
			throw new Error("offline");
		});
		expect(await deactivate(f.ctx)).toMatchObject({ ok: false, error: "unreachable" });
		expect(await readLicense(f.ctx)).not.toBeNull();
	});

	it("lets the badge be hidden only with a license or on a dev host", async () => {
		const f = createFakeCtx();
		await ensureRuntime(f.ctx);
		expect(await setBadgeHidden(f.ctx, true, "example.com", deps(T0))).toMatchObject({ ok: false });
		expect(await setBadgeHidden(f.ctx, true, "localhost", deps(T0))).toEqual({ ok: true });
		const b = await badge(f);
		expect(b).toMatchObject({ hidden: true, devOnly: true });
		expect(shouldShowBadge(b, T0, "localhost")).toBe(false);
		expect(shouldShowBadge(b, T0, "example.com")).toBe(true);
		await setBadgeHidden(f.ctx, false, "localhost", deps(T0));
		expect((await badge(f)).hidden).toBe(false);
	});

	it("validates lazily at most once a day", async () => {
		const f = await activated();
		f.respond(() => json(lsBody({ valid: true })));
		const before = f.calls.length;
		await validateIfStale(f.ctx, "example.com", deps(at(0.5)));
		expect(f.calls.length).toBe(before);
		await validateIfStale(f.ctx, "example.com", deps(at(1.5)));
		expect(f.calls.length).toBe(before + 1);
	});

	it("does nothing without a license and makes no network call", async () => {
		const f = createFakeCtx();
		await ensureRuntime(f.ctx);
		expect(await validate(f.ctx, "example.com", deps(T0))).toBeNull();
		await validateIfStale(f.ctx, "example.com", deps(T0));
		expect(f.calls).toHaveLength(0);
	});
});
