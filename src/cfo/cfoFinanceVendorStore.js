/**
 * cfoFinanceVendorStore — Sprint CF.5 (MVP 4)
 *
 * Leverantörsregister för CCO Finance. Sköter ekonomi-leverantörer
 * (vendors) som är distinkt från `ccoVendorRegister` (som är PUB-avtal /
 * databehandlare för GDPR Art.28/30).
 *
 * Detta är ekonomi-leverantörer som matchas mot expenses för:
 *  - default-kategori
 *  - default-momssats
 *  - default-betalmetod
 *  - default-note
 *  - bankgiro/plusgiro/IBAN för manuella betalningar
 *
 * Aliases:
 *  - "Apoteket", "Apoteket AB", "APOTEKET HJÄRTAT", "APOTEKET-1024" → samma vendor.
 *  - Matchning är case-insensitive substring (vendor.name + vendor.aliases[]).
 *
 * Källor (source):
 *  - 'manual'         — skapad av owner/finance
 *  - 'receipt'        — auto-skapad från kvitto/expense
 *  - 'fortnox_import' — framåt (Fortnox kund/leverantör-sync)
 *  - 'csv_import'     — framåt
 *
 * Audit:
 *  - cf.supplier.created
 *  - cf.supplier.updated
 *  - cf.supplier.deactivated
 *  - cf.supplier.activated
 *  - cf.supplier.rule_linked
 *  - cf.supplier.alias_added
 *
 * Säkerhet:
 *  - Inga bankfiler eller PII utöver vad expense redan har.
 *  - Persisteras i data/cco/finance-vendors.json (gitignored).
 *  - Bankgiro/IBAN är leverantörens egna kontouppgifter — inte patientdata.
 *  - RBAC: owner/finance write, revisor read.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';

const VALID_SOURCES = Object.freeze([
  'manual', 'receipt', 'fortnox_import', 'csv_import',
]);

const VALID_RISK_FLAGS = Object.freeze([
  'no_org_no',          // saknar org-nr
  'duplicate_candidate',// kan vara dubblett av annan vendor
  'needs_review',       // owner-flaggad
  'inactive_marketplace', // ej längre aktiv leverantör
  'high_volume',        // mer än X transaktioner
]);

function nowIso() { return new Date().toISOString(); }
function newId() { return 'supp_' + crypto.randomBytes(8).toString('hex'); }
function lower(value) { return typeof value === 'string' ? value.toLowerCase().trim() : ''; }
function normalizeText(value) { return typeof value === 'string' ? value.trim() : ''; }

/**
 * Bygg en uppsättning name-keys för match: ['name', ...aliases]
 * alla lowercase + trim. Tomma värden filtreras bort.
 */
function buildMatchKeys(vendor) {
  const keys = new Set();
  if (vendor.name) keys.add(lower(vendor.name));
  if (Array.isArray(vendor.aliases)) {
    for (const a of vendor.aliases) {
      const k = lower(a);
      if (k) keys.add(k);
    }
  }
  return [...keys];
}

/**
 * Försök matcha en supplier-string mot en vendor.
 * Returnerar { matched: bool, confidence: 0..1, matchType: 'exact'|'contains'|'reverse_contains'|null }.
 *
 * - exact (1.0): supplier-string lika med någon name/alias
 * - contains (0.75): supplier-string innehåller name/alias
 * - reverse_contains (0.55): name/alias innehåller supplier-string (alias bredare)
 */
function matchVendor(supplierString, vendor) {
  const s = lower(supplierString);
  if (!s) return { matched: false, confidence: 0, matchType: null };
  if (vendor.active === false) {
    // matchen kan fortfarande returneras, men confidence reduceras
  }
  const keys = buildMatchKeys(vendor);
  let best = { matched: false, confidence: 0, matchType: null };
  for (const k of keys) {
    if (!k) continue;
    if (k === s) {
      const conf = vendor.active === false ? 0.85 : 1.0;
      if (conf > best.confidence) best = { matched: true, confidence: conf, matchType: 'exact', matchedKey: k };
      continue;
    }
    if (s.includes(k)) {
      const conf = vendor.active === false ? 0.6 : 0.75;
      if (conf > best.confidence) best = { matched: true, confidence: conf, matchType: 'contains', matchedKey: k };
      continue;
    }
    if (k.includes(s) && s.length >= 4) {
      const conf = vendor.active === false ? 0.40 : 0.55;
      if (conf > best.confidence) best = { matched: true, confidence: conf, matchType: 'reverse_contains', matchedKey: k };
    }
  }
  return best;
}

async function createCfoFinanceVendorStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  let data = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    vendors: [],
  };

  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        data.schemaVersion = parsed.schemaVersion || SCHEMA_VERSION;
        data.createdAt = parsed.createdAt || data.createdAt;
        data.updatedAt = parsed.updatedAt || data.updatedAt;
        data.vendors = Array.isArray(parsed.vendors) ? parsed.vendors : [];
      }
    }
  } catch (err) {
    console.warn('[cfoFinanceVendorStore] kunde inte läsa:', err.message);
  }

  async function persist() {
    data.updatedAt = nowIso();
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  function audit(action, detail) {
    try {
      auditLog?.append?.({
        action, kind: action,
        surface: 'cco.cf.supplier',
        ts: nowIso(),
        actor: detail?.actor || { role: 'system' },
        target: { kind: 'vendor', id: detail?.vendorId },
        detail,
      });
    } catch {}
  }

  function validateInput(input) {
    const name = String(input?.name || '').slice(0, 200).trim();
    if (!name) throw new Error('vendor.name krävs');
    const source = input?.source || 'manual';
    if (!VALID_SOURCES.includes(source)) {
      throw new Error(`Okänd source: ${source}. Tillåtna: ${VALID_SOURCES.join(', ')}`);
    }
    return { name, source };
  }

  async function createVendor({ actor, input = {} } = {}) {
    const { name, source } = validateInput(input);
    // Dubblett-check (exakt namn-match) — varna men tillåt
    const dupeCandidate = data.vendors.find((v) =>
      lower(v.name) === lower(name) ||
      (Array.isArray(v.aliases) && v.aliases.some((a) => lower(a) === lower(name)))
    );

    const id = newId();
    const vendor = {
      id,
      name,
      aliases: Array.isArray(input.aliases) ? input.aliases.map((a) => String(a).slice(0, 200)) : [],
      orgNo: input.orgNo ? String(input.orgNo).slice(0, 30) : null,
      vatNo: input.vatNo ? String(input.vatNo).slice(0, 30) : null,
      bankgiro: input.bankgiro ? String(input.bankgiro).slice(0, 30) : null,
      plusgiro: input.plusgiro ? String(input.plusgiro).slice(0, 30) : null,
      iban: input.iban ? String(input.iban).slice(0, 50) : null,
      defaultCategory: input.defaultCategory || null,
      defaultVatRatePercent: input.defaultVatRatePercent ?? null,
      defaultPaymentMethod: input.defaultPaymentMethod || null,
      defaultNote: input.defaultNote ? String(input.defaultNote).slice(0, 500) : null,
      active: input.active !== false,
      riskFlag: input.riskFlag && VALID_RISK_FLAGS.includes(input.riskFlag) ? input.riskFlag : null,
      source,
      // Hooks för framtida Fortnox-sync (idag null)
      fortnoxCustomerId: null,
      fortnoxSyncStatus: 'blocked_integration',
      linkedRuleIds: Array.isArray(input.linkedRuleIds) ? [...input.linkedRuleIds] : [],
      stats: {
        timesMatched: 0,
        timesUsed: 0,           // räknas upp när suggestion godkänns
        lastMatchedAt: null,
        totalAmountSek: 0,
      },
      // Meta
      createdAt: nowIso(),
      createdBy: actor || null,
      updatedAt: nowIso(),
      history: [{ at: nowIso(), action: 'created', by: actor, source }],
      // Förstadie-info om vi triggat dubblett-flagga
      duplicateCandidateOf: dupeCandidate ? dupeCandidate.id : null,
    };
    if (dupeCandidate && !vendor.riskFlag) vendor.riskFlag = 'duplicate_candidate';
    data.vendors.push(vendor);
    await persist();
    audit('cf.supplier.created', { vendorId: id, name, source, duplicateCandidateOf: vendor.duplicateCandidateOf, actor });
    return { ...vendor };
  }

  async function updateVendor({ id, patch = {}, actor } = {}) {
    const v = data.vendors.find((x) => x.id === id);
    if (!v) throw new Error('vendor finns ej');
    const allowed = [
      'name', 'aliases', 'orgNo', 'vatNo', 'bankgiro', 'plusgiro', 'iban',
      'defaultCategory', 'defaultVatRatePercent', 'defaultPaymentMethod', 'defaultNote',
      'riskFlag', 'fortnoxCustomerId',
    ];
    const changed = [];
    for (const k of allowed) {
      if (k in patch) {
        if (k === 'aliases') {
          v.aliases = Array.isArray(patch[k]) ? patch[k].map((a) => String(a).slice(0, 200)) : [];
        } else if (k === 'riskFlag') {
          v.riskFlag = patch[k] && VALID_RISK_FLAGS.includes(patch[k]) ? patch[k] : null;
        } else {
          v[k] = patch[k];
        }
        changed.push(k);
      }
    }
    v.updatedAt = nowIso();
    v.history.push({ at: nowIso(), action: 'updated', by: actor, fields: changed });
    await persist();
    audit('cf.supplier.updated', { vendorId: id, fields: changed, actor });
    return { ...v };
  }

  async function deactivateVendor({ id, reason, actor } = {}) {
    const v = data.vendors.find((x) => x.id === id);
    if (!v) throw new Error('vendor finns ej');
    if (v.active === false) return { ...v };
    v.active = false;
    v.updatedAt = nowIso();
    v.history.push({ at: nowIso(), action: 'deactivated', by: actor, reason });
    await persist();
    audit('cf.supplier.deactivated', { vendorId: id, reason, actor });
    return { ...v };
  }

  async function activateVendor({ id, actor } = {}) {
    const v = data.vendors.find((x) => x.id === id);
    if (!v) throw new Error('vendor finns ej');
    if (v.active === true) return { ...v };
    v.active = true;
    v.updatedAt = nowIso();
    v.history.push({ at: nowIso(), action: 'activated', by: actor });
    await persist();
    audit('cf.supplier.activated', { vendorId: id, actor });
    return { ...v };
  }

  async function addAlias({ id, alias, actor } = {}) {
    const v = data.vendors.find((x) => x.id === id);
    if (!v) throw new Error('vendor finns ej');
    const a = String(alias || '').trim();
    if (!a) throw new Error('alias krävs');
    v.aliases = v.aliases || [];
    if (!v.aliases.includes(a)) v.aliases.push(a);
    v.updatedAt = nowIso();
    v.history.push({ at: nowIso(), action: 'alias_added', by: actor, alias: a });
    await persist();
    audit('cf.supplier.alias_added', { vendorId: id, alias: a, actor });
    return { ...v };
  }

  async function linkRule({ id, ruleId, actor } = {}) {
    const v = data.vendors.find((x) => x.id === id);
    if (!v) throw new Error('vendor finns ej');
    v.linkedRuleIds = v.linkedRuleIds || [];
    if (!v.linkedRuleIds.includes(ruleId)) v.linkedRuleIds.push(ruleId);
    v.updatedAt = nowIso();
    await persist();
    audit('cf.supplier.rule_linked', { vendorId: id, ruleId, actor });
    return { ...v };
  }

  async function recordMatched({ id, expenseId, amount = 0, actor } = {}) {
    const v = data.vendors.find((x) => x.id === id);
    if (!v) return null;
    v.stats = v.stats || { timesMatched: 0, timesUsed: 0, lastMatchedAt: null, totalAmountSek: 0 };
    v.stats.timesMatched += 1;
    v.stats.lastMatchedAt = nowIso();
    await persist();
    return { ...v };
  }

  async function recordUsed({ id, expenseId, amount = 0, actor } = {}) {
    const v = data.vendors.find((x) => x.id === id);
    if (!v) return null;
    v.stats = v.stats || { timesMatched: 0, timesUsed: 0, lastMatchedAt: null, totalAmountSek: 0 };
    v.stats.timesUsed += 1;
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      v.stats.totalAmountSek += amount;
    }
    await persist();
    return { ...v };
  }

  function getById(id) { return data.vendors.find((v) => v.id === id) || null; }

  function listVendors({ active, source, needsReview, query, limit = 200 } = {}) {
    let list = [...data.vendors];
    if (typeof active === 'boolean') list = list.filter((v) => v.active === active);
    if (source) list = list.filter((v) => v.source === source);
    if (needsReview) list = list.filter((v) => v.riskFlag === 'needs_review' || v.riskFlag === 'duplicate_candidate');
    if (query) {
      const q = lower(query);
      list = list.filter((v) =>
        lower(v.name).includes(q) ||
        (v.aliases || []).some((a) => lower(a).includes(q)) ||
        (v.orgNo && v.orgNo.includes(query))
      );
    }
    list.sort((a, b) => (b.stats?.timesMatched || 0) - (a.stats?.timesMatched || 0));
    return list.slice(0, Math.max(1, Math.min(1000, limit)));
  }

  /**
   * Hitta bästa vendor-match för en supplier-string.
   * Returnerar { vendor, matchType, confidence } eller null.
   */
  function findBySupplierName(supplierString) {
    const s = lower(supplierString);
    if (!s) return null;
    let best = null;
    for (const v of data.vendors) {
      const m = matchVendor(supplierString, v);
      if (m.matched && (!best || m.confidence > best.confidence)) {
        best = { vendor: v, ...m };
      }
    }
    return best;
  }

  function summary() {
    const bySource = {};
    const byRiskFlag = {};
    let active = 0;
    let inactive = 0;
    let totalMatched = 0;
    let totalUsed = 0;
    for (const v of data.vendors) {
      if (v.active !== false) active += 1; else inactive += 1;
      bySource[v.source] = (bySource[v.source] || 0) + 1;
      if (v.riskFlag) byRiskFlag[v.riskFlag] = (byRiskFlag[v.riskFlag] || 0) + 1;
      totalMatched += v.stats?.timesMatched || 0;
      totalUsed += v.stats?.timesUsed || 0;
    }
    return {
      total: data.vendors.length,
      active,
      inactive,
      bySource,
      byRiskFlag,
      totalMatched,
      totalUsed,
      needsReviewCount: (byRiskFlag.needs_review || 0) + (byRiskFlag.duplicate_candidate || 0),
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    VALID_SOURCES, VALID_RISK_FLAGS,
    createVendor, updateVendor, deactivateVendor, activateVendor,
    addAlias, linkRule,
    recordMatched, recordUsed,
    listVendors, getById, findBySupplierName,
    summary,
    matchVendor, // exposed för smoke-test
  };
}

module.exports = {
  createCfoFinanceVendorStore,
  matchVendor,
  VALID_SOURCES,
  VALID_RISK_FLAGS,
  SCHEMA_VERSION,
};
