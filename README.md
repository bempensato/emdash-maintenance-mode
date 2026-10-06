# Maintenance Mode & Coming Soon for EmDash

Show visitors a maintenance or coming soon page while your team keeps working on the full site.

> **Status: pre-release.** Every feature below is implemented; the Pro license is not on sale yet.

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

To uninstall, deactivate the license (if you have one), then remove the two lines from `astro.config.mjs`. Nothing else is left behind except the plugin's own settings.

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
npx emdash-maintenance-mode init
```

`init` adds the plugin and the companion to `astro.config.mjs`, shows you the change and asks before writing (`--yes` skips the question). If it doesn't recognise the shape of your config it prints the lines to paste instead. By hand:

**Workers Free** (no plugin sandbox):

```js
// astro.config.mjs
import maintenanceModePlugin from "emdash-maintenance-mode";
import maintenanceMode from "emdash-maintenance-mode/astro";

export default defineConfig({
	output: "server",
	integrations: [
		emdash({ plugins: [maintenanceModePlugin] }),
		maintenanceMode(),
	],
});
```

**Workers Paid** (plugin sandbox enabled): put the plugin in `sandboxed: [maintenanceModePlugin]` instead, or install it from **Registry** in the admin. The companion line stays the same.

Then deploy and open **Plugins → Maintenance Mode** in the admin. The **Setup check** at the bottom of the page confirms that the companion is running (it reports in the first time a logged-in user opens the site).

Before it is on npm, you can install a specific commit from GitHub. pnpm builds it on install once you allow it:

```yaml
# pnpm-workspace.yaml
onlyBuiltDependencies:
  - emdash-maintenance-mode
```

```sh
pnpm add github:bempensato/emdash-maintenance-mode#<commit>
```

### Companion options

```js
maintenanceMode({
	path: "/maintenance",               // where the maintenance page lives
	layout: "./src/layouts/Base.astro", // your own layout; receives `title` and renders the page in its slot
	accessPath: "/maintenance-access",  // endpoint of the password form
});
```

Without `layout` the page uses a neutral built-in layout with your site's title or logo, which works in light and dark mode and loads no external assets.

## Using it

On the plugin page in the admin:

1. **Status**: hide the site from visitors, or make it public again. The change reaches visitors within about 10 seconds; no redeploy.
2. **Settings**: choose *Coming soon* or *Maintenance*, the page to show (any published entry, for example a page called "Coming soon"), and who sees the full site: editors and admins (default), admins only, or every logged-in user. Without a page, visitors see a short built-in message.
3. **Edit the page** like any other: open it on the site while logged in (the admin links to it) and use live editing. It works while the site is still public, so you can prepare it first.
4. **Guest access**: create a secret preview link, set a password visitors can type on the maintenance page, choose how long guests stay signed in, or revoke every guest at once.

What visitors get while the site is hidden: `503 Service Unavailable`, `Retry-After`, `Cache-Control: no-store` and `noindex`. Only `GET` and `HEAD` page requests are affected: assets, files, the admin, APIs and form posts keep working. If anything goes wrong while checking a request (a database error, a broken setting), the visitor gets the normal site.

### Good to know

- **Route caching.** If your site caches whole pages at the edge (Astro's route cache), pages cached *before* you turned maintenance mode on can be served until they expire, because cached pages bypass middleware. Nothing is cached while the site is hidden. Purge the cache after turning it on if you need the change to be immediate.
- **Preview links of drafts** (`?_preview=…`) keep working for whoever has a valid EmDash preview token; a made-up `_preview` parameter does not unlock the site.
- **Passwords** are hashed with PBKDF2 (20 000 iterations, random salt) so that checking one fits the CPU budget of Workers Free; the form allows 5 wrong attempts per visitor every 10 minutes.
- **Admin language.** The plugin page has English and Italian text; it follows the admin language, and EmDash's admin doesn't offer Italian yet, so for now it shows English.

## Free vs Pro

Every feature is free, on as many sites as you like. The free version shows a small "Powered by" badge at the bottom of the maintenance page. A Pro license lets you hide it.

| Plan | Annual | Lifetime |
| --- | --- | --- |
| 1 site | €9 / year | €29 once |
| 5 sites | €29 / year | €89 once |

- Enter the license key in the plugin page in the admin and press **Activate**. The badge is hidden; you can show it again at any time.
- The key is activated for your site's domain. If you move the site, use **Activate on this site** (or **Deactivate on this site** and activate it elsewhere).
- The plugin checks the license about once a day. If Lemon Squeezy can't be reached, nothing changes for 7 days.
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

| Path | What |
| --- | --- |
| `src/plugin.ts`, `src/plugin/` | Sandboxed plugin: admin page (Block Kit), hooks, license client |
| `src/astro/` | Companion: integration, middleware, maintenance page, password endpoint |
| `src/shared/` | Shared by both: the `runtime` setting contract, ids, crypto, badge rule |
| `bin/` | `npx emdash-maintenance-mode init` |
| `docs/IMPLEMENTATION_PLAN.md` | Design decisions and architecture |

### Releasing

- **npm**: bump `version` in `package.json` (and `PACKAGE_VERSION` in `src/shared/keys.ts`, a test checks they match), update `CHANGELOG.md`, then push a tag `vX.Y.Z`. The `Publish to npm` workflow checks, builds and publishes with provenance (secret `NPM_TOKEN`).
- **EmDash registry**: run `pnpm run release:setup` once (it links the publisher profile and writes the release workflow), or publish from this computer with `pnpm run registry:publish`.

To try the companion in a local site, install the package from a tarball (`pnpm pack`) rather than with `link:`: Astro doesn't compile the styles of `.astro` files linked from outside the project.

Bump `version` in `package.json` for every release, and always when `capabilities`, `allowedHosts` or `storage` change in `emdash-plugin.jsonc`: installed sites have consented to the previous trust contract.
