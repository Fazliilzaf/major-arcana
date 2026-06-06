'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const { createClientoApi } = require('../infra/clientoApi');
const {
  normalizeEmail,
  normalizePersonnummer,
  normalizePhone,
  normalizeText,
  phoneMatchKey,
  nameOverlapScore,
} = require('../../scripts/migration/lib/migrationUtils');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function nowIso() {
  return new Date().toISOString();
}

function buildClientoPatientLookup(patients = []) {
  const byClientoId = new Map();
  const byPersonnummer = new Map();
  const byEmail = new Map();
  const byPhone = new Map();

  for (const patient of asArray(patients)) {
    const clientoId = normalizeText(
      asObject(patient.cliento).clientoId || asObject(patient.cliento).sourceId
    );
    if (clientoId && !byClientoId.has(clientoId)) byClientoId.set(clientoId, patient);

    const pnr = normalizePersonnummer(patient.personnummer);
    if (pnr && !byPersonnummer.has(pnr)) byPersonnummer.set(pnr, patient);

    const emailKeys = new Set(
      [patient.primaryEmail, ...asArray(patient.emails)].map(normalizeEmail).filter(Boolean)
    );
    emailKeys.forEach((email) => {
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(patient);
    });

    const phoneKeys = new Set(
      [patient.primaryPhone, ...asArray(patient.phones)].map(phoneMatchKey).filter(Boolean)
    );
    phoneKeys.forEach((phone) => {
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(patient);
    });
  }

  return { byClientoId, byPersonnummer, byEmail, byPhone, allPatients: asArray(patients) };
}

function findClientoDeltaCandidates(lookup, record) {
  const matches = new Map();
  const add = (patient, method, confidence) => {
    if (!patient?.id) return;
    const existing = matches.get(patient.id);
    if (!existing || confidence > existing.confidence) {
      matches.set(patient.id, { patient, method, confidence });
    }
  };

  if (record.clientoId) {
    const linked = lookup.byClientoId.get(record.clientoId);
    if (linked) add(linked, 'cliento_id', 1);
  }

  const pnr = normalizePersonnummer(record.personnummer);
  if (pnr) {
    const byPnr = lookup.byPersonnummer.get(pnr);
    if (byPnr) add(byPnr, 'personnummer', 0.98);
  }

  for (const email of asArray(record.emails)) {
    const normalized = normalizeEmail(email);
    const list = lookup.byEmail.get(normalized) || [];
    list.forEach((patient) => add(patient, 'email', 0.92));
  }

  for (const phone of asArray(record.phones)) {
    const list = lookup.byPhone.get(phoneMatchKey(phone)) || [];
    list.forEach((patient) => add(patient, 'phone', 0.88));
  }

  if (record.name) {
    lookup.allPatients.forEach((patient) => {
      const score = nameOverlapScore(patient.displayName, record.name);
      if (score >= 0.66) add(patient, 'name', 0.5 + score * 0.3);
    });
  }

  return Array.from(matches.values()).sort((a, b) => b.confidence - a.confidence);
}

function findClientoCsvMatch(lookup, record) {
  if (record.primaryEmail) {
    const list = lookup.byEmail.get(normalizeEmail(record.primaryEmail)) || [];
    const unique = [...new Map(list.map((patient) => [patient.id, patient])).values()];
    if (unique.length === 1) {
      return { patient: unique[0], method: 'email', ambiguous: false, candidates: unique };
    }
    if (unique.length > 1) {
      return { patient: null, method: 'email', ambiguous: true, candidates: unique };
    }
  }

  if (record.primaryPhone) {
    const list = lookup.byPhone.get(phoneMatchKey(record.primaryPhone)) || [];
    const unique = [...new Map(list.map((patient) => [patient.id, patient])).values()];
    if (unique.length === 1) {
      return { patient: unique[0], method: 'phone', ambiguous: false, candidates: unique };
    }
    if (unique.length > 1) {
      return { patient: null, method: 'phone', ambiguous: true, candidates: unique };
    }
  }

  if (record.name) {
    const nameMatches = lookup.allPatients.filter(
      (patient) => nameOverlapScore(patient.displayName, record.name) >= 0.85
    );
    const unique = [...new Map(nameMatches.map((patient) => [patient.id, patient])).values()];
    if (unique.length === 1) {
      return { patient: unique[0], method: 'name', ambiguous: false, candidates: unique };
    }
    if (unique.length > 1) {
      return { patient: null, method: 'name', ambiguous: true, candidates: unique };
    }
  }

  return { patient: null, method: 'none', ambiguous: false, candidates: [] };
}

function parseClientoExportCsvText(csvText = '') {
  let text = String(csvText || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const sample = text.split('\n').slice(0, 3).join('\n');
  const delimiter =
    (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let field = '';
  let row = [];
  let inQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuote = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuote = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      /* skip */
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  while (rows.length && rows[rows.length - 1].every((cell) => !String(cell || '').trim()))
    rows.pop();
  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((header) => String(header || '').trim());
  const dataRows = rows.slice(1).map((cells, index) => {
    const raw = {};
    headers.forEach((header, headerIndex) => {
      raw[header] = String(cells[headerIndex] !== undefined ? cells[headerIndex] : '').trim();
    });
    return mapClientoCsvRow(raw, index + 2);
  });
  return { headers, rows: dataRows.filter(Boolean) };
}

function mapClientoCsvRow(rawRow, rowNumber) {
  const headers = Object.keys(rawRow);
  const map = {};
  for (const header of headers) {
    const low = header.toLowerCase().trim();
    if (!map.name && /(^|\b)namn\b/.test(low)) map.name = header;
    if (!map.email && /(e-post|email|e-mail|epost)/.test(low)) map.email = header;
    if (!map.phone && /(telefon|mobil|phone|tel\b)/.test(low)) map.phone = header;
    if (!map.createdAt && /(skapad|created|createdat)/.test(low)) map.createdAt = header;
  }
  const get = (key) => (map[key] ? String(rawRow[map[key]] || '').trim() : '');
  const name = get('name');
  const email = normalizeEmail(get('email'));
  const phone = normalizePhone(get('phone'));
  const createdAt = get('createdAt');
  if (!name && !email && !phone) return null;
  const record = {
    rowNumber,
    name,
    emails: email ? [email] : [],
    primaryEmail: email,
    phones: phone ? [phone] : [],
    primaryPhone: phone,
    personnummer: '',
    createdAt,
    accountId: 'csv-export',
  };
  record.clientoId = buildCsvClientoFingerprint(record);
  return record;
}

function buildCsvClientoFingerprint(record) {
  const seed = [
    normalizeEmail(record.primaryEmail),
    phoneMatchKey(record.primaryPhone),
    normalizeText(record.name).toLowerCase(),
    normalizeText(record.createdAt),
  ]
    .filter(Boolean)
    .join('|');
  return `csv:${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20)}`;
}

function readClientoExportCsv(csvPath) {
  const text = fs.readFileSync(csvPath, 'utf8');
  return parseClientoExportCsvText(text);
}

function buildDuplicateEmailSet(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const email = normalizeEmail(row.primaryEmail);
    if (!email) continue;
    counts.set(email, (counts.get(email) || 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([email]) => email));
}

async function runClientoCustomerCsvDeltaSync({
  patientMasterStore,
  tenantId,
  csvPath,
  dryRun = true,
  sampleSize = 5,
} = {}) {
  if (!patientMasterStore || typeof patientMasterStore.listPatients !== 'function') {
    throw new Error('patientMasterStore saknas för Cliento CSV-sync.');
  }
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) throw new Error('tenantId saknas.');
  const resolvedCsvPath = normalizeText(csvPath);
  if (!resolvedCsvPath || !fs.existsSync(resolvedCsvPath)) {
    throw new Error(`CSV-filen saknas: ${resolvedCsvPath}`);
  }

  const parsed = readClientoExportCsv(resolvedCsvPath);
  const duplicateEmailsInCsv = buildDuplicateEmailSet(parsed.rows);
  const existing = await patientMasterStore.listPatients({
    tenantId: normalizedTenantId,
    limit: 50000,
    offset: 0,
  });
  const lookup = buildClientoPatientLookup(existing.patients);

  const report = {
    ok: true,
    skipped: false,
    source: 'cliento_csv',
    mode: dryRun ? 'dry-run' : 'commit',
    tenantId: normalizedTenantId,
    csvPath: resolvedCsvPath,
    csvHeaders: parsed.headers,
    existingPatients: existing.total,
    fetched: parsed.rows.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    reviewQueued: 0,
    invalid: 0,
    stats: {
      withoutEmail: parsed.rows.filter((row) => !row.primaryEmail).length,
      withoutPhone: parsed.rows.filter((row) => !row.primaryPhone).length,
      withoutEmailAndPhone: parsed.rows.filter((row) => !row.primaryEmail && !row.primaryPhone)
        .length,
      duplicateEmailsInCsv: duplicateEmailsInCsv.size,
    },
    reviewQueue: [],
    sample: [],
    startedAt: nowIso(),
    finishedAt: null,
  };

  for (const record of parsed.rows) {
    await applyClientoDeltaRecord({
      patientMasterStore,
      tenantId: normalizedTenantId,
      lookup,
      record,
      dryRun,
      report,
      sampleSize,
      duplicateEmailsInCsv,
    });
  }

  report.finishedAt = nowIso();
  return report;
}

function buildClientoMeta(record) {
  return {
    source: 'cliento',
    clientoId: record.clientoId,
    accountId: record.accountId,
    name: record.name,
    emails: [...asArray(record.emails)],
    phones: [...asArray(record.phones)],
    primaryEmail: record.primaryEmail,
    primaryPhone: record.primaryPhone,
    personnummer: normalizePersonnummer(record.personnummer),
    updatedAt: record.updatedAt || null,
    syncedAt: nowIso(),
  };
}

function recordsEquivalent(existing, record) {
  const cliento = asObject(existing?.cliento);
  const sameEmail =
    normalizeEmail(existing?.primaryEmail) === normalizeEmail(record.primaryEmail) ||
    (!record.primaryEmail && !existing?.primaryEmail);
  const samePhone =
    phoneMatchKey(existing?.primaryPhone) === phoneMatchKey(record.primaryPhone) ||
    (!record.primaryPhone && !existing?.primaryPhone);
  const sameName = normalizeText(existing?.displayName) === normalizeText(record.name);
  const sameCreatedAt =
    normalizeText(cliento.clientoCreatedAt || cliento.createdAt) ===
    normalizeText(record.createdAt);
  const sameClientoId =
    !record.clientoId ||
    !cliento.clientoId ||
    normalizeText(cliento.clientoId) === normalizeText(record.clientoId);
  return sameEmail && samePhone && sameName && sameCreatedAt && sameClientoId;
}

function maskSample(record, action, candidateCount) {
  const pnr = normalizePersonnummer(record.personnummer);
  return {
    clientoId: record.clientoId || '(saknas)',
    action,
    candidateCount,
    nameInitial: normalizeText(record.name).slice(0, 1) || '?',
    emailDomain: normalizeEmail(record.primaryEmail).split('@')[1] || '',
    phoneLast4: normalizePhone(record.primaryPhone).replace(/\D/g, '').slice(-4) || '',
    personnummerTail: pnr ? pnr.slice(-4) : '',
  };
}

function resolveClientoApiConfigs(config = {}) {
  const accountIds = [
    ...new Set(
      asArray(config.clientoAccountIds)
        .map((value) => normalizeText(value))
        .filter(Boolean)
    ),
  ];
  const apiKey = normalizeText(config.clientoApiKey);
  if (!apiKey) {
    return { ok: false, reason: 'cliento_api_key_missing', accountIds };
  }
  if (!accountIds.length) {
    return { ok: false, reason: 'cliento_account_ids_missing', accountIds };
  }
  return {
    ok: true,
    accountIds,
    apiBaseUrl: config.clientoApiBaseUrl,
    apiKey,
    authHeader: config.clientoApiAuthHeader,
    authScheme: config.clientoApiAuthScheme,
    timeoutMs: config.clientoApiTimeoutMs,
  };
}

async function fetchClientoCustomersForAccounts(apiConfig, { fetchImpl, updatedSince = '' } = {}) {
  const rows = [];
  const errors = [];
  for (const accountId of apiConfig.accountIds) {
    try {
      const api = createClientoApi(
        {
          partnerId: accountId,
          apiBaseUrl: apiConfig.apiBaseUrl,
          apiKey: apiConfig.apiKey,
          authHeader: apiConfig.authHeader,
          authScheme: apiConfig.authScheme,
          timeoutMs: apiConfig.timeoutMs,
        },
        { fetchImpl }
      );
      const batch = await api.listAllCustomers({ updatedSince });
      rows.push(...batch.map((row) => ({ ...row, accountId })));
    } catch (error) {
      errors.push({
        accountId,
        statusCode: error?.statusCode || null,
        message: error?.message || String(error),
      });
    }
  }
  return { rows, errors };
}

async function runClientoCustomerDeltaSync({
  patientMasterStore,
  tenantId,
  config = {},
  dryRun = true,
  sampleSize = 5,
  updatedSince = '',
  fetchImpl,
} = {}) {
  if (!patientMasterStore || typeof patientMasterStore.listPatients !== 'function') {
    throw new Error('patientMasterStore saknas för Cliento delta-sync.');
  }
  const normalizedTenantId = normalizeText(tenantId);
  if (!normalizedTenantId) throw new Error('tenantId saknas.');

  const apiConfig = resolveClientoApiConfigs(config);
  if (!apiConfig.ok) {
    return {
      ok: false,
      skipped: true,
      reason: apiConfig.reason,
      mode: dryRun ? 'dry-run' : 'commit',
      tenantId: normalizedTenantId,
      accountIds: apiConfig.accountIds,
    };
  }

  const fetched = await fetchClientoCustomersForAccounts(apiConfig, { fetchImpl, updatedSince });
  const existing = await patientMasterStore.listPatients({
    tenantId: normalizedTenantId,
    limit: 50000,
    offset: 0,
  });
  const lookup = buildClientoPatientLookup(existing.patients);

  const report = {
    ok: true,
    skipped: false,
    mode: dryRun ? 'dry-run' : 'commit',
    tenantId: normalizedTenantId,
    accountIds: apiConfig.accountIds,
    fetched: fetched.rows.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    reviewQueued: 0,
    invalid: 0,
    errors: fetched.errors,
    reviewQueue: [],
    sample: [],
    startedAt: nowIso(),
    finishedAt: null,
  };

  for (const record of fetched.rows) {
    if (!record.clientoId && !record.name && !record.emails.length) {
      report.invalid += 1;
      continue;
    }

    await applyClientoDeltaRecord({
      patientMasterStore,
      tenantId: normalizedTenantId,
      lookup,
      record,
      dryRun,
      report,
      sampleSize,
      duplicateEmailsInCsv: new Set(),
      useApiMatching: true,
    });
  }

  report.finishedAt = nowIso();
  return report;
}

async function applyClientoDeltaRecord({
  patientMasterStore,
  tenantId,
  lookup,
  record,
  dryRun,
  report,
  sampleSize,
  duplicateEmailsInCsv,
  useApiMatching = false,
}) {
  if (!record.name && !record.emails.length && !record.phones.length) {
    report.invalid += 1;
    return;
  }

  if (useApiMatching) {
    const candidates = findClientoDeltaCandidates(lookup, record);
    const uniquePatientIds = [...new Set(candidates.map((item) => item.patient.id))];
    if (uniquePatientIds.length > 1) {
      report.reviewQueued += 1;
      report.reviewQueue.push({
        clientoId: record.clientoId,
        accountId: record.accountId,
        candidatePatientIds: uniquePatientIds,
        methods: candidates.map((item) => item.method),
        queuedAt: nowIso(),
      });
      if (report.sample.length < sampleSize) {
        report.sample.push(maskSample(record, 'review', uniquePatientIds.length));
      }
      return;
    }
    const target = candidates[0]?.patient || null;
    const clientoMeta = buildClientoMeta(record);
    if (!target) {
      report.created += 1;
      if (report.sample.length < sampleSize) report.sample.push(maskSample(record, 'create', 0));
      if (!dryRun) {
        const created = await patientMasterStore.upsertPatient({
          tenantId,
          displayName: record.name || record.primaryEmail || record.clientoId,
          personnummer: normalizePersonnummer(record.personnummer),
          primaryEmail: record.primaryEmail,
          primaryPhone: record.primaryPhone,
          emails: record.emails,
          phones: record.phones,
          cliento: clientoMeta,
          matchStatus: 'cliento_only',
          matchConfidence: 1,
        });
        if (record.clientoId) lookup.byClientoId.set(record.clientoId, created);
      }
      return;
    }
    if (recordsEquivalent(target, record)) {
      report.unchanged += 1;
      if (report.sample.length < sampleSize) report.sample.push(maskSample(record, 'unchanged', 1));
      return;
    }
    report.updated += 1;
    if (report.sample.length < sampleSize) report.sample.push(maskSample(record, 'update', 1));
    if (!dryRun) {
      await patientMasterStore.upsertPatient({
        ...target,
        tenantId,
        displayName: target.displayName || record.name,
        personnummer:
          normalizePersonnummer(target.personnummer) || normalizePersonnummer(record.personnummer),
        primaryEmail: target.primaryEmail || record.primaryEmail,
        primaryPhone: target.primaryPhone || record.primaryPhone,
        emails: [...new Set([...asArray(target.emails), ...asArray(record.emails)])],
        phones: [...new Set([...asArray(target.phones), ...asArray(record.phones)])],
        cliento: clientoMeta,
        matchStatus: target.drive ? 'matched' : target.matchStatus || 'cliento_only',
        matchConfidence: Math.max(Number(target.matchConfidence) || 0, 0.95),
      });
    }
    return;
  }

  const duplicateEmail =
    record.primaryEmail && duplicateEmailsInCsv.has(normalizeEmail(record.primaryEmail));
  const match = findClientoCsvMatch(lookup, record);

  if (duplicateEmail || match.ambiguous) {
    report.reviewQueued += 1;
    report.reviewQueue.push({
      clientoId: record.clientoId,
      rowNumber: record.rowNumber,
      reason: duplicateEmail ? 'duplicate_email_in_csv' : `ambiguous_${match.method}`,
      candidatePatientIds: (match.candidates || []).map((patient) => patient.id),
      queuedAt: nowIso(),
    });
    if (report.sample.length < sampleSize) {
      report.sample.push(maskSample(record, 'review', (match.candidates || []).length || 2));
    }
    return;
  }

  const target = match.patient;
  const clientoMeta = {
    ...buildClientoMeta(record),
    importSource: 'cliento_csv',
    csvRowNumber: record.rowNumber,
    clientoCreatedAt: record.createdAt || null,
  };

  if (!target) {
    report.created += 1;
    if (report.sample.length < sampleSize) report.sample.push(maskSample(record, 'create', 0));
    if (!dryRun) {
      const created = await patientMasterStore.upsertPatient({
        tenantId,
        displayName: record.name || record.primaryEmail || `cliento-rad-${record.rowNumber}`,
        primaryEmail: record.primaryEmail,
        primaryPhone: record.primaryPhone,
        emails: record.emails,
        phones: record.phones,
        cliento: clientoMeta,
        matchStatus: 'cliento_only',
        matchConfidence: 0.7,
      });
      if (record.clientoId) lookup.byClientoId.set(record.clientoId, created);
      if (record.primaryEmail) {
        const email = normalizeEmail(record.primaryEmail);
        if (!lookup.byEmail.has(email)) lookup.byEmail.set(email, []);
        lookup.byEmail.get(email).push(created);
      }
      if (record.primaryPhone) {
        const phone = phoneMatchKey(record.primaryPhone);
        if (!lookup.byPhone.has(phone)) lookup.byPhone.set(phone, []);
        lookup.byPhone.get(phone).push(created);
      }
      lookup.allPatients.push(created);
    }
    return;
  }

  const mergedRecord = {
    ...record,
    primaryEmail: target.primaryEmail || record.primaryEmail,
    primaryPhone: target.primaryPhone || record.primaryPhone,
    name: target.displayName || record.name,
  };
  if (recordsEquivalent(target, mergedRecord)) {
    report.unchanged += 1;
    if (report.sample.length < sampleSize) report.sample.push(maskSample(record, 'unchanged', 1));
    return;
  }

  report.updated += 1;
  if (report.sample.length < sampleSize) report.sample.push(maskSample(record, 'update', 1));
  if (!dryRun) {
    await patientMasterStore.upsertPatient({
      ...target,
      tenantId,
      displayName: target.displayName || record.name,
      primaryEmail: target.primaryEmail || record.primaryEmail,
      primaryPhone: target.primaryPhone || record.primaryPhone,
      emails: [...new Set([...asArray(target.emails), ...asArray(record.emails)])],
      phones: [...new Set([...asArray(target.phones), ...asArray(record.phones)])],
      cliento: clientoMeta,
      matchStatus: target.drive ? 'matched' : target.matchStatus || 'cliento_only',
      matchConfidence: Math.max(
        Number(target.matchConfidence) || 0,
        match.method === 'name' ? 0.72 : 0.95
      ),
    });
  }
}

module.exports = {
  buildClientoPatientLookup,
  findClientoDeltaCandidates,
  findClientoCsvMatch,
  parseClientoExportCsvText,
  resolveClientoApiConfigs,
  fetchClientoCustomersForAccounts,
  runClientoCustomerDeltaSync,
  runClientoCustomerCsvDeltaSync,
};
