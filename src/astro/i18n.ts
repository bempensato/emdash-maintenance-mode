import type { Mode } from "../shared/state";

/** Strings of the public maintenance page (the admin page has its own). */

export type Locale = "en" | "it";

interface Strings {
	fallbackTitle: Record<Mode, string>;
	fallbackText: Record<Mode, string>;
	badge: string;
	passwordPrompt: string;
	passwordLabel: string;
	passwordSubmit: string;
	passwordError: string;
}

const STRINGS: Record<Locale, Strings> = {
	en: {
		fallbackTitle: {
			"coming-soon": "We're launching soon",
			maintenance: "We'll be back shortly",
		},
		fallbackText: {
			"coming-soon": "This site is getting ready. Please check back soon.",
			maintenance: "We're doing some maintenance. Please check back in a little while.",
		},
		badge: "Powered by Maintenance Mode for EmDash",
		passwordPrompt: "Have a password? Enter it to see the site.",
		passwordLabel: "Password",
		passwordSubmit: "Enter",
		passwordError: "That didn't work. Check the password and try again in a moment.",
	},
	it: {
		fallbackTitle: {
			"coming-soon": "Stiamo per arrivare",
			maintenance: "Torniamo presto",
		},
		fallbackText: {
			"coming-soon": "Il sito è in preparazione. Torna a trovarci presto.",
			maintenance: "Stiamo facendo manutenzione. Torna tra poco.",
		},
		badge: "Powered by Maintenance Mode for EmDash",
		passwordPrompt: "Hai una password? Inseriscila per vedere il sito.",
		passwordLabel: "Password",
		passwordSubmit: "Entra",
		passwordError: "Non ha funzionato. Controlla la password e riprova tra poco.",
	},
};

/**
 * Locale of the page: Astro's current locale when i18n routing is set up,
 * otherwise the visitor's preferred language. English by default.
 */
export function pickLocale(currentLocale: string | undefined, acceptLanguage: string | null): Locale {
	const candidates = currentLocale ? [currentLocale] : (acceptLanguage ?? "").split(",");
	for (const candidate of candidates) {
		const tag = candidate.split(";")[0]?.trim().toLowerCase() ?? "";
		if (tag.startsWith("it")) return "it";
		if (tag.startsWith("en")) return "en";
	}
	return "en";
}

export function strings(locale: Locale): Strings {
	return STRINGS[locale];
}
