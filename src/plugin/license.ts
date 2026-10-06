import type { PluginContext } from "emdash/plugin";

import { sha256Hex } from "../shared/crypto";
import { SETTING_KEYS } from "../shared/keys";
import { graceUntil, isDevHost, isValidationStale } from "../shared/license";
import { LEMON_SQUEEZY, type PlanSites, type PlanTerm, type ProductConfig } from "../shared/product";
import type { BadgeState } from "../shared/state";
import {
	activateLicense,
	deactivateLicense,
	validateLicense,
	type LicenseStatus,
	type LsFetch,
} from "./license-client";
import { readRuntime, updateRuntime } from "./store";

/**
 * License state of this site and its effect on the badge. Nothing but the
 * badge ever depends on the license, and every failure leaves the site as
 * it is.
 */

export type LicenseProblem =
	| "wrong-product"
	| "expired"
	| "disabled"
	| "wrong-instance"
	| "wrong-host"
	| "invalid"
	| "key-missing"
	| "key-changed";

/** The `license` setting. Never contains the key itself. */
export interface LicenseRecord {
	instanceId: string;
	/** Hostname the key was activated for (domain binding). */
	instanceName: string;
	keyHash: string;
	valid: boolean;
	status: LicenseStatus | null;
	expiresAt: string | null;
	variantId: number | null;
	sites: PlanSites | null;
	term: PlanTerm | null;
	/** Last time Lemon Squeezy answered. */
	lastValidatedAt: string | null;
	/** Last attempt, answered or not (throttles lazy checks during outages). */
	lastCheckedAt: string | null;
	problem: LicenseProblem | null;
	/** Lemon Squeezy was unreachable at the last attempt. */
	unreachable: boolean;
	lastError: string | null;
}

export interface LicenseDeps {
	product?: ProductConfig;
	now?: () => Date;
}

export type LicenseError = "empty-key" | "no-host" | "unreachable" | "rejected" | "needs-license" | "key-missing";

/** `detail` carries Lemon Squeezy's own message for a rejected key. */
export type LicenseActionResult = { ok: true } | { ok: false; error: LicenseError; detail?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function parseLicenseRecord(value: unknown): LicenseRecord | null {
	if (!isRecord(value)) return null;
	if (typeof value.instanceId !== "string" || typeof value.instanceName !== "string") return null;
	if (typeof value.keyHash !== "string") return null;
	const str = (v: unknown) => (typeof v === "string" ? v : null);
	return {
		instanceId: value.instanceId,
		instanceName: value.instanceName,
		keyHash: value.keyHash,
		valid: value.valid === true,
		status: str(value.status) as LicenseStatus | null,
		expiresAt: str(value.expiresAt),
		variantId: typeof value.variantId === "number" ? value.variantId : null,
		sites: value.sites === 1 || value.sites === 5 ? value.sites : null,
		term: value.term === "annual" || value.term === "lifetime" ? value.term : null,
		lastValidatedAt: str(value.lastValidatedAt),
		lastCheckedAt: str(value.lastCheckedAt),
		problem: str(value.problem) as LicenseProblem | null,
		unreachable: value.unreachable === true,
		lastError: str(value.lastError),
	};
}

export async function readLicense(ctx: PluginContext): Promise<LicenseRecord | null> {
	return parseLicenseRecord(await ctx.settings.get(SETTING_KEYS.license));
}

/** Hostname of the site: the configured URL, else the admin request's. */
export function siteHostname(ctx: PluginContext, requestUrl?: string): string | null {
	for (const candidate of [ctx.site.url, requestUrl]) {
		if (!candidate) continue;
		try {
			const host = new URL(candidate).hostname.toLowerCase();
			if (host) return host;
		} catch {
			// Try the next one.
		}
	}
	return null;
}

/** True while the license allows hiding the badge. */
export function licenseAllowsHiding(record: LicenseRecord | null, now: Date): boolean {
	if (!record?.valid) return false;
	return record.expiresAt === null || now.getTime() < Date.parse(record.expiresAt);
}

function fetchOf(ctx: PluginContext): LsFetch {
	const http = ctx.http;
	if (!http) throw new Error("Network access is not available to this plugin.");
	return (url, init) => http.fetch(url, init);
}

async function setBadge(ctx: PluginContext, patch: (badge: BadgeState) => BadgeState): Promise<void> {
	await updateRuntime(ctx, (s) => ({ ...s, badge: patch(s.badge) }));
}

const SHOW_BADGE = (): BadgeState => ({ hidden: false, licenseExpiresAt: null, graceUntil: null, devOnly: false });

// ---------------------------------------------------------------------------

export async function activate(
	ctx: PluginContext,
	key: string,
	host: string | null,
	deps: LicenseDeps = {},
): Promise<LicenseActionResult> {
	const product = deps.product ?? LEMON_SQUEEZY;
	const now = (deps.now ?? (() => new Date()))();
	const trimmed = key.trim();
	if (!trimmed || trimmed.length > 200) return { ok: false, error: "empty-key" };
	if (!host) return { ok: false, error: "no-host" };

	const outcome = await activateLicense(fetchOf(ctx), product, trimmed, host);
	if (outcome.kind === "unreachable") return { ok: false, error: "unreachable" };
	if (outcome.kind === "rejected") return { ok: false, error: "rejected", detail: outcome.message };

	await ctx.settings.set(SETTING_KEYS.licenseKey, trimmed);
	const record: LicenseRecord = {
		instanceId: outcome.instanceId,
		instanceName: host,
		keyHash: await sha256Hex(trimmed),
		valid: true,
		status: outcome.status,
		expiresAt: outcome.expiresAt,
		variantId: outcome.variant.id,
		sites: outcome.variant.sites,
		term: outcome.variant.term,
		lastValidatedAt: now.toISOString(),
		lastCheckedAt: now.toISOString(),
		problem: null,
		unreachable: false,
		lastError: null,
	};
	await ctx.settings.set(SETTING_KEYS.license, record);
	await setBadge(ctx, () => ({ hidden: true, licenseExpiresAt: record.expiresAt, graceUntil: null, devOnly: false }));
	return { ok: true };
}

/**
 * Re-checks the activation with Lemon Squeezy and updates the badge state.
 * Unreachable: keeps the last good state for {@link GRACE_PERIOD_DAYS} days.
 */
export async function validate(
	ctx: PluginContext,
	host: string | null,
	deps: LicenseDeps = {},
): Promise<LicenseRecord | null> {
	const record = await readLicense(ctx);
	if (!record) return null;
	const product = deps.product ?? LEMON_SQUEEZY;
	const now = (deps.now ?? (() => new Date()))();
	const nowIso = now.toISOString();

	const key = await ctx.settings.get<string>(SETTING_KEYS.licenseKey);
	let next: LicenseRecord;
	if (!key) {
		next = { ...record, valid: false, problem: "key-missing", unreachable: false, lastCheckedAt: nowIso, lastError: null };
	} else if ((await sha256Hex(key.trim())) !== record.keyHash) {
		next = { ...record, valid: false, problem: "key-changed", unreachable: false, lastCheckedAt: nowIso, lastError: null };
	} else {
		const outcome = await validateLicense(fetchOf(ctx), product, key.trim(), record, host);
		if (outcome.kind === "unreachable") {
			next = { ...record, unreachable: true, lastCheckedAt: nowIso, lastError: outcome.reason };
		} else if (outcome.kind === "valid") {
			next = {
				...record,
				valid: true,
				status: outcome.status,
				expiresAt: outcome.expiresAt,
				variantId: outcome.variant.id,
				sites: outcome.variant.sites,
				term: outcome.variant.term,
				lastValidatedAt: nowIso,
				lastCheckedAt: nowIso,
				problem: null,
				unreachable: false,
				lastError: null,
			};
		} else {
			next = {
				...record,
				valid: false,
				status: outcome.status ?? record.status,
				expiresAt: outcome.expiresAt ?? record.expiresAt,
				lastValidatedAt: outcome.reason === "wrong-host" ? record.lastValidatedAt : nowIso,
				lastCheckedAt: nowIso,
				problem: outcome.reason,
				unreachable: false,
				lastError: outcome.message,
			};
		}
	}
	await ctx.settings.set(SETTING_KEYS.license, next);

	if (!next.valid) {
		await setBadge(ctx, SHOW_BADGE);
	} else if (next.unreachable) {
		// Keep the badge as it is until the grace period ends. A known
		// paid-through date still counts; without one (lifetime) the last
		// successful check stands in for it.
		const grace = next.lastValidatedAt ? graceUntil(next.lastValidatedAt) : null;
		await setBadge(ctx, (b) => ({
			...b,
			licenseExpiresAt: next.expiresAt ?? next.lastValidatedAt,
			graceUntil: grace,
		}));
	} else {
		await setBadge(ctx, (b) => ({ ...b, licenseExpiresAt: next.expiresAt, graceUntil: null, devOnly: false }));
	}
	return next;
}

/** Validates when the last attempt is older than a day. Never throws. */
export async function validateIfStale(
	ctx: PluginContext,
	host: string | null,
	deps: LicenseDeps = {},
): Promise<void> {
	try {
		const record = await readLicense(ctx);
		const now = (deps.now ?? (() => new Date()))();
		if (record && isValidationStale(record.lastCheckedAt, now)) await validate(ctx, host, deps);
	} catch (error) {
		ctx.log.warn("License check failed", { error: String(error) });
	}
}

export async function deactivate(ctx: PluginContext): Promise<LicenseActionResult> {
	const record = await readLicense(ctx);
	const key = await ctx.settings.get<string>(SETTING_KEYS.licenseKey);
	if (record && key) {
		const outcome = await deactivateLicense(fetchOf(ctx), key.trim(), record.instanceId);
		if (outcome.kind === "unreachable") return { ok: false, error: "unreachable" };
	}
	await ctx.settings.delete(SETTING_KEYS.license);
	await ctx.settings.delete(SETTING_KEYS.licenseKey);
	await setBadge(ctx, SHOW_BADGE);
	return { ok: true };
}

/** Activation moved to a new domain: free the old instance, activate here. */
export async function activateHere(
	ctx: PluginContext,
	host: string | null,
	deps: LicenseDeps = {},
): Promise<LicenseActionResult> {
	const record = await readLicense(ctx);
	const key = await ctx.settings.get<string>(SETTING_KEYS.licenseKey);
	if (!key) return { ok: false, error: "key-missing" };
	if (record) await deactivateLicense(fetchOf(ctx), key.trim(), record.instanceId);
	return activate(ctx, key, host, deps);
}

export async function setBadgeHidden(
	ctx: PluginContext,
	hidden: boolean,
	host: string | null,
	deps: LicenseDeps = {},
): Promise<LicenseActionResult> {
	if (!hidden) {
		await setBadge(ctx, (b) => ({ ...b, hidden: false, devOnly: false }));
		return { ok: true };
	}
	const now = (deps.now ?? (() => new Date()))();
	const record = await readLicense(ctx);
	if (licenseAllowsHiding(record, now)) {
		await setBadge(ctx, () => ({
			hidden: true,
			licenseExpiresAt: record!.expiresAt,
			graceUntil: null,
			devOnly: false,
		}));
		return { ok: true };
	}
	if (host && isDevHost(host)) {
		await setBadge(ctx, () => ({ hidden: true, licenseExpiresAt: null, graceUntil: null, devOnly: true }));
		return { ok: true };
	}
	return { ok: false, error: "needs-license" };
}

/** Current badge visibility as stored (for the admin toggle). */
export async function badgeHidden(ctx: PluginContext): Promise<boolean> {
	return (await readRuntime(ctx))?.badge.hidden === true;
}
