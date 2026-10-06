import { verifyPassword } from "../shared/crypto";
import { guestCookieHeader, RateLimiter, safeReturnPath, withPasswordError } from "./guest";
import type { LoadedState } from "./state";

/**
 * POST handler of the password form (`accessPath`): checks the password,
 * sets the guest cookie and sends the visitor back where they were.
 * Every failure looks the same to the visitor.
 */

export interface AccessRequest {
	request: Request;
	url: URL;
	/** Client identity for rate limiting (IP address when available). */
	clientKey: string;
}

export interface AccessDeps {
	loadState: () => Promise<LoadedState | null>;
	limiter?: RateLimiter;
	now?: () => number;
}

/** Longest accepted password, to bound the work per request. */
const MAX_PASSWORD_LENGTH = 256;

function seeOther(location: string, headers: Record<string, string> = {}): Response {
	return new Response(null, {
		status: 303,
		headers: { Location: location, "Cache-Control": "no-store", ...headers },
	});
}

export function createAccessHandler(deps: AccessDeps) {
	const limiter = deps.limiter ?? new RateLimiter();
	const now = deps.now ?? Date.now;

	return async function handleAccess({ request, url, clientKey }: AccessRequest): Promise<Response> {
		let returnPath = "/";
		try {
			const form = await request.formData();
			returnPath = safeReturnPath(form.get("return"));
			const password = form.get("password");

			const loaded = await deps.loadState();
			const guest = loaded?.state.enabled ? loaded.state.guest : null;
			// Nothing to unlock: just go back.
			if (!guest?.password) return seeOther(returnPath);

			const nowMs = now();
			if (limiter.isLimited(clientKey, nowMs)) return seeOther(withPasswordError(returnPath));

			const ok =
				typeof password === "string" &&
				password.length > 0 &&
				password.length <= MAX_PASSWORD_LENGTH &&
				(await verifyPassword(password, guest.password));
			if (!ok) {
				limiter.recordFailure(clientKey, nowMs);
				return seeOther(withPasswordError(returnPath));
			}

			limiter.reset(clientKey);
			return seeOther(returnPath, { "Set-Cookie": await guestCookieHeader(guest, url, nowMs) });
		} catch (error) {
			console.error("[maintenance-mode] password check failed:", error);
			return seeOther(withPasswordError(returnPath));
		}
	};
}
