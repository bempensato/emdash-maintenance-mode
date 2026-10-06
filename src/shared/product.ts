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

export interface ProductConfig {
	storeId: number | null;
	productId: number | null;
	variants: readonly Variant[];
	/** Store page where the key is bought. */
	buyUrl: string;
}

export const LEMON_SQUEEZY: ProductConfig = {
	storeId: null,
	productId: null,
	variants: [],
	buyUrl: "https://github.com/bempensato/emdash-maintenance-mode#free-vs-pro",
};

export function findVariant(variantId: unknown, product: ProductConfig = LEMON_SQUEEZY): Variant | undefined {
	return product.variants.find((v) => v.id === variantId);
}
