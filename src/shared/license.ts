import type { BadgeState } from "./state";

/**
 * Pure license helpers. Enforcement is honest, not DRM: the badge comes back
 * when a license lapses, and nothing else ever depends on the license.
 */

/** How long a last-known-good license stays trusted while Lemon Squeezy is unreachable. */
export const GRACE_PERIOD_DAYS = 7;

/** How often the admin page re-validates on load. */
export const LAZY_VALIDATION_HOURS = 24;

const DAY_MS = 86_400_000;

const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Hosts that may hide the badge without a license (local development only). */
export function isDevHost(hostname: string): boolean {
	return DEV_HOSTS.has(hostname.trim().toLowerCase());
}

/** Lowercased hostname of a URL, or null when it doesn't parse. */
export function hostnameOf(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).hostname.toLowerCase() || null;
	} catch {
		return null;
	}
}

/** End of the grace period that starts at the last successful validation. */
export function graceUntil(lastValidatedAt: string | Date): string | null {
	const t = typeof lastValidatedAt === "string" ? Date.parse(lastValidatedAt) : lastValidatedAt.getTime();
	if (Number.isNaN(t)) return null;
	return new Date(t + GRACE_PERIOD_DAYS * DAY_MS).toISOString();
}

function isBefore(nowMs: number, iso: string | null): boolean {
	if (!iso) return false;
	const t = Date.parse(iso);
	return !Number.isNaN(t) && nowMs < t;
}

/**
 * The badge rule used by the companion: show the badge unless it was hidden
 * and the license has not expired (or is still within its grace period).
 * Works without cron: an expired license brings the badge back by itself.
 * A badge hidden for local development only shows again on any other host.
 */
export function shouldShowBadge(
	badge: BadgeState,
	now: Date = new Date(),
	hostname?: string,
): boolean {
	if (!badge.hidden) return true;
	if (badge.devOnly) return hostname === undefined || !isDevHost(hostname);
	const nowMs = now.getTime();
	const stillValid =
		badge.licenseExpiresAt === null ||
		isBefore(nowMs, badge.licenseExpiresAt) ||
		isBefore(nowMs, badge.graceUntil);
	return !stillValid;
}

/** True when the last validation is older than {@link LAZY_VALIDATION_HOURS}. */
export function isValidationStale(lastValidatedAt: string | null, now: Date = new Date()): boolean {
	if (!lastValidatedAt) return true;
	const t = Date.parse(lastValidatedAt);
	return Number.isNaN(t) || now.getTime() - t >= LAZY_VALIDATION_HOURS * 3_600_000;
}
