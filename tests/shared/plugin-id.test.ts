import { describe, expect, it } from "vitest";

// EmDash's own implementation (not a public export): our copy must match it.
import { makeRegistryPluginId as emdashRegistryId } from "../../node_modules/emdash/src/registry/plugin-id";
import { PLUGIN_SLUG, PUBLISHER_DID } from "../../src/shared/keys";
import {
	base32Encode,
	candidatePluginIds,
	makeRegistryPluginId,
	NPM_PLUGIN_ID,
	registryPluginId,
} from "../../src/shared/plugin-id";

describe("plugin ids", () => {
	it("encodes base32 per RFC 4648 (lowercase, no padding)", () => {
		const enc = (s: string) => base32Encode(new TextEncoder().encode(s));
		expect(enc("")).toBe("");
		expect(enc("f")).toBe("my");
		expect(enc("fo")).toBe("mzxq");
		expect(enc("foo")).toBe("mzxw6");
		expect(enc("foob")).toBe("mzxw6yq");
		expect(enc("fooba")).toBe("mzxw6ytb");
		expect(enc("foobar")).toBe("mzxw6ytboi");
	});

	it("derives the same registry id as EmDash", async () => {
		const pairs: Array<[string, string]> = [
			[PUBLISHER_DID, PLUGIN_SLUG],
			["did:plc:abc", "x"],
			["did:web:example.com", "some-plugin"],
			[`  ${PUBLISHER_DID} `, ` ${PLUGIN_SLUG}`],
		];
		for (const [did, slug] of pairs) {
			expect(await makeRegistryPluginId(did, slug)).toBe(await emdashRegistryId(did, slug));
		}
		expect(await registryPluginId()).toMatch(/^r_[a-z2-7]{16}$/);
		expect(await registryPluginId()).toBe(await emdashRegistryId(PUBLISHER_DID, PLUGIN_SLUG));
	});

	it("rejects empty inputs like EmDash", async () => {
		await expect(makeRegistryPluginId(" ", "x")).rejects.toThrow();
		await expect(makeRegistryPluginId("did:plc:a", "")).rejects.toThrow();
	});

	it("lists the npm id first", async () => {
		const [npm, registry] = await candidatePluginIds();
		expect(npm).toBe(NPM_PLUGIN_ID);
		expect(npm).toBe("maintenance-mode");
		expect(registry).toBe(await registryPluginId());
	});
});
