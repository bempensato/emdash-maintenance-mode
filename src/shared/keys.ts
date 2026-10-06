/**
 * Identifiers shared by the sandboxed plugin and the Astro companion.
 * The companion reads plugin state straight from EmDash's options table,
 * so these names are part of the contract between the two halves.
 */

/** Plugin slug, as declared in `emdash-plugin.jsonc`. */
export const PLUGIN_SLUG = "maintenance-mode";

/** Publisher DID, as declared in `emdash-plugin.jsonc`. Registry ids derive from it. */
export const PUBLISHER_DID = "did:plc:f3in7i6onwmsmxykb7emfyru";

/**
 * Package version. Kept equal to `package.json` `version` (a test checks it);
 * the companion reports it so the admin page can detect an outdated install.
 */
export const PACKAGE_VERSION = "0.1.0";

/** Public URL of the product, linked from the badge. */
export const PRODUCT_URL = "https://github.com/bempensato/emdash-maintenance-mode";

/** Setting keys (`plugin:<id>:settings:<key>`). */
export const SETTING_KEYS = {
	/** Everything the companion needs, as one non-secret JSON value. */
	runtime: "runtime",
	/** Written by the companion: `{ version, seenAt }`. */
	companion: "companion",
	/** Lemon Squeezy license key, `secret` in `admin.settingsSchema`. */
	licenseKey: "licenseKey",
	/** Last known license state (no key inside). */
	license: "license",
	/** Plain preview token, so admins can copy the link again. */
	previewToken: "previewToken",
} as const;

/** Prefix of the options rows that hold this plugin's settings. */
export function settingsKeyPrefix(pluginId: string): string {
	return `plugin:${pluginId}:settings:`;
}

/** Full options-table key of one plugin setting. */
export function settingOptionName(pluginId: string, key: string): string {
	return `${settingsKeyPrefix(pluginId)}${key}`;
}

/** Name of the guest access cookie. */
export const GUEST_COOKIE_NAME = "mm_access";

/** Query parameter that carries the preview link token. */
export const PREVIEW_QUERY_PARAM = "mm_access";

/** Query parameter set after a failed password attempt. */
export const PASSWORD_ERROR_PARAM = "mm_error";

/** Default companion paths. */
export const DEFAULT_PAGE_PATH = "/maintenance";
export const DEFAULT_ACCESS_PATH = "/maintenance-access";

/** EmDash role levels (`locals.user.role`). */
export const ROLES = {
	subscriber: 10,
	contributor: 20,
	author: 30,
	editor: 40,
	admin: 50,
} as const;

/** Defaults for values folded into `runtime`. */
export const DEFAULTS = {
	mode: "coming-soon",
	bypassMinRole: ROLES.editor,
	cookieMaxAgeDays: 30,
	retryAfterSeconds: 3600,
} as const;
