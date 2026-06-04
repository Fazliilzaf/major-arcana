#!/usr/bin/env node
'use strict';

/**
 * Lokal statisk server för design-mockup:
 *   http://127.0.0.1:8765/CCO-Kunder-Mockup-v9-DESKTOP.html
 *
 * Ersätter python http.server — frigör port 8765 och servar uploads/.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PORT = Number(process.env.CCO_MOCKUP_V9_PORT || 8765);
const HOST = process.env.CCO_MOCKUP_V9_HOST || '127.0.0.1';
const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
const MOCKUP_FILE = 'CCO-Kunder-Mockup-v9-DESKTOP.html';
const MOCKUP_PATH = path.join(UPLOADS_DIR, MOCKUP_FILE);

function log(message) {
  process.stdout.write(`${message}\n`);
}

function killPort(port) {
  try {
    const raw = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
    if (!raw) return;
    const pids = raw.split(/\s+/).filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
        log(`[mockup-v9] stoppade process ${pid} på port ${port}`);
      } catch {
        /* ignore */
      }
    }
    try {
      execSync('sleep 0.25');
    } catch {
      /* ignore */
    }
  } catch {
    /* port ledig */
  }
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
  };
  return map[ext] || 'application/octet-stream';
}

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, body) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500, {
        'Content-Type': 'text/plain; charset=utf-8',
      });
      res.end(err.code === 'ENOENT' ? 'Not found' : 'Read error');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-store',
    });
    res.end(body);
  });
}

function resolveUploadsPath(urlPath) {
  const decoded = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const normalized = path.normalize(decoded.replace(/^\/+/, ''));
  if (!normalized || normalized === '.' || normalized === path.sep) {
    return MOCKUP_PATH;
  }
  const filePath = path.resolve(UPLOADS_DIR, normalized);
  if (filePath !== UPLOADS_DIR && !filePath.startsWith(`${UPLOADS_DIR}${path.sep}`)) {
    return null;
  }
  return filePath;
}

function main() {
  if (!fs.existsSync(MOCKUP_PATH)) {
    log(`[mockup-v9] FAIL: saknar ${MOCKUP_PATH}`);
    process.exit(1);
  }

  killPort(PORT);

  const server = http.createServer((req, res) => {
    const filePath = resolveUploadsPath(req.url);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    sendFile(res, filePath);
  });

  server.on('error', (err) => {
    log(`[mockup-v9] FAIL: ${err.message}`);
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    log(`[mockup-v9] uploads → http://${HOST}:${PORT}/`);
    log(`[mockup-v9] mockup  → http://${HOST}:${PORT}/${MOCKUP_FILE}`);
    log('[mockup-v9] Avsluta med Ctrl+C');
  });
}

main();
