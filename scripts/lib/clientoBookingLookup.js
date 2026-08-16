'use strict';

const { normalizeEmail, normalizeText, phoneMatchKey } = require('../migration/lib/migrationUtils');

function parseClientoBookingsCsv(csvText = '') {
  let text = String(csvText || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine).map((h) => normalizeText(h));
  const col = (name) => headers.indexOf(name);

  const colKundId = col('Kund-id');
  const colKundnamn = col('Kundnamn');
  const colEmail = col('Kund e-post');
  const colPhone1 = col('Kund (mobilnummer)');
  const colPhone2 = col('Kund (annat telefonnummer)');
  const colCreated = col('Skapad tid');

  const required = [
    ['Kund-id', colKundId],
    ['Kundnamn', colKundnamn],
  ].filter(([, index]) => index === -1);
  if (required.length) {
    throw new Error(`Bokningsexporten saknar kolumner: ${required.map(([n]) => n).join(', ')}`);
  }

  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] !== undefined ? cells[index] : '';
    });
    rows.push(row);
  }

  return {
    headers,
    rows,
    col: {
      kundId: headers[colKundId],
      kundnamn: headers[colKundnamn],
      email: headers[colEmail],
      phone1: headers[colPhone1],
      phone2: headers[colPhone2],
      created: headers[colCreated],
    },
  };
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function normalizeName(value) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ');
}

function createClientoBookingLookup(bookingsCsvText, options = {}) {
  const { includeNameMatch = true, debug = false } = options;
  const parsed = parseClientoBookingsCsv(bookingsCsvText);
  const byEmail = new Map();
  const byPhone = new Map();
  const byName = includeNameMatch ? new Map() : null;
  const customerStats = new Map();

  for (const row of parsed.rows) {
    const customerId = normalizeText(row[parsed.col.kundId]);
    if (!customerId) continue;

    const name = normalizeName(row[parsed.col.kundnamn]);
    const email = normalizeEmail(row[parsed.col.email]);
    const phone1 = phoneMatchKey(row[parsed.col.phone1]);
    const phone2 = phoneMatchKey(row[parsed.col.phone2]);
    const createdAt = normalizeText(row[parsed.col.created]);

    const stats = customerStats.get(customerId) || {
      count: 0,
      latestCreatedAt: '',
    };
    stats.count += 1;
    if (createdAt > stats.latestCreatedAt) stats.latestCreatedAt = createdAt;
    customerStats.set(customerId, stats);

    const add = (map, key) => {
      if (!map || !key) return;
      if (!map.has(key)) map.set(key, new Map());
      const ids = map.get(key);
      ids.set(customerId, (ids.get(customerId) || 0) + 1);
    };

    add(byEmail, email);
    add(byPhone, phone1);
    add(byPhone, phone2);
    add(byName, name);
  }

  function resolveKey(map, key) {
    const ids = map.get(key);
    if (!ids) return null;
    if (ids.size === 1) return ids.keys().next().value;
    const ranked = [...ids.entries()]
      .map(([id, count]) => ({
        id,
        count,
        latest: customerStats.get(id).latestCreatedAt,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        if (b.latest !== a.latest) return b.latest.localeCompare(a.latest);
        return a.id.localeCompare(b.id);
      });
    return ranked[0].id;
  }

  function resolveCustomerId(record) {
    const emails = [
      ...new Set(
        [record.primaryEmail, ...(Array.isArray(record.emails) ? record.emails : [])]
          .map(normalizeEmail)
          .filter(Boolean)
      ),
    ];

    const phones = [
      ...new Set(
        [record.primaryPhone, ...(Array.isArray(record.phones) ? record.phones : [])]
          .map(phoneMatchKey)
          .filter(Boolean)
      ),
    ];

    for (const email of emails) {
      const id = resolveKey(byEmail, email);
      if (id) return { customerId: id, method: 'email' };
    }

    for (const phone of phones) {
      const id = resolveKey(byPhone, phone);
      if (id) return { customerId: id, method: 'phone' };
    }

    const name = normalizeName(record.name || record.displayName);
    if (byName && name) {
      const id = resolveKey(byName, name);
      if (id) return { customerId: id, method: 'name' };
    }

    return null;
  }

  if (debug) {
    console.log('booking lookup ready:', {
      rows: parsed.rows.length,
      byEmail: byEmail.size,
      byPhone: byPhone.size,
      byName: byName ? byName.size : 0,
    });
  }

  return {
    headers: parsed.headers,
    byEmail,
    byPhone,
    byName,
    customerStats,
    resolveCustomerId,
  };
}

module.exports = {
  createClientoBookingLookup,
  parseClientoBookingsCsv,
};
