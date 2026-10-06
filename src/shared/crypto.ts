/**
 * Small Web Crypto helpers used by both halves. No Node.js built-ins:
 * this runs in the plugin sandbox, in workerd and in Node.
 */

const encoder = new TextEncoder();

/** Byte arrays backed by a plain ArrayBuffer, as Web Crypto expects. */
export type Bytes = Uint8Array<ArrayBuffer>;
const decoder = new TextDecoder();

/** PBKDF2 iterations. Cloudflare Workers reject more than 100 000. */
export const PBKDF2_ITERATIONS = 100_000;

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

/** Throws on malformed input. */
export function base64ToBytes(b64: string): Bytes {
	const binary = atob(b64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
	return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Throws on malformed input. */
export function base64UrlToBytes(b64url: string): Bytes {
	if (!/^[A-Za-z0-9_-]*$/.test(b64url)) throw new Error("Invalid base64url");
	const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
	return base64ToBytes(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

export function bytesToHex(bytes: Uint8Array): string {
	let hex = "";
	for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
	return hex;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function randomBytes(length: number): Bytes {
	return crypto.getRandomValues(new Uint8Array(length));
}

/** URL-safe random token (32 bytes → 43 characters by default). */
export function randomToken(byteLength = 32): string {
	return bytesToBase64Url(randomBytes(byteLength));
}

export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
	return bytesToHex(new Uint8Array(digest));
}

/** Compares without exiting early on the first difference. */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	let diff = a.length ^ b.length;
	const length = Math.max(a.length, b.length);
	for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
	return diff === 0;
}

export function timingSafeEqualString(a: string, b: string): boolean {
	return timingSafeEqual(encoder.encode(a), encoder.encode(b));
}

async function hmacKey(secret: Bytes): Promise<CryptoKey> {
	if (secret.length === 0) throw new Error("Empty HMAC secret");
	return crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, [
		"sign",
	]);
}

export async function hmacSha256(secret: Bytes, data: string): Promise<Bytes> {
	const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data));
	return new Uint8Array(signature);
}

/** Checks `signature` in constant time. Never throws. */
export async function hmacVerify(
	secret: Bytes,
	data: string,
	signature: Uint8Array,
): Promise<boolean> {
	try {
		return timingSafeEqual(await hmacSha256(secret, data), signature);
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Passwords (PBKDF2-SHA256)
// ---------------------------------------------------------------------------

export interface PasswordHash {
	saltB64: string;
	hashB64: string;
	iterations: number;
}

async function pbkdf2(password: string, salt: Bytes, iterations: number): Promise<Bytes> {
	const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, [
		"deriveBits",
	]);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt, iterations },
		key,
		256,
	);
	return new Uint8Array(bits);
}

export async function hashPassword(
	password: string,
	iterations = PBKDF2_ITERATIONS,
): Promise<PasswordHash> {
	const salt = randomBytes(16);
	const hash = await pbkdf2(password, salt, iterations);
	return { saltB64: bytesToBase64(salt), hashB64: bytesToBase64(hash), iterations };
}

/** Never throws; a malformed stored hash never matches. */
export async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
	try {
		if (
			!Number.isInteger(stored.iterations) ||
			stored.iterations < 1 ||
			stored.iterations > PBKDF2_ITERATIONS
		) {
			return false;
		}
		const expected = base64ToBytes(stored.hashB64);
		if (expected.length === 0) return false;
		const actual = await pbkdf2(password, base64ToBytes(stored.saltB64), stored.iterations);
		return timingSafeEqual(actual, expected);
	} catch {
		return false;
	}
}

// ---------------------------------------------------------------------------
// Guest cookie: base64url(JSON payload) "." base64url(HMAC-SHA256)
// ---------------------------------------------------------------------------

export interface GuestCookiePayload {
	/** `runtime.guest.cookieVersion` at issue time. */
	v: number;
	/** Expiry, seconds since the epoch. */
	exp: number;
}

export async function signGuestCookie(
	secretB64: string,
	payload: GuestCookiePayload,
): Promise<string> {
	const body = bytesToBase64Url(encoder.encode(JSON.stringify({ v: payload.v, exp: payload.exp })));
	const signature = await hmacSha256(base64ToBytes(secretB64), body);
	return `${body}.${bytesToBase64Url(signature)}`;
}

/**
 * Returns true only for a cookie signed with `secretB64`, issued for
 * `cookieVersion` and not expired at `nowMs`. Never throws.
 */
export async function verifyGuestCookie(
	value: string,
	secretB64: string,
	cookieVersion: number,
	nowMs: number = Date.now(),
): Promise<boolean> {
	try {
		const parts = value.split(".");
		if (parts.length !== 2) return false;
		const [body, signature] = parts as [string, string];
		const secret = base64ToBytes(secretB64);
		if (!(await hmacVerify(secret, body, base64UrlToBytes(signature)))) return false;
		const payload: unknown = JSON.parse(decoder.decode(base64UrlToBytes(body)));
		if (typeof payload !== "object" || payload === null) return false;
		const { v, exp } = payload as Record<string, unknown>;
		if (v !== cookieVersion) return false;
		if (typeof exp !== "number" || !Number.isFinite(exp)) return false;
		return nowMs < exp * 1000;
	} catch {
		return false;
	}
}
