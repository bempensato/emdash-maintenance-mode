import type { PluginContext } from "emdash/plugin";

import { bytesToBase64, randomBytes } from "../shared/crypto";
import { SETTING_KEYS } from "../shared/keys";
import { createDefaultRuntimeState, parseRuntimeState, type RuntimeState } from "../shared/state";

/**
 * Plugin-side access to the `runtime` setting, the contract read by the
 * companion. Writes use the setting's revision so an admin change and a
 * concurrent license check never overwrite each other.
 */

const MAX_WRITE_ATTEMPTS = 5;

/** Fresh HMAC key for guest cookies (32 random bytes). */
export function newCookieSecret(): string {
	return bytesToBase64(randomBytes(32));
}

export async function readRuntime(ctx: PluginContext): Promise<RuntimeState | null> {
	return parseRuntimeState(await ctx.settings.get(SETTING_KEYS.runtime));
}

/** Writes the default state when none (or an unreadable one) is stored. */
export async function ensureRuntime(ctx: PluginContext): Promise<RuntimeState> {
	const existing = await readRuntime(ctx);
	if (existing) return existing;
	const state = createDefaultRuntimeState(newCookieSecret());
	await ctx.settings.set(SETTING_KEYS.runtime, state);
	return state;
}

/**
 * Applies `mutate` to the current state and stores the result with a new
 * `updatedAt`. Retries when another writer got there first.
 */
export async function updateRuntime(
	ctx: PluginContext,
	mutate: (state: RuntimeState) => RuntimeState,
	now: () => Date = () => new Date(),
): Promise<RuntimeState> {
	for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
		const current = await ctx.settings.getVersioned<unknown>(SETTING_KEYS.runtime);
		const base = parseRuntimeState(current?.value) ?? createDefaultRuntimeState(newCookieSecret());
		const next: RuntimeState = { ...mutate(structuredClone(base)), v: 1, updatedAt: now().toISOString() };
		const result = await ctx.settings.compareAndSet(
			SETTING_KEYS.runtime,
			current?.revision ?? null,
			next,
		);
		if (result.applied) return next;
	}
	throw new Error("The settings changed too often while saving. Try again.");
}

