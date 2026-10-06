import type { Block, BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext } from "emdash/plugin";
import * as z from "zod/mini";

import { hashPassword, randomToken, sha256Hex } from "../shared/crypto";
import { PREVIEW_QUERY_PARAM, SETTING_KEYS } from "../shared/keys";
import type { RuntimeState } from "../shared/state";
import type { AdminStrings } from "./i18n";
import { updateRuntime } from "./store";

/** Guest access section of the admin page: preview link, password, cookies. */

type Toast = NonNullable<BlockResponse["toast"]>;

export interface GuestActionResult {
	state: RuntimeState;
	toast: Toast;
}

const passwordSchema = z.object({ password: z.string().check(z.minLength(4), z.maxLength(256)) });
const cookieDaysSchema = z.object({
	days: z.union([z.number(), z.string()]),
});

/** Full preview URL for `token`, or null without a usable base URL. */
export function previewLinkUrl(baseUrl: string | null, token: string): string | null {
	if (!baseUrl) return null;
	try {
		const url = new URL("/", baseUrl);
		url.searchParams.set(PREVIEW_QUERY_PARAM, token);
		return url.href;
	} catch {
		return null;
	}
}

async function setNewLink(ctx: PluginContext): Promise<RuntimeState> {
	const token = randomToken();
	const linkTokenHash = await sha256Hex(token);
	await ctx.settings.set(SETTING_KEYS.previewToken, token);
	return updateRuntime(ctx, (s) => ({ ...s, guest: { ...s.guest, linkTokenHash } }));
}

/** Handles a guest-section block action; null when the action is not ours. */
export async function handleGuestAction(
	ctx: PluginContext,
	t: AdminStrings,
	actionId: string,
): Promise<GuestActionResult | null> {
	switch (actionId) {
		case "link_enable":
			return { state: await setNewLink(ctx), toast: { type: "success", message: t.linkEnabled } };
		case "link_regenerate":
			return { state: await setNewLink(ctx), toast: { type: "success", message: t.linkRegenerated } };
		case "link_disable": {
			await ctx.settings.delete(SETTING_KEYS.previewToken);
			const state = await updateRuntime(ctx, (s) => ({ ...s, guest: { ...s.guest, linkTokenHash: null } }));
			return { state, toast: { type: "success", message: t.linkDisabled } };
		}
		case "password_remove": {
			const state = await updateRuntime(ctx, (s) => ({ ...s, guest: { ...s.guest, password: null } }));
			return { state, toast: { type: "success", message: t.passwordRemoved } };
		}
		case "revoke_all": {
			const state = await updateRuntime(ctx, (s) => ({
				...s,
				guest: { ...s.guest, cookieVersion: s.guest.cookieVersion + 1 },
			}));
			return { state, toast: { type: "success", message: t.revoked } };
		}
		default:
			return null;
	}
}

/** Handles a guest-section form; null when the form is not ours. */
export async function handleGuestForm(
	ctx: PluginContext,
	t: AdminStrings,
	actionId: string,
	values: Record<string, unknown>,
	current: RuntimeState,
): Promise<GuestActionResult | null> {
	if (actionId === "set_password") {
		const parsed = passwordSchema.safeParse(values);
		if (!parsed.success) return { state: current, toast: { type: "error", message: t.passwordInvalid } };
		const password = await hashPassword(parsed.data.password);
		const state = await updateRuntime(ctx, (s) => ({ ...s, guest: { ...s.guest, password } }));
		return { state, toast: { type: "success", message: t.passwordSaved } };
	}
	if (actionId === "save_cookie_days") {
		const parsed = cookieDaysSchema.safeParse(values);
		const days = parsed.success ? Number(parsed.data.days) : Number.NaN;
		if (!Number.isInteger(days) || days < 1 || days > 365) {
			return { state: current, toast: { type: "error", message: t.cookieInvalid } };
		}
		const state = await updateRuntime(ctx, (s) => ({ ...s, guest: { ...s.guest, cookieMaxAgeDays: days } }));
		return { state, toast: { type: "success", message: t.cookieSaved } };
	}
	return null;
}

export async function guestBlocks(
	ctx: PluginContext,
	t: AdminStrings,
	state: RuntimeState,
	baseUrl: string | null,
): Promise<Block[]> {
	const blocks: Block[] = [
		{ type: "header", text: t.guestHeader },
		{ type: "context", text: t.guestIntro },
		{ type: "section", text: t.linkTitle },
	];

	const token = state.guest.linkTokenHash ? await ctx.settings.get<string>(SETTING_KEYS.previewToken) : null;
	if (state.guest.linkTokenHash && token) {
		const url = previewLinkUrl(baseUrl, token);
		if (url) blocks.push({ type: "context", text: t.linkOn }, { type: "code", language: "bash", code: url });
		else blocks.push({ type: "context", text: t.linkNoUrl });
		blocks.push({
			type: "actions",
			block_id: "link",
			elements: [
				{
					type: "button",
					action_id: "link_regenerate",
					label: t.linkRegenerate,
					confirm: {
						title: t.linkRegenerateConfirmTitle,
						text: t.linkRegenerateConfirmText,
						confirm: t.linkRegenerate,
						deny: t.cancel,
					},
				},
				{ type: "button", action_id: "link_disable", label: t.linkDisable },
			],
		});
	} else {
		blocks.push(
			{ type: "context", text: t.linkOff },
			{
				type: "actions",
				block_id: "link",
				elements: [{ type: "button", action_id: "link_enable", label: t.linkEnable }],
			},
		);
	}

	blocks.push(
		{ type: "section", text: t.passwordTitle },
		{ type: "context", text: state.guest.password ? t.passwordOn : t.passwordOff },
		{
			type: "form",
			block_id: "password",
			fields: [{ type: "secret_input", action_id: "password", label: t.passwordNew }],
			submit: { label: t.passwordSet, action_id: "set_password" },
		},
	);
	if (state.guest.password) {
		blocks.push({
			type: "actions",
			block_id: "password_actions",
			elements: [{ type: "button", action_id: "password_remove", label: t.passwordRemove }],
		});
	}

	blocks.push(
		{
			type: "form",
			block_id: "cookie",
			fields: [
				{
					type: "number_input",
					action_id: "days",
					label: t.cookieDays,
					initial_value: state.guest.cookieMaxAgeDays,
					min: 1,
					max: 365,
				},
			],
			submit: { label: t.cookieSave, action_id: "save_cookie_days" },
		},
		{
			type: "actions",
			block_id: "revoke",
			elements: [
				{
					type: "button",
					action_id: "revoke_all",
					label: t.revokeAll,
					style: "danger",
					confirm: {
						title: t.revokeConfirmTitle,
						text: t.revokeConfirmText,
						confirm: t.revokeConfirm,
						deny: t.cancel,
					},
				},
			],
		},
	);
	return blocks;
}
