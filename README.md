# Maintenance Mode & Coming Soon for EmDash

Show visitors a maintenance or coming soon page while your team keeps working on the full site.

> **Status: in development.** Nothing here is released yet; the features below describe the planned 1.0.

- **Edit the page like any other content.** You pick an entry from your site (for example a page called "Coming soon") and edit it in the EmDash admin, with live editing.
- **Your team still sees the whole site.** Logged-in users can browse and edit normally. You choose who: editors and admins (default), admins only, or every logged-in user.
- **Let guests in.** Share a secret preview link, or set a password visitors can type on the maintenance page. You can revoke every guest's access with one click.
- **Search-engine friendly.** Visitors get `503 Service Unavailable` with `Retry-After` and `noindex`, so search engines wait instead of indexing the placeholder.
- **One switch.** Turn it on and off from the plugin page in the admin. No redeploy.
- **Works on Cloudflare Workers Free and Paid.** It runs in the plugin sandbox when your site has one, and in-process when it doesn't.

## What it does, and what it doesn't

So you can decide whether to trust it before installing.

**It does:**

- read the entries you can choose as the maintenance page (`content:read`);
- only if you enter a Pro license key: contact **`api.lemonsqueezy.com`** to activate and validate it, on activation and then about once a day. That is the only external host it can reach (`allowedHosts`). Without a key it makes no network requests;
- set a cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) only for guests who use the preview link or the password, so they stay signed in;
- store its own settings in your EmDash database. Guest passwords are stored only as a salted hash.

**It doesn't:**

- send any data about your visitors, your content or your users anywhere;
- add analytics, tracking or third-party scripts to your pages;
- change your content model or your existing content;
- lock you out: on any internal error it lets visitors through instead of blocking the site, and if the license server can't be reached your site keeps working as configured.

To uninstall, remove the two lines from `astro.config.mjs`. Nothing else is left behind except the plugin's own settings.

## How it works

The package has two parts, which you install together:

| Part | What it does | Runs |
| --- | --- | --- |
| **Plugin** (`emdash-maintenance-mode`) | Admin page, settings, guest access, license | In the EmDash plugin sandbox, or in-process on Workers Free |
| **Companion** (`emdash-maintenance-mode/astro`) | Shows the maintenance page to visitors and renders it | In your Astro site |

EmDash plugins can't intercept requests to public pages, so a small Astro integration does that part. It has no dependencies, makes no network requests and only reads the plugin's settings.

## Install

```sh
pnpm add emdash-maintenance-mode
```

**Workers Free** (no plugin sandbox):

```js
// astro.config.mjs
import maintenanceModePlugin from "emdash-maintenance-mode";
import maintenanceMode from "emdash-maintenance-mode/astro";

export default defineConfig({
	integrations: [
		emdash({ plugins: [maintenanceModePlugin] }),
		maintenanceMode(),
	],
});
```

**Workers Paid** (plugin sandbox enabled): put the plugin in `sandboxed: [maintenanceModePlugin]` instead, or install it from **Registry** in the admin. The companion line stays the same.

Then deploy, open **Plugins → Maintenance Mode & Coming Soon** in the admin, enter your license key, choose the page and turn it on.

## Free vs Pro

Every feature is free, on as many sites as you like. The free version shows a small "Powered by" badge at the bottom of the maintenance page. A Pro license lets you hide it.

| Plan | Annual | Lifetime |
| --- | --- | --- |
| 1 site | €9 / year | €29 once |
| 5 sites | €29 / year | €89 once |

- Enter the license key in the plugin page in the admin. A **Hide badge** option appears.
- **Annual**: if the subscription ends, the badge comes back. Nothing else changes, and your site is never blocked.
- **Lifetime**: no expiry, updates to all 1.x versions included.
- A key works on the number of sites in its plan. Use **Deactivate on this site** to move it to another site. Local development (`localhost`) never needs a key.

## License

Free to use, source-available, with a paid option to hide the badge. You can read and audit the code; you may not redistribute it or share license keys. See [LICENSE.md](./LICENSE.md).

## Development

```sh
pnpm install
pnpm run validate    # check emdash-plugin.jsonc
pnpm run typecheck
pnpm run test        # builds the plugin and runs tests through EmDash's sandbox runner
pnpm run build
```

Bump `version` in `package.json` for every release, and always when `capabilities`, `allowedHosts` or `storage` change in `emdash-plugin.jsonc`: installed sites have consented to the previous trust contract.
