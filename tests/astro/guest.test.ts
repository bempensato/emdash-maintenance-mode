import { describe, expect, it, vi } from "vitest";

import { createAccessHandler } from "../../src/astro/access-handler";
import { createGate, type GateContext } from "../../src/astro/gate";
import {
	guestCookieHeader,
	hasValidGuestCookie,
	RateLimiter,
	readCookie,
	safeReturnPath,
	withoutGuestParams,
} from "../../src/astro/guest";
import type { LoadedState } from "../../src/astro/state";
import { bytesToBase64, hashPassword, randomBytes, sha256Hex } from "../../src/shared/crypto";
import { createDefaultRuntimeState, type RuntimeState } from "../../src/shared/state";

const options = { path: "/maintenance", accessPath: "/maintenance-access" };
const TOKEN = "preview-token-abcdefghijklmnopqrstuvwxyz0123456789";

async function guestState(patch: Partial<RuntimeState["guest"]> = {}): Promise<LoadedState> {
	const base = createDefaultRuntimeState(bytesToBase64(randomBytes(32)));
	return {
		pluginId: "maintenance-mode",
		duplicate: false,
		state: {
			...base,
			enabled: true,
			guest: { ...base.guest, linkTokenHash: await sha256Hex(TOKEN), ...patch },
		},
	};
}

function ctx(path: string, cookie?: string): GateContext {
	const url = new URL(path, "https://example.com");
	return {
		request: new Request(url, { headers: cookie ? { cookie } : {} }),
		url,
		locals: {},
	};
}

const next = vi.fn(async (rewrite?: string) => new Response(rewrite ? "maintenance" : "site"));

function cookiePair(setCookie: string): string {
	return setCookie.split(";")[0]!;
}

describe("guest helpers", () => {
	it("reads cookies", () => {
		expect(readCookie("a=1; mm_access=x.y; b=2", "mm_access")).toBe("x.y");
		expect(readCookie("mm_access_old=1", "mm_access")).toBeNull();
		expect(readCookie(null, "mm_access")).toBeNull();
	});

	it("builds the cookie attributes", async () => {
		const { state } = await guestState({ cookieMaxAgeDays: 7 });
		const secure = await guestCookieHeader(state.guest, new URL("https://example.com/"));
		expect(secure).toMatch(/^mm_access=[\w-]+\.[\w-]+; Secure; HttpOnly; SameSite=Lax; Path=\/; Max-Age=604800$/);
		const local = await guestCookieHeader(state.guest, new URL("http://localhost:4321/"));
		expect(local).not.toContain("Secure");
		const plainHttp = await guestCookieHeader(state.guest, new URL("http://example.com/"));
		expect(plainHttp).toContain("Secure");
	});

	it("keeps return paths on this site", () => {
		expect(safeReturnPath("/about?x=1")).toBe("/about?x=1");
		expect(safeReturnPath("/about?mm_error=1&mm_access=t")).toBe("/about");
		for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "about", "", 42, "/a\nb"]) {
			expect(safeReturnPath(bad), String(bad)).toBe("/");
		}
	});

	it("drops guest parameters", () => {
		expect(withoutGuestParams(new URL("https://x/p?a=1&mm_access=t#h"))).toBe("/p?a=1#h");
	});

	it("rate limits failures per client within a window", () => {
		const limiter = new RateLimiter(2, 1000, 3);
		limiter.recordFailure("a", 0);
		expect(limiter.isLimited("a", 1)).toBe(false);
		limiter.recordFailure("a", 2);
		expect(limiter.isLimited("a", 3)).toBe(true);
		expect(limiter.isLimited("b", 3)).toBe(false);
		expect(limiter.isLimited("a", 1000)).toBe(false);
		for (const k of ["c", "d", "e", "f"]) limiter.recordFailure(k, 5);
		limiter.reset("f");
		expect(limiter.isLimited("f", 6)).toBe(false);
	});
});

describe("gate with guest access", () => {
	it("trades a valid link token for a cookie and a clean redirect", async () => {
		const loaded = await guestState();
		const gate = createGate({ options, loadState: async () => loaded, hasValidPreview: () => false });
		const res = await gate(ctx(`/about?x=1&mm_access=${TOKEN}`), next);
		expect(res.status).toBe(302);
		expect(res.headers.get("Location")).toBe("/about?x=1");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
		const cookie = cookiePair(res.headers.get("Set-Cookie")!);

		const after = await gate(ctx("/about?x=1", cookie), next);
		expect(await after.text()).toBe("site");
	});

	it("ignores a wrong token or a disabled link", async () => {
		const loaded = await guestState();
		const gate = createGate({ options, loadState: async () => loaded, hasValidPreview: () => false });
		expect((await gate(ctx("/?mm_access=wrong"), next)).status).toBe(503);

		const disabled = await guestState({ linkTokenHash: null });
		const gate2 = createGate({ options, loadState: async () => disabled, hasValidPreview: () => false });
		expect((await gate2(ctx(`/?mm_access=${TOKEN}`), next)).status).toBe(503);
	});

	it("rejects expired, tampered and revoked cookies", async () => {
		const loaded = await guestState({ cookieMaxAgeDays: 1 });
		const header = await guestCookieHeader(loaded.state.guest, new URL("https://example.com/"), 0);
		const cookie = cookiePair(header).slice("mm_access=".length);
		expect(await hasValidGuestCookie(`mm_access=${cookie}`, loaded.state.guest, 1000)).toBe(true);
		expect(await hasValidGuestCookie(`mm_access=${cookie}`, loaded.state.guest, 86_400_000)).toBe(false);
		expect(await hasValidGuestCookie(`mm_access=${cookie}x`, loaded.state.guest, 1000)).toBe(false);
		const revoked = { ...loaded.state.guest, cookieVersion: loaded.state.guest.cookieVersion + 1 };
		expect(await hasValidGuestCookie(`mm_access=${cookie}`, revoked, 1000)).toBe(false);
		const rotated = { ...loaded.state.guest, cookieSecretB64: bytesToBase64(randomBytes(32)) };
		expect(await hasValidGuestCookie(`mm_access=${cookie}`, rotated, 1000)).toBe(false);
	});

	it("keeps the requested URL for the password form", async () => {
		const loaded = await guestState();
		const gate = createGate({ options, loadState: async () => loaded, hasValidPreview: () => false });
		const context = ctx("/shop?item=2");
		await gate(context, next);
		expect((context.locals as Record<string, unknown>).emdashMaintenanceModeUrl).toBe("https://example.com/shop?item=2");
	});
});

describe("password endpoint", () => {
	async function setup(patch: Partial<RuntimeState["guest"]> = {}, enabled = true) {
		const password = await hashPassword("open sesame", 1000);
		const loaded = await guestState({ password, ...patch });
		loaded.state.enabled = enabled;
		const handler = createAccessHandler({ loadState: async () => loaded, limiter: new RateLimiter(3, 60_000) });
		const post = (fields: Record<string, string>, clientKey = "1.2.3.4") =>
			handler({
				request: new Request("https://example.com/maintenance-access", { method: "POST", body: new URLSearchParams(fields) }),
				url: new URL("https://example.com/maintenance-access"),
				clientKey,
			});
		return { post, loaded };
	}

	it("sets the cookie and returns on the right password", async () => {
		const { post, loaded } = await setup();
		const res = await post({ password: "open sesame", return: "/about?x=1" });
		expect(res.status).toBe(303);
		expect(res.headers.get("Location")).toBe("/about?x=1");
		const cookie = cookiePair(res.headers.get("Set-Cookie")!);
		expect(await hasValidGuestCookie(cookie, loaded.state.guest)).toBe(true);
	});

	it("returns with an error on a wrong password", async () => {
		const { post } = await setup();
		const res = await post({ password: "nope", return: "/about" });
		expect(res.headers.get("Location")).toBe("/about?mm_error=1");
		expect(res.headers.get("Set-Cookie")).toBeNull();
	});

	it("never redirects off-site", async () => {
		const { post } = await setup();
		const res = await post({ password: "open sesame", return: "https://evil.com/" });
		expect(res.headers.get("Location")).toBe("/");
	});

	it("blocks a client after repeated failures, even with the right password", async () => {
		const { post } = await setup();
		for (let i = 0; i < 3; i++) await post({ password: "nope", return: "/" });
		const res = await post({ password: "open sesame", return: "/" });
		expect(res.headers.get("Set-Cookie")).toBeNull();
		expect(res.headers.get("Location")).toBe("/?mm_error=1");
		const other = await post({ password: "open sesame", return: "/" }, "5.6.7.8");
		expect(other.headers.get("Set-Cookie")).not.toBeNull();
	});

	it("does nothing without a password or while disabled", async () => {
		for (const { post } of [await setup({ password: null }), await setup({}, false)]) {
			const res = await post({ password: "open sesame", return: "/x" });
			expect(res.headers.get("Location")).toBe("/x");
			expect(res.headers.get("Set-Cookie")).toBeNull();
		}
	});

	it("rejects oversized passwords and bad bodies", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { post } = await setup();
		expect((await post({ password: "x".repeat(300), return: "/" })).headers.get("Set-Cookie")).toBeNull();
		const password = await hashPassword("pw", 1000);
		const loaded = await guestState({ password });
		const handler = createAccessHandler({ loadState: async () => loaded });
		const res = await handler({
			request: new Request("https://example.com/a", { method: "POST", body: "{", headers: { "content-type": "application/json" } }),
			url: new URL("https://example.com/a"),
			clientKey: "x",
		});
		expect(res.status).toBe(303);
		expect(res.headers.get("Set-Cookie")).toBeNull();
	});
});
