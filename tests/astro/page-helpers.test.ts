import { describe, expect, it } from "vitest";

import { findImageField, findPortableTextField, findSubtitleField } from "../../src/astro/entry";
import { pickLocale, strings } from "../../src/astro/i18n";

const block = { _type: "block", children: [] };

describe("entry fields", () => {
	it("prefers `content`, then the first Portable Text field", () => {
		expect(findPortableTextField({ body: [block], content: [block] })).toBe("content");
		expect(findPortableTextField({ title: "x", tags: ["a"], body: [block] })).toBe("body");
		expect(findPortableTextField({ title: "x", tags: [] })).toBeNull();
		expect(findPortableTextField({ content: "plain" })).toBeNull();
	});

	it("finds conventional image and subtitle fields", () => {
		expect(findImageField({ featured_image: { id: "m1" } })).toBe("featured_image");
		expect(findImageField({ image: null, cover: "https://x/y.png" })).toBe("cover");
		expect(findImageField({})).toBeNull();
		expect(findSubtitleField({ subtitle: " ", excerpt: "Soon" })).toBe("excerpt");
		expect(findSubtitleField({})).toBeNull();
	});
});

describe("locale", () => {
	it("uses Astro's locale, then Accept-Language, then English", () => {
		expect(pickLocale("it", "en-US")).toBe("it");
		expect(pickLocale("de", "it-IT")).toBe("en");
		expect(pickLocale(undefined, "fr-FR,it;q=0.8,en;q=0.5")).toBe("it");
		expect(pickLocale(undefined, null)).toBe("en");
		expect(strings("it").fallbackTitle.maintenance).toBe("Torniamo presto");
	});
});
