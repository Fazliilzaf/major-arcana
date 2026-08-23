'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createClientoBookingStore, normalizePriceSek } = require('./clientoBookingStore');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/^mailto:/, '');
}

function normalizePhone(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

function extractTreatmentDate(s) {
  if (!s) return null;
  const match = String(s).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function extractTreatmentDateTime(s) {
  const date = extractTreatmentDate(s);
  if (!date) return null;
  const timeMatch = String(s).match(/(\d{1,2}):(\d{2})/);
  if (!timeMatch) return `${date}T12:00:00.000Z`;
  return `${date}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00.000Z`;
}

function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
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
    } else if (ch === ',') {
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
  while (rows.length && rows[rows.length - 1].every((c) => !c)) rows.pop();
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => String(h || '').trim());
  const dataRows = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] !== undefined ? r[idx] : '').trim();
    });
    return obj;
  });
  return { headers, rows: dataRows };
}

function mapClientoCsvStatus(rawStatus, startsAtIso) {
  const status = normalizeText(rawStatus)
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
  if (status === 'avbokad' || status === 'cancelled' || status === 'canceled') {
    return 'cancelled';
  }
  if (status === 'noshow') return 'no_show';
  if (status === 'show' || status === 'klar' || status === 'done') return 'completed';
  if (status === 'bokad' || status === 'booked') {
    const ms = Date.parse(startsAtIso || '');
    if (Number.isFinite(ms) && ms > Date.now()) return 'upcoming';
    return 'completed';
  }
  if (!status) {
    const ms = Date.parse(startsAtIso || '');
    if (Number.isFinite(ms) && ms > Date.now()) return 'upcoming';
    return 'completed';
  }
  return 'unknown';
}

function joinNotes(...values) {
  return [...new Set(values.map(normalizeText).filter(Boolean))].join('\n\n');
}

function buildCsvIdentityLookups(rows = []) {
  const emailsByClientoId = new Map();
  const emailsByPhone = new Map();
  const add = (map, key, email) => {
    if (!key || !email) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(email);
  };
  for (const row of rows) {
    const email = normalizeEmail(
      row['Kund e-post'] || row['E-post'] || row['Epost'] || row['Email']
    );
    add(emailsByClientoId, normalizeText(row['Kund-id']), email);
    add(
      emailsByPhone,
      normalizePhone(
        row['Kund (mobilnummer)'] || row['Telefon'] || row['Mobil'] || row['Telefonnummer']
      ),
      email
    );
  }
  const uniqueValue = (map, key) => {
    const values = map.get(key);
    return values?.size === 1 ? [...values][0] : '';
  };
  return {
    emailForClientoId: (id) => uniqueValue(emailsByClientoId, id),
    emailForPhone: (phone) => uniqueValue(emailsByPhone, phone),
  };
}

function buildClientoIdEmailLookup(patients = []) {
  const byClientoId = new Map();
  for (const patient of patients) {
    const cliento = patient?.cliento && typeof patient.cliento === 'object' ? patient.cliento : {};
    const clientoId = normalizeText(cliento.sourceId);
    const email = normalizeEmail(patient.primaryEmail || cliento.primaryEmail);
    if (clientoId && email) byClientoId.set(clientoId, email);
  }
  return byClientoId;
}

function loadPatientsFromMasterStore(filePath, tenantId) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  try {
    const state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const bucket = state?.tenants?.[tenantId];
    return Array.isArray(bucket?.patients) ? bucket.patients : [];
  } catch {
    return [];
  }
}

function rowsToClientoBookings(rows, emailByClientoId, opts = {}) {
  const limit = Number(opts.limit) > 0 ? Number(opts.limit) : 0;
  const bookings = [];
  let skippedNoId = 0;
  let skippedNoDate = 0;
  const skippedNoEmail = 0;
  let reviewNoIdentity = 0;
  let missingClientoId = 0;

  let working = rows;
  if (limit > 0) working = rows.slice(0, limit);
  const csvLookups = buildCsvIdentityLookups(rows);

  for (const row of working) {
    const clientoCustomerId = normalizeText(row['Kund-id']);
    if (!clientoCustomerId) missingClientoId += 1;
    const startsAt = extractTreatmentDateTime(row['Starttid']);
    if (!startsAt) {
      skippedNoDate += 1;
      continue;
    }
    const status = mapClientoCsvStatus(row['Status'], startsAt);
    const customerPhone = normalizeText(
      row['Kund (mobilnummer)'] || row['Telefon'] || row['Mobil'] || row['Telefonnummer']
    );
    const customerEmail =
      normalizeEmail(row['Kund e-post'] || row['E-post'] || row['Epost'] || row['Email']) ||
      csvLookups.emailForClientoId(clientoCustomerId) ||
      emailByClientoId.get(clientoCustomerId) ||
      csvLookups.emailForPhone(normalizePhone(customerPhone)) ||
      '';
    if (!customerEmail && !clientoCustomerId && !normalizePhone(customerPhone)) {
      reviewNoIdentity += 1;
    }
    if (!clientoCustomerId) skippedNoId += 1;
    const serviceLabel = normalizeText(row['Tjänstens namn'] || row['Tjänst']);
    // Cliento-exporten bär tjänstens ID i "Tjänste-id" (kolumn 32). Mätt på
    // Dataexport 1 maj 2021 – 16 juni 2027: 28 507 av 40 256 rader (70,8 %) har
    // det, fördelat på 82 unika ID. Fältet lästes aldrig, och namnet ensamt går
    // inte alltid att klassa: "Uppföljning via telefon" bärs av srvId 60041
    // (Hair TP, 87 bokningar) OCH 60223 (Curatiio, 3). Med ID:t blir de exakta.
    const serviceId = normalizeText(row['Tjänste-id'] || row['Tjänste-ID'] || row['ServiceId']);
    const bookingNotes = normalizeText(row['Bokningsanteckning']);
    const customerMessage = normalizeText(row['Meddelande från kund']);
    const internalNotes = joinNotes(
      row['Anteckningar'],
      row['Anteckning'],
      row['Noteringar'],
      row['Kommentar']
    );
    const treatmentNotes = normalizeText(
      row['Behandlingsanteckning'] || row['Behandlingsnotering'] || row['Beskrivning']
    );
    const priceSek = normalizePriceSek(
      row['Pris'] ||
        row['Pris (inkl. moms)'] ||
        row['Pris inkl. moms'] ||
        row['Belopp'] ||
        row['Kostnad'] ||
        row['Price']
    );
    bookings.push({
      bookingId:
        normalizeText(row['Boknings-id']) ||
        `cliento_${clientoCustomerId || customerEmail}_${startsAt}_${serviceLabel}`,
      customerEmail,
      customerName: normalizeText(row['Kundnamn'] || row['Namn']),
      customerPhone,
      serviceLabel,
      serviceId,
      staffName: normalizeText(row['Resursnamn'] || row['Resurs']),
      locationName: normalizeText(row['Plats'] || row['Klinik']),
      startsAt,
      endsAt: extractTreatmentDateTime(row['Sluttid']),
      durationMinutes: Number.parseInt(row['Bokningens längd'], 10) || null,
      status,
      rawStatus: normalizeText(row['Status']),
      source: 'cliento_csv',
      clientoCustomerId,
      priceSek,
      bookingNotes,
      customerMessage,
      internalNotes,
      treatmentNotes,
      notes: joinNotes(bookingNotes, customerMessage, internalNotes, treatmentNotes),
      sourceMessageId: normalizeText(row['Bokningsreferens']),
    });
  }

  return {
    bookings,
    stats: {
      inputRows: working.length,
      accepted: bookings.length,
      skippedNoId,
      skippedNoDate,
      skippedNoEmail,
      reviewNoIdentity,
      missingClientoId,
      skippedCancelled: 0,
    },
  };
}

async function importClientoBookingsFromCsv({
  csvPath,
  tenantId,
  storePath,
  patientMasterPath = '',
  dryRun = true,
  limit = 0,
} = {}) {
  const absCsv = path.resolve(String(csvPath || '').trim());
  if (!absCsv || !fs.existsSync(absCsv)) {
    throw new Error('CSV-filen finns inte.');
  }
  const repoRoot = path.resolve(__dirname, '..', '..');
  if (absCsv.startsWith(repoRoot + path.sep)) {
    throw new Error('COMPLIANCE: CSV får inte ligga i repo.');
  }

  const tid = normalizeText(tenantId) || 'hair_tp';
  const csvText = fs.readFileSync(absCsv, 'utf8');
  const { rows } = parseCsv(csvText);
  const patients = loadPatientsFromMasterStore(patientMasterPath, tid);
  const emailByClientoId = buildClientoIdEmailLookup(patients);
  const mapped = rowsToClientoBookings(rows, emailByClientoId, { limit });

  if (dryRun) {
    return {
      dryRun: true,
      tenantId: tid,
      csvPath: absCsv,
      patientLookupSize: emailByClientoId.size,
      ...mapped.stats,
    };
  }

  const store = await createClientoBookingStore({ filePath: storePath });
  const result = await store.importBatch({
    tenantId: tid,
    bookings: mapped.bookings,
    source: path.basename(absCsv),
  });
  return {
    dryRun: false,
    tenantId: tid,
    csvPath: absCsv,
    patientLookupSize: emailByClientoId.size,
    ...mapped.stats,
    ...result,
  };
}

module.exports = {
  parseCsv,
  mapClientoCsvStatus,
  buildClientoIdEmailLookup,
  rowsToClientoBookings,
  importClientoBookingsFromCsv,
};
