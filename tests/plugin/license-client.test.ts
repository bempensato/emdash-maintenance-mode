import { describe, expect, it, vi } from "vitest";

import { activateLicense, deactivateLicense, LS_API_BASE, validateLicense, type LsFetch } from "../../src/plugin/license-client";
import { LEMON_SQUEEZY } from "../../src/shared/product";
import { json, lsBody, PRODUCT } from "./fake-ctx";

function fetchSeq(...responses: Array<Response | Error>) {
	const calls: Array<{ url: string; init: RequestInit }> = [];
	const fn: LsFetch = vi.fn(async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		const next = responses.shift();
		if (!next) throw new Error("unexpected call");
		if (next instanceof Error) throw next;
		return next;
	});
	return { fn, calls };
}

const activation = { instanceId: "inst-1", instanceName: "example.com" };

describe("activate", () => {
	it("activates a key for this product", async () => {
		const { fn, calls } = fetchSeq(json(lsBody({ activated: true })));
		const out = await activateLicense(fn, PRODUCT, "KEY", "example.com");
		expect(out).toEqual({
			kind: "activated",
			instanceId: "inst-1",
			status: "active",
			expiresAt: "2027-01-01T00:00:00.000000Z",
			variant: PRODUCT.variants[0],
		});
		expect(calls[0]!.url).toBe(`${LS_API_BASE}/activate`);
		expect(calls[0]!.init.method).toBe("POST");
		const headers = new Headers(calls[0]!.init.headers);
		expect(headers.get("accept")).toBe("application/json");
		expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
		expect(Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body)))).toEqual({
			license_key: "KEY",
			instance_name: "example.com",
		});
	});

	it("rejects and frees the activation of another product's key", async () => {
		for (const meta of [{ store_id: 99 }, { product_id: 99 }, { variant_id: 999 }]) {
			const { fn, calls } = fetchSeq(json(lsBody({ activated: true }, {}, meta)), json({ deactivated: true }));
			const out = await activateLicense(fn, PRODUCT, "KEY", "example.com");
			expect(out).toMatchObject({ kind: "rejected", reason: "wrong-product" });
			expect(calls[1]!.url).toBe(`${LS_API_BASE}/deactivate`);
			expect(new URLSearchParams(String(calls[1]!.init.body)).get("instance_id")).toBe("inst-1");
		}
	});

	it("rejects every key while the product ids are placeholders", async () => {
		const { fn } = fetchSeq(json(lsBody({ activated: true })), json({ deactivated: true }));
		expect(await activateLicense(fn, LEMON_SQUEEZY, "KEY", "example.com")).toMatchObject({ reason: "wrong-product" });
	});

	it("reports the activation limit, expiry and disabled keys", async () => {
		const limit = lsBody({ activated: false, error: "This license key has reached the activation limit.", instance: undefined }, { activation_limit: 5, activation_usage: 5 });
		expect(await activateLicense(fetchSeq(json(limit, 400)).fn, PRODUCT, "KEY", "x")).toMatchObject({
			kind: "rejected",
			reason: "limit",
			message: "This license key has reached the activation limit.",
		});
		const expired = lsBody({ activated: false, error: "expired", instance: undefined }, { status: "expired" });
		expect(await activateLicense(fetchSeq(json(expired, 400)).fn, PRODUCT, "KEY", "x")).toMatchObject({ reason: "expired" });
		const disabled = lsBody({ activated: false, error: "disabled", instance: undefined }, { status: "disabled", activation_usage: 0 });
		expect(await activateLicense(fetchSeq(json(disabled, 400)).fn, PRODUCT, "KEY", "x")).toMatchObject({ reason: "disabled" });
		expect(await activateLicense(fetchSeq(json({ error: "license_key not found." }, 404)).fn, PRODUCT, "KEY", "x")).toMatchObject({
			kind: "rejected",
			reason: "invalid",
		});
	});

	it("treats network failures, 429 and 5xx as unreachable", async () => {
		for (const r of [new Error("offline"), new Response("busy", { status: 429 }), new Response("down", { status: 503 }), new Response("<html>", { status: 200 })]) {
			expect((await activateLicense(fetchSeq(r).fn, PRODUCT, "KEY", "x")).kind).toBe("unreachable");
		}
	});
});

describe("validate", () => {
	it("accepts an active key for this product and instance", async () => {
		const { fn, calls } = fetchSeq(json(lsBody({ valid: true })));
		expect(await validateLicense(fn, PRODUCT, "KEY", activation, "example.com")).toMatchObject({ kind: "valid", status: "active" });
		expect(Object.fromEntries(new URLSearchParams(String(calls[0]!.init.body)))).toEqual({ license_key: "KEY", instance_id: "inst-1" });
	});

	it("binds the key to the activated domain without asking Lemon Squeezy", async () => {
		const { fn } = fetchSeq();
		expect(await validateLicense(fn, PRODUCT, "KEY", activation, "other.com")).toMatchObject({ kind: "invalid", reason: "wrong-host" });
		expect(fn).not.toHaveBeenCalled();
	});

	it("skips the domain check when the host is unknown (cron without a site URL)", async () => {
		expect((await validateLicense(fetchSeq(json(lsBody({ valid: true }))).fn, PRODUCT, "KEY", activation, null)).kind).toBe("valid");
	});

	it("reports expired, disabled, wrong product and wrong instance", async () => {
		const cases: Array<[Response, string]> = [
			[json(lsBody({ valid: false, error: "expired" }, { status: "expired" }), 400), "expired"],
			[json(lsBody({ valid: false, error: "disabled" }, { status: "disabled" }), 400), "disabled"],
			[json(lsBody({ valid: true }, {}, { product_id: 1 })), "wrong-product"],
			[json(lsBody({ valid: true, instance: { id: "other" } })), "wrong-instance"],
			[json(lsBody({ valid: true }, { status: "expired" })), "expired"],
			[json({ valid: false, error: "license_key not found." }, 404), "invalid"],
		];
		for (const [response, reason] of cases) {
			expect(await validateLicense(fetchSeq(response).fn, PRODUCT, "KEY", activation, "example.com"), reason).toMatchObject({ kind: "invalid", reason });
		}
	});

	it("treats outages as unreachable", async () => {
		expect((await validateLicense(fetchSeq(new Error("x")).fn, PRODUCT, "KEY", activation, "example.com")).kind).toBe("unreachable");
	});
});

describe("deactivate", () => {
	it("counts any answer as done", async () => {
		expect(await deactivateLicense(fetchSeq(json({ deactivated: true })).fn, "KEY", "inst-1")).toEqual({ kind: "done" });
		expect(await deactivateLicense(fetchSeq(json({ deactivated: false, error: "x" }, 404)).fn, "KEY", "inst-1")).toEqual({ kind: "done" });
		expect((await deactivateLicense(fetchSeq(new Error("x")).fn, "KEY", "inst-1")).kind).toBe("unreachable");
	});
});
