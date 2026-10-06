import type { Block, BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext } from "emdash/plugin";
import * as z from "zod/mini";

import { isDevHost } from "../shared/license";
import { LEMON_SQUEEZY } from "../shared/product";
import type { RuntimeState } from "../shared/state";
import type { AdminStrings } from "./i18n";
import {
	activate,
	activateHere,
	deactivate,
	licenseAllowsHiding,
	readLicense,
	setBadgeHidden,
	type LicenseActionResult,
	type LicenseDeps,
	type LicenseRecord,
} from "./license";
import { readRuntime } from "./store";

/** License section of the admin page. */

type Toast = NonNullable<BlockResponse["toast"]>;

const keySchema = z.object({ license_key: z.string() });

function day(iso: string | null): string {
	return iso ? iso.slice(0, 10) : "—";
}

function errorToast(t: AdminStrings, result: Extract<LicenseActionResult, { ok: false }>): Toast {
	const base = t.licenseErrors[result.error] ?? t.licenseErrors.rejected!;
	return { type: "error", message: result.detail ? `${base} ${result.detail}` : base };
}

export async function handleLicenseAction(
	ctx: PluginContext,
	t: AdminStrings,
	actionId: string,
	host: string | null,
	deps: LicenseDeps = {},
): Promise<Toast | null> {
	let result: LicenseActionResult;
	let success: string;
	switch (actionId) {
		case "license_deactivate":
			result = await deactivate(ctx);
			success = t.licenseDeactivated;
			break;
		case "license_activate_here":
			result = await activateHere(ctx, host, deps);
			success = t.licenseActivated;
			break;
		case "badge_hide":
			result = await setBadgeHidden(ctx, true, host, deps);
			success = t.badgeHidden;
			break;
		case "badge_show":
			result = await setBadgeHidden(ctx, false, host, deps);
			success = t.badgeShown;
			break;
		default:
			return null;
	}
	return result.ok ? { type: "success", message: success } : errorToast(t, result);
}

export async function handleLicenseForm(
	ctx: PluginContext,
	t: AdminStrings,
	actionId: string,
	values: Record<string, unknown>,
	host: string | null,
	deps: LicenseDeps = {},
): Promise<Toast | null> {
	if (actionId !== "license_activate") return null;
	const parsed = keySchema.safeParse(values);
	const result = await activate(ctx, parsed.success ? parsed.data.license_key : "", host, deps);
	return result.ok ? { type: "success", message: t.licenseActivated } : errorToast(t, result);
}

function statusText(t: AdminStrings, record: LicenseRecord | null, host: string | null, now: Date): string {
	if (!record) return host && isDevHost(host) ? `${t.licenseFree} ${t.licenseDevHost}` : t.licenseFree;
	if (record.valid) {
		const plan = record.sites ? t.licenseSites(record.sites) : "";
		const pro = t.licensePro(plan, record.term === "lifetime" ? null : day(record.expiresAt));
		if (record.unreachable && record.lastValidatedAt) {
			const grace = new Date(Date.parse(record.lastValidatedAt) + 7 * 86_400_000).toISOString();
			return `${pro} ${t.licenseUnreachable(day(record.lastValidatedAt), day(grace))}`;
		}
		if (!licenseAllowsHiding(record, now)) return t.licenseProblem.expired;
		return pro;
	}
	if (record.problem === "wrong-host") return t.licenseProblem["wrong-host"](record.instanceName);
	const problem = record.problem && record.problem in t.licenseProblem ? record.problem : "invalid";
	const text = t.licenseProblem[problem as Exclude<keyof AdminStrings["licenseProblem"], "wrong-host">];
	return typeof text === "string" ? text : t.licenseProblem.invalid;
}

export async function licenseBlocks(
	ctx: PluginContext,
	t: AdminStrings,
	state: RuntimeState,
	host: string | null,
	now: Date = new Date(),
): Promise<Block[]> {
	const record = await readLicense(ctx);
	const blocks: Block[] = [
		{ type: "header", text: t.licenseHeader },
		{ type: "context", text: statusText(t, record, host, now) },
	];

	if (!record || (!record.valid && record.problem !== "wrong-host")) {
		blocks.push({
			type: "form",
			block_id: "license",
			fields: [{ type: "secret_input", action_id: "license_key", label: t.licenseKey }],
			submit: { label: t.licenseActivate, action_id: "license_activate" },
		});
	}

	const elements: Extract<Block, { type: "actions" }>["elements"] = [];
	const canHide = licenseAllowsHiding(record, now) || (host !== null && isDevHost(host));
	const hidden = (await readRuntime(ctx))?.badge.hidden ?? state.badge.hidden;
	if (hidden) elements.push({ type: "button", action_id: "badge_show", label: t.badgeShow });
	else if (canHide) elements.push({ type: "button", action_id: "badge_hide", label: t.badgeHide, style: "primary" });
	if (record?.problem === "wrong-host") {
		elements.push({ type: "button", action_id: "license_activate_here", label: t.licenseActivateHere, style: "primary" });
	}
	if (record) {
		elements.push({
			type: "button",
			action_id: "license_deactivate",
			label: t.licenseDeactivate,
			confirm: {
				title: t.licenseDeactivateConfirmTitle,
				text: t.licenseDeactivateConfirmText,
				confirm: t.licenseDeactivateConfirm,
				deny: t.cancel,
			},
		});
	}
	if (!record?.valid) {
		elements.push({ type: "link", label: t.licenseBuy, target: { kind: "external", url: LEMON_SQUEEZY.buyUrl } });
	}
	if (elements.length) blocks.push({ type: "actions", block_id: "license_actions", elements });
	blocks.push({ type: "context", text: t.licensePrivacy });
	return blocks;
}
