#!/usr/bin/env node
/**
 * Walk every HTML file in <site-dir>, find <a href> links pointing to local
 * paths that don't exist, query the Wayback CDX for snapshots of the original
 * URL, and download the latest one.
 *
 * Usage: node backfill-links.js <site-dir> <origin-host>
 *   e.g. node backfill-links.js websites/example.com www.example.com
 */
import fs from "fs";
import path from "path";

const [, , siteDir, originHost] = process.argv;
if (!siteDir || !originHost) {
  console.error("Usage: node backfill-links.js <site-dir> <origin-host>");
  process.exit(1);
}
const root = path.resolve(siteDir);
const ORIGIN = originHost.replace(/^https?:\/\//, "").replace(/\/$/, "");

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, ext, out);
    else if (full.toLowerCase().endsWith(ext)) out.push(full);
  }
  return out;
}

const SKIP_PREFIXES = ["account/", "checkout/", "wishlist/", "config-start/", "customer/", "detail/", "navigation/", "widgets/"];

function shouldSkip(p) {
  if (SKIP_PREFIXES.some(pre => p.startsWith(pre))) return true;
  return false;
}

const htmlFiles = walk(root, ".html");
console.log(`Scanning ${htmlFiles.length} HTML file(s) for broken <a href> links...`);

const broken = new Set();
for (const f of htmlFiles) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(/href="([A-Za-z][^"#?]*index\.html)"/g)) {
    const rel = m[1];
    if (shouldSkip(rel)) continue;
    if (!fs.existsSync(path.join(root, rel))) broken.add(rel);
  }
}
console.log(`Found ${broken.size} unique broken internal links to backfill.`);

function relToOriginUrl(rel) {
  // strip trailing index.html → ends with /
  let p = rel.replace(/\/?index\.html$/, "/");
  return `https://${ORIGIN}/${p}`;
}

async function cdxLatest(url) {
  const api = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&limit=-1&filter=statuscode:200&filter=mimetype:text/html`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(api);
      if (res.status === 504 || res.status === 503 || res.status === 429) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return null;
      const text = await res.text();
      if (!text.trim().startsWith("[")) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
      const rows = JSON.parse(text);
      if (rows.length < 2) return null;
      const [, ...data] = rows;
      data.sort((a, b) => a[1].localeCompare(b[1]));
      const last = data[data.length - 1];
      return { timestamp: last[1], original: last[2] };
    } catch {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

async function fetchSnap(ts, original) {
  const url = `https://web.archive.org/web/${ts}id_/${original}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

const items = [...broken];
const CONCURRENCY = 2;
let ok = 0, miss = 0, err = 0;
const log = [];

async function worker(slice) {
  for (const rel of slice) {
    const originUrl = relToOriginUrl(rel);
    const cdx = await cdxLatest(originUrl);
    if (!cdx) { miss++; log.push(`MISS\t${rel}\t${originUrl}`); continue; }
    const html = await fetchSnap(cdx.timestamp, cdx.original);
    if (!html) { err++; log.push(`ERR\t${rel}\t${cdx.timestamp}`); continue; }
    const dest = path.join(root, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
    ok++;
    if (ok % 25 === 0) console.log(`  ${ok} downloaded...`);
  }
}

const slices = Array.from({ length: CONCURRENCY }, (_, i) => items.filter((_, j) => j % CONCURRENCY === i));
await Promise.all(slices.map(worker));

console.log(`\nDone. Downloaded ${ok}, no Wayback snapshot ${miss}, fetch error ${err}.`);
fs.writeFileSync(path.join(root, ".backfill.log"), log.join("\n") + "\n");
console.log(`Log: ${path.join(root, ".backfill.log")}`);
