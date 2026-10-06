/**
 * Lemon Squeezy product identifiers. The license client accepts only keys
 * whose activation/validation response names this store and product and one
 * of these variants.
 *
 * Placeholders until the product exists (implementation plan §10.3): with
 * `storeId` null every key is rejected as "not for this product".
 */

export type PlanSites = 1 | 5;
export type PlanTerm = "annual" | "lifetime";

export interface Variant {
	id: number;
	sites: PlanSites;
	term: PlanTerm;
}

export const LEMON_SQUEEZY = {
	storeId: null as number | null,
	productId: null as number | null,
	variants: [] as Variant[],
	/** Store page where the key is bought. */
	buyUrl: "https://github.com/bempensato/emdash-maintenance-mode#free-vs-pro",
} as const;

export function findVariant(variantId: unknown): Variant | undefined {
	return LEMON_SQUEEZY.variants.find((v) => v.id === variantId);
}
