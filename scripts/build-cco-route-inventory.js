#!/usr/bin/env node
'use strict';

/**
 * build-cco-route-inventory.js — CCO route inventory (read-only probe)
 *   node scripts/build-cco-route-inventory.js
 *   CCO_PERSONAL_DEMO_BASE=https://arcana.hairtpclinic.com node scripts/build-cco-route-inventory.js
 */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const REPO = path.join(__dirname, '..');
const PUBLIC = path.join(REPO, 'public');
const BASE = process.env.CCO_PERSONAL_DEMO_BASE || 'https://arcana.hairtpclinic.com';
const OUT_JSON = path.join(REPO, 'public/cco-route-index.json');
const OUT_MD = path.join(REPO, 'docs/strategy/CCO-ROUTE-INVENTORY-2026-06-04.md');

const ROUTE_META = {
  '/cco-demo.html': {
    title: 'Välkommen till CCO',
    purpose: 'Canonical presentation start · arbetsnav översikt',
    status: 'CANONICAL',
    mainNav: true,
    presentation: true,
    risks: [],
  },
  '/kunder.html': {
    title: 'Kunder',
    purpose: 'Huvudnav · kundkort · journal · timeline',
    status: 'CANONICAL',
    mainNav: true,
    presentation: true,
    risks: [],
  },
  '/kalender.html': {
    title: 'Kalender',
    purpose: 'Kalender · bokningar',
    status: 'LIVE_TOOL',
    mainNav: true,
    presentation: true,
    risks: ['ej journal-P0'],
  },
  '/konversationer.html': {
    title: 'Konversationer',
    purpose: 'Kommunikation · inbox',
    status: 'PAUSED',
    mainNav: true,
    presentation: true,
    risks: ['aktivering pågår · ej dag-1-verktyg'],
  },
  '/m-konversationer.html': {
    title: 'Konversationer (mobil)',
    purpose: 'Mobil kommunikationsvy',
    status: 'PAUSED',
    mainNav: false,
    presentation: false,
    risks: ['mobil demo'],
  },
  '/cco-personal-start.html': {
    title: 'Legacy personal-start',
    purpose: 'Redirect → /cco-demo.html',
    status: 'LEGACY',
    mainNav: false,
    presentation: false,
    risks: ['ska ej vara primaryStartUrl'],
  },
  '/personal-demo.html': {
    title: 'Personal demo (alt)',
    purpose: 'Presenter-alt · ej canonical',
    status: 'SUPPORT',
    mainNav: false,
    presentation: false,
    risks: [],
  },
  '/cco-ops-workbench.html': {
    title: 'Ops Workbench',
    purpose: 'Intern drift · blocker-köer',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: ['intern only'],
  },
  '/cco-4june-command-center.html': {
    title: '4 juni Command Center',
    purpose: 'Fazli GO/STOP under mötet',
    status: 'SUPPORT',
    mainNav: false,
    presentation: true,
    risks: [],
  },
  '/finance.html': {
    title: 'Chief of Finance',
    purpose: 'CCO-native finance dashboard',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: ['Fortnox blockerad'],
  },
  '/finance-review.html': {
    title: 'Finance review',
    purpose: 'Revisorportal',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: [],
  },
  '/finance-reports.html': {
    title: 'Finance reports',
    purpose: 'Rapporter',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: [],
  },
  '/journal-feed-demo.html': {
    title: 'Journal feed (demo shell)',
    purpose: 'Patient journal-feed UI',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: true,
    risks: ['kräver customerId query'],
  },
  '/journal-build-demo.html': {
    title: 'Journal API demo',
    purpose: 'API-referens',
    status: 'DEMO_OLD',
    mainNav: false,
    presentation: false,
    risks: ['demo only'],
  },
  '/journal-pilot-guide.html': {
    title: 'Journal pilot guide',
    purpose: 'Print/guide',
    status: 'SUPPORT',
    mainNav: false,
    presentation: true,
    risks: [],
  },
  '/photo-review.html': {
    title: 'Photo Review',
    purpose: 'Bildgranskning operator',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: ['canary max 25/batch när ENABLE_PHOTO_REVIEW_* på'],
  },
  '/cco-photo-review.html': {
    title: 'Photo Review (alias)',
    purpose: 'Redirect till /photo-review.html',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: [],
  },
  '/ambiguous-mail-enrichment-review.html': {
    title: 'Mail ambiguous review',
    purpose: 'Mail enrichment operator',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: ['ej dag-1-verktyg'],
  },
  '/cco-import-review.html': {
    title: 'Import Review',
    purpose: 'Osäkra kundmatchningar halso@ + GetAccept',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: ['canary max 25/batch när ENABLE_IMPORT_REVIEW_WRITE på'],
  },
  '/ai-triage.html': {
    title: 'AI triage',
    purpose: 'AI triage demo',
    status: 'DEMO_OLD',
    mainNav: false,
    presentation: false,
    risks: ['mock/demo · ej färdigt'],
  },
  '/operator-dashboard.html': {
    title: 'Operator dashboard',
    purpose: 'Operatörsöversikt',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: [],
  },
  '/drive-historik.html': {
    title: 'Drive historik',
    purpose: 'Historik/import vy',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: ['Drive-referens'],
  },
  '/cco-concepts.html': {
    title: 'CCO concepts',
    purpose: 'Koncept/demo',
    status: 'DEMO_OLD',
    mainNav: false,
    presentation: false,
    risks: [],
  },
  '/admin.html': {
    title: 'Admin',
    purpose: 'Admin',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: ['auth'],
  },
  '/index.html': {
    title: 'Index',
    purpose: 'Root redirect/landing',
    status: 'REMOVE_FROM_NAV',
    mainNav: false,
    presentation: false,
    risks: [],
  },
  '/cco/index.html': {
    title: 'CCO index',
    purpose: 'CCO subfolder',
    status: 'REMOVE_FROM_NAV',
    mainNav: false,
    presentation: false,
    risks: [],
  },
  '/analytics.html': {
    title: 'Analytics',
    purpose: 'Analytics (refererad i gammal demo)',
    status: 'DEMO_OLD',
    mainNav: false,
    presentation: false,
    risks: ['404 om saknas · mock om live'],
  },
  '/showcase.html': {
    title: 'Showcase',
    purpose: 'Gammal showcase',
    status: 'REMOVE_FROM_NAV',
    mainNav: false,
    presentation: false,
    risks: ['redlist'],
  },
  '/automation.html': {
    title: 'Automation hub',
    purpose: 'Automation demo',
    status: 'REMOVE_FROM_NAV',
    mainNav: false,
    presentation: false,
    risks: ['redlist · ej live'],
  },
  '/watch-app.html': {
    title: 'Watch app',
    purpose: 'Watch demo',
    status: 'REMOVE_FROM_NAV',
    mainNav: false,
    presentation: false,
    risks: ['redlist'],
  },
};

function listHtmlFiles(dir, base = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(base, ent.name);
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      out.push(...listHtmlFiles(full, rel));
    } else if (ent.name.endsWith('.html')) {
      out.push('/' + rel.split(path.sep).join('/'));
    }
  }
  return out;
}

function readTitle(htmlPath) {
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    const t = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    return t ? t[1].trim().replace(/\s+/g, ' ') : '';
  } catch {
    return '';
  }
}

function detectRisks(html, routePath) {
  const risks = [];
  const body = html.slice(0, 80000);
  if (
    /Demo-portal|simulerad data|1\s*247|49\s*MSEK|webcal:\/\/localhost|drive\.google/i.test(body)
  ) {
    risks.push('mock claims');
  }
  if (/Aisia live|Fortnox kopplat|Photo Review klar|full cutover/i.test(body))
    risks.push('false live claim');
  if (/href=["'][^"']*personal-start/i.test(body) && routePath !== '/cco-personal-start.html') {
    risks.push('links to legacy personal-start');
  }
  return risks;
}

function probe(pathname) {
  return new Promise((resolve) => {
    const url = new URL(pathname, BASE);
    const req = https.request(url, { method: 'HEAD', timeout: 12000 }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

function defaultMeta(routePath, fileTitle) {
  const base = path.basename(routePath);
  if (base.startsWith('cco-') && base.includes('staff')) {
    return {
      title: fileTitle || base,
      purpose: 'Personal/support',
      status: 'SUPPORT',
      mainNav: false,
      presentation: false,
      risks: [],
    };
  }
  if (base.includes('journal') || base.includes('pilot')) {
    return {
      title: fileTitle || base,
      purpose: 'Journal pilot support',
      status: 'SUPPORT',
      mainNav: false,
      presentation: true,
      risks: [],
    };
  }
  if (routePath.includes('/patient') || routePath.includes('patient-')) {
    return {
      title: fileTitle || base,
      purpose: 'Patient portal',
      status: 'LIVE_TOOL',
      mainNav: false,
      presentation: false,
      risks: ['patient-facing'],
    };
  }
  if (routePath.includes('finance')) {
    return {
      title: fileTitle || base,
      purpose: 'Finance',
      status: 'LIVE_TOOL',
      mainNav: false,
      presentation: false,
      risks: [],
    };
  }
  if (routePath.includes('uppfoljning') || routePath.includes('major-arcana-preview')) {
    return {
      title: fileTitle || base,
      purpose: 'Marketing/legacy',
      status: 'REMOVE_FROM_NAV',
      mainNav: false,
      presentation: false,
      risks: [],
    };
  }
  return {
    title: fileTitle || base,
    purpose: 'CCO/public HTML',
    status: 'LIVE_TOOL',
    mainNav: false,
    presentation: false,
    risks: [],
  };
}

async function main() {
  const htmlRoutes = listHtmlFiles(PUBLIC).sort();
  const routes = [];
  console.log('Probing', htmlRoutes.length, 'HTML routes against', BASE);

  for (const routePath of htmlRoutes) {
    const filePath = path.join(PUBLIC, routePath.slice(1));
    const fileTitle = readTitle(filePath);
    let html = '';
    try {
      html = fs.readFileSync(filePath, 'utf8');
    } catch (_) {
      /* ignore */
    }
    const meta = ROUTE_META[routePath] || defaultMeta(routePath, fileTitle);
    const httpStatus = await probe(routePath);
    const fileRisks = detectRisks(html, routePath);
    routes.push({
      path: routePath,
      title: meta.title || fileTitle,
      purpose: meta.purpose,
      status: meta.status,
      httpStatus,
      mainNav: meta.mainNav,
      presentationMeeting: meta.presentation,
      risks: [...new Set([...(meta.risks || []), ...fileRisks])],
    });
    process.stdout.write('.');
  }
  console.log('\n');

  const payload = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    canonicalStart: '/cco-demo.html',
    canonicalFlow: 'Välkommen till CCO → Kunder → Kundkort → Journal',
    legacyRedirect: '/cco-personal-start.html',
    routeCount: routes.length,
    routes,
    summary: {
      canonical: routes.filter((r) => r.status === 'CANONICAL').map((r) => r.path),
      legacy: routes.filter((r) => r.status === 'LEGACY').map((r) => r.path),
      removeFromNav: routes.filter((r) => r.status === 'REMOVE_FROM_NAV').map((r) => r.path),
      demoOld: routes.filter((r) => r.status === 'DEMO_OLD').map((r) => r.path),
      paused: routes.filter((r) => r.status === 'PAUSED').map((r) => r.path),
    },
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(payload, null, 2));
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, buildMarkdown(payload));
  console.log('Wrote:', OUT_JSON);
  console.log('Wrote:', OUT_MD);
}

function buildMarkdown(p) {
  const lines = [
    '# CCO Route Inventory — 4 juni 2026',
    '',
    `_Generated: ${p.generatedAt}_`,
    `_Base: ${p.base}_`,
    '',
    '## Canonical navigation',
    '',
    '| | |',
    '|---|---|',
    `| **Start** | \`${p.canonicalStart}\` — Välkommen till CCO |`,
    `| **Flöde** | ${p.canonicalFlow} |`,
    `| **Legacy** | \`${p.legacyRedirect}\` → redirect (ej huvudprodukt) |`,
    '',
    `**Route count:** ${p.routeCount}`,
    '',
    '## Summary',
    '',
    `- **CANONICAL:** ${p.summary.canonical.join(', ') || '—'}`,
    `- **LEGACY:** ${p.summary.legacy.join(', ') || '—'}`,
    `- **REMOVE_FROM_NAV:** ${p.summary.removeFromNav.join(', ') || '—'}`,
    `- **DEMO_OLD:** ${p.summary.demoOld.join(', ') || '—'}`,
    `- **PAUSED:** ${p.summary.paused.join(', ') || '—'}`,
    '',
    '## Git: cco-demo.html history',
    '',
    '| SHA | Notering |',
    '|-----|----------|',
    '| `70b8aea9` | Gammal **Demo-portal** · mock 1 247 / 49 MSEK · Kalender/Kunder/Konv/Analytics-struktur |',
    '| `d6997442` | Cycle-19: **Välkommen till CCO** utan mock · journal-fokus |',
    '| `b225be56` | Primär start + gate + legacy redirect personal-start |',
    '',
    'Rätt struktur (Kalender, Kunder, Konversationer, mobil, AI/watch/automation som **pausade** kartor) kommer från `70b8aea9` — **utan** mock-siffror och Demo-portal-copy.',
    '',
    '## All routes',
    '',
    '| Path | Title | Status | HTTP | Main nav | Presentation | Risks |',
    '|------|-------|--------|------|----------|--------------|-------|',
  ];
  for (const r of p.routes) {
    lines.push(
      `| \`${r.path}\` | ${r.title} | ${r.status} | ${r.httpStatus || '—'} | ${r.mainNav ? 'ja' : 'nej'} | ${r.presentationMeeting ? 'ja' : 'nej'} | ${r.risks.join('; ') || '—'} |`
    );
  }
  lines.push('', '---', '', '_Regenerate: `node scripts/build-cco-route-inventory.js`_');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
