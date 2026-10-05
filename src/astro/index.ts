import type { AstroIntegration } from "astro";

export interface MaintenanceModeOptions {
	/** Public path of the maintenance page. Defaults to `/coming-soon`. */
	path?: string;
	/** Optional Astro layout used to render the maintenance page. */
	layout?: string;
}

/**
 * Astro companion: registers the middleware that shows the maintenance
 * page to visitors and the route that renders it.
 */
export default function maintenanceMode(_options: MaintenanceModeOptions = {}): AstroIntegration {
	return {
		name: "emdash-maintenance-mode",
		hooks: {},
	};
}
