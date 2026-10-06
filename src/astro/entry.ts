/**
 * Picks which fields of the chosen entry the maintenance page renders. The
 * entry can come from any collection, so fields are found by shape.
 */

type Data = Record<string, unknown>;

const IMAGE_FIELDS = ["image", "featured_image", "cover_image", "hero_image", "cover"];

function isPortableText(value: unknown): boolean {
	return (
		Array.isArray(value) &&
		value.every((block) => typeof block === "object" && block !== null && "_type" in block)
	);
}

/** `content` when it is Portable Text, otherwise the first Portable Text field. */
export function findPortableTextField(data: Data): string | null {
	if (isPortableText(data.content)) return "content";
	for (const [key, value] of Object.entries(data)) {
		if (Array.isArray(value) && value.length > 0 && isPortableText(value)) return key;
	}
	return null;
}

/** First conventional image field that holds a value. */
export function findImageField(data: Data): string | null {
	for (const key of IMAGE_FIELDS) {
		const value = data[key];
		if ((typeof value === "object" && value !== null) || (typeof value === "string" && value)) {
			return key;
		}
	}
	return null;
}

/** First non-empty string among `subtitle` and `excerpt`. */
export function findSubtitleField(data: Data): string | null {
	for (const key of ["subtitle", "excerpt"]) {
		const value = data[key];
		if (typeof value === "string" && value.trim() !== "") return key;
	}
	return null;
}

export function stringField(data: Data, key: string): string | null {
	const value = data[key];
	return typeof value === "string" && value.trim() !== "" ? value : null;
}
