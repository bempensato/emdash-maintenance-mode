# Changelog

## 0.2.0 — unreleased

First feature-complete pre-release.

- **Companion** (`emdash-maintenance-mode/astro`): visitor gate with `503`, `Retry-After`, `no-store` and `noindex`; bypass by role; fail-open on any error; maintenance page rendering the chosen entry with live editing, built-in fallback text (English/Italian) and a neutral default layout; optional custom layout.
- **Plugin admin page**: on/off, mode, page picker, who sees the full site, setup check (companion missing, outdated or installed twice).
- **Guest access**: secret preview link (rotate, turn off), password form with rate limiting, signed `HttpOnly` cookie with configurable duration, revoke all.
- **Pro license** (Lemon Squeezy): activate, daily validation, deactivate, domain binding, 7-day grace period; hides the "Powered by" badge. Product ids are placeholders until the store opens, so keys are not accepted yet.
- `page:metadata` adds `noindex` while the site is hidden.
- `npx emdash-maintenance-mode init` edits `astro.config` for you.
- Trust contract: `content:read`, `schema:read`, `network:request` limited to `api.lemonsqueezy.com`.

## 0.1.0

Scaffold.
