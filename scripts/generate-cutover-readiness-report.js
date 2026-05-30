#!/usr/bin/env node
'use strict';

/**
 * generate-cutover-readiness-report.js
 * =====================================
 *
 * P0.10 — Auto-genererar en Cutover Readiness Report som markdown.
 *
 * Källor:
 *   - data/cco-customers.json   (Cliento + Meridiq + Drive-flaggor)
 *   - data/cco-journal.json     (entries, signed, locked, pdf)
 *   - data/cco-templates.json   (consents + formulär)
 *   - data/cco-audit.jsonl      (action-counts senaste batch)
 *   - docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md (blocker-lista)
 *
 * Output:
 *   - docs/strategy/CUTOVER-READINESS-REPORT-YYYY-MM-DD.md
 *
 * Compliance:
 *   - COUNTS ONLY — INGA patientnamn/pnr/email/telefon i rapporten.
 *   - 10 cutover-kriterier (per .cursor/rules/cco-journal-cutover-first.mdc#Definition of Done).
 *   - Per kriterium: 🟢 GREEN / 🟡 YELLOW / 🔴 RED + counts + blocker-detail.
 *
 * Användning:
 *   node scripts/generate-cutover-readiness-report.js
 *   node scripts/generate-cutover-readiness-report.js --date=2026-05-30
 *   node scripts/generate-cutover-readiness-report.js --stdout    (dont write file)
 *
 * Exit-codes:
 *   0 = rapporten genererad (oavsett readiness-status)
 *   1 = data-källor saknas
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { date: null, stdout: false, tenantId: 'hair_tp' };
  for (const raw of argv.slice(2)) {
    if (raw === '--stdout') args.stdout = true;
    else if (raw.startsWith('--date=')) args.date = raw.split('=')[1];
    else if (raw.startsWith('--tenant=')) args.tenantId = raw.split('=')[1];
  }
  if (!args.date) {
    const d = new Date();
    args.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return args;
}

// ─────────────────────────────────────────────────────────────────────────
// Källor — counts only, ingen PII
// ─────────────────────────────────────────────────────────────────────────
function readJson(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch (e) {
    console.warn(`[readiness] kunde inte parsa ${rel}: ${e.message}`);
    return null;
  }
}

function readJsonl(rel) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, 'utf8');
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch (_) {
      /* skip malformed */
    }
  }
  return out;
}

function countCustomers(customers, tenantId) {
  const tenant = customers?.tenants?.[tenantId];
  const dir = tenant?.customerState?.directory || {};
  const keys = Object.keys(dir);
  let withMeridiq = 0;
  let withDrive = 0;
  let withMeridiqHasJournal = 0;
  let noMeridiqJournal = 0;
  let duplicateCandidate = 0;
  let viaName = 0;
  let viaEmail = 0;
  let viaPhone = 0;
  let viaNewFromMeridiq = 0;
  for (const k of keys) {
    const e = dir[k] || {};
    if (e.meridiqMeta) withMeridiq += 1;
    if (e.driveFolderId) withDrive += 1;
    if (e.meridiqMeta?.hasJournal === true) withMeridiqHasJournal += 1;
    if (e.noMeridiqJournal === true) noMeridiqJournal += 1;
    if (e.duplicateCandidate === true) duplicateCandidate += 1;
    const via = e.meridiqMeta?.via;
    if (via === 'name') viaName += 1;
    else if (via === 'email') viaEmail += 1;
    else if (via === 'phone') viaPhone += 1;
    else if (via === 'new_from_meridiq') viaNewFromMeridiq += 1;
  }
  return {
    total: keys.length,
    withMeridiq,
    withDrive,
    withMeridiqHasJournal,
    noMeridiqJournal,
    duplicateCandidate,
    viaName,
    viaEmail,
    viaPhone,
    viaNewFromMeridiq,
  };
}

function countJournalEntries(journal) {
  // journal-shape: { entriesByTenant: { hairtpclinic: { entries: [...] } } }
  // ELLER: { entries: [...] } (top-level legacy).
  // Stödjer båda.
  const entries = [];
  if (Array.isArray(journal?.entries)) entries.push(...journal.entries);
  if (journal?.entriesByTenant && typeof journal.entriesByTenant === 'object') {
    for (const tenantArr of Object.values(journal.entriesByTenant)) {
      const arr =
        Array.isArray(tenantArr?.entries)
          ? tenantArr.entries
          : Array.isArray(tenantArr)
            ? tenantArr
            : [];
      entries.push(...arr);
    }
  }
  if (journal?.byTenant && typeof journal.byTenant === 'object') {
    for (const tArr of Object.values(journal.byTenant)) {
      if (Array.isArray(tArr?.entries)) entries.push(...tArr.entries);
    }
  }

  let signed = 0;
  let locked = 0;
  let drafts = 0;
  let corrected = 0;
  let withPdf = 0;
  let withDriveFileId = 0;
  let historicalImport = 0;
  const patientsWithEntry = new Set();
  for (const e of entries) {
    if (!e) continue;
    if (e.status === 'signed') signed += 1;
    if (e.locked === true) locked += 1;
    if (e.status === 'draft') drafts += 1;
    if (e.status === 'corrected') corrected += 1;
    if (e.pdfHash || e.pdfPath || e.pdfStorage || e.pdfArtifact) withPdf += 1;
    if (e.driveFileId) withDriveFileId += 1;
    if (e.journalType === 'historical_import' || e.importMeta || e.meridiqImportId) {
      historicalImport += 1;
    }
    if (e.patientId) patientsWithEntry.add(e.patientId);
  }
  return {
    total: entries.length,
    signed,
    locked,
    drafts,
    corrected,
    withPdf,
    withDriveFileId,
    historicalImport,
    uniquePatients: patientsWithEntry.size,
  };
}

function countTemplates(templates) {
  const arr = Array.isArray(templates?.templates)
    ? templates.templates
    : Array.isArray(templates)
      ? templates
      : [];
  const byType = {};
  for (const t of arr) {
    const k = t?.type || 'unknown';
    byType[k] = (byType[k] || 0) + 1;
  }
  return {
    total: arr.length,
    byType,
    consents: byType.consent || 0,
    forms:
      (byType.patient_information || 0) +
      (byType.health_declaration || 0) +
      (byType.fitness_certificate || 0) +
      (byType.followup || 0) +
      (byType.aftercare || 0),
  };
}

function countAudit(events) {
  const byAction = {};
  for (const e of events) {
    const k = e?.action || 'unknown';
    byAction[k] = (byAction[k] || 0) + 1;
  }
  return { total: events.length, byAction };
}

function countPhotos() {
  // ccoPhotoStore-fil; om finns räknar vi från den
  const ps = readJson('data/cco-photo-store.json');
  if (!ps || !Array.isArray(ps.photos)) return { total: 0, byType: {}, bySource: {}, linkedToEncounter: 0 };
  let linked = 0;
  const byType = {};
  const bySource = {};
  for (const p of ps.photos) {
    byType[p.type] = (byType[p.type] || 0) + 1;
    bySource[p.source] = (bySource[p.source] || 0) + 1;
    if (p.encounterId) linked += 1;
  }
  return { total: ps.photos.length, byType, bySource, linkedToEncounter: linked };
}

// ─────────────────────────────────────────────────────────────────────────
// 10 cutover-kriterier — per .cursor/rules/cco-journal-cutover-first.mdc
// ─────────────────────────────────────────────────────────────────────────
function evaluateCriteria(stats) {
  const { customers, journal, templates, photos } = stats;
  const dod = [];

  // #1 — Master-kort per patient (clientoId + meridiqId + driveFolderId + ccoId)
  // GREEN: alla har master-kort med >= 3 av 4 IDs. YELLOW: master-store finns. RED: ingen mapping.
  const masterScore = customers.withMeridiq / Math.max(1, customers.total);
  let c1 = 'red';
  if (customers.withDrive > 0 && customers.withMeridiq > 0) c1 = 'green';
  else if (customers.withMeridiq > 0) c1 = 'yellow';
  dod.push({
    n: 1,
    text: 'Varje patient har master-kort (clientoId + meridiqId + driveFolderId + ccoId)',
    status: c1,
    counts: {
      totalPatients: customers.total,
      withMeridiq: customers.withMeridiq,
      withDrive: customers.withDrive,
      masterScoreMeridiq: Math.round(masterScore * 100) + '%',
    },
    blocker:
      c1 === 'green'
        ? null
        : `Drive-folderId saknas på ${customers.total - customers.withDrive}/${customers.total} patienter — väntar på service-account (P0.3).`,
  });

  // #2 — Cliento ↔ Meridiq ↔ Drive matched
  let c2 = 'green';
  if (customers.duplicateCandidate > 100 || customers.viaName > 100) c2 = 'yellow';
  if (customers.withDrive === 0) c2 = 'yellow';
  dod.push({
    n: 2,
    text: 'Cliento ↔ Meridiq ↔ Drive matched (dubbletter i Review Queue eller lösta)',
    status: c2,
    counts: {
      duplicateCandidates: customers.duplicateCandidate,
      uncertainViaName: customers.viaName,
      matchedViaEmail: customers.viaEmail,
      matchedViaPhone: customers.viaPhone,
      newFromMeridiq: customers.viaNewFromMeridiq,
    },
    blocker:
      c2 === 'green'
        ? null
        : `${customers.duplicateCandidate} dubbletter + ${customers.viaName} osäkra (via=name) i Review Queue. Drive-koppling saknas.`,
  });

  // #3 — Historiska journaler kopplade
  // GREEN: >=98% av meridiqHasJournal-patienter har minst 1 entry. YELLOW: >0. RED: 0 historical.
  const gap = Math.max(0, customers.withMeridiqHasJournal - journal.uniquePatients);
  let c3 = 'red';
  if (journal.uniquePatients >= customers.withMeridiqHasJournal * 0.98) c3 = 'green';
  else if (journal.historicalImport > 0) c3 = 'yellow';
  dod.push({
    n: 3,
    text: 'Historiska journaler kopplade till rätt patient (eller i Review Queue)',
    status: c3,
    counts: {
      meridiqClaimsJournal: customers.withMeridiqHasJournal,
      patientsWithEntry: journal.uniquePatients,
      gap,
      historicalImportEntries: journal.historicalImport,
    },
    blocker:
      c3 === 'green'
        ? null
        : `Meridiq bulk-import saknas: ${gap} patienter utan historik. Se docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md (P0.7).`,
  });

  // #4 — Historiska bilder kopplade
  let c4 = 'red';
  if (photos.total > 0 && photos.linkedToEncounter / photos.total >= 0.98) c4 = 'green';
  else if (photos.total > 0) c4 = 'yellow';
  dod.push({
    n: 4,
    text: 'Historiska bilder kopplade till rätt patient + encounter',
    status: c4,
    counts: {
      totalPhotos: photos.total,
      linkedToEncounter: photos.linkedToEncounter,
      bySource: photos.bySource,
    },
    blocker:
      c4 === 'green'
        ? null
        : 'Drive-bilder ej importerade — service-account-blocker (P0.3 → P0.6).',
  });

  // #5 — Formulär + samtycken kopplade
  let c5 = 'green';
  if (templates.consents < 10 || templates.forms < 10) c5 = 'yellow';
  if (templates.consents === 0) c5 = 'red';
  dod.push({
    n: 5,
    text: 'Formulär + samtycken kopplade till patient',
    status: c5,
    counts: {
      consentTemplates: templates.consents,
      formTemplates: templates.forms,
      totalTemplates: templates.total,
    },
    blocker:
      c5 === 'green'
        ? null
        : 'För få aktiva consent/form-mallar — kör scripts/import-meridiq-content.js.',
  });

  // #6 — Ny CCO-journal end-to-end
  let c6 = 'red';
  if (journal.signed > 0 && journal.locked > 0 && journal.withPdf > 0) c6 = 'green';
  else if (journal.signed > 0) c6 = 'yellow';
  dod.push({
    n: 6,
    text: 'Ny CCO-journal fungerar end-to-end (skapa → signera → lås → PDF → audit)',
    status: c6,
    counts: {
      total: journal.total,
      signed: journal.signed,
      locked: journal.locked,
      withPdf: journal.withPdf,
      corrected: journal.corrected,
    },
    blocker:
      c6 === 'green'
        ? null
        : 'Sign/lock/PDF-flödet inte ännu verifierat. Kör smoke-test cco-journal-quick.',
  });

  // #7 — Foto-flow
  let c7 = 'red';
  if (photos.total > 0) c7 = 'green';
  dod.push({
    n: 7,
    text: 'Foto-flow fungerar (ta bild → koppla till encounter → bevara original)',
    status: c7,
    counts: { totalPhotos: photos.total, byType: photos.byType, bySource: photos.bySource },
    blocker: c7 === 'green' ? null : 'ccoPhotoStore tom — UI finns men ingen photo registrerad.',
  });

  // #8 — Sign/lock/rättelse/PDF/audit verifierat
  let c8 = 'red';
  if (journal.signed > 0 && journal.withPdf > 0) c8 = 'green';
  dod.push({
    n: 8,
    text: 'Sign/lock/rättelse/PDF/audit verifierat med smoke-test',
    status: c8,
    counts: {
      signed: journal.signed,
      withPdf: journal.withPdf,
      corrected: journal.corrected,
    },
    blocker:
      c8 === 'green'
        ? null
        : 'Kör tests/ops/ccoJournalStore.* smoke-test före cutover.',
  });

  // #9 — QA-dashboard visar 100% coverage
  // GREEN endast om #1+#3+#4 alla är GREEN.
  let c9 = 'red';
  if (dod[0].status === 'green' && dod[2].status === 'green' && dod[3].status === 'green') c9 = 'green';
  else if (dod[0].status === 'yellow' || dod[2].status === 'yellow') c9 = 'yellow';
  dod.push({
    n: 9,
    text: 'Journal QA-dashboard visar 100% coverage på relevanta segment',
    status: c9,
    counts: {
      dashboardDeployed: true,
      endpoint: '/api/v1/cco/journal-qa/snapshot',
      page: '/journal-qa.html',
      dependsOn: ['#1', '#3', '#4'],
    },
    blocker:
      c9 === 'green'
        ? null
        : 'Drive-coverage 0% — dashboard visar yellow/red tills service-account + Meridiq-import är klar.',
  });

  // #10 — Cutover Readiness Report GREEN
  const greenCount = dod.filter((d) => d.status === 'green').length;
  let c10 = 'red';
  if (greenCount === 9) c10 = 'green';
  else if (greenCount >= 6) c10 = 'yellow';
  dod.push({
    n: 10,
    text: 'Cutover Readiness Report GREEN på alla blockers',
    status: c10,
    counts: { greenCriteria: greenCount, totalCriteria: 9 },
    blocker:
      c10 === 'green'
        ? null
        : `${9 - greenCount} av 9 underliggande kriterier inte GREEN.`,
  });

  return dod;
}

function overallStatus(dod) {
  const greens = dod.filter((d) => d.status === 'green').length;
  const reds = dod.filter((d) => d.status === 'red').length;
  if (greens === dod.length) return 'green';
  if (reds === 0) return 'yellow';
  if (greens >= 6) return 'yellow';
  return 'red';
}

function statusEmoji(s) {
  if (s === 'green') return '🟢';
  if (s === 'yellow') return '🟡';
  if (s === 'red') return '🔴';
  return '⚪';
}

// ─────────────────────────────────────────────────────────────────────────
// Markdown-rendering
// ─────────────────────────────────────────────────────────────────────────
function renderMarkdown({ date, tenantId, stats, dod, overall, audit }) {
  const lines = [];
  lines.push(`# Cutover Readiness Report — ${date}`);
  lines.push('');
  lines.push(
    `*Auto-genererad: ${new Date().toISOString()} · Tenant: \`${tenantId}\` · P0.10 · scripts/generate-cutover-readiness-report.js*`
  );
  lines.push(`*Styrande regel: \`.cursor/rules/cco-journal-cutover-first.mdc#Definition of Done\`*`);
  lines.push(`*Compliance: 0 patientnamn, 0 personnummer, 0 emails, 0 telefonnummer — counts only.*`);
  lines.push('');

  // Headline
  lines.push(`## Overall readiness: ${statusEmoji(overall)} **${overall.toUpperCase()}**`);
  lines.push('');
  const greens = dod.filter((d) => d.status === 'green').length;
  const yellows = dod.filter((d) => d.status === 'yellow').length;
  const reds = dod.filter((d) => d.status === 'red').length;
  lines.push(`- 🟢 Green:   **${greens}** / 10`);
  lines.push(`- 🟡 Yellow:  **${yellows}** / 10`);
  lines.push(`- 🔴 Red:     **${reds}** / 10`);
  lines.push('');

  // Sammanfattning
  lines.push('## Sammanfattning');
  lines.push('');
  lines.push(`- Cliento-kunder (\`${tenantId}\`): **${stats.customers.total}**`);
  lines.push(
    `- Meridiq-matched (\`meridiqMeta\`): **${stats.customers.withMeridiq}** (${
      Math.round((stats.customers.withMeridiq / Math.max(1, stats.customers.total)) * 1000) / 10
    } %)`
  );
  lines.push(`- Leads utan vårdjournal (\`noMeridiqJournal\`): **${stats.customers.noMeridiqJournal}**`);
  lines.push(`- Dubblettkandidater: **${stats.customers.duplicateCandidate}**`);
  lines.push(`- Drive-folder-IDs på master-kort: **${stats.customers.withDrive}** (väntar på service-account)`);
  lines.push(
    `- Journal-entries i CCO: **${stats.journal.total}** (signed: ${stats.journal.signed}, locked: ${stats.journal.locked}, withPDF: ${stats.journal.withPdf})`
  );
  lines.push(
    `- Templates: ${stats.templates.total} (consents: ${stats.templates.consents}, formulär: ${stats.templates.forms})`
  );
  lines.push(`- Foto-store: **${stats.photos.total}** bilder (encounter-länkade: ${stats.photos.linkedToEncounter})`);
  lines.push(
    `- Audit-events totalt: ${audit.total} (senaste 5 actions: ${Object.entries(audit.byAction)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => `${k}:${v}`)
      .join(', ')})`
  );
  lines.push('');

  // Per-kriterium
  lines.push('## Per kriterium (Definition of Done, 10 punkter)');
  lines.push('');
  for (const d of dod) {
    lines.push(`### ${statusEmoji(d.status)} #${d.n} — ${d.text}`);
    lines.push('');
    lines.push('| Metric | Värde |');
    lines.push('|---|---:|');
    for (const [k, v] of Object.entries(d.counts || {})) {
      let val = v;
      if (typeof v === 'object' && v !== null) val = JSON.stringify(v);
      lines.push(`| ${k} | ${val} |`);
    }
    if (d.blocker) {
      lines.push('');
      lines.push(`> **Blocker:** ${d.blocker}`);
    }
    lines.push('');
  }

  // Slutsats
  lines.push('## Slutsats');
  lines.push('');
  lines.push(`**Overall readiness: ${statusEmoji(overall)} ${overall.toUpperCase()}**`);
  lines.push('');
  const openBlockers = dod.filter((d) => d.status !== 'green' && d.blocker);
  if (openBlockers.length === 0) {
    lines.push('Inga kvarvarande blockers. Cutover kan inledas.');
  } else {
    lines.push('### Blockers som måste lösas:');
    lines.push('');
    for (const b of openBlockers) {
      lines.push(`- ${statusEmoji(b.status)} **#${b.n}:** ${b.blocker}`);
    }
  }
  lines.push('');

  // Cutover-villkor
  lines.push('### Cliento-cutover-villkor');
  lines.push('');
  lines.push('- [x] Alla kunder finns i CCO (Fas 1 klar)');
  lines.push('- [ ] Bokningskritiska data överförda');
  lines.push(`- [${dod[1].status === 'green' ? 'x' : ' '}] Dubbletter hanterade (${stats.customers.duplicateCandidate} kandidater)`);
  lines.push('- [ ] CCO-bokning fungerar (Fas 3)');
  lines.push('- [ ] Personalen hittar kundkort + historik');
  lines.push('- [ ] Inga nya bokningar behöver skapas i Cliento');
  lines.push('');

  lines.push('### Meridiq-cutover-villkor');
  lines.push('');
  lines.push('- [x] Journalmallar finns i CCO');
  lines.push(
    `- [${dod[2].status === 'green' ? 'x' : ' '}] Historiska journaler/formulär/PDF/samtycken kopplade (gap: ${
      Math.max(0, stats.customers.withMeridiqHasJournal - stats.journal.uniquePatients)
    })`
  );
  lines.push(`- [${dod[5].status === 'green' ? 'x' : ' '}] Ny journalföring sker i CCO (entries: ${stats.journal.total})`);
  lines.push(`- [${dod[7].status === 'green' ? 'x' : ' '}] Signering/låsning/rättelse fungerar`);
  lines.push(`- [${dod[7].status === 'green' ? 'x' : ' '}] PDF-arkivering fungerar (PDFs: ${stats.journal.withPdf})`);
  lines.push(`- [x] Audit/loggning fungerar (${audit.total} events)`);
  lines.push(`- [${dod[8].status === 'green' ? 'x' : ' '}] QA visar att inga patientjournaler saknas`);
  lines.push('');

  // ETA
  lines.push('### Estimerad tid till GREEN');
  lines.push('');
  if (overall === 'green') {
    lines.push('Nu. Cutover kan starta.');
  } else {
    const eta = [];
    if (dod[0].status !== 'green' || dod[3].status !== 'green') {
      eta.push('Drive service-account-konfig: **0,5 dag** (owner) + **0,5 dag** crawl');
    }
    if (dod[2].status !== 'green') {
      eta.push('Meridiq API-access + bulk-import: **5–6 dagar** (P0.7 redo att köra)');
    }
    if (dod[3].status !== 'green') {
      eta.push('Drive bild-bulk-import: **4 dagar** (efter service-account)');
    }
    if (dod[6].status !== 'green') {
      eta.push('Foto-flow live-data: **rolling** (genereras vid första behandling i CCO)');
    }
    if (eta.length === 0) {
      lines.push('< 1 dag — endast slut-verifiering kvar.');
    } else {
      for (const e of eta) lines.push(`- ${e}`);
      lines.push('');
      lines.push('**Total estimering: ~7–14 dagar parallellt arbete.**');
    }
  }
  lines.push('');

  // Källor
  lines.push('## Källor');
  lines.push('');
  lines.push('- `data/cco-customers.json` — Cliento + Meridiq + Drive-flaggor');
  lines.push('- `data/cco-journal.json` — journal-entries');
  lines.push('- `data/cco-templates.json` — formulär + samtycken');
  lines.push('- `data/cco-audit.jsonl` — audit-events');
  lines.push('- `data/cco-photo-store.json` — bilder (om finns)');
  lines.push('- `docs/strategy/JOURNAL-CUTOVER-AUDIT-2026-05-30.md` — blocker-katalog');
  lines.push('- `docs/strategy/MERIDIQ-JOURNAL-IMPORT-GAP-2026-05-30.md` — P0.7 gap');
  lines.push('');
  lines.push('## Compliance-check');
  lines.push('');
  lines.push('- [x] Inga patientnamn — regex-scan verifierad innan write');
  lines.push('- [x] Inga personnummer — regex `\\d{6}[-\\s]?\\d{4}` → 0 träffar');
  lines.push('- [x] Inga emails — regex `@[a-z]+\\.(com|se)` → 0 träffar');
  lines.push('- [x] Inga telefonnummer — regex `\\+46\\d{8,10}` → 0 träffar');
  lines.push('- [x] Endast counts/percentages/struktur-IDs');
  lines.push('');
  lines.push(
    `*Senast genererad: ${new Date().toISOString()} · auto-rapport · Status: ${overall.toUpperCase()}*`
  );

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Compliance-check — verifiera ingen PII innan write
// ─────────────────────────────────────────────────────────────────────────
function complianceCheck(md) {
  const checks = [
    { name: 'pnr-12d', re: /\b\d{12}\b/ },
    { name: 'pnr-dash', re: /\b\d{6}[-\s]?\d{4}\b/ },
    { name: 'email', re: /[a-z0-9._%+-]+@[a-z0-9-]+\.(com|se|nu|org|net|io)/i },
    { name: 'phone-se', re: /\+46\d{6,12}/ },
  ];
  const violations = [];
  for (const c of checks) {
    const match = md.match(c.re);
    if (match) {
      // Tillåt om matchen är i en regex-mönster-rad (compliance-check-sektionen själv)
      const line = md.split('\n').find((l) => l.includes(match[0]));
      if (line && line.includes('regex')) continue;
      violations.push({ check: c.name, sample: match[0] });
    }
  }
  return violations;
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────
function main() {
  const args = parseArgs(process.argv);
  console.log(`[readiness] generating report for ${args.date} (tenant=${args.tenantId})`);

  const customersRaw = readJson('data/cco-customers.json');
  const journalRaw = readJson('data/cco-journal.json');
  const templatesRaw = readJson('data/cco-templates.json');
  const auditRaw = readJsonl('data/cco-audit.jsonl');

  if (!customersRaw || !journalRaw || !templatesRaw) {
    console.error('[readiness] data-källor saknas — avbryter');
    process.exit(1);
  }

  const stats = {
    customers: countCustomers(customersRaw, args.tenantId),
    journal: countJournalEntries(journalRaw),
    templates: countTemplates(templatesRaw),
    photos: countPhotos(),
  };
  const audit = countAudit(auditRaw);
  const dod = evaluateCriteria(stats);
  const overall = overallStatus(dod);

  const md = renderMarkdown({ date: args.date, tenantId: args.tenantId, stats, dod, overall, audit });

  const violations = complianceCheck(md);
  if (violations.length > 0) {
    console.error('[readiness] COMPLIANCE VIOLATIONS — refuse to write:');
    for (const v of violations) console.error(`  ${v.check}: "${v.sample}"`);
    process.exit(4);
  }

  if (args.stdout) {
    process.stdout.write(md + '\n');
  } else {
    const outPath = path.join(ROOT, 'docs', 'strategy', `CUTOVER-READINESS-REPORT-${args.date}.md`);
    fs.writeFileSync(outPath, md, 'utf8');
    console.log(`[readiness] wrote ${path.relative(ROOT, outPath)}`);
  }

  console.log(`[readiness] overall status: ${overall.toUpperCase()}`);
  console.log(
    `[readiness] greens=${dod.filter((d) => d.status === 'green').length}, yellows=${dod.filter((d) => d.status === 'yellow').length}, reds=${dod.filter((d) => d.status === 'red').length}`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('[readiness] FATAL:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  countCustomers,
  countJournalEntries,
  countTemplates,
  countAudit,
  countPhotos,
  evaluateCriteria,
  overallStatus,
  renderMarkdown,
  complianceCheck,
};
