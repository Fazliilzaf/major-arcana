/* eslint-disable no-console */
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');

function getArgValue(args, name, fallback = '') {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function decodeEntities(input) {
  return String(input ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#([0-9]+);/g, (_, dec) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    );
}

function htmlToText(html) {
  let text = String(html ?? '');
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');

  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  text = text.replace(/<\/(p|div|section|article|li|h1|h2|h3|h4|h5|h6)>/gi, '\n');
  text = text.replace(/<[^>]+>/g, ' ');

  text = decodeEntities(text);
  text = text.replace(/\r/g, '');
  text = text.replace(/[ \t]+\n/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  text = text.replace(/[ \t]{2,}/g, ' ');
  return text.trim();
}

function extractLinks(html, baseUrl) {
  const links = new Set();
  const re = /href\s*=\s*"([^"]+)"/gi;
  let match;
  while ((match = re.exec(html))) {
    const href = match[1];
    if (!href) continue;
    if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (href.startsWith('#')) continue;
    try {
      const url = new URL(href, baseUrl);
      url.hash = '';
      links.add(url.toString());
    } catch {
      // ignore
    }
  }
  return Array.from(links);
}

function slugFromUrl(urlString) {
  const url = new URL(urlString);
  const pathname = url.pathname.replace(/\/+/g, '/').replace(/\/$/, '');
  const base = pathname === '' ? 'index' : pathname.slice(1);
  const safe = base
    .replace(/[^a-zA-Z0-9\-_/]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/-+/g, '-')
    .replace(/^\/+/, '')
    .replace(/\/$/, '');
  return safe || 'index';
}

async function fetchText(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'ArcanaIngest/1.0 (+local)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return await resp.text();
}

function extractSitemapUrls(xmlText) {
  const urls = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(xmlText))) {
    const loc = match[1];
    if (loc) urls.push(loc.trim());
  }
  return urls;
}

async function main() {
  const args = process.argv.slice(2);

  const base = getArgValue(args, '--base', 'https://www.hairtpclinic.se');
  const outDir = getArgValue(
    args,
    '--out',
    path.join(process.cwd(), 'knowledge', 'site')
  );
  const maxPages = asInt(getArgValue(args, '--maxPages', '80'), 80);
  const useSitemap = hasFlag(args, '--sitemap');

  const baseUrl = new URL(base);
  const allowOrigin = baseUrl.origin;

  await fs.mkdir(outDir, { recursive: true });

  let seedUrls;
  if (useSitemap) {
    console.log('Fetching sitemap…');
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    const xml = await fetchText(sitemapUrl);
    seedUrls = extractSitemapUrls(xml).filter((u) => {
      try {
        return new URL(u).origin === allowOrigin;
      } catch {
        return false;
      }
    });
  } else {
    seedUrls = [baseUrl.toString()];
  }

  const queue = [...new Set(seedUrls)];
  const visited = new Set();
  const written = [];

  console.log(`Start: ${queue.length} URL(s), maxPages=${maxPages}`);

  while (queue.length && visited.size < maxPages) {
    const url = queue.shift();
    if (!url) break;
    if (visited.has(url)) continue;
    visited.add(url);

    let html;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.warn(`Skip (fetch failed): ${url} (${e.message})`);
      continue;
    }

    const links = extractLinks(html, url);
    for (const link of links) {
      try {
        const u = new URL(link);
        if (u.origin !== allowOrigin) continue;
        // ignore obvious non-content
        if (/\.(png|jpg|jpeg|gif|svg|webp|pdf|zip)$/i.test(u.pathname)) continue;
        if (!visited.has(u.toString())) queue.push(u.toString());
      } catch {
        // ignore
      }
    }

    const text = htmlToText(html);
    if (!text || text.length < 200) {
      console.log(`Skip (too little text): ${url}`);
      continue;
    }

    const slug = slugFromUrl(url);
    const filePath = path.join(outDir, `${slug}.md`);
    const md = `# ${slug}\n\nKälla: ${url}\n\n${text}\n`;
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, md, 'utf8');

    written.push({ url, file: path.relative(process.cwd(), filePath) });
    console.log(`Saved: ${url} -> ${path.relative(process.cwd(), filePath)}`);
  }

  const indexPath = path.join(outDir, 'index.json');
  await fs.writeFile(indexPath, JSON.stringify({ base, written }, null, 2), 'utf8');
  console.log(`\nDone. Wrote ${written.length} file(s). Index: ${path.relative(process.cwd(), indexPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
