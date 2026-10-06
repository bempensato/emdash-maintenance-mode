import type { PluginContext } from "emdash/plugin";

/** Minimal in-memory PluginContext for unit tests of plugin-side modules. */

export interface FakeCall {
	url: string;
	body: URLSearchParams;
	headers: Headers;
}

export type FakeResponder = (call: FakeCall) => Response | Promise<Response>;

export function createFakeCtx(options: { siteUrl?: string; respond?: FakeResponder } = {}) {
	const values = new Map<string, { value: unknown; revision: number }>();
	const calls: FakeCall[] = [];
	let responder: FakeResponder = options.respond ?? (() => new Response("{}", { status: 500 }));
	let revision = 0;

	const settings = {
		async get<T>(key: string): Promise<T | null> {
			return (values.has(key) ? structuredClone(values.get(key)!.value) : null) as T | null;
		},
		async getVersioned<T>(key: string) {
			const entry = values.get(key);
			return entry ? { value: structuredClone(entry.value) as T, revision: String(entry.revision) } : null;
		},
		async compareAndSet(key: string, expected: string | null, value: unknown) {
			const entry = values.get(key);
			if ((entry ? String(entry.revision) : null) !== expected) return { applied: false as const };
			values.set(key, { value: structuredClone(value), revision: ++revision });
			return { applied: true as const, revision: String(revision) };
		},
		async compareAndDelete() {
			return { applied: false };
		},
		async set(key: string, value: unknown) {
			values.set(key, { value: structuredClone(value), revision: ++revision });
		},
		async delete(key: string) {
			return values.delete(key);
		},
		async list() {
			return [...values].map(([key, e]) => ({ key, value: e.value }));
		},
	};

	const ctx = {
		plugin: { id: "maintenance-mode", version: "test" },
		settings,
		site: { name: "Test", url: options.siteUrl ?? "https://example.com", locale: "en" },
		log: { debug() {}, info() {}, warn() {}, error() {} },
		http: {
			async fetch(url: string, init?: RequestInit) {
				const call = {
					url,
					body: new URLSearchParams(String(init?.body ?? "")),
					headers: new Headers(init?.headers),
				};
				calls.push(call);
				return responder(call);
			},
		},
	} as unknown as PluginContext;

	return {
		ctx,
		calls,
		values,
		setSiteUrl(url: string) {
			(ctx.site as { url: string }).url = url;
		},
		respond(next: FakeResponder) {
			responder = next;
		},
	};
}

export const PRODUCT = {
	storeId: 11,
	productId: 22,
	variants: [
		{ id: 101, sites: 1 as const, term: "annual" as const },
		{ id: 102, sites: 1 as const, term: "lifetime" as const },
		{ id: 105, sites: 5 as const, term: "annual" as const },
	],
	buyUrl: "https://example.com/buy",
};

export function lsBody(overrides: Record<string, unknown> = {}, licenseKey: Record<string, unknown> = {}, meta: Record<string, unknown> = {}) {
	return {
		error: null,
		license_key: {
			id: 1,
			status: "active",
			key: "KEY",
			activation_limit: 1,
			activation_usage: 1,
			created_at: "2026-01-01T00:00:00.000000Z",
			expires_at: "2027-01-01T00:00:00.000000Z",
			...licenseKey,
		},
		instance: { id: "inst-1", name: "example.com", created_at: "2026-01-01T00:00:00.000000Z" },
		meta: { store_id: 11, order_id: 2, order_item_id: 3, product_id: 22, variant_id: 101, ...meta },
		...overrides,
	};
}

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
