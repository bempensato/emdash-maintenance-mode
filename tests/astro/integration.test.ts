import { describe, expect, it, vi } from "vitest";

import maintenanceMode from "../../src/astro/index";

type Setup = (params: Record<string, unknown>) => void;

function runSetup(integration: ReturnType<typeof maintenanceMode>, output = "server") {
	const injectRoute = vi.fn();
	const addMiddleware = vi.fn();
	const updateConfig = vi.fn();
	const setup = integration.hooks["astro:config:setup"] as unknown as Setup;
	setup({
		config: { output, root: new URL("file:///site/") },
		injectRoute,
		addMiddleware,
		updateConfig,
	});
	const plugin = updateConfig.mock.calls[0]![0].vite.plugins[0];
	return { injectRoute, addMiddleware, plugin };
}

describe("integration", () => {
	it("injects the page and a post-order middleware", () => {
		const { injectRoute, addMiddleware } = runSetup(maintenanceMode());
		expect(injectRoute).toHaveBeenCalledWith(
			expect.objectContaining({ pattern: "/maintenance", prerender: false }),
		);
		expect(String(injectRoute.mock.calls[0]![0].entrypoint)).toMatch(/MaintenancePage\.astro$/);
		expect(addMiddleware).toHaveBeenCalledWith(expect.objectContaining({ order: "post" }));
		expect(String(addMiddleware.mock.calls[0]![0].entrypoint)).toMatch(/middleware\.ts$/);
	});

	it("exposes options and the layout through a virtual module", () => {
		const { plugin } = runSetup(maintenanceMode({ path: "/coming-soon/", layout: "./src/layouts/Base.astro" }));
		const resolved = plugin.resolveId("virtual:emdash-maintenance-mode/config");
		const code = plugin.load(resolved) as string;
		expect(code).toContain('"path":"/coming-soon"');
		expect(code).toContain('"accessPath":"/maintenance-access"');
		expect(code).toContain('from "virtual:emdash-maintenance-mode/layout"');
		expect(plugin.resolveId("virtual:emdash-maintenance-mode/layout")).toBe("/site/src/layouts/Base.astro");
		expect(plugin.resolveId("other")).toBeUndefined();
	});

	it("defaults to the built-in layout", () => {
		const { plugin } = runSetup(maintenanceMode());
		expect(plugin.resolveId("virtual:emdash-maintenance-mode/layout")).toMatch(/DefaultLayout\.astro$/);
	});

	it("requires server output", () => {
		expect(() => runSetup(maintenanceMode(), "static")).toThrow(/output: "server"/);
	});

	it("rejects bad paths", () => {
		for (const path of ["maintenance", "/", "//evil", "/a?b", "/a b"]) {
			expect(() => maintenanceMode({ path }), path).toThrow();
		}
		expect(() => maintenanceMode({ path: "/x", accessPath: "/x/" })).toThrow(/differ/);
	});
});
