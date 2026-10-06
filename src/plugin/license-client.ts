import { findVariant, type ProductConfig, type Variant } from "../shared/product";

/**
 * Lemon Squeezy License API client (https://docs.lemonsqueezy.com/api/license-api).
 * Form-encoded POSTs to api.lemonsqueezy.com, no API key. Errors come back as
 * 400/404/422 with a JSON body (`error`); only transport failures, 429 and
 * 5xx count as "unreachable", which is what the grace period covers.
 *
 * The license key is sent only to Lemon Squeezy and never logged.
 */

export const LS_API_BASE = "https://api.lemonsqueezy.com/v1/licenses";

export type LsFetch = (url: string, init: RequestInit) => Promise<Response>;

export type LicenseStatus = "inactive" | "active" | "expired" | "disabled";

interface LsBody {
	activated?: boolean;
	valid?: boolean;
	deactivated?: boolean;
	error?: string | null;
	license_key?: {
		status?: string;
		expires_at?: string | null;
		activation_limit?: number | null;
		activation_usage?: number | null;
	};
	instance?: { id?: string; name?: string } | null;
	meta?: { store_id?: number; product_id?: number; variant_id?: number };
}

type CallResult = { reachable: true; status: number; body: LsBody } | { reachable: false; reason: string };

async function call(fetch: LsFetch, endpoint: string, params: Record<string, string>): Promise<CallResult> {
	let response: Response;
	try {
		response = await fetch(`${LS_API_BASE}/${endpoint}`, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams(params).toString(),
		});
	} catch {
		return { reachable: false, reason: "network" };
	}
	if (response.status === 429 || response.status >= 500) {
		return { reachable: false, reason: `http ${response.status}` };
	}
	try {
		const body: unknown = await response.json();
		if (typeof body !== "object" || body === null) return { reachable: false, reason: "bad response" };
		return { reachable: true, status: response.status, body: body as LsBody };
	} catch {
		return { reachable: false, reason: "bad response" };
	}
}

function errorText(body: LsBody, fallback: string): string {
	return typeof body.error === "string" && body.error.trim() ? body.error.trim().slice(0, 300) : fallback;
}

/** The variant when the response's store, product and variant are ours. */
export function matchProduct(body: LsBody, product: ProductConfig): Variant | null {
	const meta = body.meta;
	if (!meta || product.storeId === null || product.productId === null) return null;
	if (meta.store_id !== product.storeId || meta.product_id !== product.productId) return null;
	return findVariant(meta.variant_id, product) ?? null;
}

function parseStatus(value: unknown): LicenseStatus | null {
	return value === "inactive" || value === "active" || value === "expired" || value === "disabled" ? value : null;
}

function isoOrNull(value: unknown): string | null {
	return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

// ---------------------------------------------------------------------------

export type ActivationOutcome =
	| { kind: "activated"; instanceId: string; status: LicenseStatus; expiresAt: string | null; variant: Variant }
	| { kind: "rejected"; reason: "wrong-product" | "expired" | "disabled" | "limit" | "invalid"; message: string }
	| { kind: "unreachable"; reason: string };

export async function activateLicense(
	fetch: LsFetch,
	product: ProductConfig,
	key: string,
	instanceName: string,
): Promise<ActivationOutcome> {
	const result = await call(fetch, "activate", { license_key: key, instance_name: instanceName });
	if (!result.reachable) return { kind: "unreachable", reason: result.reason };
	const { body } = result;
	const status = parseStatus(body.license_key?.status);
	const instanceId = body.instance?.id;

	if (body.activated !== true || typeof instanceId !== "string" || !instanceId) {
		const reason =
			status === "expired"
				? "expired"
				: status === "disabled"
					? "disabled"
					: body.license_key?.activation_limit != null &&
						  body.license_key.activation_usage != null &&
						  body.license_key.activation_usage >= body.license_key.activation_limit
						? "limit"
						: "invalid";
		return { kind: "rejected", reason, message: errorText(body, "The license key could not be activated.") };
	}

	const variant = matchProduct(body, product);
	if (!variant) {
		// Give the activation back: the key belongs to another product.
		await call(fetch, "deactivate", { license_key: key, instance_id: instanceId });
		return { kind: "rejected", reason: "wrong-product", message: "This license key is not for this plugin." };
	}
	return {
		kind: "activated",
		instanceId,
		status: status ?? "active",
		expiresAt: isoOrNull(body.license_key?.expires_at),
		variant,
	};
}

export type ValidationOutcome =
	| { kind: "valid"; status: LicenseStatus; expiresAt: string | null; variant: Variant }
	| {
			kind: "invalid";
			reason: "wrong-product" | "expired" | "disabled" | "wrong-instance" | "wrong-host" | "invalid";
			status: LicenseStatus | null;
			expiresAt: string | null;
			message: string;
	  }
	| { kind: "unreachable"; reason: string };

/**
 * Validates the activation of `key` on this site. `currentHost` is the
 * site's hostname now; when it differs from the activation's instance name
 * the key is treated as not activated here (domain binding).
 */
export async function validateLicense(
	fetch: LsFetch,
	product: ProductConfig,
	key: string,
	activation: { instanceId: string; instanceName: string },
	currentHost: string | null,
): Promise<ValidationOutcome> {
	if (currentHost !== null && currentHost !== activation.instanceName) {
		return {
			kind: "invalid",
			reason: "wrong-host",
			status: null,
			expiresAt: null,
			message: `The license was activated for ${activation.instanceName}.`,
		};
	}
	const result = await call(fetch, "validate", { license_key: key, instance_id: activation.instanceId });
	if (!result.reachable) return { kind: "unreachable", reason: result.reason };
	const { body } = result;
	const status = parseStatus(body.license_key?.status);
	const expiresAt = isoOrNull(body.license_key?.expires_at);
	const invalid = (reason: Extract<ValidationOutcome, { kind: "invalid" }>["reason"], message: string) =>
		({ kind: "invalid", reason, status, expiresAt, message }) as const;

	if (body.valid !== true) {
		if (status === "expired") return invalid("expired", errorText(body, "The license has expired."));
		if (status === "disabled") return invalid("disabled", errorText(body, "The license has been disabled."));
		return invalid("invalid", errorText(body, "The license key is not valid."));
	}
	const variant = matchProduct(body, product);
	if (!variant) return invalid("wrong-product", "This license key is not for this plugin.");
	if (body.instance?.id !== undefined && body.instance.id !== activation.instanceId) {
		return invalid("wrong-instance", "The license is not activated on this site.");
	}
	if (status !== "active") {
		return invalid(status === "expired" ? "expired" : status === "disabled" ? "disabled" : "invalid", "The license is not active.");
	}
	return { kind: "valid", status, expiresAt, variant };
}

export type DeactivationOutcome = { kind: "done" } | { kind: "unreachable"; reason: string };

/** Frees the activation slot. Any answer from Lemon Squeezy counts as done. */
export async function deactivateLicense(fetch: LsFetch, key: string, instanceId: string): Promise<DeactivationOutcome> {
	const result = await call(fetch, "deactivate", { license_key: key, instance_id: instanceId });
	return result.reachable ? { kind: "done" } : { kind: "unreachable", reason: result.reason };
}
