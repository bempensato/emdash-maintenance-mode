import { afterEach, describe, expect, it, vi } from "vitest";

import { clearRuntimeStateCache, loadRuntimeState, readRuntimeState } from "../../src/astro/state";
import { registryPluginId } from "../../src/shared/plugin-id";
import { createDefaultRuntimeState } from "../../src/shared/state";

const older = { ...createDefaultRuntimeState("a"), updatedAt: "2026-01-01T00:00:00.000Z" };
const newer = { ...createDefaultRuntimeState("b"), enabled: true, updatedAt: "2026-02-01T00:00:00.000Z" };

afterEach(() => clearRuntimeStateCache());

function reader(values: Record<string, unknown>) {
	return vi.fn(async (pluginId: string, key: string) => values[`${pluginId}/${key}`]);
}

describe("companion state", () => {
	it("reads the npm install", async () => {
		const loaded = await readRuntimeState(reader({ "maintenance-mode/runtime": older }));
		expect(loaded).toEqual({ pluginId: "maintenance-mode", state: older });
	});

	it("reads the registry install", async () => {
		const id = await registryPluginId();
		const loaded = await readRuntimeState(reader({ [`${id}/runtime`]: newer }));
		expect(loaded).toEqual({ pluginId: id, state: newer });
	});

	it("prefers the newer state when both ids have one", async () => {
		const id = await registryPluginId();
		expect(
			(await readRuntimeState(reader({ "maintenance-mode/runtime": older, [`${id}/runtime`]: newer })))?.pluginId,
		).toBe(id);
		expect(
			(await readRuntimeState(reader({ "maintenance-mode/runtime": newer, [`${id}/runtime`]: older })))?.pluginId,
		).toBe("maintenance-mode");
	});

	it("ignores invalid values", async () => {
		const id = await registryPluginId();
		const loaded = await readRuntimeState(reader({ "maintenance-mode/runtime": { v: 9 }, [`${id}/runtime`]: older }));
		expect(loaded?.pluginId).toBe(id);
		expect(await readRuntimeState(reader({}))).toBeNull();
	});

	it("caches for 10 seconds, including a missing state", async () => {
		const read = reader({});
		expect(await loadRuntimeState(read, 0)).toBeNull();
		expect(await loadRuntimeState(read, 9_999)).toBeNull();
		expect(read).toHaveBeenCalledTimes(2); // one call per id
		await loadRuntimeState(read, 10_000);
		expect(read).toHaveBeenCalledTimes(4);
	});

	it("does not cache errors", async () => {
		const read = vi.fn(async () => {
			throw new Error("down");
		});
		await expect(loadRuntimeState(read, 0)).rejects.toThrow("down");
		const ok = reader({ "maintenance-mode/runtime": older });
		expect((await loadRuntimeState(ok, 1))?.state).toEqual(older);
	});
});
