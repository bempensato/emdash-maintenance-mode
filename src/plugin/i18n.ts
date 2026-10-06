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

	guestHeader: "Guest access",
	guestIntro: "Let people without an account see the full site, with a secret link or a password.",
	linkTitle: "Preview link",
	linkOff: "The preview link is off.",
	linkOn: "Anyone with this link sees the full site:",
	linkNoUrl: "Anyone with the link sees the full site. Set the site URL in the EmDash settings to show it here.",
	linkEnable: "Create a preview link",
	linkRegenerate: "Make a new link",
	linkRegenerateConfirmTitle: "Make a new preview link?",
	linkRegenerateConfirmText: "The current link stops working. Guests who already used it keep access until you revoke it.",
	linkDisable: "Turn off the link",
	linkEnabled: "Preview link created",
	linkRegenerated: "New preview link created",
	linkDisabled: "Preview link turned off",
	passwordTitle: "Password",
	passwordOff: "No password is set.",
	passwordOn: "A password is set. Visitors can type it on the maintenance page.",
	passwordNew: "New password",
	passwordSet: "Set password",
	passwordRemove: "Remove password",
	passwordSaved: "Password saved",
	passwordRemoved: "Password removed",
	passwordInvalid: "Enter a password between 4 and 256 characters.",
	cookieDays: "Keep guests signed in for (days)",
	cookieSave: "Save",
	cookieSaved: "Duration saved",
	cookieInvalid: "Enter a number of days between 1 and 365.",
	revokeAll: "Revoke all guest access",
	revokeConfirmTitle: "Revoke all guest access?",
	revokeConfirmText: "Every guest is signed out and needs the link or the password again.",
	revokeConfirm: "Revoke",
	revoked: "All guest access revoked",

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

	guestHeader: "Accesso ospiti",
	guestIntro: "Fai vedere il sito completo a chi non ha un account, con un link segreto o una password.",
	linkTitle: "Link di anteprima",
	linkOff: "Il link di anteprima è disattivato.",
	linkOn: "Chi ha questo link vede il sito completo:",
	linkNoUrl: "Chi ha il link vede il sito completo. Imposta l'URL del sito nelle impostazioni di EmDash per mostrarlo qui.",
	linkEnable: "Crea un link di anteprima",
	linkRegenerate: "Crea un nuovo link",
	linkRegenerateConfirmTitle: "Creare un nuovo link di anteprima?",
	linkRegenerateConfirmText: "Il link attuale smette di funzionare. Chi lo ha già usato mantiene l'accesso finché non lo revochi.",
	linkDisable: "Disattiva il link",
	linkEnabled: "Link di anteprima creato",
	linkRegenerated: "Nuovo link di anteprima creato",
	linkDisabled: "Link di anteprima disattivato",
	passwordTitle: "Password",
	passwordOff: "Nessuna password impostata.",
	passwordOn: "È impostata una password. I visitatori possono inserirla nella pagina di manutenzione.",
	passwordNew: "Nuova password",
	passwordSet: "Imposta password",
	passwordRemove: "Rimuovi password",
	passwordSaved: "Password salvata",
	passwordRemoved: "Password rimossa",
	passwordInvalid: "Inserisci una password tra 4 e 256 caratteri.",
	cookieDays: "Mantieni l'accesso degli ospiti per (giorni)",
	cookieSave: "Salva",
	cookieSaved: "Durata salvata",
	cookieInvalid: "Inserisci un numero di giorni tra 1 e 365.",
	revokeAll: "Revoca tutti gli accessi ospite",
	revokeConfirmTitle: "Revocare tutti gli accessi ospite?",
	revokeConfirmText: "Tutti gli ospiti vengono disconnessi e devono usare di nuovo il link o la password.",
	revokeConfirm: "Revoca",
	revoked: "Tutti gli accessi ospite sono stati revocati",

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
