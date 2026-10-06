import { afterEach, describe, expect, it } from "vitest";

import {
	createPluginRuntimeTestHost,
	createPluginTestHost,
	type PluginRuntimeTestHost,
	type PluginTestHost,
} from "@emdash-cms/plugin-test";

import { encodePage } from "../src/plugin/admin";
import { PACKAGE_VERSION } from "../src/shared/keys";
import { parseRuntimeState, type RuntimeState } from "../src/shared/state";

let host: PluginRuntimeTestHost | undefined;
let transportHost: PluginTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	await transportHost?.dispose();
	host = undefined;
	transportHost = undefined;
});

const PAGE = "/settings";

async function setup(): Promise<PluginRuntimeTestHost> {
	host = await createPluginRuntimeTestHost({ site: { url: "https://example.com", name: "Example" } });
	await host.actions.plugin.activate();
	return host;
}

async function runtime(h: PluginRuntimeTestHost): Promise<RuntimeState> {
	const state = parseRuntimeState(await h.inspect.setting("runtime"));
	if (!state) throw new Error("runtime setting missing or invalid");
	return state;
}

function texts(blocks: unknown): string {
	return JSON.stringify(blocks);
}

async function seedPages(h: PluginRuntimeTestHost) {
	await h.fixtures.collection({
		slug: "pages",
		label: "Pages",
		fields: [{ slug: "title", label: "Title", type: "string" }],
	});
	await h.fixtures.content("pages", { slug: "coming-soon", status: "published", data: { title: "Coming soon" } });
	await h.fixtures.content("pages", { slug: "draft-page", status: "draft", data: { title: "Draft" } });
}

describe("maintenance-mode plugin", () => {
	it("declares the trust contract", async () => {
		transportHost = await createPluginTestHost();
		expect(transportHost.manifest.capabilities).toEqual(
			expect.arrayContaining(["content:read", "schema:read", "network:request"]),
		);
		expect(transportHost.manifest.allowedHosts).toEqual(["api.lemonsqueezy.com"]);
	});

	it("writes a disabled default state on activation", async () => {
		const h = await setup();
		const state = await runtime(h);
		expect(state).toMatchObject({
			enabled: false,
			mode: "coming-soon",
			page: null,
			bypassMinRole: 40,
			guest: { linkTokenHash: null, password: null, cookieVersion: 1 },
			badge: { hidden: false },
		});
		expect(state.guest.cookieSecretB64.length).toBeGreaterThanOrEqual(43);
	});

	it("keeps the existing state when activated again", async () => {
		const h = await setup();
		const first = await runtime(h);
		await h.actions.plugin.deactivate();
		await h.actions.plugin.activate();
		expect((await runtime(h)).guest.cookieSecretB64).toBe(first.guest.cookieSecretB64);
	});

	it("renders the admin page", async () => {
		const h = await setup();
		const page = await h.admin.loadPage(PAGE);
		const json = texts(page.blocks);
		expect(json).toContain("Maintenance Mode & Coming Soon");
		expect(json).toContain("Your site is public");
		expect(json).toContain('"action_id":"enable"');
		expect(json).toContain('"action_id":"save_settings"');
		expect(json).toContain("Step 2: install the companion");
		expect(json).toContain("maintenanceModePlugin");
	});

	// EmDash 1.1 has no Italian admin locale yet, so the host never attests
	// `it`; the transport host lets the test set the UI context directly.
	it("renders in Italian for an Italian admin", async () => {
		transportHost = await createPluginTestHost();
		const page = await transportHost.invokeRoute(
			"admin",
			{ type: "page_load", page: PAGE },
			{ ui: { locale: "it-IT", direction: "ltr", surface: "admin-page" } },
		);
		expect(texts(page)).toContain("Il sito è pubblico");
	});

	it("turns maintenance mode on and off", async () => {
		const h = await setup();
		const on = await h.admin.act(PAGE, "enable");
		expect(on.toast?.type).toBe("success");
		expect(texts(on.blocks)).toContain("Your site is hidden");
		expect((await runtime(h)).enabled).toBe(true);

		await h.admin.act(PAGE, "disable");
		expect((await runtime(h)).enabled).toBe(false);
	});

	it("bumps updatedAt on every change", async () => {
		const h = await setup();
		const before = await runtime(h);
		await new Promise((r) => setTimeout(r, 5));
		await h.admin.act(PAGE, "enable");
		expect(Date.parse((await runtime(h)).updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt));
	});

	it("lists published entries and saves the settings", async () => {
		const h = await setup();
		await seedPages(h);
		const page = await h.admin.loadPage(PAGE);
		const json = texts(page.blocks);
		expect(json).toContain("Pages — Coming soon");
		expect(json).not.toContain("Draft");

		const saved = await h.admin.submit(PAGE, "save_settings", {
			mode: "maintenance",
			page: encodePage({ collection: "pages", slug: "coming-soon" }),
			bypass: "50",
		});
		expect(saved.toast).toEqual({ type: "success", message: "Settings saved" });
		expect(await runtime(h)).toMatchObject({
			mode: "maintenance",
			page: { collection: "pages", slug: "coming-soon" },
			bypassMinRole: 50,
		});
	});

	it("clears the page with the built-in message option", async () => {
		const h = await setup();
		await seedPages(h);
		await h.admin.submit(PAGE, "save_settings", {
			mode: "coming-soon",
			page: encodePage({ collection: "pages", slug: "coming-soon" }),
			bypass: "40",
		});
		await h.admin.submit(PAGE, "save_settings", { mode: "coming-soon", page: "", bypass: "20" });
		expect(await runtime(h)).toMatchObject({ page: null, bypassMinRole: 20 });
	});

	it("rejects unknown pages and invalid values", async () => {
		const h = await setup();
		await seedPages(h);
		const before = await runtime(h);
		for (const values of [
			{ mode: "coming-soon", page: encodePage({ collection: "pages", slug: "draft-page" }), bypass: "40" },
			{ mode: "coming-soon", page: encodePage({ collection: "secrets", slug: "x" }), bypass: "40" },
			{ mode: "coming-soon", page: "not json", bypass: "40" },
			{ mode: "party", page: "", bypass: "40" },
			{ mode: "coming-soon", page: "", bypass: "10" },
		]) {
			const res = await h.admin.submit(PAGE, "save_settings", values);
			expect(res.toast?.type, JSON.stringify(values)).toBe("error");
		}
		expect((await runtime(h)).updatedAt).toBe(before.updatedAt);
	});

	it("shows the companion status", async () => {
		const h = await setup();
		await h.fixtures.plugin.setting("companion", {
			version: PACKAGE_VERSION,
			seenAt: new Date().toISOString(),
			path: "/maintenance",
			duplicateInstall: false,
		});
		let json = texts((await h.admin.loadPage(PAGE)).blocks);
		expect(json).toContain(`Companion installed (version ${PACKAGE_VERSION})`);
		expect(json).toContain("https://example.com/maintenance");
		expect(json).not.toContain("Step 2");

		await h.fixtures.plugin.setting("companion", {
			version: "0.0.1",
			seenAt: new Date().toISOString(),
			path: "/maintenance",
			duplicateInstall: true,
		});
		json = texts((await h.admin.loadPage(PAGE)).blocks);
		expect(json).toContain("Update the companion");
		expect(json).toContain("Installed twice");
	});

	it("adds noindex only while the site is hidden", async () => {
		const h = await setup();
		const event = {
			page: {
				url: "https://example.com/",
				path: "/",
				locale: null,
				kind: "custom",
				pageType: "website",
				title: "Home",
				description: null,
				canonical: null,
				image: null,
			},
		};
		expect(await h.transport.invokeHook("page:metadata", event)).toBeFalsy();
		await h.admin.act(PAGE, "enable");
		expect(JSON.stringify(await h.transport.invokeHook("page:metadata", event))).toContain("noindex");
	});
});

describe("guest access admin", () => {
	it("creates, rotates and turns off the preview link", async () => {
		const h = await setup();
		await h.admin.act(PAGE, "link_enable");
		const token = await h.inspect.setting<string>("previewToken");
		expect(token).toMatch(/^[\w-]{43}$/);
		const first = await runtime(h);
		const { sha256Hex } = await import("../src/shared/crypto");
		expect(first.guest.linkTokenHash).toBe(await sha256Hex(token!));
		expect(texts((await h.admin.loadPage(PAGE)).blocks)).toContain(`https://example.com/?mm_access=${token}`);

		await h.admin.act(PAGE, "link_regenerate");
		const second = await runtime(h);
		expect(second.guest.linkTokenHash).not.toBe(first.guest.linkTokenHash);
		expect(await h.inspect.setting("previewToken")).not.toBe(token);

		await h.admin.act(PAGE, "link_disable");
		expect((await runtime(h)).guest.linkTokenHash).toBeNull();
		expect(await h.inspect.setting("previewToken")).toBeNull();
	});

	it("stores only a hash of the password", async () => {
		const h = await setup();
		const res = await h.admin.submit(PAGE, "set_password", { password: "open sesame" });
		expect(res.toast?.type).toBe("success");
		const state = await runtime(h);
		expect(state.guest.password).toMatchObject({ iterations: expect.any(Number) });
		const { verifyPassword } = await import("../src/shared/crypto");
		expect(await verifyPassword("open sesame", state.guest.password!)).toBe(true);
		expect(JSON.stringify(await h.inspect.settings.raw("runtime"))).not.toContain("open sesame");

		await h.admin.act(PAGE, "password_remove");
		expect((await runtime(h)).guest.password).toBeNull();
	});

	it("rejects too short passwords", async () => {
		const h = await setup();
		const res = await h.admin.submit(PAGE, "set_password", { password: "abc" });
		expect(res.toast?.type).toBe("error");
		expect((await runtime(h)).guest.password).toBeNull();
	});

	it("saves the cookie duration and revokes all guests", async () => {
		const h = await setup();
		await h.admin.submit(PAGE, "save_cookie_days", { days: 7 });
		expect((await runtime(h)).guest.cookieMaxAgeDays).toBe(7);
		expect((await h.admin.submit(PAGE, "save_cookie_days", { days: 0 })).toast?.type).toBe("error");
		expect((await h.admin.submit(PAGE, "save_cookie_days", { days: 400 })).toast?.type).toBe("error");

		const before = (await runtime(h)).guest.cookieVersion;
		await h.admin.act(PAGE, "revoke_all");
		expect((await runtime(h)).guest.cookieVersion).toBe(before + 1);
	});
});

describe("license (through the sandbox)", () => {
	it("stores the license key encrypted", async () => {
		// EmDash reads the encryption key from process.env (nodejs_compat).
		const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
		const { bytesToBase64Url, randomBytes } = await import("../src/shared/crypto");
		env.EMDASH_ENCRYPTION_KEY = `emdash_enc_v1_${bytesToBase64Url(randomBytes(32))}`;
		const h = await setup();
		const update = await h.actions.plugin.updateSettings({ licenseKey: "SECRET-KEY-123" });
		expect(update).toMatchObject({ success: true });
		const raw = await h.inspect.settings.raw("licenseKey");
		expect(raw).toBeTruthy();
		expect(JSON.stringify(raw)).not.toContain("SECRET-KEY-123");
	});

	it("shows the free status and makes no request without a key", async () => {
		const h = await setup();
		const json = texts((await h.admin.loadPage(PAGE)).blocks);
		expect(json).toContain("Free version");
		expect(json).toContain('"action_id":"license_activate"');
		expect(json).not.toContain("badge_hide");
		expect(h.http.requests()).toHaveLength(0);
	});

	it("activates only against api.lemonsqueezy.com and rejects keys of other products", async () => {
		const h = await setup();
		await h.http.respond(
			"https://api.lemonsqueezy.com/v1/licenses/activate",
			new Response(
				JSON.stringify({
					activated: true,
					error: null,
					license_key: { status: "active", expires_at: null, activation_limit: 1, activation_usage: 1 },
					instance: { id: "inst-1", name: "example.com" },
					meta: { store_id: 1, product_id: 2, variant_id: 3 },
				}),
				{ headers: { "content-type": "application/json" } },
			),
		);
		await h.http.respond(
			"https://api.lemonsqueezy.com/v1/licenses/deactivate",
			new Response(JSON.stringify({ deactivated: true, error: null }), { headers: { "content-type": "application/json" } }),
		);
		const res = await h.admin.submit(PAGE, "license_activate", { license_key: "SOME-KEY" });
		expect(res.toast?.type).toBe("error");
		expect(res.toast?.message).toContain("not for this plugin");
		const requests = h.http.requests();
		expect(requests.map((r) => r.url)).toEqual([
			"https://api.lemonsqueezy.com/v1/licenses/activate",
			"https://api.lemonsqueezy.com/v1/licenses/deactivate",
		]);
		const body = new URLSearchParams(new TextDecoder().decode(requests[0]!.body));
		expect(body.get("license_key")).toBe("SOME-KEY");
		expect(body.get("instance_name")).toBe("example.com");
		expect((await runtime(h)).badge.hidden).toBe(false);
		expect(await h.inspect.setting("license")).toBeNull();
	});

	it("reports an unreachable Lemon Squeezy without changing anything", async () => {
		const h = await setup();
		await h.http.respond("https://api.lemonsqueezy.com/v1/licenses/activate", new Response("down", { status: 503 }));
		const res = await h.admin.submit(PAGE, "license_activate", { license_key: "SOME-KEY" });
		expect(res.toast).toEqual({ type: "error", message: "Lemon Squeezy could not be reached. Try again in a few minutes." });
		expect((await runtime(h)).badge.hidden).toBe(false);
	});

	it("refuses to hide the badge without a license", async () => {
		const h = await setup();
		const res = await h.admin.act(PAGE, "badge_hide");
		expect(res.toast?.type).toBe("error");
		expect((await runtime(h)).badge.hidden).toBe(false);
	});

	it("schedules the daily license check", async () => {
		const h = await setup();
		const tasks = await h.inspect.scheduledTasks();
		expect(JSON.stringify(tasks)).toContain("license-validate");
	});
});
