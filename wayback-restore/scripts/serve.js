import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = process.argv[2] || ".";
const port = Number(process.argv[3] || 8080);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json; charset=utf-8",
};

const STUB_PREFIXES = ["/widgets/", "/checkout/", "/wishlist/", "/account/", "/customer/"];

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (STUB_PREFIXES.some(p => url.startsWith(p))) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("");
    return;
  }
  let p = path.join(root, url);
  try {
    const st = fs.statSync(p);
    if (st.isDirectory()) p = path.join(p, "index.html");
    const data = fs.readFileSync(p);
    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { "Content-Type": TYPES[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("");
  }
});

server.listen(port, () => console.log(`serving ${path.resolve(root)} on http://localhost:${port}`));
