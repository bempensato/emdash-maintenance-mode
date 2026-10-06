import { describe, expect, it } from "vitest";

import {
	base64UrlToBytes,
	bytesToBase64,
	bytesToBase64Url,
	hashPassword,
	hmacSha256,
	hmacVerify,
	PBKDF2_ITERATIONS,
	randomBytes,
	randomToken,
	sha256Hex,
	signGuestCookie,
	timingSafeEqualString,
	verifyGuestCookie,
	verifyPassword,
} from "../../src/shared/crypto";

const secret = bytesToBase64(randomBytes(32));
const otherSecret = bytesToBase64(randomBytes(32));
const now = Date.parse("2026-01-01T00:00:00Z");
const exp = now / 1000 + 3600;

describe("encoding and primitives", () => {
	it("round-trips base64url", () => {
		const bytes = randomBytes(37);
		expect(base64UrlToBytes(bytesToBase64Url(bytes))).toEqual(bytes);
		expect(() => base64UrlToBytes("a+b")).toThrow();
	});

	it("hashes with sha256", async () => {
		expect(await sha256Hex("abc")).toBe(
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
		);
	});

	it("makes url-safe random tokens", () => {
		const a = randomToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(randomToken()).not.toBe(a);
	});

	it("compares strings", () => {
		expect(timingSafeEqualString("abc", "abc")).toBe(true);
		expect(timingSafeEqualString("abc", "abd")).toBe(false);
		expect(timingSafeEqualString("abc", "abcd")).toBe(false);
		expect(timingSafeEqualString("", "")).toBe(true);
	});

	it("signs and verifies HMAC (RFC 4231 case 2)", async () => {
		const key = new TextEncoder().encode("Jefe");
		const sig = await hmacSha256(key, "what do ya want for nothing?");
		expect(bytesToBase64Url(sig)).toBe(
			bytesToBase64Url(
				Uint8Array.from(
					"5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
						.match(/../g)!
						.map((h) => parseInt(h, 16)),
				),
			),
		);
		expect(await hmacVerify(key, "what do ya want for nothing?", sig)).toBe(true);
		expect(await hmacVerify(key, "what do ya want for nothing!", sig)).toBe(false);
		expect(await hmacVerify(new Uint8Array(), "x", sig)).toBe(false);
	});
});

describe("passwords", () => {
	it("hashes with a salt and verifies", async () => {
		const a = await hashPassword("open sesame", 1000);
		const b = await hashPassword("open sesame", 1000);
		expect(a.saltB64).not.toBe(b.saltB64);
		expect(a.hashB64).not.toBe(b.hashB64);
		expect(JSON.stringify(a)).not.toContain("open sesame");
		expect(await verifyPassword("open sesame", a)).toBe(true);
		expect(await verifyPassword("open sesame!", a)).toBe(false);
		expect(await verifyPassword("", a)).toBe(false);
	});

	it("uses the Workers-compatible iteration count by default", async () => {
		const h = await hashPassword("pw");
		expect(h.iterations).toBe(PBKDF2_ITERATIONS);
		expect(await verifyPassword("pw", h)).toBe(true);
	});

	it("never matches a malformed hash", async () => {
		const good = await hashPassword("pw", 1000);
		expect(await verifyPassword("pw", { ...good, hashB64: "" })).toBe(false);
		expect(await verifyPassword("pw", { ...good, hashB64: "!!" })).toBe(false);
		expect(await verifyPassword("pw", { ...good, iterations: 0 })).toBe(false);
		expect(await verifyPassword("pw", { ...good, iterations: 10_000_000 })).toBe(false);
	});
});

describe("guest cookie", () => {
	it("accepts a valid cookie", async () => {
		const value = await signGuestCookie(secret, { v: 3, exp });
		expect(await verifyGuestCookie(value, secret, 3, now)).toBe(true);
	});

	it("rejects an expired cookie", async () => {
		const value = await signGuestCookie(secret, { v: 3, exp });
		expect(await verifyGuestCookie(value, secret, 3, exp * 1000)).toBe(false);
	});

	it("rejects a revoked cookie (version bumped)", async () => {
		const value = await signGuestCookie(secret, { v: 3, exp });
		expect(await verifyGuestCookie(value, secret, 4, now)).toBe(false);
	});

	it("rejects a cookie signed with another secret", async () => {
		const value = await signGuestCookie(otherSecret, { v: 3, exp });
		expect(await verifyGuestCookie(value, secret, 3, now)).toBe(false);
	});

	it("rejects tampered payloads and signatures", async () => {
		const value = await signGuestCookie(secret, { v: 3, exp });
		const [, sig] = value.split(".");
		const forgedBody = bytesToBase64Url(
			new TextEncoder().encode(JSON.stringify({ v: 3, exp: exp + 86_400 * 365 })),
		);
		expect(await verifyGuestCookie(`${forgedBody}.${sig}`, secret, 3, now)).toBe(false);
		const flipped = value.slice(0, -2) + (value.endsWith("AA") ? "AB" : "AA");
		expect(await verifyGuestCookie(flipped, secret, 3, now)).toBe(false);
	});

	it("never throws on garbage", async () => {
		for (const v of ["", ".", "a.b.c", "!!!.???", "e30.", "x"]) {
			expect(await verifyGuestCookie(v, secret, 3, now)).toBe(false);
		}
		const value = await signGuestCookie(secret, { v: 3, exp });
		expect(await verifyGuestCookie(value, "", 3, now)).toBe(false);
		expect(await verifyGuestCookie(value, "not base64!", 3, now)).toBe(false);
	});
});
