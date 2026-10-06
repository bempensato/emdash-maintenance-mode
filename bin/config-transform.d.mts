export declare const PLUGIN_IMPORT: string;
export declare const COMPANION_IMPORT: string;
export declare function mask(source: string): string;
export declare function findClosing(source: string, open: number): number;
export declare function addMaintenanceMode(
	source: string,
): { ok: true; source: string; target: "plugins" | "sandboxed" } | { ok: false; reason: string };
export declare function manualInstructions(usesSandbox: boolean): string;
export declare function lineDiff(before: string, after: string): string;
