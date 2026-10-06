import { PLUGIN_SLUG, PUBLISHER_DID } from "./keys";

/**
 * Plugin id derivation.
 *
 * EmDash stores plugin settings under the plugin id, which depends on how the
 * plugin was installed:
 *
 * - npm (`plugins: []` or `sandboxed: []`): the slug, `maintenance-mode`;
 * - registry: `"r_" + base32lower(sha256(publisherDid + "\n" + slug))`,
 *   truncated to 16 base32 characters.
 *
 * Copied from `emdash/src/registry/plugin-id.ts` (not a public export);
 * `tests/shared/plugin-id.test.ts` checks both produce the same ids.
 */

const HASH_LENGTH = 16;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

/** RFC 4648 base32, lowercase, no padding. */
export function base32Encode(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = "";
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			out += BASE32_ALPHABET[(value >>> bits) & 0x1f];
		}
	}
	if (bits > 0) {
		out += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
	}
	return out;
}

/** Id EmDash gives a registry install of `(publisherDid, slug)`. */
export async function makeRegistryPluginId(publisherDid: string, slug: string): Promise<string> {
	const did = publisherDid.trim();
	const s = slug.trim();
	if (!did) throw new Error("makeRegistryPluginId: publisherDid is required");
	if (!s) throw new Error("makeRegistryPluginId: slug is required");
	const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${did}\n${s}`));
	return `r_${base32Encode(new Uint8Array(hash)).slice(0, HASH_LENGTH)}`;
}

/** Id of an npm install. */
export const NPM_PLUGIN_ID = PLUGIN_SLUG;

let registryIdPromise: Promise<string> | undefined;

/** Id of a registry install of this plugin (memoised). */
export function registryPluginId(): Promise<string> {
	registryIdPromise ??= makeRegistryPluginId(PUBLISHER_DID, PLUGIN_SLUG);
	return registryIdPromise;
}

/** Every id this plugin can have, npm first. */
export async function candidatePluginIds(): Promise<[string, string]> {
	return [NPM_PLUGIN_ID, await registryPluginId()];
}
