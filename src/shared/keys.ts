/**
 * Identifiers shared by the sandboxed plugin and the Astro companion.
 * The companion reads plugin state straight from EmDash's options table,
 * so these names are part of the contract between the two halves.
 */

/** Plugin slug, as declared in `emdash-plugin.jsonc`. */
export const PLUGIN_SLUG = "maintenance-mode";

/** Prefix of the options rows that hold this plugin's settings. */
export function settingsKeyPrefix(pluginId: string): string {
	return `plugin:${pluginId}:settings:`;
}
