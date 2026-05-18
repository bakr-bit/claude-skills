---
name: wayback-restore
description: >
  End-to-end workflow for restoring a dead website from the Wayback Machine into a
  clean, deployable static site. Use when the user says "restore <domain>",
  "revive an expired domain", "download from wayback", or is working in this repo
  (cli.js, lib/downloader.js, scripts/strip-wayback-urls.js,
  scripts/strip-wayback-artifacts.js, scripts/clean-cloudflare-emails.js,
  websites/<host>/). Covers the three repeatable phases: (1) download snapshot,
  (2) strip wayback injections and archive.org URLs from assets,
  (3) production cleanup (Cloudflare email obfuscation, unused chunks, analytics).
---

# Wayback Restore

Use this skill when restoring a site from the Wayback Machine using this repo's
tooling. The workflow has three repeatable phases, each backed by a committed,
directory-agnostic script under `scripts/`. The ad-hoc `download-*.js`,
`fix-budsandbrews-*.js`, `fix-console-errors*.js`, etc. in the repo root are
**site-specific one-offs from prior restores** — don't run them on a new site.
Use the canonical commands below.

## Phase 1 — Download the snapshot

```bash
node cli.js
```

Interactive prompts:

- **Domain or URL**: e.g. `example.com` (no protocol needed; normalized internally)
- **From / To timestamp** (`YYYYMMDDhhmmss`): leave blank to take all snapshots, or
  narrow to a single capture window if the site changed substantially over time
- **Rewrite links**: answer `yes` (relative) for sites you'll self-host. Default
  `as-is` only if you'll serve under the original origin
- **Canonical**: if rewriting, answer `remove` unless the canonical tags are still
  valid for the new host
- **Threads**: 3 is the default; bump to 5–8 for large sites if you're not getting
  rate-limited by archive.org
- **Exact URL**: `no` (default) — wildcard `/*` grabs the whole tree
- **Target directory**: blank → `websites/<host>/`
- **Download external assets**: `no` unless the site genuinely depends on
  third-party CDN assets you also want vendored locally

Output lands in `websites/<host>/`.

For non-interactive runs (scripted restores), copy `download-aquafaba.js` as a
template — it instantiates `WaybackMachineDownloader` directly.

## Phase 2 — Strip Wayback artifacts

The Wayback Machine injects two kinds of contamination:

1. **URL wrappers** like `//web.archive.org/web/20231001120000im_/` prefixed to
   every asset URL inside HTML/CSS/JS.
2. **Toolbar/wombat script blocks** appended to CSS/JS files. Markers include
   `FILE ARCHIVED ON`, `JAVASCRIPT APPENDED BY WAYBACK MACHINE`,
   `var _____WB$wombat`, `var RufflePlayer`.

Run both committed scripts against the site directory — they walk recursively
and auto-detect contaminated files:

```bash
node scripts/strip-wayback-urls.js websites/<host>/
node scripts/strip-wayback-artifacts.js websites/<host>/
```

`strip-wayback-urls.js` rewrites archive.org URL wrappers across all text files
(`.html`, `.css`, `.js`, `.json`, `.xml`, `.svg`, `.txt`, `.map`).
`strip-wayback-artifacts.js` scans CSS/JS/HTML, finds the earliest injection
marker, walks backward to the start of the injected block (`/*`, triple
newline, or `<script`), and truncates there.

Both scripts print a verification pass at the end. After both have run, this
should be silent:

```bash
grep -rlE 'archive\.org|WAYBACK|_____WB' websites/<host>/ || echo "clean"
```

The original hardcoded copies (`fix-wayback-urls.js`, `fix-wayback-artifacts.js`)
remain in the repo root as historical reference for the budsandbrewsusa.com
restore. Don't run them on new sites — use the `scripts/` versions.

## Phase 3 — Production cleanup

### Cloudflare email decoding

If the original site sat behind Cloudflare, emails will be obfuscated with
`data-cfemail` attributes and a decoder script. Run:

```bash
node scripts/clean-cloudflare-emails.js websites/<host>/
```

This walks every `.html` file, decodes `data-cfemail` payloads back to plain
addresses, replaces the obfuscated anchors/spans with `mailto:` links, and
strips the various Cloudflare decoder script blocks. Verify:

```bash
grep -rlE 'data-cfemail|/cdn-cgi/l/email-protection' websites/<host>/ || echo "clean"
```

### Unused chunks and analytics

These steps remain site-specific (the chunk set differs per CMS/template) and
have no general script:

1. **Unused chunks** — open the homepage in a browser, watch the Network tab,
   and delete any large bundled JS/CSS files that are never requested
   (typical suspects from Wix-style sites: `background-*.js`, `gallery-*.js`,
   `course-*.js`). Be conservative; keep anything referenced from inline HTML.
2. **Analytics** — strip `gtag`, `googletagmanager`, `facebook`, `hotjar`,
   `clarity`, etc. script tags. `production-cleanup.js` in the repo root shows
   the per-site pattern used for budsandbrewsusa.com.

## Verification before handoff

```bash
# No wayback contamination remains
grep -rlE 'archive\.org|WAYBACK|_____WB' websites/<host>/

# No CF email obfuscation
grep -rlE 'data-cfemail|/cdn-cgi/l/email-protection' websites/<host>/

# Serve locally and spot-check
cd websites/<host>/ && python3 -m http.server 8080
```

Open `http://localhost:8080`, click through main nav, check console for 404s
and JS errors.

## Repo orientation for colleagues

- `cli.js` / `lib/downloader.js` — the actual downloader (upstream package; do
  not modify casually)
- `scripts/strip-wayback-urls.js`, `scripts/strip-wayback-artifacts.js`,
  `scripts/clean-cloudflare-emails.js` — **canonical, directory-agnostic
  cleanup tools**. Take `<dir>` as the only argument.
- `websites/<host>/` — output directory, one folder per restored site
- Root-level `download-*.js`, `fix-*.js`, `cleanup-*.js`,
  `production-cleanup.js`, `clean-cloudflare-emails.js`, etc. —
  **per-site historical scripts** from previous restores. Use as reference,
  don't run blindly.
- `dockerfile` / `index.js` — packaging for the downloader itself

## Related

- `[[svenskarnasparti-deployment]]` — pattern for deploying a restored site to
  an IncogNET VPS behind Cloudflare (SSH port 2222, Nginx).
