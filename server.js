/*  Stachey's Pizza — local dev server
    Run with:  node server.js
    Then open: http://localhost:3001
               http://localhost:3001/admin.html
*/

const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const PORT = 3001;   // Fixed port so the browser always knows where to POST

const MIME = {
  '.html': 'text/html',
  '.js':   'text/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const server = http.createServer((req, res) => {
  console.log(`[${req.method}] ${req.url}`);

  // ── CORS pre-flight ──
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  // ── POST /api/save  →  write site-data.json ──
  if (req.method === 'POST' && req.url === '/api/save') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const dataPath = path.join(__dirname, 'site-data.json');
        fs.writeFile(dataPath, JSON.stringify(parsed, null, 2), 'utf8', err => {
          if (err) {
            console.error('Write error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json', ...CORS });
            res.end(JSON.stringify({ ok: false, error: err.message }));
            return;
          }
          console.log('✓ site-data.json saved');
          res.writeHead(200, { 'Content-Type': 'application/json', ...CORS });
          res.end(JSON.stringify({ ok: true }));
        });
      } catch (e) {
        console.error('JSON parse error:', e);
        res.writeHead(400, { 'Content-Type': 'application/json', ...CORS });
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // ── GET  →  static files ──
  if (req.method === 'GET') {
    let urlPath = req.url.split('?')[0];            // strip query string
    if (urlPath === '/') urlPath = '/index.html';

    // Security: prevent directory traversal
    const safe = path.normalize(urlPath).replace(/^(\.\.[\\/])+/, '');
    const abs   = path.join(__dirname, safe);

    fs.stat(abs, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain', ...CORS });
        res.end('404 Not Found: ' + safe);
        return;
      }
      const mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, ...CORS });
      fs.createReadStream(abs).pipe(res);
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log(`  │   Stachey's server running                   │`);
  console.log(`  │   Site:   http://localhost:${PORT}               │`);
  console.log(`  │   Admin:  http://localhost:${PORT}/admin.html    │`);
  console.log('  └──────────────────────────────────────────────┘');
  console.log('');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ✗ Port ${PORT} is already in use.\n  Stop the other process or change PORT at the top of server.js.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});