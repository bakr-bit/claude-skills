#!/usr/bin/env node
/**
 * Non-interactive Wayback Machine downloader wrapper for the wayback-restore skill.
 *
 * Usage: node download.js <domain> [--out <dir>] [--from <ts>] [--to <ts>] [--threads <n>]
 *   e.g. node download.js example.com
 *        node download.js example.com --out /path/to/sites/example.com
 *        node download.js example.com --from 20230101000000 --to 20231231235959
 *
 * Defaults: rewrite=relative, canonical=remove, exact_url=false, threads=5,
 *           directory=./websites/<host>/, external assets off.
 */

import { WaybackMachineDownloader } from "wayback-machine-downloader";
import path from "path";
import { fileURLToPath } from "url";

const args = process.argv.slice(2);
if (args.length === 0 || args[0].startsWith("-")) {
  console.error("Usage: node download.js <domain> [--out <dir>] [--from <ts>] [--to <ts>] [--threads <n>]");
  process.exit(1);
}

const domain = args[0];
const opts = {};
for (let i = 1; i < args.length; i += 2) {
  const k = args[i];
  const v = args[i + 1];
  if (k === "--out") opts.out = v;
  else if (k === "--from") opts.from = Number(v);
  else if (k === "--to") opts.to = Number(v);
  else if (k === "--threads") opts.threads = Number(v);
  else {
    console.error(`Unknown flag: ${k}`);
    process.exit(1);
  }
}

const skillDir = path.dirname(fileURLToPath(import.meta.url));
const defaultOut = path.join(skillDir, "websites", domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));

const dl = new WaybackMachineDownloader({
  base_url: domain,
  exact_url: false,
  directory: opts.out || defaultOut,
  from_timestamp: opts.from || 0,
  to_timestamp: opts.to || 0,
  threads_count: opts.threads || 5,
  rewrite_mode: "relative",
  canonical_action: "remove",
  download_external_assets: false,
});

dl.download_files()
  .then(() => console.log(`Download complete: ${opts.out || defaultOut}`))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
