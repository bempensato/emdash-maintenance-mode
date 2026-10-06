import { DEFAULTS, ROLES } from "./keys";
import type { PasswordHash } from "./crypto";

/**
 * The contract between plugin and companion: one non-secret setting,
 * `runtime`, rewritten by the plugin after every admin change and license
 * check, read by the companion on public requests.
 */

export type Mode = "coming-soon" | "maintenance";

/** all logged-in users | editors and admins (default) | admins only */
export type BypassMinRole = 20 | 40 | 50;

export interface PageRef {
	collection: string;
	slug: string;
}

export interface GuestState {
	/** sha256 hex of the preview token; null = link disabled. */
	linkTokenHash: string | null;
	password: PasswordHash | null;
	/** HMAC key for guest cookies, generated once. */
	cookieSecretB64: string;
	/** Bump to revoke every guest cookie. */
	cookieVersion: number;
	cookieMaxAgeDays: number;
}

export interface BadgeState {
	hidden: boolean;
	licenseExpiresAt: string | null;
	graceUntil: string | null;
	/**
	 * Hidden without a license on a local development host: honoured only on
	 * such hosts, so a database copied to production shows the badge again.
	 */
	devOnly?: boolean;
}

export interface RuntimeState {
	v: 1;
	enabled: boolean;
	mode: Mode;
	page: PageRef | null;
	bypassMinRole: BypassMinRole;
	guest: GuestState;
	badge: BadgeState;
	retryAfterSeconds: number;
	updatedAt: string;
}

export const MODES: readonly Mode[] = ["coming-soon", "maintenance"];
export const BYPASS_ROLES: readonly BypassMinRole[] = [ROLES.contributor, ROLES.editor, ROLES.admin];

/** Default state written on install: disabled, badge visible, no guest access. */
export function createDefaultRuntimeState(
	cookieSecretB64: string,
	now: Date = new Date(),
): RuntimeState {
	return {
		v: 1,
		enabled: false,
		mode: DEFAULTS.mode,
		page: null,
		bypassMinRole: DEFAULTS.bypassMinRole,
		guest: {
			linkTokenHash: null,
			password: null,
			cookieSecretB64,
			cookieVersion: 1,
			cookieMaxAgeDays: DEFAULTS.cookieMaxAgeDays,
		},
		badge: { hidden: false, licenseExpiresAt: null, graceUntil: null, devOnly: false },
		retryAfterSeconds: DEFAULTS.retryAfterSeconds,
		updatedAt: now.toISOString(),
	};
}

// ---------------------------------------------------------------------------
// Parsing. The stored value is untrusted (hand edits, older versions, bugs):
// anything that cannot be read safely yields null, and callers fail open.
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value : null;
}

function isoDateOrNull(value: unknown): string | null {
	if (typeof value !== "string") return null;
	return Number.isNaN(Date.parse(value)) ? null : value;
}

function intInRange(value: unknown, min: number, max: number, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
		? value
		: fallback;
}

function parsePage(value: unknown): PageRef | null {
	if (!isRecord(value)) return null;
	const collection = nonEmptyString(value.collection);
	const slug = nonEmptyString(value.slug);
	return collection && slug ? { collection, slug } : null;
}

function parsePassword(value: unknown): PasswordHash | null {
	if (!isRecord(value)) return null;
	const saltB64 = nonEmptyString(value.saltB64);
	const hashB64 = nonEmptyString(value.hashB64);
	const iterations = value.iterations;
	if (!saltB64 || !hashB64 || typeof iterations !== "number" || !Number.isInteger(iterations)) {
		return null;
	}
	return { saltB64, hashB64, iterations };
}

function parseGuest(value: unknown): GuestState {
	const g = isRecord(value) ? value : {};
	const linkTokenHash =
		typeof g.linkTokenHash === "string" && /^[0-9a-f]{64}$/.test(g.linkTokenHash)
			? g.linkTokenHash
			: null;
	return {
		linkTokenHash,
		password: parsePassword(g.password),
		// An empty secret makes every cookie check fail (see verifyGuestCookie).
		cookieSecretB64: typeof g.cookieSecretB64 === "string" ? g.cookieSecretB64 : "",
		cookieVersion: intInRange(g.cookieVersion, 0, Number.MAX_SAFE_INTEGER, 1),
		cookieMaxAgeDays: intInRange(g.cookieMaxAgeDays, 1, 365, DEFAULTS.cookieMaxAgeDays),
	};
}

function parseBadge(value: unknown): BadgeState {
	const b = isRecord(value) ? value : {};
	return {
		hidden: b.hidden === true,
		licenseExpiresAt: isoDateOrNull(b.licenseExpiresAt),
		graceUntil: isoDateOrNull(b.graceUntil),
		devOnly: b.devOnly === true,
	};
}

/**
 * Reads a stored `runtime` value (object, or JSON string for hand-written
 * rows). Returns null when it is missing or not a version-1 state with a
 * boolean `enabled`; optional fields fall back to their defaults.
 */
export function parseRuntimeState(raw: unknown): RuntimeState | null {
	let value = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (!isRecord(value) || value.v !== 1 || typeof value.enabled !== "boolean") return null;

	return {
		v: 1,
		enabled: value.enabled,
		mode: MODES.includes(value.mode as Mode) ? (value.mode as Mode) : DEFAULTS.mode,
		page: parsePage(value.page),
		bypassMinRole: BYPASS_ROLES.includes(value.bypassMinRole as BypassMinRole)
			? (value.bypassMinRole as BypassMinRole)
			: DEFAULTS.bypassMinRole,
		guest: parseGuest(value.guest),
		badge: parseBadge(value.badge),
		retryAfterSeconds: intInRange(value.retryAfterSeconds, 0, 86_400 * 7, DEFAULTS.retryAfterSeconds),
		updatedAt: isoDateOrNull(value.updatedAt) ?? new Date(0).toISOString(),
	};
}

/** Picks the more recently updated of two states (either may be null). */
export function newerState(a: RuntimeState | null, b: RuntimeState | null): RuntimeState | null {
	if (!a) return b;
	if (!b) return a;
	return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}
