import type { SandboxedPlugin } from "emdash/plugin";

/**
 * Sandboxed plugin entry: admin page, settings, guest access secrets and
 * license handling. Public-page gating lives in the Astro companion
 * (`src/astro/`), because plugins cannot intercept public requests.
 *
 * The same bundle runs from the registry, from npm in `sandboxed: []`
 * (Workers Paid) and from npm in `plugins: []` (Workers Free, in-process).
 */
const plugin: SandboxedPlugin = {
	hooks: {},
	routes: {},
};

export default plugin;
