import { SETTING_KEYS } from "../shared/keys";
import { candidatePluginIds } from "../shared/plugin-id";
import { newerState, parseRuntimeState, type RuntimeState } from "../shared/state";

/**
 * Reads the plugin's `runtime` setting for the companion.
 *
 * The plugin id depends on how it was installed (npm slug or registry hash),
 * so both are tried; if both have state (installed twice) the more recently
 * updated one wins. Results are cached per isolate for {@link CACHE_TTL_MS}.
 */

export const CACHE_TTL_MS = 10_000;

/** Reads one plugin setting; `getPluginSetting` from `emdash` in production. */
export type SettingReader = (pluginId: string, key: string) => Promise<unknown>;

export interface LoadedState {
	state: RuntimeState;
	pluginId: string;
	/** Both the npm and the registry install have state (installed twice). */
	duplicate: boolean;
}

interface CacheEntry {
	value: LoadedState | null;
	expiresAt: number;
}

let cache: CacheEntry | undefined;

/** Reads and picks the state without caching. Throws on read errors. */
export async function readRuntimeState(read: SettingReader): Promise<LoadedState | null> {
	const ids = await candidatePluginIds();
	const raws = await Promise.all(ids.map((id) => read(id, SETTING_KEYS.runtime)));
	let best: LoadedState | null = null;
	let found = 0;
	for (const [i, pluginId] of ids.entries()) {
		const state = parseRuntimeState(raws[i]);
		if (!state) continue;
		found++;
		if (newerState(best?.state ?? null, state) === state) best = { state, pluginId, duplicate: false };
	}
	if (best) best.duplicate = found > 1;
	return best;
}

/** Cached {@link readRuntimeState}. Errors are not cached and propagate. */
export async function loadRuntimeState(
	read: SettingReader,
	now: number = Date.now(),
): Promise<LoadedState | null> {
	if (cache && now < cache.expiresAt) return cache.value;
	const value = await readRuntimeState(read);
	cache = { value, expiresAt: now + CACHE_TTL_MS };
	return value;
}

/** Test helper. */
export function clearRuntimeStateCache(): void {
	cache = undefined;
}
