import { describe, expect, it } from "vitest";

import pkg from "../../package.json";
import { PACKAGE_VERSION, PLUGIN_SLUG, settingOptionName } from "../../src/shared/keys";

describe("keys", () => {
	it("keeps PACKAGE_VERSION in sync with package.json", () => {
		expect(PACKAGE_VERSION).toBe(pkg.version);
	});

	it("builds options-table names", () => {
		expect(settingOptionName(PLUGIN_SLUG, "runtime")).toBe("plugin:maintenance-mode:settings:runtime");
	});
});
