import { describe, expect, it } from "vitest";

import { addMaintenanceMode, findClosing, lineDiff, manualInstructions, mask } from "../../bin/config-transform.mjs";

// The official starter templates (emdash-cms/emdash templates/starter*).
const STARTER = `import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
		}),
	],
	devToolbar: { enabled: false },
});
`;

const CLOUDFLARE = `import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig } from "astro/config";
import emdash from "emdash/astro";

export default defineConfig({
	output: "server",
	adapter: cloudflare(),
	integrations: [
		react(),
		emdash({
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
		}),
	],
});
`;

describe("init transform", () => {
	it("adds imports, the plugin and the companion to the starter config", () => {
		const result = addMaintenanceMode(STARTER);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.target).toBe("plugins");
		expect(result.source).toContain(
			'import { sqlite } from "emdash/db";\nimport maintenanceModePlugin from "emdash-maintenance-mode";\nimport maintenanceMode from "emdash-maintenance-mode/astro";\n',
		);
		expect(result.source).toContain("\t\temdash({\n\t\t\tplugins: [maintenanceModePlugin],\n\t\t\tdatabase:");
		expect(result.source).toContain("\t\t}),\n\t\tmaintenanceMode(),\n\t],\n\tdevToolbar");
	});

	it("handles the Cloudflare template", () => {
		const result = addMaintenanceMode(CLOUDFLARE);
		expect(result.ok && result.source).toContain("plugins: [maintenanceModePlugin],");
		expect(result.ok && result.source).toContain("maintenanceMode(),\n\t],\n});");
	});

	it("uses sandboxed when a sandbox runner is configured, appending to an existing array", () => {
		const source = `import { defineConfig } from "astro/config";
import emdash from "emdash/astro";
import { sandbox } from "@emdash-cms/cloudflare";
export default defineConfig({
	integrations: [emdash({ sandboxRunner: sandbox(), sandboxed: [otherPlugin], plugins: [] })],
});
`;
		const result = addMaintenanceMode(source);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.target).toBe("sandboxed");
		expect(result.source).toContain("sandboxed: [otherPlugin, maintenanceModePlugin], plugins: []");
		expect(result.source).toContain("plugins: [] }), maintenanceMode()],");
	});

	it("appends to an existing multi-line plugins array", () => {
		const source = `import { defineConfig } from "astro/config";
export default defineConfig({
	integrations: [
		emdash({
			plugins: [
				seo(),
			],
		}),
	],
});
`;
		const result = addMaintenanceMode(source);
		expect(result.ok && result.source).toContain("\t\t\t\tseo(),\n\t\t\t\tmaintenanceModePlugin,\n\t\t\t],");
	});

	it("ignores brackets in strings and comments", () => {
		const source = `import { defineConfig } from "astro/config";
export default defineConfig({
	integrations: [
		// emdash({ plugins: [ ] })
		emdash({ database: d1({ binding: "DB]" }) }), /* ] */
	],
});
`;
		const result = addMaintenanceMode(source);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.source).toContain("// emdash({ plugins: [ ] })");
		expect(result.source).toContain('emdash({ plugins: [maintenanceModePlugin], database: d1({ binding: "DB]" }) }),\n\t\tmaintenanceMode(), /* ] */');
		expect(result.source).not.toMatch(/,\s*,/);
	});

	it("refuses shapes it does not recognise", () => {
		expect(addMaintenanceMode("export default {}")).toMatchObject({ ok: false, reason: "no-emdash-call" });
		expect(addMaintenanceMode('import x from "y";\nconst c = emdash({});\nexport default c;')).toMatchObject({ ok: false });
		expect(addMaintenanceMode(`${STARTER}\n// emdash-maintenance-mode`)).toMatchObject({ ok: false, reason: "already-installed" });
	});

	it("prints manual instructions and a readable diff", () => {
		expect(manualInstructions(true)).toContain("sandboxed: [maintenanceModePlugin]");
		const result = addMaintenanceMode(CLOUDFLARE);
		const diff = lineDiff(CLOUDFLARE, result.ok ? result.source : "");
		expect(diff.split("\n").filter((l) => l.startsWith("+"))).toHaveLength(4);
		expect(diff).not.toMatch(/^- /m);
	});

	it("masks comments and string contents", () => {
		const src = 'a("x]") // c\n/* d */ b';
		const m = mask(src);
		expect(m).toHaveLength(src.length);
		expect(m).toBe('a("  ")     \n        b');
	});

	it("finds matching brackets", () => {
		expect(findClosing("[a, [b], 'c]']", 0)).toBe(13);
		expect(findClosing("[a", 0)).toBe(-1);
	});
});
