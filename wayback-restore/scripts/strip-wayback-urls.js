#!/usr/bin/env node
/**
 * Strip Wayback Machine URL wrappers from every text file under a directory.
 *
 * Usage: node scripts/strip-wayback-urls.js <dir>
 *   e.g. node scripts/strip-wayback-urls.js websites/example.com
 */

import fs from "fs";
import path from "path";

const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/strip-wayback-urls.js <dir>");
  process.exit(1);
}
if (!fs.existsSync(root)) {
  console.error(`Directory not found: ${root}`);
  process.exit(1);
}

const TEXT_EXT = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".cjs",
  ".json", ".xml", ".svg", ".txt", ".map",
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && TEXT_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(root);
let changed = 0;

for (const file of files) {
  let content;
  try { content = fs.readFileSync(file, "utf-8"); } catch { continue; }
  const orig = content;

  content = content.replace(/\/\/web\.archive\.org\/web\/\d+(?:im_|id_|js_|cs_|if_|fw_|)?\//g, "//");
  content = content.replace(/https?:\/\/web\.archive\.org\/web\/\d+(?:im_|id_|js_|cs_|if_|fw_|)?\//g, "");

  if (content !== orig) {
    fs.writeFileSync(file, content);
    console.log(`fixed: ${path.relative(root, file)}`);
    changed++;
  }
}

console.log(`\n${changed} file(s) modified.`);

let dirty = 0;
for (const file of files) {
  let content;
  try { content = fs.readFileSync(file, "utf-8"); } catch { continue; }
  if (/archive\.org|WAYBACK|_____WB/.test(content)) {
    console.log(`still contains wayback refs: ${path.relative(root, file)}`);
    dirty++;
  }
}
if (dirty === 0) console.log("All URLs clean.");
else console.log(`\n${dirty} file(s) still contain wayback references — run strip-wayback-artifacts.js next.`);
