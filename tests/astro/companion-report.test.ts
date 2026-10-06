import { describe, expect, it, vi } from "vitest";

import { createCompanionReporter } from "../../src/astro/companion-report";
import type { LoadedState } from "../../src/astro/state";
import { PACKAGE_VERSION } from "../../src/shared/keys";
import { createDefaultRuntimeState } from "../../src/shared/state";

const loaded: LoadedState = { pluginId: "r_abc", state: createDefaultRuntimeState("x"), duplicate: true };
const withDb = { emdash: { db: { fake: true } } };

function setup(loadState: () => Promise<LoadedState | null>, write = vi.fn(async () => {})) {
	const tasks: Array<() => Promise<void>> = [];
	const report = createCompanionReporter({
		pagePath: "/maintenance",
		loadState,
		write,
		defer: (task) => tasks.push(task),
		now: () => new Date("2026-01-01T00:00:00Z"),
	});
	const flush = async () => {
		while (tasks.length) await tasks.shift()!();
	};
	return { report, write, flush, tasks };
}

describe("companion report", () => {
	it("waits for a request with a database handle", async () => {
		const { report, tasks } = setup(async () => loaded);
		report({});
		report({ emdash: {} });
		report(undefined);
		expect(tasks).toHaveLength(0);
	});

	it("writes the version once, under the installed plugin id", async () => {
		const { report, write, flush } = setup(async () => loaded);
		report(withDb);
		report(withDb);
		await flush();
		report(withDb);
		await flush();
		expect(write).toHaveBeenCalledTimes(1);
		expect(write).toHaveBeenCalledWith(withDb.emdash.db, "plugin:r_abc:settings:companion", {
			version: PACKAGE_VERSION,
			seenAt: "2026-01-01T00:00:00.000Z",
			path: "/maintenance",
			duplicateInstall: true,
		});
	});

	it("retries when the plugin has no state yet or the write fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		let current: LoadedState | null = null;
		const write = vi.fn(async () => {
			if (write.mock.calls.length === 1) throw new Error("busy");
		});
		const { report, flush } = setup(async () => current, write);
		report(withDb);
		await flush();
		expect(write).not.toHaveBeenCalled();
		current = loaded;
		report(withDb);
		await flush();
		report(withDb);
		await flush();
		expect(write).toHaveBeenCalledTimes(2);
	});
});
