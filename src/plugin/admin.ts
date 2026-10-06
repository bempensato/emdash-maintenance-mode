import type { Block, BlockResponse } from "@emdash-cms/blocks";
import type { PluginContext } from "emdash/plugin";
import * as z from "zod/mini";

import { PACKAGE_VERSION, PLUGIN_SLUG, SETTING_KEYS } from "../shared/keys";
import { BYPASS_ROLES, MODES, type BypassMinRole, type Mode, type PageRef, type RuntimeState } from "../shared/state";
import { guestBlocks, handleGuestAction, handleGuestForm } from "./guest-admin";
import { adminLocale, adminStrings, type AdminStrings } from "./i18n";
import { siteHostname, validateIfStale } from "./license";
import { handleLicenseAction, handleLicenseForm, licenseBlocks } from "./license-admin";
import { ensureRuntime, readRuntime, updateRuntime } from "./store";

/**
 * The plugin's admin page (Block Kit, private `admin` route).
 */

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

const interactionSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("page_load"), page: z.optional(z.string()) }),
	z.object({
		type: z.literal("block_action"),
		action_id: z.string(),
		block_id: z.optional(z.string()),
		value: z.optional(z.unknown()),
	}),
	z.object({
		type: z.literal("form_submit"),
		action_id: z.string(),
		block_id: z.optional(z.string()),
		values: z.record(z.string(), z.unknown()),
	}),
]);

export type Interaction = z.infer<typeof interactionSchema>;

const settingsSchema = z.object({
	mode: z.enum(["coming-soon", "maintenance"]),
	page: z.optional(z.string()),
	bypass: z.enum(["20", "40", "50"]),
});

// ---------------------------------------------------------------------------
// Page options
// ---------------------------------------------------------------------------

/** Most entries listed per collection in the page picker. */
const ENTRIES_PER_COLLECTION = 100;
/** Most options in the page picker (Block Kit arrays hold up to 1000 items). */
const MAX_PAGE_OPTIONS = 500;

interface PageOption {
	label: string;
	value: string;
}

export function encodePage(page: PageRef): string {
	return JSON.stringify([page.collection, page.slug]);
}

export function decodePage(value: string | undefined): PageRef | null | undefined {
	if (!value) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		if (
			Array.isArray(parsed) &&
			parsed.length === 2 &&
			typeof parsed[0] === "string" &&
			typeof parsed[1] === "string" &&
			parsed[0] &&
			parsed[1]
		) {
			return { collection: parsed[0], slug: parsed[1] };
		}
	} catch {
		// Fall through.
	}
	return undefined;
}

function entryTitle(data: Record<string, unknown>, slug: string): string {
	const title = data.title ?? data.name;
	return typeof title === "string" && title.trim() ? title.trim() : slug;
}

/** Published entries of every visible collection, `pages` first. */
async function listPageOptions(ctx: PluginContext, t: AdminStrings, current: PageRef | null): Promise<PageOption[]> {
	const options: PageOption[] = [{ label: t.pageNone, value: "" }];
	let currentListed = current === null;
	try {
		const collections = (await ctx.schema?.listCollections()) ?? [];
		const visible = collections
			.filter((c) => !c.hidden)
			.sort((a, b) => (a.slug === "pages" ? -1 : b.slug === "pages" ? 1 : a.label.localeCompare(b.label)));
		for (const collection of visible) {
			if (options.length >= MAX_PAGE_OPTIONS) break;
			const result = await ctx.content?.list(collection.slug, {
				limit: ENTRIES_PER_COLLECTION,
				where: { status: "published" },
			});
			for (const item of result?.items ?? []) {
				if (!item.slug || options.length >= MAX_PAGE_OPTIONS) continue;
				const ref = { collection: collection.slug, slug: item.slug };
				if (current && current.collection === ref.collection && current.slug === ref.slug) currentListed = true;
				options.push({ label: `${collection.label} — ${entryTitle(item.data, item.slug)}`, value: encodePage(ref) });
			}
		}
	} catch (error) {
		ctx.log.warn("Could not list the pages for the page picker", { error: String(error) });
	}
	if (current && !currentListed) {
		options.push({ label: `${current.collection} — ${current.slug} (${t.pageUnpublished})`, value: encodePage(current) });
	}
	return options;
}

// ---------------------------------------------------------------------------
// Companion status
// ---------------------------------------------------------------------------

export interface CompanionInfo {
	version: string;
	seenAt: string;
	path: string | null;
	duplicateInstall: boolean;
}

export function parseCompanion(value: unknown): CompanionInfo | null {
	if (typeof value !== "object" || value === null) return null;
	const v = value as Record<string, unknown>;
	if (typeof v.version !== "string" || typeof v.seenAt !== "string") return null;
	return {
		version: v.version,
		seenAt: v.seenAt,
		path: typeof v.path === "string" && v.path.startsWith("/") ? v.path : null,
		duplicateInstall: v.duplicateInstall === true,
	};
}

/** Numeric comparison of dotted versions; pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
	const parts = (v: string) => v.split("-")[0]!.split(".").map((n) => Number.parseInt(n, 10) || 0);
	const pa = parts(a);
	const pb = parts(b);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

export function companionSnippet(registryInstall: boolean): string {
	if (registryInstall) {
		return [
			"// pnpm add emdash-maintenance-mode",
			"// astro.config.mjs",
			'import maintenanceMode from "emdash-maintenance-mode/astro";',
			"",
			"export default defineConfig({",
			"\tintegrations: [",
			"\t\temdash({ /* … */ }),",
			"\t\tmaintenanceMode(),",
			"\t],",
			"});",
		].join("\n");
	}
	return [
		"// astro.config.mjs",
		'import maintenanceModePlugin from "emdash-maintenance-mode";',
		'import maintenanceMode from "emdash-maintenance-mode/astro";',
		"",
		"export default defineConfig({",
		"\tintegrations: [",
		"\t\temdash({ plugins: [maintenanceModePlugin] }),",
		"\t\tmaintenanceMode(),",
		"\t],",
		"});",
	].join("\n");
}

function setupBlocks(ctx: PluginContext, t: AdminStrings, companion: CompanionInfo | null): Block[] {
	const blocks: Block[] = [{ type: "header", text: t.setupHeader }];
	if (!companion) {
		blocks.push(
			{ type: "banner", variant: "alert", title: t.companionMissingTitle, description: t.companionMissingText },
			{ type: "code", language: "ts", code: companionSnippet(ctx.plugin.id !== PLUGIN_SLUG) },
			{ type: "context", text: t.companionNoUser },
		);
		return blocks;
	}
	if (companion.duplicateInstall) {
		blocks.push({ type: "banner", variant: "error", title: t.companionDuplicateTitle, description: t.companionDuplicateText });
	}
	if (compareVersions(companion.version, PACKAGE_VERSION) < 0) {
		blocks.push({
			type: "banner",
			variant: "alert",
			title: t.companionOutdatedTitle,
			description: t.companionOutdatedText(companion.version, PACKAGE_VERSION),
		});
	} else {
		blocks.push({ type: "context", text: t.companionOk(companion.version) });
	}
	return blocks;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Base URL of the public site: the configured site URL, or the origin of the
 * admin request when none is configured.
 */
export function siteBaseUrl(configured: string, requestUrl: string | undefined): string | null {
	for (const candidate of [configured, requestUrl]) {
		if (!candidate) continue;
		try {
			const url = new URL(candidate);
			if (url.protocol === "https:" || url.protocol === "http:") return configured === candidate ? candidate : url.origin;
		} catch {
			// Try the next one.
		}
	}
	return null;
}

export function publicUrl(siteUrl: string, path: string): string | null {
	try {
		const url = new URL(path, siteUrl);
		return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
	} catch {
		return null;
	}
}

async function buildPage(
	ctx: PluginContext,
	t: AdminStrings,
	state: RuntimeState,
	companion: CompanionInfo | null,
	baseUrl: string | null,
	host: string | null,
): Promise<Block[]> {
	const blocks: Block[] = [{ type: "header", text: t.title }];

	// 1. Status
	const pageUrl = companion?.path && baseUrl ? publicUrl(baseUrl, companion.path) : null;
	blocks.push(
		state.enabled
			? {
					type: "banner",
					variant: "alert",
					title: t.statusHiddenTitle,
					description: t.statusHiddenText(t.modeName[state.mode] ?? state.mode),
				}
			: { type: "banner", variant: "default", title: t.statusPublicTitle, description: t.statusPublicText },
		{
			type: "actions",
			block_id: "status",
			elements: [
				state.enabled
					? { type: "button", action_id: "disable", label: t.turnOff, style: "secondary" }
					: {
							type: "button",
							action_id: "enable",
							label: t.turnOn,
							style: "primary",
							confirm: {
								title: t.turnOnConfirmTitle,
								text: t.turnOnConfirmText,
								confirm: t.turnOnConfirm,
								deny: t.cancel,
							},
						},
				...(pageUrl
					? [{ type: "link" as const, label: t.openPage, target: { kind: "external" as const, url: pageUrl } }]
					: []),
			],
		},
	);

	// 2–3. Mode, page, bypass
	const pageOptions = await listPageOptions(ctx, t, state.page);
	blocks.push(
		{ type: "header", text: t.settingsHeader },
		{
			type: "form",
			block_id: "settings",
			fields: [
				{
					type: "select",
					action_id: "mode",
					label: t.mode,
					options: [
						{ label: t.modeComingSoon, value: "coming-soon" },
						{ label: t.modeMaintenance, value: "maintenance" },
					],
					initial_value: state.mode,
				},
				{
					type: "combobox",
					action_id: "page",
					label: t.page,
					options: pageOptions,
					initial_value: state.page ? encodePage(state.page) : "",
				},
				{
					type: "select",
					action_id: "bypass",
					label: t.bypass,
					options: [
						{ label: t.bypassEditors, value: "40" },
						{ label: t.bypassAdmins, value: "50" },
						{ label: t.bypassAll, value: "20" },
					],
					initial_value: String(state.bypassMinRole),
				},
			],
			submit: { label: t.save, action_id: "save_settings" },
		},
		{ type: "context", text: t.pageHint },
	);

	// 4. Guest access
	blocks.push({ type: "divider" }, ...(await guestBlocks(ctx, t, state, baseUrl)));

	// 5. License
	blocks.push({ type: "divider" }, ...(await licenseBlocks(ctx, t, state, host)));

	// 6. Setup check
	blocks.push({ type: "divider" }, ...setupBlocks(ctx, t, companion));
	return blocks;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

type Toast = NonNullable<BlockResponse["toast"]>;

async function applySettings(
	ctx: PluginContext,
	t: AdminStrings,
	values: Record<string, unknown>,
	state: RuntimeState,
): Promise<{ state: RuntimeState; toast: Toast }> {
	const parsed = settingsSchema.safeParse(values);
	if (!parsed.success) return { state, toast: { type: "error", message: t.invalidInput } };
	const page = decodePage(parsed.data.page);
	if (page === undefined) return { state, toast: { type: "error", message: t.invalidPage } };
	if (page) {
		const options = await listPageOptions(ctx, t, null);
		if (!options.some((o) => o.value === encodePage(page))) {
			return { state, toast: { type: "error", message: t.invalidPage } };
		}
	}
	const mode = parsed.data.mode as Mode;
	const bypassMinRole = Number(parsed.data.bypass) as BypassMinRole;
	if (!MODES.includes(mode) || !BYPASS_ROLES.includes(bypassMinRole)) {
		return { state, toast: { type: "error", message: t.invalidInput } };
	}
	const next = await updateRuntime(ctx, (s) => ({ ...s, mode, page, bypassMinRole }));
	return { state: next, toast: { type: "success", message: t.saved } };
}

export async function handleAdmin(
	routeCtx: { input: unknown; ui?: { locale?: string }; request?: { url?: string } },
	ctx: PluginContext,
): Promise<BlockResponse> {
	const t = adminStrings(adminLocale(routeCtx.ui?.locale));
	let state = await ensureRuntime(ctx);
	let toast: Toast | undefined;

	const parsed = interactionSchema.safeParse(routeCtx.input);
	const interaction = parsed.success ? parsed.data : null;
	if (!parsed.success) toast = { type: "error", message: t.invalidInput };
	const host = siteHostname(ctx, routeCtx.request?.url);

	if (interaction?.type === "page_load") {
		await validateIfStale(ctx, host);
		state = (await readRuntime(ctx)) ?? state;
	}

	if (interaction?.type === "block_action") {
		if (interaction.action_id === "enable" || interaction.action_id === "disable") {
			const enabled = interaction.action_id === "enable";
			state = await updateRuntime(ctx, (s) => ({ ...s, enabled }));
			toast = { type: "success", message: enabled ? t.turnedOn : t.turnedOff };
		} else {
			const result = await handleGuestAction(ctx, t, interaction.action_id);
			if (result) ({ state, toast } = result);
			else {
				toast = (await handleLicenseAction(ctx, t, interaction.action_id, host)) ?? undefined;
				state = (await readRuntime(ctx)) ?? state;
			}
		}
	} else if (interaction?.type === "form_submit") {
		if (interaction.action_id === "save_settings") {
			({ state, toast } = await applySettings(ctx, t, interaction.values, state));
		} else {
			const result = await handleGuestForm(ctx, t, interaction.action_id, interaction.values, state);
			if (result) ({ state, toast } = result);
			else {
				toast = (await handleLicenseForm(ctx, t, interaction.action_id, interaction.values, host)) ?? undefined;
				state = (await readRuntime(ctx)) ?? state;
			}
		}
	}

	const companion = parseCompanion(await ctx.settings.get(SETTING_KEYS.companion));
	const baseUrl = siteBaseUrl(ctx.site.url, routeCtx.request?.url);
	const blocks = await buildPage(ctx, t, state, companion, baseUrl, host);
	return toast ? { blocks, toast } : { blocks };
}
