/**
 * Pure text transform behind `npx emdash-maintenance-mode init`: adds the
 * plugin and the companion to an astro.config file. No dependencies and no
 * Node.js APIs, so it can be unit tested anywhere.
 *
 * It only edits shapes it recognises; anything else returns `ok: false` and
 * the caller prints the lines to paste instead of guessing.
 */

export const PLUGIN_IMPORT = 'import maintenanceModePlugin from "emdash-maintenance-mode";';
export const COMPANION_IMPORT = 'import maintenanceMode from "emdash-maintenance-mode/astro";';

/**
 * `source` with comments and the contents of strings replaced by spaces
 * (same length, newlines kept), so searches only see code.
 */
export function mask(source) {
	let out = "";
	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		const next = source[i + 1];
		if (ch === "/" && (next === "/" || next === "*")) {
			const end = next === "/" ? source.indexOf("\n", i) : source.indexOf("*/", i + 2) + 2;
			const stop = end <= 0 || end === 1 ? source.length : end;
			out += source.slice(i, stop).replace(/[^\n]/g, " ");
			i = stop - 1;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			let j = i + 1;
			while (j < source.length && source[j] !== ch) j += source[j] === "\\" ? 2 : 1;
			const body = source.slice(i + 1, Math.min(j, source.length));
			out += ch + body.replace(/[^\n]/g, " ") + (j < source.length ? ch : "");
			i = j;
			continue;
		}
		out += ch;
	}
	return out;
}

/**
 * Index of the bracket closing the one at `open`, skipping strings,
 * template literals and comments. -1 when unbalanced.
 */
export function findClosing(source, open) {
	const pairs = { "(": ")", "[": "]", "{": "}" };
	const stack = [];
	for (let i = open; i < source.length; i++) {
		const ch = source[i];
		const next = source[i + 1];
		if (ch === "/" && next === "/") {
			const end = source.indexOf("\n", i);
			if (end === -1) return -1;
			i = end;
			continue;
		}
		if (ch === "/" && next === "*") {
			const end = source.indexOf("*/", i + 2);
			if (end === -1) return -1;
			i = end + 1;
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			let j = i + 1;
			while (j < source.length && source[j] !== ch) j += source[j] === "\\" ? 2 : 1;
			if (j >= source.length) return -1;
			i = j;
			continue;
		}
		if (ch in pairs) stack.push(pairs[ch]);
		else if (ch === ")" || ch === "]" || ch === "}") {
			if (stack.pop() !== ch) return -1;
			if (stack.length === 0) return i;
		}
	}
	return -1;
}

function lineIndent(source, index) {
	const start = source.lastIndexOf("\n", index - 1) + 1;
	return /^[\t ]*/.exec(source.slice(start))[0];
}

/** Appends `item` to the array literal whose `[` is at `open`. */
function appendToArray(source, open, item) {
	const close = findClosing(source, open);
	if (close === -1) return null;
	// Decide on the code only: a trailing comment must not hide a comma.
	const inner = mask(source).slice(open + 1, close);
	if (inner.trim() === "") return `${source.slice(0, open + 1)}${item}${source.slice(close)}`;
	const codeEnd = open + 1 + inner.replace(/\s+$/, "").length;
	const needsComma = !inner.replace(/\s+$/, "").endsWith(",");
	if (!inner.includes("\n")) {
		return `${source.slice(0, codeEnd)}${needsComma ? ", " : " "}${item}${source.slice(codeEnd)}`;
	}
	// Multi-line array: add a line with the indentation of the last item.
	const lastItemIndent = lineIndent(source, codeEnd);
	return `${source.slice(0, codeEnd)}${needsComma ? "," : ""}\n${lastItemIndent}${item},${source.slice(codeEnd)}`;
}

/** Position of the `[` of `key: [` directly inside the object at `objOpen`. */
function findArrayKey(source, objOpen, key) {
	const objClose = findClosing(source, objOpen);
	if (objClose === -1) return -1;
	const code = mask(source);
	const re = new RegExp(`\\b${key}\\s*:\\s*\\[`, "g");
	re.lastIndex = objOpen;
	let match;
	while ((match = re.exec(code)) && match.index < objClose) {
		// Must be at depth 1 of the object.
		let depth = 0;
		for (let i = objOpen + 1; i < match.index; i++) {
			const ch = source[i];
			if (ch === "{" || ch === "[" || ch === "(") {
				const close = findClosing(source, i);
				if (close === -1) return -1;
				if (close > match.index) {
					depth++;
					break;
				}
				i = close;
			}
		}
		if (depth === 0) return match.index + match[0].length - 1;
	}
	return -1;
}

function addImports(source) {
	const importRe = /^import[\s\S]*?from\s*["'][^"']+["'];?[^\S\n]*$/gm;
	let last = null;
	let match;
	while ((match = importRe.exec(source))) last = match;
	const lines = `${PLUGIN_IMPORT}\n${COMPANION_IMPORT}`;
	if (!last) return `${lines}\n\n${source}`;
	const end = last.index + last[0].length;
	return `${source.slice(0, end)}\n${lines}${source.slice(end)}`;
}

/**
 * @param {string} source astro.config contents
 * @returns {{ ok: true, source: string, target: "plugins" | "sandboxed" } | { ok: false, reason: string }}
 */
export function addMaintenanceMode(source) {
	if (source.includes("emdash-maintenance-mode")) return { ok: false, reason: "already-installed" };
	const usesSandbox = /\bsandboxRunner\s*:/.test(mask(source));
	const target = usesSandbox ? "sandboxed" : "plugins";

	let out = addImports(source);

	// 1. The plugin, inside emdash({ ... }).
	const call = /\bemdash\s*\(\s*\{/.exec(mask(out));
	if (!call) return { ok: false, reason: "no-emdash-call" };
	const objOpen = call.index + call[0].length - 1;
	const arrayOpen = findArrayKey(out, objOpen, target);
	if (arrayOpen !== -1) {
		const next = appendToArray(out, arrayOpen, "maintenanceModePlugin");
		if (!next) return { ok: false, reason: "unbalanced" };
		out = next;
	} else {
		const objClose = findClosing(out, objOpen);
		if (objClose === -1) return { ok: false, reason: "unbalanced" };
		const inner = mask(out).slice(objOpen + 1, objClose);
		if (inner.trim() === "") {
			out = `${out.slice(0, objOpen + 1)} ${target}: [maintenanceModePlugin] ${out.slice(objClose)}`;
		} else {
			const indent = inner.includes("\n") ? lineIndent(out, objOpen + 1 + inner.search(/\S/)) : "";
			const entry = inner.includes("\n")
				? `\n${indent}${target}: [maintenanceModePlugin],`
				: ` ${target}: [maintenanceModePlugin],`;
			out = `${out.slice(0, objOpen + 1)}${entry}${out.slice(objOpen + 1)}`;
		}
	}

	// 2. The companion, in integrations: [ ... ].
	const config = /\bdefineConfig\s*\(\s*\{/.exec(mask(out));
	if (!config) return { ok: false, reason: "no-define-config" };
	const configOpen = config.index + config[0].length - 1;
	const integrationsOpen = findArrayKey(out, configOpen, "integrations");
	if (integrationsOpen === -1) return { ok: false, reason: "no-integrations" };
	const withCompanion = appendToArray(out, integrationsOpen, "maintenanceMode()");
	if (!withCompanion) return { ok: false, reason: "unbalanced" };

	return { ok: true, source: withCompanion, target };
}

/** Lines to paste by hand when the file shape is not recognised. */
export function manualInstructions(usesSandbox) {
	const target = usesSandbox ? "sandboxed" : "plugins";
	return [
		PLUGIN_IMPORT,
		COMPANION_IMPORT,
		"",
		"export default defineConfig({",
		"\tintegrations: [",
		`\t\temdash({ ${target}: [maintenanceModePlugin] /* keep your other options */ }),`,
		"\t\tmaintenanceMode(),",
		"\t],",
		"});",
	].join("\n");
}

/** Minimal line diff for display (the transform only inserts lines or text). */
export function lineDiff(before, after) {
	const a = before.split("\n");
	const b = after.split("\n");
	const out = [];
	let i = 0;
	let j = 0;
	while (i < a.length || j < b.length) {
		if (i < a.length && j < b.length && a[i] === b[j]) {
			i++;
			j++;
			continue;
		}
		// Changed line: does the old line reappear later in the new file?
		const k = i < a.length ? b.indexOf(a[i], j) : -1;
		if (k !== -1) {
			while (j < k) out.push(`+ ${b[j++]}`);
		} else {
			if (i < a.length) out.push(`- ${a[i++]}`);
			if (j < b.length) out.push(`+ ${b[j++]}`);
		}
	}
	return out.join("\n");
}
