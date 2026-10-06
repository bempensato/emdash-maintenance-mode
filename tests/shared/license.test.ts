import { describe, expect, it } from "vitest";

import {
	graceUntil,
	hostnameOf,
	isDevHost,
	isValidationStale,
	shouldShowBadge,
} from "../../src/shared/license";

const now = new Date("2026-06-01T00:00:00Z");
const past = "2026-05-01T00:00:00Z";
const future = "2026-07-01T00:00:00Z";

describe("badge rule", () => {
	it("shows the badge when not hidden", () => {
		expect(shouldShowBadge({ hidden: false, licenseExpiresAt: null, graceUntil: null }, now)).toBe(true);
		expect(shouldShowBadge({ hidden: false, licenseExpiresAt: future, graceUntil: future }, now)).toBe(true);
	});

	it("hides it for lifetime and unexpired licenses", () => {
		expect(shouldShowBadge({ hidden: true, licenseExpiresAt: null, graceUntil: null }, now)).toBe(false);
		expect(shouldShowBadge({ hidden: true, licenseExpiresAt: future, graceUntil: null }, now)).toBe(false);
	});

	it("brings it back on expiry without any write", () => {
		expect(shouldShowBadge({ hidden: true, licenseExpiresAt: past, graceUntil: null }, now)).toBe(true);
		expect(shouldShowBadge({ hidden: true, licenseExpiresAt: past, graceUntil: past }, now)).toBe(true);
	});

	it("keeps it hidden during the grace period", () => {
		expect(shouldShowBadge({ hidden: true, licenseExpiresAt: past, graceUntil: future }, now)).toBe(false);
	});

	it("treats the expiry instant as expired", () => {
		const at = new Date(past);
		expect(shouldShowBadge({ hidden: true, licenseExpiresAt: past, graceUntil: null }, at)).toBe(true);
	});
});

describe("license helpers", () => {
	it("exempts only local hosts", () => {
		for (const h of ["localhost", "127.0.0.1", "[::1]", "LOCALHOST"]) expect(isDevHost(h)).toBe(true);
		for (const h of ["example.com", "site.workers.dev", "localhost.example.com", "127.0.0.2", ""]) {
			expect(isDevHost(h)).toBe(false);
		}
	});

	it("reads hostnames", () => {
		expect(hostnameOf("https://Example.com:8443/path")).toBe("example.com");
		expect(hostnameOf("http://[::1]:4321/")).toBe("[::1]");
		expect(hostnameOf("not a url")).toBeNull();
		expect(hostnameOf(undefined)).toBeNull();
	});

	it("computes a 7-day grace period", () => {
		expect(graceUntil("2026-06-01T00:00:00Z")).toBe("2026-06-08T00:00:00.000Z");
		expect(graceUntil(new Date("2026-06-01T00:00:00Z"))).toBe("2026-06-08T00:00:00.000Z");
		expect(graceUntil("garbage")).toBeNull();
	});

	it("flags validations older than 24 hours", () => {
		expect(isValidationStale(null, now)).toBe(true);
		expect(isValidationStale("garbage", now)).toBe(true);
		expect(isValidationStale("2026-05-31T00:00:00Z", now)).toBe(true);
		expect(isValidationStale("2026-05-31T00:00:01Z", now)).toBe(false);
	});
});
