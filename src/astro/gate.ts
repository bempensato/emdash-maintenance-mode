import type { LoadedState } from "./state";

/**
 * The visitor gate, independent of Astro's virtual modules so it can be unit
 * tested. `middleware.ts` wires it to the real settings reader and options.
 *
 * Rule zero: fail open. Any error lets the request through to the real site.
 */

/** The parts of Astro's `APIContext` the gate uses. */
export interface GateContext {
	request: Request;
	url: URL;
	locals: { user?: { role: number } | null };
	/** Astro route cache handle; absent when no cache provider is configured. */
	cache?: { enabled?: boolean; set(options: false): void } | undefined;
}

export type GateNext = (rewrite?: string) => Promise<Response>;

export interface GateOptions {
	/** Public path of the maintenance page. */
	path: string;
	/** Path of the password endpoint. */
	accessPath: string;
}

export interface GateDeps {
	options: GateOptions;
	loadState: () => Promise<LoadedState | null>;
	/** True when EmDash verified a `_preview` token for this request. */
	hasValidPreview: (context: GateContext) => boolean;
}

/** EmDash shows its editing toolbar from this role up (`request-context` middleware). */
const EDIT_MIN_ROLE = 30;

const PASS_PREFIXES = ["/_emdash", "/_astro/", "/_image", "/_server-islands/", "/.well-known/", "/favicon"];
const PASS_EXACT = new Set(["/robots.txt"]);

function stripTrailingSlash(path: string): string {
	return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function hasFileExtension(pathname: string): boolean {
	const last = pathname.slice(pathname.lastIndexOf("/") + 1);
	return /\.[A-Za-z0-9]{1,8}$/.test(last);
}

/** Paths that are never gated: assets, EmDash itself and the companion's own routes. */
export function isAlwaysAllowedPath(pathname: string, options: GateOptions): boolean {
	if (PASS_EXACT.has(pathname)) return true;
	if (PASS_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
	if (hasFileExtension(pathname)) return true;
	const path = stripTrailingSlash(pathname);
	return path === stripTrailingSlash(options.path) || path === stripTrailingSlash(options.accessPath);
}

/** Headers of the maintenance response. */
export function maintenanceHeaders(base: Headers, retryAfterSeconds: number): Headers {
	const headers = new Headers(base);
	headers.set("Retry-After", String(retryAfterSeconds));
	headers.set("Cache-Control", "no-store");
	headers.set("X-Robots-Tag", "noindex");
	return headers;
}

function optOutOfRouteCache(context: GateContext): void {
	try {
		if (context.cache?.enabled) context.cache.set(false);
	} catch {
		// No cache provider: nothing to opt out of.
	}
}

export function createGate(deps: GateDeps) {
	const { options } = deps;

	return async function gate(context: GateContext, next: GateNext): Promise<Response> {
		const method = context.request.method.toUpperCase();
		if (method !== "GET" && method !== "HEAD") return next();
		if (isAlwaysAllowedPath(context.url.pathname, options)) return next();

		let rewritten: Response;
		let retryAfterSeconds: number;
		try {
			const loaded = await deps.loadState();
			if (!loaded) return next();

			const { state } = loaded;
			if (!state.enabled) return next();

			// While the site is hidden, no response may land in a shared route
			// cache: it would be served to everyone without passing the gate.
			optOutOfRouteCache(context);

			const role = context.locals.user?.role ?? 0;
			if (context.locals.user && role >= state.bypassMinRole) return next();

			// Drafts shared with a valid EmDash preview token, and editors asking
			// for an editing render, see the real page.
			const params = context.url.searchParams;
			if (params.has("_preview") && deps.hasValidPreview(context)) return next();
			if (params.has("_edit") && role >= EDIT_MIN_ROLE) return next();

			retryAfterSeconds = state.retryAfterSeconds;
			rewritten = await next(options.path);
		} catch (error) {
			console.error("[maintenance-mode] gate failed, serving the site:", error);
			return next();
		}

		// A missing or broken maintenance route must not take the site down.
		if (rewritten.status === 404 || rewritten.status >= 500) {
			console.error(
				`[maintenance-mode] ${options.path} answered ${rewritten.status}, serving the site`,
			);
			return next();
		}

		return new Response(rewritten.body, {
			status: 503,
			statusText: "Service Unavailable",
			headers: maintenanceHeaders(rewritten.headers, retryAfterSeconds),
		});
	};
}
