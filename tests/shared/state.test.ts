import { describe, expect, it } from "vitest";

import { createDefaultRuntimeState, newerState, parseRuntimeState } from "../../src/shared/state";

const defaults = createDefaultRuntimeState("c2VjcmV0", new Date("2026-01-01T00:00:00Z"));

describe("runtime state", () => {
	it("has safe defaults", () => {
		expect(defaults).toMatchObject({
			v: 1,
			enabled: false,
			mode: "coming-soon",
			page: null,
			bypassMinRole: 40,
			guest: { linkTokenHash: null, password: null, cookieVersion: 1, cookieMaxAgeDays: 30 },
			badge: { hidden: false, licenseExpiresAt: null, graceUntil: null },
			retryAfterSeconds: 3600,
		});
	});

	it("round-trips the default state, as object or JSON", () => {
		expect(parseRuntimeState(defaults)).toEqual(defaults);
		expect(parseRuntimeState(JSON.stringify(defaults))).toEqual(defaults);
	});

	it("returns null for missing or unreadable values", () => {
		for (const raw of [undefined, null, "", "{", 1, [], {}, { v: 2, enabled: true }, { v: 1 }]) {
			expect(parseRuntimeState(raw)).toBeNull();
		}
		expect(parseRuntimeState({ v: 1, enabled: "yes" })).toBeNull();
	});

	it("fills invalid optional fields with defaults", () => {
		const s = parseRuntimeState({
			v: 1,
			enabled: true,
			mode: "party",
			page: { collection: "pages", slug: "" },
			bypassMinRole: 10,
			guest: {
				linkTokenHash: "nothex",
				password: { saltB64: "a" },
				cookieVersion: -1,
				cookieMaxAgeDays: 0,
			},
			badge: { hidden: "true", licenseExpiresAt: "soon" },
			retryAfterSeconds: -5,
			updatedAt: "yesterday",
		});
		expect(s).toEqual({
			v: 1,
			enabled: true,
			mode: "coming-soon",
			page: null,
			bypassMinRole: 40,
			guest: {
				linkTokenHash: null,
				password: null,
				cookieSecretB64: "",
				cookieVersion: 1,
				cookieMaxAgeDays: 30,
			},
			badge: { hidden: false, licenseExpiresAt: null, graceUntil: null },
			retryAfterSeconds: 3600,
			updatedAt: "1970-01-01T00:00:00.000Z",
		});
	});

	it("keeps valid values", () => {
		const raw = {
			...defaults,
			enabled: true,
			mode: "maintenance",
			page: { collection: "pages", slug: "coming-soon" },
			bypassMinRole: 50,
			guest: {
				...defaults.guest,
				linkTokenHash: "a".repeat(64),
				password: { saltB64: "c2FsdA==", hashB64: "aGFzaA==", iterations: 100000 },
				cookieVersion: 7,
				cookieMaxAgeDays: 90,
			},
			badge: { hidden: true, licenseExpiresAt: "2027-01-01T00:00:00Z", graceUntil: null },
			retryAfterSeconds: 120,
		};
		expect(parseRuntimeState(raw)).toEqual(raw);
	});

	it("picks the newer of two states", () => {
		const older = { ...defaults, updatedAt: "2026-01-01T00:00:00Z" };
		const newer = { ...defaults, updatedAt: "2026-02-01T00:00:00Z" };
		expect(newerState(older, newer)).toBe(newer);
		expect(newerState(newer, older)).toBe(newer);
		expect(newerState(null, older)).toBe(older);
		expect(newerState(older, null)).toBe(older);
		expect(newerState(null, null)).toBeNull();
	});
});
