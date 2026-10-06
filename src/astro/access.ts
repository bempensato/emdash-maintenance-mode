import type { APIRoute } from "astro";
import { getPluginSetting } from "emdash";

import { createAccessHandler } from "./access-handler";
import { loadRuntimeState } from "./state";

/** Password form endpoint, injected at `accessPath`. */

export const prerender = false;

const handleAccess = createAccessHandler({ loadState: () => loadRuntimeState(getPluginSetting) });

function clientKey(context: Parameters<APIRoute>[0]): string {
	try {
		return context.clientAddress;
	} catch {
		const headers = context.request.headers;
		return (
			headers.get("cf-connecting-ip") ??
			headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
			"unknown"
		);
	}
}

export const POST: APIRoute = (context) =>
	handleAccess({ request: context.request, url: context.url, clientKey: clientKey(context) });

export const GET: APIRoute = () =>
	new Response(null, { status: 303, headers: { Location: "/", "Cache-Control": "no-store" } });
