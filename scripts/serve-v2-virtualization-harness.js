#!/usr/bin/env node
'use strict';

/**
 * Minimal statisk preview-server för V2-virtualiseringens browser-test.
 *
 * Servar repo-roten så att både den riktiga produktionskoden
 * (public/major-arcana-preview/app/…) och testharnessen (tests/e2e/…) kan
 * laddas av samma sida. Ingen backend, ingen auth — harnessen renderar
 * V2-skalet direkt med syntetisk trådlista, så testet mäter enbart
 * layout/virtualisering i en riktig browser.
 *
 * Körs av tests/e2e/playwright.virtualization.config.js via webServer.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.V2_HARNESS_PORT || 3210);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_error) {
    res.writeHead(400).end('Bad request');
    return;
  }

  // Path traversal-skydd: resolvea och kräv att filen ligger under ROOT.
  const resolved = path.resolve(ROOT, '.' + pathname);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(resolved, (statError, stats) => {
    if (statError || !stats.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(resolved).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(resolved).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`v2-harness static server on http://127.0.0.1:${PORT}\n`);
});
