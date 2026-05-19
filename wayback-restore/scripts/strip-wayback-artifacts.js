#!/usr/bin/env node
/**
 * Strip injected Wayback Machine toolbar/wombat blocks from CSS/JS files.
 *
 * The Wayback Machine appends a comment + script block to many archived
 * CSS/JS files. This script auto-detects contaminated files under <dir>
 * and truncates the injection at its starting marker.
 *
 * Usage: node scripts/strip-wayback-artifacts.js <dir>
 *   e.g. node scripts/strip-wayback-artifacts.js websites/example.com
 */

import fs from "fs";
import path from "path";

const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/strip-wayback-artifacts.js <dir>");
  process.exit(1);
}
if (!fs.existsSync(root)) {
  console.error(`Directory not found: ${root}`);
  process.exit(1);
}

const SCAN_EXT = new Set([".css", ".js", ".mjs", ".cjs", ".html", ".htm"]);

const MARKERS = [
  "FILE ARCHIVED ON",
  "JAVASCRIPT APPENDED BY WAYBACK MACHINE",
  "var _____WB$wombat",
  "var RufflePlayer",
  "window.RufflePlayer",
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && SCAN_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function firstMarkerIndex(content) {
  let best = -1;
  for (const m of MARKERS) {
    const idx = content.indexOf(m);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

function findCutPoint(content, markerIdx) {
  const back = content.substring(Math.max(0, markerIdx - 1000), markerIdx);
  const commentStart = back.lastIndexOf("/*");
  const newlineBlock = back.lastIndexOf("\n\n\n");
  const scriptTag = back.lastIndexOf("<script");
  const candidates = [commentStart, newlineBlock, scriptTag].filter((i) => i !== -1);
  if (candidates.length === 0) return markerIdx;
  return Math.max(0, markerIdx - 1000) + Math.max(...candidates);
}

const files = walk(root);
let modified = 0;

for (const file of files) {
  let content;
  try { content = fs.readFileSync(file, "utf-8"); } catch { continue; }

  const origLen = content.length;
  const markerIdx = firstMarkerIndex(content);
  if (markerIdx === -1) continue;

  const cut = findCutPoint(content, markerIdx);
  content = content.substring(0, cut).trimEnd();

  content = content.replace(/\/\/web\.archive\.org\/web\/\d+(?:im_|id_|js_|cs_|if_|fw_|)?\//g, "//");
  content = content.replace(/https?:\/\/web\.archive\.org\/web\/\d+(?:im_|id_|js_|cs_|if_|fw_|)?\//g, "");

  fs.writeFileSync(file, content);
  const rel = path.relative(root, file);
  console.log(`${rel}: ${(origLen / 1024).toFixed(0)}KB -> ${(content.length / 1024).toFixed(0)}KB`);
  modified++;
}

console.log(`\n${modified} contaminated file(s) cleaned.`);

let dirty = 0;
for (const file of files) {
  let content;
  try { content = fs.readFileSync(file, "utf-8"); } catch { continue; }
  if (/WAYBACK|_____WB\$wombat|archive\.org\/web\/\d+/.test(content)) {
    console.log(`still contaminated: ${path.relative(root, file)}`);
    dirty++;
  }
}
if (dirty === 0) console.log("All artifacts removed.");
