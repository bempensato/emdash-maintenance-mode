import { fileURLToPath } from "node:url";

import type { AstroIntegration } from "astro";

import { DEFAULT_ACCESS_PATH, DEFAULT_PAGE_PATH } from "../shared/keys";

export interface MaintenanceModeOptions {
	/** Public path of the maintenance page. Defaults to `/maintenance`. */
	path?: string;
	/**
	 * Project-relative path of an `.astro` layout for the maintenance page,
	 * for example `./src/layouts/Base.astro`. It receives `title` (and
	 * `content` for EmDash page contributions) and renders the page in its
	 * default slot. Defaults to a neutral built-in layout.
	 */
	layout?: string;
	/** Path of the password endpoint. Defaults to `/maintenance-access`. */
	accessPath?: string;
}

const VIRTUAL_ID = "virtual:emdash-maintenance-mode/config";
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;
/** Resolves straight to the layout file, so Vite never treats its path as root-relative. */
const LAYOUT_ID = "virtual:emdash-maintenance-mode/layout";

function normalizePath(value: string | undefined, fallback: string, name: string): string {
	const path = (value ?? fallback).trim();
	if (!path.startsWith("/") || path.startsWith("//") || /[?#\s]/.test(path) || path === "/") {
		throw new Error(`[maintenance-mode] "${name}" must be an absolute path like "${fallback}", got "${path}".`);
	}
	return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Astro companion of the Maintenance Mode plugin: the middleware that shows
 * the maintenance page to visitors and the route that renders it.
 */
export default function maintenanceMode(userOptions: MaintenanceModeOptions = {}): AstroIntegration {
	const path = normalizePath(userOptions.path, DEFAULT_PAGE_PATH, "path");
	const accessPath = normalizePath(userOptions.accessPath, DEFAULT_ACCESS_PATH, "accessPath");
	if (path === accessPath) {
		throw new Error('[maintenance-mode] "path" and "accessPath" must differ.');
	}

	return {
		name: "emdash-maintenance-mode",
		hooks: {
			"astro:config:setup": ({ config, addMiddleware, injectRoute, updateConfig }) => {
				if (config.output !== "server") {
					throw new Error(
						'[maintenance-mode] The maintenance page is rendered on demand: set `output: "server"` in astro.config.mjs.',
					);
				}

				const layoutFile = userOptions.layout
					? fileURLToPath(new URL(userOptions.layout, config.root))
					: fileURLToPath(new URL("./DefaultLayout.astro", import.meta.url));

				updateConfig({
					vite: {
						plugins: [
							{
								name: "emdash-maintenance-mode:config",
								resolveId(id: string) {
									if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
									if (id === LAYOUT_ID) return layoutFile;
									return undefined;
								},
								load(id: string) {
									if (id !== RESOLVED_VIRTUAL_ID) return undefined;
									return [
										`export { default as Layout } from ${JSON.stringify(LAYOUT_ID)};`,
										`export const options = ${JSON.stringify({ path, accessPath })};`,
									].join("\n");
								},
							},
						],
					},
				});

				injectRoute({
					pattern: path,
					entrypoint: new URL("./MaintenancePage.astro", import.meta.url),
					prerender: false,
				});

				addMiddleware({
					entrypoint: new URL("./middleware.ts", import.meta.url),
					order: "post",
				});
			},
		},
	};
}
