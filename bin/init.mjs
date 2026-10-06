#!/usr/bin/env node
/**
 * npx emdash-maintenance-mode init [--yes]
 *
 * Adds the plugin and the companion to astro.config.(mjs|ts|js|mts) in the
 * current directory. Shows the change and asks before writing; `--yes`
 * skips the question. No dependencies.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import { addMaintenanceMode, lineDiff, manualInstructions } from "./config-transform.mjs";

const CONFIG_NAMES = ["astro.config.mjs", "astro.config.ts", "astro.config.mts", "astro.config.js"];

function usage() {
	console.log("Usage: npx emdash-maintenance-mode init [--yes]");
}

async function confirm(question) {
	if (!process.stdin.isTTY) return false;
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	try {
		const answer = await rl.question(question);
		return /^y(es)?$/i.test(answer.trim());
	} finally {
		rl.close();
	}
}

async function main(args) {
	const [command, ...flags] = args;
	if (command !== "init") {
		usage();
		return command === undefined || command === "--help" || command === "-h" ? 0 : 1;
	}
	const yes = flags.includes("--yes") || flags.includes("-y");

	const cwd = process.cwd();
	const name = CONFIG_NAMES.find((file) => existsSync(join(cwd, file)));
	if (!name) {
		console.error("No astro.config file found here. Run this in your site's folder.");
		return 1;
	}
	const path = join(cwd, name);
	const source = readFileSync(path, "utf8");

	try {
		const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
		const deps = { ...pkg.dependencies, ...pkg.devDependencies };
		if (!deps["emdash-maintenance-mode"]) {
			console.warn("Note: add the package first: pnpm add emdash-maintenance-mode\n");
		}
	} catch {
		// No package.json: nothing to check.
	}

	const result = addMaintenanceMode(source);
	if (!result.ok) {
		if (result.reason === "already-installed") {
			console.log(`${name} already uses emdash-maintenance-mode. Nothing to do.`);
			return 0;
		}
		console.log(`I couldn't safely edit ${name} (${result.reason}). Add these lines by hand:\n`);
		console.log(manualInstructions(/\bsandboxRunner\s*:/.test(source)));
		return 1;
	}

	if (!/\boutput\s*:\s*["']server["']/.test(source)) {
		console.warn('Warning: the companion needs `output: "server"` in the Astro config.\n');
	}

	console.log(`Changes to ${name} (plugin in \`${result.target}\`):\n`);
	console.log(lineDiff(source, result.source));
	console.log("");

	if (!yes && !(await confirm("Write these changes? [y/N] "))) {
		console.log(process.stdin.isTTY ? "Nothing written." : "Nothing written. Run with --yes to apply without asking.");
		return 1;
	}
	writeFileSync(path, result.source);
	console.log(`Updated ${name}. Build and deploy, then open Plugins → Maintenance Mode & Coming Soon in the admin.`);
	return 0;
}

main(process.argv.slice(2)).then(
	(code) => process.exit(code),
	(error) => {
		console.error(error);
		process.exit(1);
	},
);
