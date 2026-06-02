/**
 * ccoExpenseRuleStore — Sprint CF.4 (MVP 3)
 *
 * Regelmotor för auto-categorization av expenses UTAN extern AI/OCR.
 * Allt matchas mot strukturerade fält som redan finns på expense:
 *   - supplier (sträng-match, exakt/contains/regex)
 *   - amountSek (intervall)
 *   - vatRatePercent (likhet)
 *   - paymentMethod (likhet)
 *   - notes (sträng-match — om OCR-text finns där sen är det fortfarande
 *     bara strängmatchning, ingen OCR körs här)
 *   - recurring-heuristik (matchande supplier + ±10% amount + ~månadsintervall
 *     mot expense-historik)
 *
 * Föreslår fält:
 *   - setCategory
 *   - setVatRatePercent
 *   - setSupplier (normaliserat namn)
 *   - setPaymentMethod
 *   - setNotes (append, ej overwrite)
 *
 * Confidence score 0..1 beräknas från antal matchande villkor (se scoreRule).
 *
 * Human approval krävs alltid — engine skriver ALDRIG fält direkt på expense.
 * Den producerar bara `suggestion`-objekt som UI:t visar för godkännande.
 *
 * Säkerhet:
 *   - Regler är konfigurationsdata (kategorimappningar, leverantörer) — INTE PII.
 *   - Persisteras i data/cco/expense-rules.json (gitignored).
 *   - Audit på alla mutationer.
 *   - RBAC: owner/finance write, revisor read.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SCHEMA_VERSION = '1.0.0';

const VALID_MATCH_TYPES = Object.freeze([
  'supplier_equals',       // case-insensitive exakt match
  'supplier_contains',     // case-insensitive substring
  'supplier_regex',        // regex (case-insensitive)
  'notes_contains',
  'amount_between',        // { min, max }
  'amount_equals',
  'payment_method_is',
  'vat_rate_is',
  'category_is',           // för regler som triggar på redan-kategoriserad expense
]);

// Vikter för confidence-beräkning. Summan av matchande villkors-poäng,
// normaliserad mot summan av alla aktiva villkors-poäng → 0..1.
const CONDITION_WEIGHTS = Object.freeze({
  supplier_equals: 0.50,
  supplier_contains: 0.30,
  supplier_regex: 0.40,
  notes_contains: 0.20,
  amount_between: 0.20,
  amount_equals: 0.30,
  payment_method_is: 0.15,
  vat_rate_is: 0.10,
  category_is: 0.10,
});

const HIGH_CONFIDENCE_THRESHOLD = 0.70;
const LOW_CONFIDENCE_THRESHOLD = 0.30;

function nowIso() { return new Date().toISOString(); }
function newId() { return 'rule_' + crypto.randomBytes(8).toString('hex'); }

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function lower(value) { return normalizeText(value).toLowerCase(); }

/**
 * Utvärdera ett enskilt villkor mot en expense.
 * Returnerar { matched: bool, weight: number }
 */
function evaluateCondition(cond, expense) {
  const t = cond?.type;
  const w = CONDITION_WEIGHTS[t] || 0;
  switch (t) {
    case 'supplier_equals': {
      const a = lower(expense.supplier);
      const b = lower(cond.value);
      return { matched: !!a && a === b, weight: w };
    }
    case 'supplier_contains': {
      const a = lower(expense.supplier);
      const b = lower(cond.value);
      return { matched: !!a && !!b && a.includes(b), weight: w };
    }
    case 'supplier_regex': {
      try {
        const re = new RegExp(cond.pattern, 'i');
        return { matched: re.test(String(expense.supplier || '')), weight: w };
      } catch { return { matched: false, weight: 0 }; }
    }
    case 'notes_contains': {
      const a = lower(expense.notes);
      const b = lower(cond.value);
      return { matched: !!a && !!b && a.includes(b), weight: w };
    }
    case 'amount_between': {
      const v = Number(expense.amountSek);
      const lo = Number(cond.min);
      const hi = Number(cond.max);
      if (!Number.isFinite(v)) return { matched: false, weight: 0 };
      return {
        matched: (Number.isFinite(lo) ? v >= lo : true) && (Number.isFinite(hi) ? v <= hi : true),
        weight: w,
      };
    }
    case 'amount_equals': {
      const v = Number(expense.amountSek);
      const target = Number(cond.value);
      if (!Number.isFinite(v) || !Number.isFinite(target)) return { matched: false, weight: 0 };
      const tol = Number(cond.tolerance) || 0.01;
      return { matched: Math.abs(v - target) <= tol, weight: w };
    }
    case 'payment_method_is':
      return { matched: lower(expense.paymentMethod) === lower(cond.value), weight: w };
    case 'vat_rate_is':
      return {
        matched: String(expense.vatRatePercent ?? '') === String(cond.value ?? ''),
        weight: w,
      };
    case 'category_is':
      return { matched: lower(expense.category) === lower(cond.value), weight: w };
    default:
      return { matched: false, weight: 0 };
  }
}

/**
 * Beräkna confidence för en regel mot en expense.
 * Score = sum(matched-condition-weights) / sum(all-condition-weights), kapas vid 1.
 */
function scoreRule(rule, expense) {
  const conds = Array.isArray(rule?.conditions) ? rule.conditions : [];
  if (conds.length === 0) return { confidence: 0, matchedConditions: 0, totalConditions: 0 };
  let matchedWeight = 0;
  let totalWeight = 0;
  let matched = 0;
  for (const c of conds) {
    const { matched: m, weight } = evaluateCondition(c, expense);
    totalWeight += weight;
    if (m) { matchedWeight += weight; matched += 1; }
  }
  // matchType: 'all' kräver att alla villkor matchar för att räknas
  if (rule?.matchType === 'all' && matched < conds.length) {
    return { confidence: 0, matchedConditions: matched, totalConditions: conds.length };
  }
  const confidence = totalWeight > 0 ? Math.min(1, matchedWeight / totalWeight) : 0;
  return { confidence, matchedConditions: matched, totalConditions: conds.length };
}

/**
 * Föreslå fält baserat på regel + expense.
 * setNotes APPEND:s med separator ' · ' — overwriter aldrig befintligt notes-fält.
 */
function buildSuggestionFromRule(rule, expense) {
  const fields = {};
  if (rule.setCategory && !expense.category) fields.category = rule.setCategory;
  if (rule.setVatRatePercent !== undefined && rule.setVatRatePercent !== null
      && (expense.vatRatePercent === null || expense.vatRatePercent === undefined)) {
    fields.vatRatePercent = rule.setVatRatePercent;
  }
  if (rule.setSupplier && !expense.supplier) fields.supplier = rule.setSupplier;
  if (rule.setPaymentMethod && !expense.paymentMethod) fields.paymentMethod = rule.setPaymentMethod;
  if (rule.setNotes) {
    const existing = String(expense.notes || '').trim();
    fields.notes = existing ? `${existing} · ${rule.setNotes}` : rule.setNotes;
  }
  return fields;
}

/**
 * Heuristik för "återkommande kostnad":
 *   - Samma supplier (case-insensitive)
 *   - Belopp inom ±10%
 *   - 2+ tidigare expenses
 *   - Minst en av tidigare expenses har date ~28-33 dagar bakåt
 */
function detectRecurring(expense, historyExpenses = []) {
  const sup = lower(expense.supplier);
  const amt = Number(expense.amountSek);
  if (!sup || !Number.isFinite(amt)) return null;
  const candidates = historyExpenses.filter((h) =>
    lower(h.supplier) === sup &&
    Number.isFinite(Number(h.amountSek)) &&
    Math.abs(Number(h.amountSek) - amt) / amt <= 0.10 &&
    h.id !== expense.id
  );
  if (candidates.length < 2) return null;
  const expenseDate = expense.date ? Date.parse(expense.date) : Date.now();
  const monthlyHit = candidates.some((c) => {
    if (!c.date) return false;
    const diff = Math.abs(expenseDate - Date.parse(c.date)) / (24 * 3600 * 1000);
    return diff >= 25 && diff <= 35;
  });
  return {
    isRecurring: monthlyHit,
    matchingCount: candidates.length,
    confidence: monthlyHit ? 0.65 : 0.30,
    likelyIntervalDays: monthlyHit ? 30 : null,
    note: monthlyHit ? 'Återkommande månatlig kostnad upptäckt' : 'Liknande tidigare expenses finns',
  };
}

/**
 * Evaluera alla aktiva regler mot expense. Returnerar bästa förslaget.
 * historyExpenses = redan kategoriserade expenses (för recurring-detection
 * + framtida supplier-frekvens-heuristik).
 */
function evaluateAllRules({ expense, rules, historyExpenses = [] } = {}) {
  if (!expense) return null;
  const active = (rules || []).filter((r) => r.enabled !== false);
  // Sortera på prioritet (högre först)
  active.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));

  const matches = [];
  for (const rule of active) {
    const { confidence, matchedConditions, totalConditions } = scoreRule(rule, expense);
    if (confidence > 0) {
      const fields = buildSuggestionFromRule(rule, expense);
      if (Object.keys(fields).length > 0) {
        matches.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority || 0,
          confidence,
          matchedConditions,
          totalConditions,
          suggestedFields: fields,
        });
      }
    }
  }

  // Sortera på confidence (högre först), sedan priority
  matches.sort((a, b) => (b.confidence - a.confidence) || (b.priority - a.priority));

  const recurring = detectRecurring(expense, historyExpenses);

  return {
    bestMatch: matches[0] || null,
    allMatches: matches,
    recurring,
    evaluatedAt: nowIso(),
    rulesEvaluated: active.length,
  };
}

// ─── Store ─────────────────────────────────────────────────────

async function createCcoExpenseRuleStore({ filePath, auditLog = null } = {}) {
  if (!filePath) throw new Error('filePath krävs');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  let data = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    rules: [],
  };

  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        data.schemaVersion = parsed.schemaVersion || SCHEMA_VERSION;
        data.createdAt = parsed.createdAt || data.createdAt;
        data.updatedAt = parsed.updatedAt || data.updatedAt;
        data.rules = Array.isArray(parsed.rules) ? parsed.rules : [];
      }
    }
  } catch (err) {
    console.warn('[ccoExpenseRuleStore] kunde inte läsa:', err.message);
  }

  async function persist() {
    data.updatedAt = nowIso();
    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  function audit(action, detail) {
    try {
      auditLog?.append?.({
        // CF.3 P2-C workaround: vi sätter både action OCH kind så ccoAuditLog
        // (som läser action) och alla framtida auditer (som kanske läser kind) får rätt.
        action, kind: action,
        surface: 'cco.cf.rule',
        ts: nowIso(),
        actor: detail?.actor || { role: 'system' },
        target: { kind: 'rule', id: detail?.ruleId },
        detail,
      });
    } catch {}
  }

  function validateRule(input) {
    const name = String(input?.name || '').slice(0, 200).trim();
    if (!name) throw new Error('rule.name krävs');
    const conditions = Array.isArray(input?.conditions) ? input.conditions : [];
    for (const c of conditions) {
      if (!VALID_MATCH_TYPES.includes(c?.type)) {
        throw new Error(`Okänd condition.type: ${c?.type}. Tillåtna: ${VALID_MATCH_TYPES.join(', ')}`);
      }
    }
    const matchType = input?.matchType === 'all' ? 'all' : 'any';
    return { name, conditions, matchType };
  }

  async function createRule({ actor, input = {} } = {}) {
    const { name, conditions, matchType } = validateRule(input);
    const id = newId();
    const rule = {
      id,
      name,
      description: String(input.description || '').slice(0, 500),
      priority: Number(input.priority) || 0,
      enabled: input.enabled !== false,
      matchType,
      conditions,
      setCategory: input.setCategory || null,
      setVatRatePercent: input.setVatRatePercent ?? null,
      setSupplier: input.setSupplier || null,
      setPaymentMethod: input.setPaymentMethod || null,
      setNotes: input.setNotes ? String(input.setNotes).slice(0, 500) : null,
      createdAt: nowIso(),
      createdBy: actor || null,
      updatedAt: nowIso(),
      stats: { timesApplied: 0, timesRejected: 0, lastAppliedAt: null },
    };
    data.rules.push(rule);
    await persist();
    audit('cf.rule.created', { ruleId: id, name, actor });
    return { ...rule };
  }

  async function updateRule({ id, patch = {}, actor } = {}) {
    const r = data.rules.find((x) => x.id === id);
    if (!r) throw new Error('rule finns ej');
    if ('conditions' in patch || 'matchType' in patch || 'name' in patch) {
      const { name, conditions, matchType } = validateRule({
        name: patch.name ?? r.name,
        conditions: patch.conditions ?? r.conditions,
        matchType: patch.matchType ?? r.matchType,
      });
      r.name = name;
      r.conditions = conditions;
      r.matchType = matchType;
    }
    const allowed = ['description', 'priority', 'enabled', 'setCategory',
      'setVatRatePercent', 'setSupplier', 'setPaymentMethod', 'setNotes'];
    for (const k of allowed) if (k in patch) r[k] = patch[k];
    r.updatedAt = nowIso();
    await persist();
    audit('cf.rule.updated', { ruleId: id, fields: Object.keys(patch), actor });
    return { ...r };
  }

  async function deleteRule({ id, actor } = {}) {
    const idx = data.rules.findIndex((x) => x.id === id);
    if (idx < 0) throw new Error('rule finns ej');
    const removed = data.rules.splice(idx, 1)[0];
    await persist();
    audit('cf.rule.deleted', { ruleId: id, name: removed.name, actor });
    return { ok: true, id };
  }

  async function recordApplied({ id, expenseId, actor, suggestionConfidence } = {}) {
    const r = data.rules.find((x) => x.id === id);
    if (!r) return null;
    r.stats = r.stats || { timesApplied: 0, timesRejected: 0, lastAppliedAt: null };
    r.stats.timesApplied += 1;
    r.stats.lastAppliedAt = nowIso();
    await persist();
    audit('cf.rule.applied', { ruleId: id, expenseId, confidence: suggestionConfidence, actor });
    return { ...r };
  }

  async function recordRejected({ id, expenseId, reason, actor } = {}) {
    const r = data.rules.find((x) => x.id === id);
    if (!r) return null;
    r.stats = r.stats || { timesApplied: 0, timesRejected: 0, lastAppliedAt: null };
    r.stats.timesRejected += 1;
    await persist();
    audit('cf.rule.rejected', { ruleId: id, expenseId, reason, actor });
    return { ...r };
  }

  function getById(id) { return data.rules.find((r) => r.id === id) || null; }

  function listRules({ enabled, supplier, category, limit = 200 } = {}) {
    let list = [...data.rules];
    if (typeof enabled === 'boolean') list = list.filter((r) => r.enabled === enabled);
    if (supplier) {
      const s = lower(supplier);
      list = list.filter((r) =>
        (r.conditions || []).some((c) => {
          if (c.type === 'supplier_equals') return lower(c.value) === s;
          if (c.type === 'supplier_contains') return s.includes(lower(c.value));
          return false;
        }));
    }
    if (category) list = list.filter((r) => r.setCategory === category);
    list.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    return list.slice(0, Math.max(1, Math.min(1000, limit)));
  }

  function summary() {
    const byCategory = {};
    let active = 0;
    let totalApplied = 0;
    let totalRejected = 0;
    for (const r of data.rules) {
      if (r.enabled !== false) active += 1;
      if (r.setCategory) byCategory[r.setCategory] = (byCategory[r.setCategory] || 0) + 1;
      totalApplied += r.stats?.timesApplied || 0;
      totalRejected += r.stats?.timesRejected || 0;
    }
    return {
      total: data.rules.length,
      active,
      inactive: data.rules.length - active,
      byCategory,
      totalApplied,
      totalRejected,
    };
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    VALID_MATCH_TYPES,
    HIGH_CONFIDENCE_THRESHOLD,
    LOW_CONFIDENCE_THRESHOLD,
    createRule, updateRule, deleteRule,
    recordApplied, recordRejected,
    listRules, getById, summary,
    // engine-funktioner (rena, exposed för enklare smoke-test)
    evaluateAllRules,
    detectRecurring,
    scoreRule,
    buildSuggestionFromRule,
  };
}

module.exports = {
  createCcoExpenseRuleStore,
  evaluateAllRules,
  detectRecurring,
  scoreRule,
  buildSuggestionFromRule,
  VALID_MATCH_TYPES,
  HIGH_CONFIDENCE_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  SCHEMA_VERSION,
};
