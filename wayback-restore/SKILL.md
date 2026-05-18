---
name: wayback-restore
description: >
  End-to-end workflow for restoring a dead website from the Wayback Machine into a
  clean, deployable static site. Use when the user says "restore <domain>",
  "revive an expired domain", "download from wayback", or is working in this repo
  (cli.js, lib/downloader.js, fix-wayback-artifacts.js, fix-wayback-urls.js,
  production-cleanup.js, clean-cloudflare-emails.js, websites/<host>/). Covers the
  three repeatable phases: (1) download snapshot, (2) strip wayback injections and
  archive.org URLs from assets, (3) production cleanup (unused chunks, Cloudflare
  email obfuscation, analytics).
---

# Wayback Restore

Use this skill when restoring a site from the Wayback Machine using this repo's
tooling. The workflow has three repeatable phases. The ad-hoc `download-*.js`,
`fix-budsandbrews-*.js`, `fix-console-errors*.js`, etc. in the repo root are
**site-specific one-offs from prior restores** — don't run them on a new site.
Use the three canonical commands below.

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

## Phase 2 — Strip Wayback artifacts

The Wayback Machine injects two kinds of contamination into archived files:

1. **Toolbar/wombat script blocks** appended to CSS/JS files. Markers include
   `FILE ARCHIVED ON`, `JAVASCRIPT APPENDED BY WAYBACK MACHINE`,
   `var _____WB$wombat`, `var RufflePlayer`.
2. **URL wrappers** like `//web.archive.org/web/20231001120000im_/` prefixed to
   every asset URL inside HTML/CSS/JS.

`fix-wayback-artifacts.js` and `fix-wayback-urls.js` in the repo root demonstrate
the patterns but are **hardcoded** to `websites/budsandbrewsusa.com/assets`. For a
new site, either:

- **(easier)** copy those two files, change the `base` constant to the new
  site's assets dir, and run them; or
- **(better)** generalize them to take the directory as an argv (one-shot edit).

The core regex for URL stripping (from `fix-wayback-urls.js`):

```js
content = content.replace(/\/\/web\.archive\.org\/web\/\d+(?:im_|id_|js_|cs_|)?\//g, "//");
content = content.replace(/https?:\/\/web\.archive\.org\/web\/\d+(?:im_|id_|js_|cs_|)?\//g, "");
```

The artifact stripper (`fix-wayback-artifacts.js`) walks back from each marker
string to find the start of the injected block and truncates there. It targets
specific contaminated files by name — you'll need to identify which CSS/JS files
have the injection (grep for `FILE ARCHIVED ON` across the assets dir).

Verification: after running both, no file under `websites/<host>/` should
contain `archive.org`, `WAYBACK`, or `_____WB`.

```bash
grep -rlE 'archive\.org|WAYBACK|_____WB' websites/<host>/ || echo "clean"
```

## Phase 3 — Production cleanup

`production-cleanup.js` (also hardcoded to `budsandbrewsusa.com`) does several
things you'll typically want for any Wix/Squarespace-style restore:

- Delete unused webpack chunks (large `background-*.js`, `gallery-*.js`,
  `course-*.js`, etc. that the live site never loads)
- Remove analytics/tracking script tags
- Strip Cloudflare email obfuscation

For the **Cloudflare email** step specifically, `clean-cloudflare-emails.js` is
generalizable — it decodes obfuscated emails using:

```js
const key = parseInt(encoded.substr(0, 2), 16);
for (let i = 2; i < encoded.length; i += 2) {
  email += String.fromCharCode(parseInt(encoded.substr(i, 2), 16) ^ key);
}
```

…then replaces `<a href="/cdn-cgi/l/email-protection#...">` and
`<span data-cfemail="...">` with plain `mailto:` links, and removes the CF
decoder script.

For a new site:

1. Decide which chunks are unused — open the homepage in a browser, watch the
   Network tab, anything not requested is a candidate for deletion. Be
   conservative; keep anything referenced from inline HTML.
2. Run a CF email decode pass if the original site used Cloudflare proxy.
3. Strip analytics: `gtag`, `googletagmanager`, `facebook`, `hotjar`, etc.

## Verification before handoff

```bash
# No wayback contamination remains
grep -rlE 'archive\.org|WAYBACK|_____WB' websites/<host>/

# No CF email obfuscation
grep -rl 'data-cfemail\|/cdn-cgi/l/email-protection' websites/<host>/

# Serve locally and spot-check
cd websites/<host>/ && python3 -m http.server 8080
```

Open `http://localhost:8080`, click through main nav, check console for 404s
and JS errors.

## Repo orientation for colleagues

- `cli.js` / `lib/downloader.js` — the actual downloader (do not modify casually;
  this is the upstream package)
- `websites/<host>/` — output directory, one folder per restored site
- Root-level `download-*.js`, `fix-*.js`, `cleanup-*.js` — **per-site scripts**
  from previous restores. Use as reference, don't run blindly.
- `dockerfile` / `index.js` — packaging for the downloader itself

## Related

- `[[svenskarnasparti-deployment]]` — pattern for deploying a restored site to
  an IncogNET VPS behind Cloudflare (SSH port 2222, Nginx).
