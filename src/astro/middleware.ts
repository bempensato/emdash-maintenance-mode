import type { MiddlewareHandler } from "astro";
import { after, getPluginSetting, getRequestContext, OptionsRepository } from "emdash";
import { options } from "virtual:emdash-maintenance-mode/config";

import { createCompanionReporter } from "./companion-report";
import { createGate } from "./gate";
import { loadRuntimeState } from "./state";

/**
 * Visitor gate, registered by the integration with `order: "post"` so it runs
 * after EmDash's middleware has set `locals.user`, `locals.emdash` and the
 * request context.
 */

type Db = ConstructorParameters<typeof OptionsRepository>[0];

const loadState = () => loadRuntimeState(getPluginSetting);

const reportCompanion = createCompanionReporter({
	pagePath: options.path,
	loadState,
	write: (db, name, value) => new OptionsRepository(db as Db).set(name, value),
	defer: after,
});

const gate = createGate({
	options,
	loadState,
	hasValidPreview: () => getRequestContext()?.preview !== undefined,
});

export const onRequest: MiddlewareHandler = (context, next) => {
	try {
		reportCompanion(context.locals);
	} catch {
		// Reporting is best effort and never affects the response.
	}
	return gate(context, next);
};
