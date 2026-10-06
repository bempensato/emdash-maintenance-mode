import { describe, expect, it, vi } from "vitest";

import { createGate, isAlwaysAllowedPath, type GateContext } from "../../src/astro/gate";
import type { LoadedState } from "../../src/astro/state";
import { createDefaultRuntimeState, type RuntimeState } from "../../src/shared/state";

const options = { path: "/maintenance", accessPath: "/maintenance-access" };

function stateWith(patch: Partial<RuntimeState> = {}): LoadedState {
	return { pluginId: "maintenance-mode", duplicate: false, state: { ...createDefaultRuntimeState("c2VjcmV0"), enabled: true, ...patch } };
}

function ctx(path: string, init: { method?: string; role?: number } = {}): GateContext & { cacheSet: ReturnType<typeof vi.fn> } {
	const url = new URL(path, "https://example.com");
	const cacheSet = vi.fn();
	return {
		request: new Request(url, { method: init.method ?? "GET" }),
		url,
		locals: { user: init.role === undefined ? undefined : { role: init.role } },
		cache: { enabled: true, set: cacheSet },
		cacheSet,
	};
}

function fakeNext(page = new Response("<h1>maintenance</h1>", { headers: { "content-type": "text/html" } })) {
	return vi.fn(async (rewrite?: string) =>
		rewrite ? page.clone() : new Response("real site", { headers: { "content-type": "text/html" } }),
	);
}

function gateFor(loaded: LoadedState | null | Error, extra: { preview?: boolean } = {}) {
	const gate = createGate({
		options,
		loadState: async () => {
			if (loaded instanceof Error) throw loaded;
			return loaded;
		},
		hasValidPreview: () => extra.preview ?? false,
	});
	return { gate };
}

describe("allowlist", () => {
	it("never gates assets, EmDash and the companion's routes", () => {
		for (const p of [
			"/_emdash/admin",
			"/_emdash/api/x",
			"/_astro/a.js",
			"/_image",
			"/_image?href=x",
			"/_server-islands/x",
			"/.well-known/security.txt",
			"/favicon.ico",
			"/favicon.svg",
			"/robots.txt",
			"/sitemap.xml",
			"/files/doc.pdf",
			"/maintenance",
			"/maintenance/",
			"/maintenance-access",
		]) {
			expect(isAlwaysAllowedPath(new URL(p, "https://x").pathname, options), p).toBe(true);
		}
	});

	it("gates pages", () => {
		for (const p of ["/", "/about", "/posts/hello", "/maintenance-other", "/v1.2/"]) {
			expect(isAlwaysAllowedPath(p, options), p).toBe(false);
		}
	});
});

describe("gate", () => {
	it("serves the maintenance page with 503 to anonymous visitors", async () => {
		const { gate } = gateFor(stateWith({ retryAfterSeconds: 120 }));
		const next = fakeNext();
		const context = ctx("/about");
		const res = await gate(context, next);
		expect(next).toHaveBeenCalledWith("/maintenance");
		expect(res.status).toBe(503);
		expect(res.headers.get("Retry-After")).toBe("120");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
		expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
		expect(res.headers.get("content-type")).toBe("text/html");
		expect(await res.text()).toBe("<h1>maintenance</h1>");
		expect(context.cacheSet).toHaveBeenCalledWith(false);
	});

	it("serves HEAD like GET", async () => {
		const { gate } = gateFor(stateWith());
		expect((await gate(ctx("/", { method: "HEAD" }), fakeNext())).status).toBe(503);
	});

	it("lets other methods through", async () => {
		const { gate } = gateFor(stateWith());
		for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
			const next = fakeNext();
			const res = await gate(ctx("/form", { method }), next);
			expect(res.status).toBe(200);
			expect(next).toHaveBeenCalledWith();
		}
	});

	it("passes when disabled, missing or unreadable", async () => {
		for (const loaded of [stateWith({ enabled: false }), null]) {
			const { gate } = gateFor(loaded);
			const context = ctx("/");
			expect(await (await gate(context, fakeNext())).text()).toBe("real site");
			expect(context.cacheSet).not.toHaveBeenCalled();
		}
	});

	it("fails open when reading state throws", async () => {
		const { gate } = gateFor(new Error("D1 down"));
		vi.spyOn(console, "error").mockImplementation(() => {});
		const res = await gate(ctx("/"), fakeNext());
		expect(await res.text()).toBe("real site");
	});

	it("fails open when the maintenance route is missing or broken", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		for (const status of [404, 500]) {
			const { gate } = gateFor(stateWith());
			const next = fakeNext(new Response("x", { status }));
			const res = await gate(ctx("/"), next);
			expect(res.status).toBe(200);
			expect(await res.text()).toBe("real site");
		}
	});

	it("fails open when rendering the maintenance page throws", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		const { gate } = gateFor(stateWith());
		const next = vi.fn(async (rewrite?: string) => {
			if (rewrite) throw new Error("render failed");
			return new Response("real site");
		});
		expect(await (await gate(ctx("/"), next)).text()).toBe("real site");
	});

	it("applies the role threshold", async () => {
		const cases: Array<[20 | 40 | 50, number | undefined, number]> = [
			[40, undefined, 503],
			[40, 10, 503],
			[40, 30, 503],
			[40, 40, 200],
			[40, 50, 200],
			[50, 40, 503],
			[50, 50, 200],
			[20, 10, 503],
			[20, 20, 200],
		];
		for (const [bypassMinRole, role, status] of cases) {
			const { gate } = gateFor(stateWith({ bypassMinRole }));
			const res = await gate(ctx("/", { role }), fakeNext());
			expect(res.status, `min ${bypassMinRole}, role ${role}`).toBe(status);
		}
	});

	it("opts bypassed responses out of the route cache", async () => {
		const { gate } = gateFor(stateWith());
		const context = ctx("/", { role: 50 });
		await gate(context, fakeNext());
		expect(context.cacheSet).toHaveBeenCalledWith(false);
	});

	it("lets a valid preview token through, not a made-up one", async () => {
		expect((await gateFor(stateWith(), { preview: true }).gate(ctx("/?_preview=tok"), fakeNext())).status).toBe(200);
		expect((await gateFor(stateWith(), { preview: false }).gate(ctx("/?_preview=tok"), fakeNext())).status).toBe(503);
		expect((await gateFor(stateWith(), { preview: true }).gate(ctx("/"), fakeNext())).status).toBe(503);
	});

	it("lets `_edit` through only for editors", async () => {
		const state = stateWith({ bypassMinRole: 50 });
		expect((await gateFor(state).gate(ctx("/?_edit=1"), fakeNext())).status).toBe(503);
		expect((await gateFor(state).gate(ctx("/?_edit=1", { role: 20 }), fakeNext())).status).toBe(503);
		expect((await gateFor(state).gate(ctx("/?_edit=1", { role: 40 }), fakeNext())).status).toBe(200);
	});

	it("does not load state for allowlisted paths", async () => {
		const loadState = vi.fn(async () => stateWith());
		const gate = createGate({ options, loadState, hasValidPreview: () => false });
		await gate(ctx("/_astro/x.js"), fakeNext());
		expect(loadState).not.toHaveBeenCalled();
	});
});
