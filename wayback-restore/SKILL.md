---
name: wayback-restore
description: >
  End-to-end workflow for restoring a dead website from the Wayback Machine into a
  clean, deployable static site. Use when the user says "restore <domain>",
  "revive an expired domain", or "download from wayback". Self-contained: ships
  with a non-interactive downloader wrapper and seven cleanup/recovery scripts.
  Covers download, broken-link backfill from CDX, URL rewriting, wayback
  injection stripping, missing-asset mirroring from live sister sites, Cloudflare
  email decoding, and a UTF-8 dev server with CMS widget XHR stubs.
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

## Phase 1.5 — Backfill broken links from CDX

The interactive downloader frequently skips category pages and individual
product/article pages even when Wayback has snapshots. Walk every `<a href>`,
find broken local targets, query the Wayback CDX, and fetch what exists:

```bash
node "$SKILL_DIR/scripts/backfill-links.js" <site-dir> <origin-host>
# e.g. node scripts/backfill-links.js websites/example.com www.example.com
```

Backfilled HTML comes from Wayback's raw `id_/` endpoint, so it has absolute
origin URLs (`https://www.example.com/X`) instead of relative paths. Always
follow with the rewriter:

```bash
node "$SKILL_DIR/scripts/rewrite-absolute.js" <site-dir> <origin-host>
```

Re-run `backfill-links.js` 2–4 more times — newly-backfilled pages reveal more
broken links. Converges in a few iterations. Pages truly absent from Wayback
are logged to `<site-dir>/.backfill.log`.

The backfill script skips dynamic prefixes (`account/`, `checkout/`,
`wishlist/`, `widgets/`, `detail/`, `navigation/`, `config-start/`, `customer/`)
since those need a live backend and won't be in the archive.

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

Verify clean:

```bash
grep -rlE 'archive\.org|WAYBACK|_____WB' <site-dir> || echo "clean"
```

## Phase 3 — Production cleanup

### 3a. Mirror missing assets from a live sister site (optional, very effective)

Many businesses run sibling shops on the same template (`example.de`, `.at`,
`.ch`, `.nl`) backed by one server that serves every site's exact asset paths.
If you find such a sibling, you can mirror every missing CSS/JS/image:

```bash
node "$SKILL_DIR/scripts/mirror-missing-assets.js" <site-dir> <upstream-base-url>
# e.g. node scripts/mirror-missing-assets.js websites/example.dk https://www.example.de
```

Walks every HTML file, extracts asset references (link href, script src, img
src/srcset, picture/source, CSS `url(...)`), and for each missing local path
fetches `<upstream>/<same path>` and writes it. Recurses one level into
downloaded CSS to pull nested `url(...)` deps. Failed URLs go to
`<site-dir>/.mirror-failed.log`.

To find a sister site: open the homepage and grep for absolute URLs to other
domains owned by the same business (often listed in the language switcher).

### 3b. Cloudflare email decoding

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

### 3c. Unused chunks and analytics

Site-specific (the chunk set differs per CMS/template), no general script:

1. **Unused chunks** — serve the site locally, open the homepage, watch the
   Network tab, and delete any large bundled JS/CSS files that are never
   requested (typical Wix-style suspects: `background-*.js`, `gallery-*.js`,
   `course-*.js`). Be conservative; keep anything referenced from inline HTML.
2. **Analytics** — strip `gtag`, `googletagmanager`, `facebook`, `hotjar`,
   `clarity` etc. script tags.

## Verification before handoff

Use the bundled Node static server (preferred over `python3 -m http.server`):
it sends `Content-Type: text/html; charset=utf-8` so Danish/German/Swedish
characters render correctly, and returns empty `200` for typical CMS XHR
widget paths (`/widgets/*`, `/checkout/*`, `/wishlist/*`, `/account/*`,
`/customer/*`) so the page's own JS doesn't inject the server's 404 HTML into
cart/wishlist placeholders.

```bash
grep -rlE 'archive\.org|WAYBACK|_____WB' <site-dir>
grep -rlE 'data-cfemail|/cdn-cgi/l/email-protection' <site-dir>

node "$SKILL_DIR/scripts/serve.js" <site-dir> 8080
```

Open `http://localhost:8080`, click through the main nav, hit a category page,
hit a product/article page, check the console for 404s and JS errors.

Python's `http.server` works as a fallback but will (a) garble non-ASCII chars
in the `<title>` because it omits the charset header and (b) make broken
widget XHRs inject visible "Error response 404" HTML into the cart/header.

## Files in this skill

- `download.js` — non-interactive Wayback downloader (wraps the npm package)
- `scripts/backfill-links.js` — find broken `<a href>` targets, query CDX, fetch
- `scripts/rewrite-absolute.js` — rewrite absolute origin URLs to root-relative
- `scripts/strip-wayback-urls.js` — strip archive.org URL wrappers
- `scripts/strip-wayback-artifacts.js` — strip injected wombat/toolbar blocks
- `scripts/mirror-missing-assets.js` — mirror missing assets from a live sister site
- `scripts/clean-cloudflare-emails.js` — decode CF-obfuscated emails
- `scripts/serve.js` — UTF-8 static server with CMS widget XHR stubs
- `package.json` — declares the `wayback-machine-downloader` dependency

## Related

- `[[svenskarnasparti-deployment]]` — pattern for deploying a restored site to
  an IncogNET VPS behind Cloudflare (SSH port 2222, Nginx).
