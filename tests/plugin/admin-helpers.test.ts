import { describe, expect, it } from "vitest";

import {
	companionSnippet,
	compareVersions,
	decodePage,
	encodePage,
	parseCompanion,
	publicUrl,
	siteBaseUrl,
} from "../../src/plugin/admin";
import { adminLocale } from "../../src/plugin/i18n";

describe("admin helpers", () => {
	it("round-trips page references", () => {
		const ref = { collection: "pages", slug: "a:b/c" };
		expect(decodePage(encodePage(ref))).toEqual(ref);
		expect(decodePage("")).toBeNull();
		expect(decodePage(undefined)).toBeNull();
		for (const bad of ["x", "[]", '["pages"]', '["", "x"]', "[1,2]", '{"a":1}']) {
			expect(decodePage(bad), bad).toBeUndefined();
		}
	});

	it("compares versions", () => {
		expect(compareVersions("0.2.0", "0.2.0")).toBe(0);
		expect(compareVersions("0.1.9", "0.2.0")).toBeLessThan(0);
		expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
		expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
		expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
	});

	it("reads the companion report defensively", () => {
		expect(parseCompanion(null)).toBeNull();
		expect(parseCompanion({ version: 1 })).toBeNull();
		expect(parseCompanion({ version: "0.2.0", seenAt: "x", path: "javascript:alert(1)" })).toEqual({
			version: "0.2.0",
			seenAt: "x",
			path: null,
			duplicateInstall: false,
		});
	});

	it("builds public URLs from the site URL or the admin request", () => {
		expect(siteBaseUrl("https://example.com", "https://admin.example.com/x")).toBe("https://example.com");
		expect(siteBaseUrl("", "http://127.0.0.1:4321/_emdash/api/x")).toBe("http://127.0.0.1:4321");
		expect(siteBaseUrl("", undefined)).toBeNull();
		expect(siteBaseUrl("ftp://x", "nope")).toBeNull();
		expect(publicUrl("https://example.com", "/maintenance")).toBe("https://example.com/maintenance");
		expect(publicUrl("https://example.com/blog", "/maintenance")).toBe("https://example.com/maintenance");
	});

	it("tailors the install snippet", () => {
		expect(companionSnippet(false)).toContain("plugins: [maintenanceModePlugin]");
		expect(companionSnippet(true)).not.toContain("maintenanceModePlugin");
		expect(companionSnippet(true)).toContain("maintenanceMode()");
	});

	it("picks the admin language", () => {
		expect(adminLocale("it")).toBe("it");
		expect(adminLocale("it-IT")).toBe("it");
		expect(adminLocale("en-GB")).toBe("en");
		expect(adminLocale(undefined)).toBe("en");
	});
});
