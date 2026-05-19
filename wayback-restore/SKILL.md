---
name: wayback-restore
description: >
  End-to-end workflow for restoring a dead website from the Wayback Machine into a
  clean, deployable static site. Use when the user says "restore <domain>",
  "revive an expired domain", or "download from wayback". Self-contained: ships
  with a non-interactive downloader wrapper and three cleanup scripts. Covers
  the three repeatable phases: (1) download snapshot, (2) strip wayback
  injections and archive.org URLs from assets, (3) production cleanup
  (Cloudflare email obfuscation, unused chunks, analytics).
---

# Wayback Restore

Self-contained skill — all tooling lives in this skill's base directory. Run
every command from `$SKILL_DIR` (the skill's base directory; shown to you at
invocation time). Output sites land in `$SKILL_DIR/websites/<host>/`.

## One-time setup

The skill depends on the npm package `wayback-machine-downloader`. On first
use (or if `$SKILL_DIR/node_modules` is missing), install deps:

```bash
cd "$SKILL_DIR" && npm install
```

## Phase 1 — Download the snapshot

```bash
cd "$SKILL_DIR" && node download.js <domain>
```

Optional flags: `--out <dir>`, `--from <YYYYMMDDhhmmss>`, `--to <YYYYMMDDhhmmss>`, `--threads <n>`.

Defaults: rewrite=relative, canonical=remove, exact_url=false, threads=5,
external assets off, output dir `$SKILL_DIR/websites/<host>/`.

Examples:

```bash
node download.js example.com
node download.js example.com --from 20230101000000 --to 20231231235959 --threads 8
node download.js example.com --out /custom/path/example.com
```

For interactive use (prompts for every option), invoke the upstream CLI
directly:

```bash
cd "$SKILL_DIR" && node node_modules/wayback-machine-downloader/cli.js
```

## Phase 2 — Strip Wayback artifacts

The Wayback Machine injects two kinds of contamination:

1. **URL wrappers** like `//web.archive.org/web/20231001120000im_/` prefixed
   to every asset URL inside HTML/CSS/JS.
2. **Toolbar/wombat script blocks** appended to CSS/JS files. Markers:
   `FILE ARCHIVED ON`, `JAVASCRIPT APPENDED BY WAYBACK MACHINE`,
   `var _____WB$wombat`, `var RufflePlayer`.

Run both scripts against the site directory:

```bash
node "$SKILL_DIR/scripts/strip-wayback-urls.js" <site-dir>
node "$SKILL_DIR/scripts/strip-wayback-artifacts.js" <site-dir>
```

Where `<site-dir>` is e.g. `$SKILL_DIR/websites/example.com` (or wherever you
sent the download with `--out`).

`strip-wayback-urls.js` rewrites archive.org URL wrappers across all text files
(`.html`, `.css`, `.js`, `.json`, `.xml`, `.svg`, `.txt`, `.map`).
`strip-wayback-artifacts.js` scans CSS/JS/HTML, finds the earliest injection
marker, walks backward to the start of the injected block (`/*`, triple
newline, or `<script`), and truncates there.

Verify clean:

```bash
grep -rlE 'archive\.org|WAYBACK|_____WB' <site-dir> || echo "clean"
```

## Phase 3 — Production cleanup

### Cloudflare email decoding

If the original site sat behind Cloudflare, emails will be obfuscated with
`data-cfemail` attributes and a decoder script. Run:

```bash
node "$SKILL_DIR/scripts/clean-cloudflare-emails.js" <site-dir>
```

Decodes payloads back to plain `mailto:` links and strips the decoder scripts.
Verify:

```bash
grep -rlE 'data-cfemail|/cdn-cgi/l/email-protection' <site-dir> || echo "clean"
```

### Unused chunks and analytics

Site-specific (the chunk set differs per CMS/template), no general script:

1. **Unused chunks** — serve the site locally, open the homepage, watch the
   Network tab, and delete any large bundled JS/CSS files that are never
   requested (typical Wix-style suspects: `background-*.js`, `gallery-*.js`,
   `course-*.js`). Be conservative; keep anything referenced from inline HTML.
2. **Analytics** — strip `gtag`, `googletagmanager`, `facebook`, `hotjar`,
   `clarity` etc. script tags.

## Verification before handoff

```bash
grep -rlE 'archive\.org|WAYBACK|_____WB' <site-dir>
grep -rlE 'data-cfemail|/cdn-cgi/l/email-protection' <site-dir>
cd <site-dir> && python3 -m http.server 8080
```

Open `http://localhost:8080`, click through main nav, check console for 404s
and JS errors.

## Files in this skill

- `download.js` — non-interactive Wayback downloader (wraps the npm package)
- `scripts/strip-wayback-urls.js` — strips archive.org URL wrappers
- `scripts/strip-wayback-artifacts.js` — strips injected wombat/toolbar blocks
- `scripts/clean-cloudflare-emails.js` — decodes CF-obfuscated emails
- `package.json` — declares the `wayback-machine-downloader` dependency

## Related

- `[[svenskarnasparti-deployment]]` — pattern for deploying a restored site to
  an IncogNET VPS behind Cloudflare (SSH port 2222, Nginx).
