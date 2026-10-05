import { afterEach, describe, expect, it } from "vitest";

import { createPluginTestHost, type PluginTestHost } from "@emdash-cms/plugin-test";

let host: PluginTestHost | undefined;

afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

describe("maintenance-mode plugin", () => {
	it("loads through the sandbox host with the declared trust contract", async () => {
		host = await createPluginTestHost();
		expect(host.manifest.capabilities).toEqual(
			expect.arrayContaining(["content:read", "network:request"]),
		);
		expect(host.manifest.allowedHosts).toEqual(["api.lemonsqueezy.com"]);
	});
});
