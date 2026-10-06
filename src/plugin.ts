import type { SandboxedPlugin } from "emdash/plugin";

import type { RuntimeState } from "./shared/state";
import { handleAdmin } from "./plugin/admin";
import { siteHostname, validate } from "./plugin/license";
import { ensureRuntime, readRuntime } from "./plugin/store";

/**
 * Sandboxed plugin entry: admin page, settings, guest access secrets and
 * license handling. Public-page gating lives in the Astro companion
 * (`src/astro/`), because plugins cannot intercept public requests.
 *
 * The same bundle runs from the registry, from npm in `sandboxed: []`
 * (Workers Paid) and from npm in `plugins: []` (Workers Free, in-process).
 */

/** `page:metadata` runs on every public page view: keep the state for a few seconds. */
const METADATA_CACHE_MS = 10_000;

/** Daily license validation (cron triggers run only in production on Cloudflare). */
const LICENSE_CRON = "license-validate";
let metadataCache: { state: RuntimeState | null; expiresAt: number } | undefined;

const plugin: SandboxedPlugin = {
	hooks: {
		"plugin:install": async (_event, ctx) => {
			await ensureRuntime(ctx);
		},

		"plugin:activate": async (_event, ctx) => {
			await ensureRuntime(ctx);
			try {
				await ctx.cron?.schedule(LICENSE_CRON, { schedule: "17 3 * * *" });
			} catch (error) {
				ctx.log.warn("Could not schedule the daily license check", { error: String(error) });
			}
		},

		cron: async (event, ctx) => {
			if (event.name !== LICENSE_CRON) return;
			try {
				await validate(ctx, siteHostname(ctx));
			} catch (error) {
				ctx.log.warn("Daily license check failed", { error: String(error) });
			}
		},

		"page:metadata": async (_event, ctx) => {
			try {
				const now = Date.now();
				if (!metadataCache || now >= metadataCache.expiresAt) {
					metadataCache = { state: await readRuntime(ctx), expiresAt: now + METADATA_CACHE_MS };
				}
				if (!metadataCache.state?.enabled) return null;
				return { kind: "meta", name: "robots", content: "noindex, nofollow" };
			} catch {
				return null;
			}
		},
	},

	routes: {
		admin: {
			permission: "plugins:manage",
			handler: async (routeCtx, ctx) => {
				metadataCache = undefined;
				return handleAdmin(routeCtx, ctx);
			},
		},
	},
};

export default plugin;
