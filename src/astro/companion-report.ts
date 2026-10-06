import { PACKAGE_VERSION, SETTING_KEYS, settingOptionName } from "../shared/keys";
import type { LoadedState } from "./state";

/**
 * Records `{ version, seenAt, path, duplicateInstall }` in the plugin's `companion` setting, so the
 * admin page can tell the companion is installed and up to date.
 *
 * EmDash exposes the database (`locals.emdash.db`) only on requests that run
 * the full runtime (logged-in users, admin), so the report waits for one of
 * those. It is written once per isolate; failures are retried later.
 */

export interface CompanionReporterDeps {
	/** Public path of the maintenance page, shown in the admin. */
	pagePath: string;
	loadState: () => Promise<LoadedState | null>;
	/** Writes one options row with the given database handle. */
	write: (db: unknown, name: string, value: unknown) => Promise<void>;
	/** Runs work after the response (`after` from `emdash`). */
	defer: (task: () => Promise<void>) => void;
	now?: () => Date;
}

export function createCompanionReporter(deps: CompanionReporterDeps) {
	let state: "pending" | "running" | "done" = "pending";

	return function report(locals: unknown): void {
		if (state !== "pending") return;
		const db = (locals as { emdash?: { db?: unknown } } | undefined)?.emdash?.db;
		if (!db) return;
		state = "running";
		deps.defer(async () => {
			try {
				const loaded = await deps.loadState();
				// Plugin not installed or not initialised yet: try again later.
				if (!loaded) {
					state = "pending";
					return;
				}
				await deps.write(db, settingOptionName(loaded.pluginId, SETTING_KEYS.companion), {
					version: PACKAGE_VERSION,
					seenAt: (deps.now?.() ?? new Date()).toISOString(),
					path: deps.pagePath,
					duplicateInstall: loaded.duplicate,
				});
				state = "done";
			} catch (error) {
				state = "pending";
				console.error("[maintenance-mode] could not record the companion version:", error);
			}
		});
	};
}
