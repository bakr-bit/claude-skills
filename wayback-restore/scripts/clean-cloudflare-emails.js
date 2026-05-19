#!/usr/bin/env node
/**
 * Decode Cloudflare-obfuscated emails in archived HTML files and remove
 * the Cloudflare decoder scripts.
 *
 * Usage: node scripts/clean-cloudflare-emails.js <dir>
 *   e.g. node scripts/clean-cloudflare-emails.js websites/example.com
 */

import fs from "fs";
import path from "path";

const root = process.argv[2];
if (!root) {
  console.error("Usage: node scripts/clean-cloudflare-emails.js <dir>");
  process.exit(1);
}
if (!fs.existsSync(root)) {
  console.error(`Directory not found: ${root}`);
  process.exit(1);
}

function decodeEmail(encoded) {
  try {
    let email = "";
    const key = parseInt(encoded.substr(0, 2), 16);
    for (let i = 2; i < encoded.length; i += 2) {
      email += String.fromCharCode(parseInt(encoded.substr(i, 2), 16) ^ key);
    }
    return email;
  } catch {
    return null;
  }
}

function processFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  const orig = content;

  const cfLink = /<a[^>]*class="__cf_email__"[^>]*href="[^"]*cdn-cgi\/l\/email-protection[^"]*"[^>]*data-cfemail="([a-f0-9]+)"[^>]*>\[email[^\]]*\]<\/a>/gi;
  content = content.replace(cfLink, (m, enc) => {
    const d = decodeEmail(enc);
    return d ? `<a href="mailto:${d}">${d}</a>` : m;
  });

  const cfSpan = /<span[^>]*class="__cf_email__"[^>]*data-cfemail="([a-f0-9]+)"[^>]*>\[email[^\]]*\]<\/span>/gi;
  content = content.replace(cfSpan, (m, enc) => decodeEmail(enc) || m);

  content = content.replace(
    /<script[^>]*>\s*(?:\/\*[^*]*\*\/\s*)?\(function\(\)\{try\{var s,a,i,j,r,c,l,b=document\.getElementsByTagName\("script"\)[\s\S]*?}\)\(\);\s*(?:\/\*[^*]*\*\/)?\s*<\/script>/gi,
    "",
  );
  content = content.replace(/<script[^>]*cf-hash[^>]*>[\s\S]*?<\/script>/gi, "");
  content = content.replace(
    /<script[^>]*>\s*\/\*\s*<!\[CDATA\[\s*\*\/\s*\(function\(\)\{try\{var s,a,i,j,r,c,l=document\.getElementsByTagName\("a"\)[\s\S]*?<\/script>/gi,
    "",
  );
  content = content.replace(
    /<script[^>]*>\s*(?:\/\/\s*)?<!\[CDATA\[\s*try\{if\s*\(!window\.CloudFlare\)[\s\S]*?<\/script>/gi,
    "",
  );
  content = content.replace(
    /<script[^>]*>\s*\/\*\s*CloudFlare analytics upgrade\s*\*\/\s*<\/script>/gi,
    "",
  );

  const anchorCf = /<a[^>]*data-cfemail="([a-f0-9]+)"[^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = anchorCf.exec(content)) !== null) {
    const d = decodeEmail(m[1]);
    if (d) content = content.replace(m[0], `<a href="mailto:${d}">${d}</a>`);
  }

  content = content.replace(/href="[^"]*cdn-cgi\/l\/email-protection[^"]*"/gi, 'href="#"');

  if (content !== orig) {
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  }
  return false;
}

function findHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findHtml(full, out);
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const files = findHtml(root);
console.log(`Scanning ${files.length} HTML file(s)...`);
let modified = 0;
for (const f of files) {
  if (processFile(f)) {
    modified++;
    console.log(`cleaned: ${path.relative(root, f)}`);
  }
}
console.log(`\n${modified} file(s) modified.`);
