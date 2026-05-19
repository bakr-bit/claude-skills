#!/usr/bin/env node
/**
 * Mirror missing assets for a restored Wayback site from a live upstream
 * sister site that serves the same path tree.
 *
 * Usage: node mirror-missing-assets.js <site-dir> <upstream-base-url>
 *   e.g. node mirror-missing-assets.js websites/sminkebordshop.dk https://www.schminktischshop.de
 *
 * Walks every .html file under <site-dir>, extracts asset references, and for
 * every asset whose local path is missing, fetches it from <upstream>/<path>
 * and writes it. Also recurses one level into fetched CSS to pull url(...) deps.
 */

import fs from "fs";
import path from "path";

const [, , siteDir, upstreamArg] = process.argv;
if (!siteDir || !upstreamArg) {
  console.error("Usage: node mirror-missing-assets.js <site-dir> <upstream-base-url>");
  process.exit(1);
}
const upstream = upstreamArg.replace(/\/$/, "");
const root = path.resolve(siteDir);

const ASSET_RE = [
  /\bhref\s*=\s*["']([^"'#?]+\.(?:css|ico|svg|png|jpe?g|webp|gif|woff2?|ttf|otf|eot|json|xml|map))(?:[?#][^"']*)?["']/gi,
  /\bsrc\s*=\s*["']([^"'#?]+\.(?:js|mjs|svg|png|jpe?g|webp|gif|ico))(?:[?#][^"']*)?["']/gi,
  /\bsrcset\s*=\s*["']([^"']+)["']/gi,
  /url\(\s*["']?([^"')]+\.(?:css|svg|png|jpe?g|webp|gif|woff2?|ttf|otf))(?:[?#][^"')]*)?["']?\s*\)/gi,
];

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, ext, out);
    else if (full.toLowerCase().endsWith(ext)) out.push(full);
  }
  return out;
}

function extractRefs(text) {
  const refs = new Set();
  for (const re of ASSET_RE) {
    let m;
    while ((m = re.exec(text))) {
      const raw = m[1];
      // srcset: "url1 1x, url2 2x"
      if (re.source.includes("srcset")) {
        for (const part of raw.split(",")) {
          const u = part.trim().split(/\s+/)[0];
          if (u) refs.add(u);
        }
      } else {
        refs.add(raw);
      }
    }
  }
  return refs;
}

function toPathname(ref) {
  if (/^https?:/i.test(ref) || ref.startsWith("//") || ref.startsWith("data:") || ref.startsWith("mailto:")) return null;
  // strip query/hash
  let p = ref.split("?")[0].split("#")[0];
  // leading /
  p = p.replace(/^\.?\//, "").replace(/^\//, "");
  return p;
}

async function fetchToDisk(pathname) {
  const localPath = path.join(root, pathname);
  if (fs.existsSync(localPath)) return { skipped: true };
  const url = `${upstream}/${pathname}`;
  let res;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch (e) {
    return { error: e.message };
  }
  if (!res.ok) return { status: res.status };
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.writeFileSync(localPath, buf);
  return { ok: true, bytes: buf.length, localPath, contentType: res.headers.get("content-type") || "" };
}

const queue = new Set();
const htmlFiles = walk(root, ".html");
console.log(`Scanning ${htmlFiles.length} HTML file(s)...`);
for (const f of htmlFiles) {
  const text = fs.readFileSync(f, "utf8");
  for (const ref of extractRefs(text)) {
    const p = toPathname(ref);
    if (p) queue.add(p);
  }
}
console.log(`Found ${queue.size} unique asset references.`);

let ok = 0, skipped = 0, failed = 0;
const failedList = [];
const cssToScan = [];
const CONCURRENCY = 10;
const items = [...queue];

async function worker(slice) {
  for (const p of slice) {
    const r = await fetchToDisk(p);
    if (r.skipped) skipped++;
    else if (r.ok) {
      ok++;
      if ((r.contentType.includes("text/css") || p.endsWith(".css"))) cssToScan.push(r.localPath);
    } else {
      failed++;
      failedList.push(`${r.status || r.error}\t${p}`);
    }
  }
}

const slices = Array.from({ length: CONCURRENCY }, (_, i) => items.filter((_, j) => j % CONCURRENCY === i));
await Promise.all(slices.map(worker));

console.log(`\nPass 1 done: ${ok} downloaded, ${skipped} already present, ${failed} failed.`);

// Pass 2: scan downloaded CSS for url(...) refs
if (cssToScan.length) {
  console.log(`\nScanning ${cssToScan.length} downloaded CSS file(s) for nested url() refs...`);
  const cssRefs = new Set();
  for (const f of cssToScan) {
    const text = fs.readFileSync(f, "utf8");
    const baseDir = path.relative(root, path.dirname(f));
    let m;
    const re = /url\(\s*["']?([^"')]+)(?:["']?)\s*\)/gi;
    while ((m = re.exec(text))) {
      const raw = m[1].trim();
      if (!raw || /^(data|https?|\/\/|#)/i.test(raw)) continue;
      const cleaned = raw.split("?")[0].split("#")[0];
      // resolve relative to CSS file dir
      const resolved = path.posix.normalize(path.posix.join(baseDir.split(path.sep).join("/"), cleaned));
      cssRefs.add(resolved.replace(/^\/+/, ""));
    }
  }
  console.log(`  Found ${cssRefs.size} nested refs.`);
  let ok2 = 0, sk2 = 0, fl2 = 0;
  const items2 = [...cssRefs];
  const slices2 = Array.from({ length: CONCURRENCY }, (_, i) => items2.filter((_, j) => j % CONCURRENCY === i));
  await Promise.all(slices2.map(async (slice) => {
    for (const p of slice) {
      const r = await fetchToDisk(p);
      if (r.skipped) sk2++;
      else if (r.ok) ok2++;
      else { fl2++; failedList.push(`${r.status || r.error}\t${p}`); }
    }
  }));
  console.log(`Pass 2 done: ${ok2} downloaded, ${sk2} already present, ${fl2} failed.`);
}

if (failedList.length) {
  fs.writeFileSync(path.join(root, ".mirror-failed.log"), failedList.join("\n") + "\n");
  console.log(`\nFailed list written to ${path.join(root, ".mirror-failed.log")}`);
}
