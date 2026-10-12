/* Plain Node server: static files from public/ + the same API Vercel runs.
 *   npm start            → http://localhost:3000   (in-memory data unless the Redis env vars are set)
 * Use it locally, or on any always-on host (Render paid tier, Railway, Fly …). On Vercel this file is unused. */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handle } = require('./lib/api');

const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 3000;
const FRAME_ANCESTORS = 'frame-ancestors https://lagoslife.app https://www.lagoslife.app https://naijalife.app https://www.naijalife.app https://lagoslife.eliysites.com';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep) && file !== PUBLIC) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Content-Security-Policy', FRAME_ANCESTORS);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.url.startsWith('/api/')) return handle(req, res);
  serveStatic(req, res);
});
if (require.main === module) server.listen(PORT, () => console.log(`Lagos Swipe on http://localhost:${PORT}`));
module.exports = server;
