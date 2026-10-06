/**
 * Admin page strings. English by default, Italian when the admin locale
 * starts with `it`. Every user-facing string of the plugin lives here.
 */

export type AdminLocale = "en" | "it";

export function adminLocale(locale: string | undefined): AdminLocale {
	return locale?.toLowerCase().startsWith("it") ? "it" : "en";
}

const en = {
	title: "Maintenance Mode & Coming Soon",

	statusHeader: "Status",
	statusPublicTitle: "Your site is public",
	statusPublicText: "Everyone sees the full site.",
	statusHiddenTitle: "Your site is hidden",
	statusHiddenText: (mode: string) => `Visitors see the ${mode} page. Your team still sees the full site.`,
	turnOn: "Hide the site",
	turnOff: "Make the site public",
	turnOnConfirmTitle: "Hide the site from visitors?",
	turnOnConfirmText: "Visitors will see the maintenance page until you turn it off.",
	turnOnConfirm: "Hide the site",
	cancel: "Cancel",
	turnedOn: "The site is now hidden from visitors",
	turnedOff: "The site is public again",
	openPage: "Open the maintenance page",

	settingsHeader: "Settings",
	mode: "Mode",
	modeComingSoon: "Coming soon",
	modeMaintenance: "Maintenance",
	modeName: { "coming-soon": "coming soon", maintenance: "maintenance" } as Record<string, string>,
	page: "Page to show",
	pageNone: "Built-in message",
	pageUnpublished: "not published",
	pageHint:
		"Edit this page like any other: open it on the site while logged in to use live editing. Without a page, visitors see a short built-in message.",
	bypass: "Who sees the full site",
	bypassAll: "All logged-in users",
	bypassEditors: "Editors and admins",
	bypassAdmins: "Admins only",
	save: "Save",
	saved: "Settings saved",
	invalidPage: "That page is no longer available. Choose another one.",
	invalidInput: "Something in the form was not valid. Reload the page and try again.",

	setupHeader: "Setup check",
	companionMissingTitle: "Step 2: install the companion",
	companionMissingText:
		"The plugin stores the settings; a small Astro integration in your site shows the maintenance page to visitors. Add it to astro.config.mjs and redeploy. Until then, visitors keep seeing the site.",
	companionOutdatedTitle: "Update the companion",
	companionOutdatedText: (found: string, expected: string) =>
		`Your site runs the companion ${found}; this plugin is ${expected}. Update the emdash-maintenance-mode package and redeploy.`,
	companionDuplicateTitle: "Installed twice",
	companionDuplicateText:
		"The plugin is installed both from npm and from the registry. Remove one of them; the companion uses the settings saved most recently.",
	companionOk: (version: string) => `Companion installed (version ${version}).`,
	companionNoUser:
		"The companion reports in once a logged-in user opens the site. If you just deployed it, reload this page in a minute.",
};

export type AdminStrings = typeof en;

const it: AdminStrings = {
	title: "Maintenance Mode & Coming Soon",

	statusHeader: "Stato",
	statusPublicTitle: "Il sito è pubblico",
	statusPublicText: "Tutti vedono il sito completo.",
	statusHiddenTitle: "Il sito è nascosto",
	statusHiddenText: (mode: string) =>
		`I visitatori vedono la pagina ${mode}. Il tuo team continua a vedere il sito completo.`,
	turnOn: "Nascondi il sito",
	turnOff: "Rendi pubblico il sito",
	turnOnConfirmTitle: "Nascondere il sito ai visitatori?",
	turnOnConfirmText: "I visitatori vedranno la pagina di manutenzione finché non la disattivi.",
	turnOnConfirm: "Nascondi il sito",
	cancel: "Annulla",
	turnedOn: "Ora il sito è nascosto ai visitatori",
	turnedOff: "Il sito è di nuovo pubblico",
	openPage: "Apri la pagina di manutenzione",

	settingsHeader: "Impostazioni",
	mode: "Modalità",
	modeComingSoon: "Coming soon",
	modeMaintenance: "Manutenzione",
	modeName: { "coming-soon": "coming soon", maintenance: "di manutenzione" },
	page: "Pagina da mostrare",
	pageNone: "Messaggio predefinito",
	pageUnpublished: "non pubblicata",
	pageHint:
		"Modifica questa pagina come le altre: aprila sul sito da loggato per usare la modifica dal vivo. Senza una pagina, i visitatori vedono un breve messaggio predefinito.",
	bypass: "Chi vede il sito completo",
	bypassAll: "Tutti gli utenti loggati",
	bypassEditors: "Editor e amministratori",
	bypassAdmins: "Solo amministratori",
	save: "Salva",
	saved: "Impostazioni salvate",
	invalidPage: "Quella pagina non è più disponibile. Scegline un'altra.",
	invalidInput: "Qualcosa nel modulo non è valido. Ricarica la pagina e riprova.",

	setupHeader: "Verifica installazione",
	companionMissingTitle: "Passo 2: installa il companion",
	companionMissingText:
		"Il plugin salva le impostazioni; una piccola integrazione Astro nel sito mostra la pagina di manutenzione ai visitatori. Aggiungila ad astro.config.mjs e rifai il deploy. Fino ad allora i visitatori continuano a vedere il sito.",
	companionOutdatedTitle: "Aggiorna il companion",
	companionOutdatedText: (found: string, expected: string) =>
		`Il sito usa il companion ${found}; questo plugin è alla ${expected}. Aggiorna il pacchetto emdash-maintenance-mode e rifai il deploy.`,
	companionDuplicateTitle: "Installato due volte",
	companionDuplicateText:
		"Il plugin è installato sia da npm sia dal registry. Rimuovine uno; il companion usa le impostazioni salvate più di recente.",
	companionOk: (version: string) => `Companion installato (versione ${version}).`,
	companionNoUser:
		"Il companion si registra quando un utente loggato apre il sito. Se lo hai appena installato, ricarica questa pagina tra un minuto.",
};

export function adminStrings(locale: AdminLocale): AdminStrings {
	return locale === "it" ? it : en;
}
