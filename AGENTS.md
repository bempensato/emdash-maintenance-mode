# Agent instructions

Before editing this plugin, read `skills/creating-plugins/SKILL.md` completely. Codex discovers the same directory through `.agents/skills`; Claude discovers it through `.claude/skills` and reads these instructions through `.claude/CLAUDE.md`.
Keep `emdash-plugin.jsonc` aligned with the runtime implementation, declare every capability and host the plugin uses, and run the generated validation, typecheck, test, and build scripts after changes.

## Project

Commercial, source-available EmDash plugin sold with Lemon Squeezy license keys. Display name "Maintenance Mode & Coming Soon", npm `emdash-maintenance-mode`, registry slug `maintenance-mode`.

One package, two parts sharing `src/shared/`:

- **Plugin** (`src/plugin.ts`, sandboxed format): Block Kit admin page, settings (on/off, mode, page to show, who bypasses, guest access by secret link or password), Lemon Squeezy license (activate/validate/deactivate via `ctx.http`, host `api.lemonsqueezy.com`), `page:metadata` noindex. The same bundle must work from the registry, in `sandboxed: []` (Workers Paid) and in `plugins: []` (Workers Free, in-process).
- **Companion** (`src/astro/`, Astro integration exported as `./astro`): middleware that rewrites visitor requests to the maintenance page (503, `Retry-After`, `no-store`, `noindex`), lets through logged-in users above the configured role and guests with a valid signed cookie, and the injected route that renders the chosen entry with live editing. It reads plugin settings from EmDash's options table (`plugin:<id>:settings:<key>`); the id is the slug for npm installs and `r_` + base32(sha256(publisherDID + "\n" + slug))[0..16] for registry installs.

Rules: fail open (never block a site because of an error or an unreachable license server), no telemetry, no runtime dependencies in the companion, no network calls outside `allowedHosts`.
