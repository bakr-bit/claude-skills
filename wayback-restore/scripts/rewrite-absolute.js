#!/usr/bin/env node
/**
 * Rewrite absolute URLs pointing to the origin host into root-relative URLs.
 *
 * Usage: node rewrite-absolute.js <site-dir> <origin-host>
 */
import fs from "fs";
import path from "path";

const [, , siteDir, originHost] = process.argv;
if (!siteDir || !originHost) {
  console.error("Usage: node rewrite-absolute.js <site-dir> <origin-host>");
  process.exit(1);
}
const root = path.resolve(siteDir);
const host = originHost.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

function walk(dir, ext, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, ext, out);
    else if (full.toLowerCase().endsWith(ext)) out.push(full);
  }
  return out;
}

// Matches https://[www.]host/path  →  /path
const re = new RegExp(`https?:\\/\\/(?:www\\.)?${host.replace(/\./g, "\\.")}\\/`, "gi");

let modified = 0;
for (const f of walk(root, ".html")) {
  const text = fs.readFileSync(f, "utf8");
  if (!re.test(text)) { re.lastIndex = 0; continue; }
  re.lastIndex = 0;
  const out = text.replace(re, "/");
  fs.writeFileSync(f, out);
  modified++;
}
console.log(`Rewrote absolute origin URLs in ${modified} HTML file(s).`);
