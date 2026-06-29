#!/usr/bin/env node
/* global document, window */
/**
 * Local responsive QA for /staff-portal.html.
 * Exercises the live-data path with stubbed staff APIs across mobile, iPad and desktop.
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const publicDir = path.join(root, 'public');

const viewports = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'ipad', width: 820, height: 1180 },
  { name: 'desktop', width: 1440, height: 940 },
];

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function links(caseId = 'case-tp-001', patientId = 'patient-001') {
  return {
    customerCard: `/major-arcana-preview/?view=customers&patientId=${patientId}`,
    workspace: `/major-arcana-preview/?view=customers&workspace=1&patientId=${patientId}`,
    threads: `/api/v1/staff/customer-threads/${patientId}`,
    photos: `/api/v1/staff/customer-photos/${patientId}`,
    ordination: `/staff-portal#ordination-${caseId}`,
    audit: `/api/v1/staff/audit?action=staff_portal&caseId=${caseId}`,
    qms: '/staff-portal#qms',
  };
}

const caseBase = {
  id: 'case-tp-001',
  patientId: 'patient-001',
  customerId: 'customer-001',
  customerName: 'Amina Larsson',
  treatmentType: 'TP · DHI',
  serviceLabel: 'Hårtransplantation DHI',
  startsAt: '2030-06-29T08:30:00.000Z',
  state: 'needs_reply',
  assignedTo: 'staff-anna',
  links: links(),
  ordinationReview: {
    status: 'pending',
  },
};

function routeApi(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/v1/staff/me') {
    return json(res, {
      ok: true,
      name: 'Anna Lindstrom',
      role: 'owner',
    });
  }
  if (url.pathname === '/api/v1/staff/team') {
    return json(res, {
      ok: true,
      staff: [
        { userId: 'staff-anna', label: 'Anna Lindstrom' },
        { userId: 'doctor-marcus', label: 'Dr. Marcus Oberg' },
      ],
    });
  }
  if (url.pathname === '/api/v1/staff/daily-work-queue') {
    return json(res, {
      ok: true,
      summary: { urgent: 1, today: 1, waiting: 1 },
      items: [
        {
          ...caseBase,
          title: 'Amina Larsson - konsultation klar',
          priority: 'today',
          customer: {
            case: caseBase,
          },
          actions: [{ key: 'reply', label: 'Svar krävs', severity: 'urgent' }],
          staffActions: {},
        },
      ],
    });
  }
  if (url.pathname === '/api/v1/staff/tasks') {
    return json(res, {
      ok: true,
      count: 1,
      tasks: [
        {
          ...caseBase,
          title: 'Amina Larsson - fråga om eftervård',
          needsReplyStatus: 'needs_reply',
        },
      ],
    });
  }
  if (url.pathname === '/api/v1/staff/my-customers') {
    return json(res, {
      ok: true,
      summary: { total: 1, needsReply: 1, withPhotos: 1 },
      customers: [
        {
          id: 'customer-signal-001',
          title: 'Amina Larsson',
          patientId: 'patient-001',
          customerId: 'customer-001',
          links: links(),
          case: caseBase,
          threads: { count: 3, needsReply: 1 },
          photos: { count: 4 },
        },
      ],
    });
  }
  if (url.pathname === '/api/v1/staff/review-queue') {
    return json(res, { ok: true, count: 1, queue: [caseBase] });
  }
  if (url.pathname === '/api/v1/staff/ordination-reviews') {
    return json(res, {
      ok: true,
      count: 1,
      reviews: [
        {
          ...caseBase,
          ordinationReadout: {
            patient: { patientId: 'patient-001', customerId: 'customer-001' },
            treatmentPlan: {
              treatment: 'Hårtransplantation',
              method: 'DHI',
              graftsTotal: 2800,
              price: '59 000 kr',
              anesthesia: 'Lokalbedövning',
              zones: [
                { label: 'Hårlinje', grafts: 600 },
                { label: 'Mitt', grafts: 900 },
                { label: 'Krona', grafts: 1300 },
              ],
            },
            readiness: [
              { label: 'Hälsodeklaration', done: true },
              { label: 'Friskförsäkran', done: false },
            ],
            documents: [{ id: 'ordination_tp', name: 'Ordinationsmall TP', status: 'underlag' }],
            missing: ['friskforsakran'],
          },
        },
      ],
    });
  }
  if (url.pathname === '/api/v1/staff/audit') {
    return json(res, {
      ok: true,
      entries: [
        {
          ts: '2030-06-29T08:45:00.000Z',
          action: 'staff_portal.deep_link.opened',
          actor: { userId: 'staff-anna' },
          target: { id: 'case-tp-001' },
        },
      ],
    });
  }
  if (url.pathname === '/api/v1/staff/documents') {
    return json(res, {
      ok: true,
      documents: [
        { id: 'delegation_lokalbedovning', name: 'Delegering - lokalbedovning' },
        { id: 'handbook_staff', title: 'Personalhandbok', category: 'handbok' },
      ],
    });
  }
  if (url.pathname === '/api/v1/staff/qms/handbook') {
    return json(res, {
      ok: true,
      qms: {
        mode: 'local-responsive-fixture',
        generatedAt: '2030-06-29T08:00:00.000Z',
        safety: { message: 'Read-only QA fixture.' },
        summary: { activeChecklists: 3, activeProcesses: 2, openDeviations: 1 },
        handbook: {
          principles: ['AI föreslår aldrig journal automatiskt', 'Ordination kräver läkare'],
          documents: [
            { id: 'handbook_staff', title: 'Personalhandbok', category: 'handbok' },
            { id: 'ols_checklist', title: 'OLS-checklista', category: 'qms' },
          ],
        },
        checklists: [
          {
            title: 'Preop kontroll',
            category: 'clinical',
            frequency: 'dagligen',
            responsibleRole: 'STAFF',
            steps: [{ title: 'Kontrollera hälsodeklaration' }, { title: 'Kontrollera samtycke' }],
          },
        ],
        processes: [
          {
            title: 'Läkarordination',
            category: 'clinical',
            owner: 'Läkare',
            steps: [{ title: 'Granska underlag' }, { title: 'Signera manuellt' }],
          },
        ],
        deviations: [
          {
            referenceNumber: 'AVV-2030-001',
            severity: 'medium',
            status: 'reported',
            title: 'Testavvikelse',
            description: 'Fixture for responsive QA.',
          },
        ],
      },
    });
  }
  return false;
}

function createServer() {
  return http.createServer((req, res) => {
    if (req.url.startsWith('/api/v1/staff/')) {
      if (routeApi(req, res) !== false) return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(publicDir, safePath === '/' ? 'staff-portal.html' : safePath);
    if (
      !filePath.startsWith(publicDir) ||
      !fs.existsSync(filePath) ||
      fs.statSync(filePath).isDirectory()
    ) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath);
    const type =
      ext === '.html' ? 'text/html; charset=utf-8' : ext === '.css' ? 'text/css' : 'text/plain';
    res.writeHead(200, { 'content-type': type });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function checkViewport(page, name) {
  await page.goto('/staff-portal.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('.deep-link', { timeout: 10000 });

  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return {
      innerWidth: window.innerWidth,
      docScrollWidth: doc.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      deepLinks: document.querySelectorAll('.deep-link').length,
      visibleDeepLinks: [...document.querySelectorAll('.deep-link')].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }).length,
      activeView: document.querySelector('.view.active')?.id || '',
    };
  });
  const overflow = Math.max(metrics.docScrollWidth, metrics.bodyScrollWidth) - metrics.innerWidth;
  if (overflow > 2) {
    throw new Error(`${name}: horizontal overflow ${overflow}px`);
  }
  if (metrics.visibleDeepLinks < 4) {
    throw new Error(`${name}: expected visible deep links, got ${metrics.visibleDeepLinks}`);
  }

  if (name === 'mobile') {
    await page.locator('#hamburgerBtn').click();
    await page.waitForSelector('#sidebar.open', { timeout: 3000 });
    const box = await page.locator('#hamburgerBtn').boundingBox();
    if (!box || box.height < 36 || box.width < 36) {
      throw new Error(`${name}: hamburger target too small`);
    }
    await page.mouse.click(360, 80);
    await page.waitForSelector('#sidebar:not(.open)', { timeout: 3000 });
  }

  for (const label of ['Läkare', 'Admin / Ägare', 'Sjuksköterska']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await page.waitForTimeout(80);
    const after = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        innerWidth: window.innerWidth,
        scrollWidth: doc.scrollWidth,
        activeView: document.querySelector('.view.active')?.id || '',
      };
    });
    if (after.scrollWidth - after.innerWidth > 2) {
      throw new Error(
        `${name}/${label}: horizontal overflow ${after.scrollWidth - after.innerWidth}px`
      );
    }
  }

  const tooSmall = await page.evaluate(() =>
    [...document.querySelectorAll('.deep-link, .btn, .role-btn')]
      .filter((el) => {
        const style = window.getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return style.display !== 'none' && box.width > 0 && box.height > 0 && box.height < 32;
      })
      .slice(0, 5)
      .map((el) => `${el.textContent.trim()}:${Math.round(el.getBoundingClientRect().height)}`)
  );
  if (tooSmall.length) {
    throw new Error(`${name}: small tap targets ${tooSmall.join(', ')}`);
  }

  console.log(
    `PASS ${name}: ${metrics.innerWidth}px · ${metrics.visibleDeepLinks} deep links · overflow 0`
  );
}

async function main() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({
        baseURL: `http://127.0.0.1:${port}`,
        viewport: { width: viewport.width, height: viewport.height },
        locale: 'sv-SE',
      });
      const page = await context.newPage();
      try {
        await checkViewport(page, viewport.name);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(`FAIL staff portal responsive QA: ${error.message || error}`);
  process.exit(1);
});
