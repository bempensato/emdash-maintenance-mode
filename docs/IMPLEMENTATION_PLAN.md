# Implementation plan — Maintenance Mode & Coming Soon for EmDash

This document is the complete brief for implementing the plugin. It is written for an agent starting from a fresh session: read it fully, then `AGENTS.md`, `skills/creating-plugins/SKILL.md`, `README.md` and `LICENSE.md` before writing code.

Decisions marked **(decided)** were agreed with the owner and must not be re-opened. Items marked **(verify)** are facts not yet confirmed against a live system; check them before relying on them.

---

## 1. Product

| | |
|---|---|
| Display name | **Maintenance Mode & Coming Soon** |
| Repo | `bempensato/emdash-maintenance-mode` (public), default branch `main` |
| npm package | `emdash-maintenance-mode` |
| Registry slug / public name | `maintenance-mode` / `@bempensato.com/maintenance-mode` |
| Publisher DID | `did:plc:f3in7i6onwmsmxykb7emfyru` (handle `bempensato.com`) |
| Security contact | `support@bempensato.com` |
| Author / copyright | Federico Bempensato |
| License | Freemium, source-available (`LICENSE.md`, approved) |

**What it does:** while enabled, anonymous visitors of an EmDash site see a maintenance / coming soon page instead of the site. The page is a normal EmDash entry, edited with live editing. Logged-in users above a configurable role see and edit the whole site. Guests can be let in with a secret link or a password.

**Business model (decided):** every feature is free and shows a small "Powered by" badge on the maintenance page. A Lemon Squeezy license key unlocks a **Hide badge** option. If the key expires, is cancelled or revoked, the badge comes back; nothing else changes and the site is never blocked.

| Plan | Annual | Lifetime |
|---|---|---|
| 1 site | €9 / year | €29 |
| 5 sites | €29 / year | €89 |

There is no unlimited plan (decided).

---

## 2. Non-negotiable rules

1. **Fail open.** Any error (DB, settings, crypto, license server) must let visitors through to the real site, never block it and never show an error page.
2. **No telemetry.** No network calls except to `api.lemonsqueezy.com`, and only when a license key is entered.
3. **Companion has zero runtime dependencies** besides its peers (`astro`, `emdash`) and makes no network calls.
4. **One plugin codebase** in sandboxed format that works unchanged from the registry, from npm in `sandboxed: []` (Workers Paid) and from npm in `plugins: []` (Workers Free, in-process).
5. **No obfuscation / DRM.** The code stays readable; license enforcement is "honest".
6. Bump `package.json` `version` whenever `capabilities`, `allowedHosts` or `storage` change in `emdash-plugin.jsonc` (pre-1.0 releases included).
7. Run `pnpm run validate`, `pnpm run typecheck`, `pnpm test`, `pnpm run build` before every commit. Commit to `main` in small, reviewable steps.

---

## 3. Verified technical facts (emdash 1.1.0, @emdash-cms/plugin-cli 0.13.2)

- **Plugins cannot intercept public requests.** There is no request hook and `PluginDescriptor` has no middleware field (`emdash/src/astro/integration/runtime.ts`). Public-page hooks are only `page:metadata` (sandbox-safe) and `page:fragments` (native only). Hence the Astro **companion**.
- **Plugin registration.** `emdash-plugin build` emits `dist/index.mjs` that default-exports a frozen descriptor object (`format: "standard"`, `entrypoint: "emdash-maintenance-mode/sandbox"`). It is passed **without calling it**: `plugins: [maintenanceModePlugin]` or `sandboxed: [maintenanceModePlugin]`.
- **Plugin ids.** npm install: id = slug `maintenance-mode`. Registry install: id = `"r_" + base32lower(sha256(publisherDid + "\n" + slug))` truncated to 16 chars (RFC 4648 alphabet `a-z2-7`, no padding). Source: `emdash/src/registry/plugin-id.ts` (copy the algorithm, including `base32Encode`, and unit-test it against that file's behaviour).
- **Settings storage.** Plugin settings live in the options table under `plugin:<id>:settings:<key>`. `emdash` **publicly exports** `getPluginSetting(pluginId, key)` and `getPluginSettings(pluginId)` for templates (`emdash/src/settings/index.ts`); the companion must use these, not raw SQL. Secret fields are decrypted with `EMDASH_ENCRYPTION_KEY`; the companion must never need a secret.
- **Plugin context** (`emdash/src/plugins/types.ts`): `ctx.settings` (get/set/delete/list), `ctx.kv`, `ctx.content.list/get` (needs `content:read`), `ctx.http.fetch` (needs `network:request` + `allowedHosts`), `ctx.site.url`, `ctx.cron.schedule()`, `ctx.log`.
- **Cron.** Schedule in `plugin:activate` with `ctx.cron.schedule(name, { schedule: "<cron>" })`; handle in the `cron` hook (`event.name`). On Cloudflare, cron triggers run only in production.
- **Manifest admin.** `emdash-plugin.jsonc` accepts `admin.pages` (Block Kit pages served by the private `admin` route) and `admin.settingsSchema` (field types `string`, `number`, `boolean`, `select`, `secret`, `url`, `email`). Registry limits: description ≤ 140 graphemes, ≤ 5 keywords.
- **Auth in public middleware.** EmDash middleware runs with `order: "pre"`; a companion middleware added with `order: "post"` sees `locals.user` (soft auth on public routes; `user.role`: 10 subscriber, 20 contributor, 30 author, 40 editor, 50 admin) and `locals.emdash`.
- **Live editing.** Entries from `getEmDashEntry()` expose `entry.edit.<field>` spreads; the page needs `createPublicPageContext` + `<EmDashHead>`, `<EmDashBodyStart>`, `<EmDashBodyEnd>` (the official EmDash templates' `src/layouts/Base.astro` and `src/pages/[slug].astro` show the pattern).
- **Lemon Squeezy License API (verify field names against https://docs.lemonsqueezy.com/api/license-api):** base `https://api.lemonsqueezy.com`, `POST /v1/licenses/activate` (`license_key`, `instance_name`), `/v1/licenses/validate` (`license_key`, `instance_id`), `/v1/licenses/deactivate` (`license_key`, `instance_id`); form-encoded, `Accept: application/json`, no API key; 60 req/min. Responses include `license_key.status` (`inactive|active|expired|disabled`), `license_key.expires_at`, `license_key.activation_limit/activation_usage`, `instance.id`, `meta.store_id/product_id/variant_id`.

---

## 4. Architecture

```
emdash-plugin.jsonc      manifest (trust contract)
package.json             exports ".", "./sandbox", "./astro"
src/
  shared/                imported by both halves; Web APIs only
    keys.ts              slug, publisher DID, setting key names, defaults
    plugin-id.ts         npm/registry id derivation
    state.ts             RuntimeState type + parse/validate (defensive, versioned)
    crypto.ts            sha256, HMAC-SHA256 sign/verify, password hashing (PBKDF2 via Web Crypto), random tokens, constant-time compare
    license.ts           pure helpers: badge visibility, grace period, dev-host detection
    product.ts           Lemon Squeezy store/product/variant ids (placeholders until the product exists)
  plugin.ts              SandboxedPlugin: admin page, settings, license, cron, page:metadata
  plugin/                (optional split of plugin.ts) admin-page.ts, license-client.ts, i18n.ts
  astro/
    index.ts             maintenanceMode(options): AstroIntegration
    middleware.ts        visitor gate
    state.ts             reads RuntimeState via getPluginSetting, id resolution, 10 s in-memory cache
    MaintenancePage.astro  injected route rendering the chosen entry
    DefaultLayout.astro  neutral layout (used when options.layout is not set)
    access.ts            injected POST endpoint for the password form
bin/init.mjs             `npx emdash-maintenance-mode init`
tests/                   plugin tests (plugin-test host) + companion unit tests
```

### 4.1 The contract between plugin and companion: `runtime` setting

The plugin keeps everything the companion needs in **one non-secret setting** `runtime` (JSON), rewritten after every admin change and every license check. The companion reads only this key (one query, cached).

```ts
interface RuntimeState {
  v: 1;
  enabled: boolean;
  mode: "coming-soon" | "maintenance";
  page: { collection: string; slug: string } | null;
  bypassMinRole: 20 | 40 | 50;           // all logged-in | editors+admins (default) | admins only
  guest: {
    linkTokenHash: string | null;         // sha256 hex of the preview token; null = link disabled
    password: { saltB64: string; hashB64: string; iterations: number } | null;
    cookieSecretB64: string;              // HMAC key, generated once
    cookieVersion: number;                // bump = revoke all guest cookies
    cookieMaxAgeDays: number;             // default 30
  };
  badge: { hidden: boolean; licenseExpiresAt: string | null; graceUntil: string | null };
  retryAfterSeconds: number;              // default 3600
  updatedAt: string;
}
```

Companion badge rule: show the badge unless `badge.hidden && (licenseExpiresAt == null || now < licenseExpiresAt || now < graceUntil)`. This makes the badge reappear on expiry even if cron never runs.

The companion also writes one setting, `companion`, `{ version, seenAt }`, at most once per isolate lifetime (via `OptionsRepository` from `emdash`, key `plugin:<id>:settings:companion`), so the admin page can show "companion installed ✓".

### 4.2 Other plugin settings

| Key | Kind | Purpose |
|---|---|---|
| `licenseKey` | `secret` in `admin.settingsSchema` | encrypted; never sent back to the browser |
| `license` | JSON | `{ instanceId, instanceName, status, expiresAt, variantId, lastValidatedAt, lastError }` |
| `previewToken` | string | plain token so admins can copy the link again (rotating it changes `linkTokenHash`) |

All other admin choices are folded into `runtime`.

---

## 5. Plugin (`src/plugin.ts`, sandboxed format)

### 5.1 Manifest changes

```jsonc
"capabilities": ["content:read", "schema:read", "network:request"],
"allowedHosts": ["api.lemonsqueezy.com"],
"admin": {
  "pages": [{ "path": "/", "label": "Maintenance Mode", "icon": "<pick a valid icon>" }],
  "settingsSchema": { "licenseKey": { "type": "secret", "label": "License key" } }
}
```

`schema:read` is needed to list collections in the page picker. Bump the version.

### 5.2 Hooks

- `plugin:install`: generate `cookieSecretB64` (32 random bytes) and write the default `runtime` (`enabled: false`, `mode: "coming-soon"`, `bypassMinRole: 40`, link and password disabled, badge visible).
- `plugin:activate`: `ctx.cron.schedule("license-validate", { schedule: "17 3 * * *" })`; repair `runtime` if missing.
- `cron` (`license-validate`): validate the license (§5.4) and rewrite `runtime.badge`.
- `page:metadata`: when `runtime.enabled`, contribute `{ kind: "meta", name: "robots", content: "noindex, nofollow" }`.

### 5.3 Admin page (Block Kit, private `admin` route)

Validate `routeCtx.input` with zod (see the Block Kit reference). On `page_load`, run a lazy license validation if `lastValidatedAt` is older than 24 h. Sections:

1. **Status**: big "Site is public / Site is hidden" + toggle; mode select (Coming soon / Maintenance).
2. **Page to show**: collection select (from `ctx.schema`), entry select (from `ctx.content.list`, published entries, title + slug). Hint: "Edit this page like any other: open it on the site while logged in to use live editing." Show the public preview path.
3. **Who sees the full site**: select All logged-in users / Editors and admins (default) / Admins only.
4. **Guest access**: preview link on/off, "Copy link" (show full URL built from `ctx.site.url`), "Regenerate link"; password set/remove; cookie duration; "Revoke all guest access" (bumps `cookieVersion`).
5. **License**: status line (Free / Pro until <date> / Lifetime / Expired / Invalid), license key input + Activate, Deactivate on this site, **Hide badge** toggle (visible only with a valid license), link to buy.
6. **Setup check**: if `companion` setting is missing or older than the plugin version, show "Step 2: install the companion" with the exact `astro.config.mjs` lines; warn if both the npm id and the registry id have state (installed twice).

Strings: English default, Italian when `routeCtx.ui.locale` starts with `it`. Keep all strings in one `i18n.ts`.

### 5.4 License client

- **Activate**: `instance_name` = hostname of `ctx.site.url`. Reject if `meta.store_id`/`product_id` don't match `src/shared/product.ts` or `variant_id` is unknown. Store `license` and set `runtime.badge.hidden = true` (user can turn it off).
- **Validate**: send stored `instance_id`. Valid only if `valid === true`, status `active`, product matches, and the current hostname equals `instanceName`. Hostname mismatch → treat as unlicensed, show "Activate on this site". Network error → keep last good state, set `graceUntil = lastValidatedAt + 7 days`.
- **Deactivate**: call API, clear `license`, show badge.
- **Dev hosts**: `localhost`, `127.0.0.1`, `[::1]` may hide the badge without activation. Nothing else is exempt (`*.workers.dev` is not).
- Never log the license key.

---

## 6. Companion (`src/astro/`)

### 6.1 Integration

```ts
export default function maintenanceMode(options?: {
  path?: string;          // default "/maintenance"
  layout?: string;        // project-relative path to an .astro layout receiving { title, children }
  accessPath?: string;    // default "/maintenance-access"
}): AstroIntegration
```

In `astro:config:setup`: `addMiddleware({ entrypoint: new URL("./middleware.ts", import.meta.url), order: "post" })`, `injectRoute` for the page and the access endpoint, and a Vite virtual module `virtual:emdash-maintenance-mode/config` exposing the options and the layout import. Fail the build with a clear message if `output` is not `"server"`.

### 6.2 Middleware order of checks

1. Only `GET`/`HEAD` are gated; everything else passes (forms, APIs).
2. Pass: `/_emdash/*`, `/_astro/*`, `/_image*`, `/.well-known/*`, `/favicon*`, `/robots.txt`, any path with a file extension, `options.path`, `options.accessPath`, URLs with `_preview` or `_edit` params.
3. Load `runtime` (cached 10 s per isolate; resolve id: try `maintenance-mode`, then the registry id; if both exist use the newer `updatedAt`). Missing/invalid → pass.
4. `!enabled` → pass.
5. `locals.user && locals.user.role >= bypassMinRole` → pass.
6. `?mm_access=<token>` with `sha256(token) == linkTokenHash` → set guest cookie, redirect 302 to the same URL without the param.
7. Valid guest cookie `mm_access` → pass. Cookie value `base64url(payload).base64url(hmac)` with payload `{ v: cookieVersion, exp }`; verify HMAC (constant time), version, expiry. Attributes: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=…` (omit `Secure` on `http://localhost`).
8. Otherwise `context.rewrite(options.path)` and return a new `Response` with the same body, status **503**, `Retry-After: retryAfterSeconds`, `Cache-Control: no-store`, `X-Robots-Tag: noindex`.

Wrap steps 3–8 in try/catch → on error `return next()`.

### 6.3 Maintenance page (`MaintenancePage.astro`)

- `getEmDashEntry(page.collection, page.slug)`; render `title`, optional `subtitle`, optional image field, and the main Portable Text field (`content`, falling back to the first portableText field) with `entry.edit.*` spreads for live editing.
- Missing entry or `page == null` → built-in fallback text per mode ("We're launching soon" / "We'll be back shortly"), translated by site locale (en/it).
- Password form when `guest.password` is set; POST to `accessPath`; shows a generic error on failure.
- Badge at the bottom when the badge rule says so: "Powered by Maintenance Mode for EmDash", linking to the product page (use the GitHub repo URL until the landing page exists).
- `<meta name="robots" content="noindex">`. Wrapped in `options.layout` or `DefaultLayout.astro` (site title/logo from `getSiteSettings()`, centered card, light/dark friendly, no external assets).
- Visiting `options.path` directly while logged in shows the page with the EmDash toolbar so editors can live-edit it.

### 6.4 Password endpoint (`access.ts`)

POST form `password`, `return` (same-origin relative path only). Rate limit: max 5 failures per IP per 10 minutes in an in-memory map (best effort). Verify PBKDF2 hash in constant time; on success set the cookie and 303 to `return`; on failure 303 back with `?mm_error=1`.

---

## 7. `npx emdash-maintenance-mode init`

Node script (no dependencies): find `astro.config.(mjs|ts)`, detect `sandboxRunner`, add the two imports, add `maintenanceModePlugin` to `plugins` (or `sandboxed` when a runner is configured) and `maintenanceMode()` to `integrations`. Print the diff and ask for confirmation; `--yes` skips it. If the file shape is not recognised, print the exact lines to paste instead of guessing.

---

## 8. Tests

- **Plugin** (`@emdash-cms/plugin-test`): install defaults; admin page renders and validates (`createPluginRuntimeTestHost` admin helpers); toggles update `runtime`; preview-link rotation changes the hash; password set stores a hash only; license activate/validate/deactivate with `host.http.respond()` for: valid, wrong product, expired, disabled, activation limit reached, network error (grace), hostname mismatch; `page:metadata` only when enabled; the secret `licenseKey` is stored encrypted (`inspect.settings.raw()`).
- **Shared**: registry id derivation against the EmDash algorithm; HMAC sign/verify and tampering; PBKDF2; badge rule incl. expiry and grace.
- **Companion** (vitest, plain unit tests with a fake `next`/context): allowlist, disabled, role thresholds, link flow + redirect, cookie valid/expired/tampered/revoked, 503 headers, fail-open on thrown errors, id resolution with both ids present.
- Manual end-to-end on the dedicated test instance (§9).

---

## 9. End-to-end testing on a dedicated instance

Use a clean EmDash site created only for testing this plugin (not a production site).

1. Create it from an official EmDash Cloudflare template (D1 + R2) and deploy it on the Workers **Free** plan, so the plugin runs in-process via `plugins: []`. Later, test the sandboxed path on a second instance (or the same one upgraded) with Worker Loader enabled (`sandboxed: []`, then a registry install).
2. Add the dependency from git (`"emdash-maintenance-mode": "github:bempensato/emdash-maintenance-mode#<commit>"`) until it is on npm; make sure `dist/` is available (build in a `prepare` script or publish a release build to a `release` branch).
3. Register plugin + companion in `astro.config.mjs` (or run `npx emdash-maintenance-mode init`), build and deploy.
4. In the admin create a page "Coming soon", pick it in the plugin, enable it, and check: anonymous visitor, each bypass role, preview link, password, revoke, live editing, badge with and without a (test-mode) license.

## 10. Release

1. `pnpm run release:setup` to create the GitHub Actions workflow for registry releases (delegated releases); add an npm publish job with `npm publish --provenance --access public` (needs `NPM_TOKEN` secret and `id-token: write`).
2. Tag `vX.Y.Z` → test, build, npm publish, registry publish.
3. Before 1.0: owner creates the Lemon Squeezy product (4 variants: 1 site/5 sites × annual/lifetime, license keys on, activation limits 1/5), fills `src/shared/product.ts`, tests in LS test mode; owner asks the EmDash maintainers whether a plugin with a paid option is welcome in the registry.

---

## 11. Milestones (one or more commits each)

1. **Shared core**: `keys`, `plugin-id`, `state`, `crypto`, `license` helpers + unit tests.
2. **Companion MVP**: integration, middleware (no guest access yet), page with live edit, default layout, fail-open, tests. Try it on the test instance (§9) with `runtime` written by hand if the admin page isn't ready.
3. **Plugin admin**: manifest update, install/activate hooks, Block Kit page (status, mode, page picker, bypass role), `page:metadata`, companion check.
4. **Guest access**: preview link, password, cookies, revoke, rate limit.
5. **Licensing**: Lemon Squeezy client, cron + lazy validation, badge toggle, grace period, domain binding.
6. **Installer & docs**: `init`, README updates (screenshots later), CHANGELOG.
7. **Release pipeline**: workflows, provenance, first `0.x` pre-release on npm (registry after maintainer feedback).

## 12. Acceptance criteria for 1.0

- Free install on Workers Free and on a sandboxed site behaves identically.
- Anonymous visitor: 503 + maintenance page + badge; editor (default setting): full site; preview link and password work and can be revoked.
- Live editing of the chosen page works for logged-in editors.
- With a valid key the badge can be hidden; after expiry (or with an expired fixture) it reappears without any manual action; Lemon Squeezy outage < 7 days changes nothing.
- No request leaves the site except to `api.lemonsqueezy.com`, and only with a key entered.
- Any thrown error in the companion results in the normal site being served.
