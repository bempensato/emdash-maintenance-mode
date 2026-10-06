import { sha256Hex, signGuestCookie, timingSafeEqualString, verifyGuestCookie } from "../shared/crypto";
import { GUEST_COOKIE_NAME, PASSWORD_ERROR_PARAM, PREVIEW_QUERY_PARAM } from "../shared/keys";
import { isDevHost } from "../shared/license";
import type { GuestState } from "../shared/state";

/**
 * Guest access: the preview link token, the signed `mm_access` cookie, the
 * password form's return path and a best-effort rate limiter.
 */

const DAY_SECONDS = 86_400;

/** Value of one cookie in a `Cookie` header, or null. */
export function readCookie(header: string | null, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(";")) {
		const index = part.indexOf("=");
		if (index === -1) continue;
		if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
	}
	return null;
}

/** True when the request carries a guest cookie valid for the current state. */
export async function hasValidGuestCookie(
	cookieHeader: string | null,
	guest: GuestState,
	nowMs: number = Date.now(),
): Promise<boolean> {
	const value = readCookie(cookieHeader, GUEST_COOKIE_NAME);
	if (!value || !guest.cookieSecretB64) return false;
	return verifyGuestCookie(value, guest.cookieSecretB64, guest.cookieVersion, nowMs);
}

/** True when `token` is the current preview link token. */
export async function isValidLinkToken(token: string, guest: GuestState): Promise<boolean> {
	if (!guest.linkTokenHash || !token || token.length > 256) return false;
	return timingSafeEqualString(await sha256Hex(token), guest.linkTokenHash);
}

/** `Set-Cookie` value granting guest access for `cookieMaxAgeDays`. */
export async function guestCookieHeader(
	guest: GuestState,
	requestUrl: URL,
	nowMs: number = Date.now(),
): Promise<string> {
	const maxAge = guest.cookieMaxAgeDays * DAY_SECONDS;
	const value = await signGuestCookie(guest.cookieSecretB64, {
		v: guest.cookieVersion,
		exp: Math.floor(nowMs / 1000) + maxAge,
	});
	const attributes = [`${GUEST_COOKIE_NAME}=${value}`, "HttpOnly", "SameSite=Lax", "Path=/", `Max-Age=${maxAge}`];
	// Browsers drop `Secure` cookies on plain http, which local development uses.
	if (!(requestUrl.protocol === "http:" && isDevHost(requestUrl.hostname))) attributes.splice(1, 0, "Secure");
	return attributes.join("; ");
}

/** The URL without the guest-access query parameters, as a relative path. */
export function withoutGuestParams(url: URL): string {
	const clean = new URL(url);
	clean.searchParams.delete(PREVIEW_QUERY_PARAM);
	clean.searchParams.delete(PASSWORD_ERROR_PARAM);
	return clean.pathname + clean.search + clean.hash;
}

/**
 * A same-origin relative path to return to after the password form, or "/".
 * Rejects absolute and protocol-relative URLs and backslash tricks.
 */
export function safeReturnPath(value: unknown): string {
	if (typeof value !== "string" || value.length > 2048) return "/";
	if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
	if (/[\u0000-\u001f\u007f]/.test(value)) return "/";
	try {
		const url = new URL(value, "https://placeholder.invalid");
		if (url.origin !== "https://placeholder.invalid") return "/";
		url.searchParams.delete(PREVIEW_QUERY_PARAM);
		url.searchParams.delete(PASSWORD_ERROR_PARAM);
		return url.pathname + url.search;
	} catch {
		return "/";
	}
}

/** `path` with `mm_error=1` added, for a failed password attempt. */
export function withPasswordError(path: string): string {
	const url = new URL(path, "https://placeholder.invalid");
	url.searchParams.set(PASSWORD_ERROR_PARAM, "1");
	return url.pathname + url.search;
}

/**
 * Failure counter per client, in memory and per isolate: best effort, it
 * slows down guessing without any storage.
 */
export class RateLimiter {
	private readonly entries = new Map<string, { failures: number; resetAt: number }>();

	constructor(
		private readonly maxFailures = 5,
		private readonly windowMs = 10 * 60_000,
		private readonly maxEntries = 10_000,
	) {}

	isLimited(key: string, nowMs: number = Date.now()): boolean {
		const entry = this.entries.get(key);
		if (!entry) return false;
		if (nowMs >= entry.resetAt) {
			this.entries.delete(key);
			return false;
		}
		return entry.failures >= this.maxFailures;
	}

	recordFailure(key: string, nowMs: number = Date.now()): void {
		const entry = this.entries.get(key);
		if (entry && nowMs < entry.resetAt) {
			entry.failures++;
			return;
		}
		if (this.entries.size >= this.maxEntries) this.prune(nowMs);
		this.entries.set(key, { failures: 1, resetAt: nowMs + this.windowMs });
	}

	reset(key: string): void {
		this.entries.delete(key);
	}

	private prune(nowMs: number): void {
		for (const [key, entry] of this.entries) {
			if (nowMs >= entry.resetAt) this.entries.delete(key);
		}
		// Still full: drop the oldest entries (Map keeps insertion order).
		for (const key of this.entries.keys()) {
			if (this.entries.size < this.maxEntries) break;
			this.entries.delete(key);
		}
	}
}
