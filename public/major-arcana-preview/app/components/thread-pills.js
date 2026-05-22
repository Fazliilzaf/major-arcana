/**
 * app/components/thread-pills.js
 * Fas 5 av Lit-migration — buildSignals utan DOM-beroende.
 *
 * Replikerar logiken i app/signal-bar.js's buildSignals() men opererar på
 * thread-data istället för DOM-element. Detta är vad threadToCardProps
 * använder för att producera card.pills.
 *
 * Inga MutationObservers. Inga DOM-queries. Pure function:
 *   thread → pills array
 *
 * Signal-bar.js bibehålls oförändrad — den kör fortfarande mot DOM:en för
 * legacy cards som inte byggs av Lit-komponenten. När Fas 7 är klar och
 * Lit används överallt → signal-bar.js kan raderas helt.
 */

// ─────────── Color/icon-config (kopia från signal-bar.js) ───────────

const LANES = {
  'act-now':   { label: 'Agera nu',   color: '#EF4444', icon: 'alert' },
  'act_now':   { label: 'Agera nu',   color: '#EF4444', icon: 'alert' },
  'agera-nu':  { label: 'Agera nu',   color: '#EF4444', icon: 'alert' },
  'agera_nu':  { label: 'Agera nu',   color: '#EF4444', icon: 'alert' },
  sprint:      { label: 'Sprint',     color: '#16A34A', icon: 'bolt' },
  bookable:    { label: 'Bokning',    color: '#0891B2', icon: 'calendar' },
  booking:     { label: 'Bokning',    color: '#0891B2', icon: 'calendar' },
  bokning:     { label: 'Bokning',    color: '#0891B2', icon: 'calendar' },
  review:      { label: 'Granska',    color: '#F59E0B', icon: 'eye' },
  granska:     { label: 'Granska',    color: '#F59E0B', icon: 'eye' },
  unclear:     { label: 'Oklart',     color: '#7C3AED', icon: 'question' },
  oklart:      { label: 'Oklart',     color: '#7C3AED', icon: 'question' },
  later:       { label: 'Senare',     color: '#6366F1', icon: 'clock' },
  senare:      { label: 'Senare',     color: '#6366F1', icon: 'clock' },
  admin:       { label: 'Admin',      color: '#64748B', icon: 'gear' },
  medical:     { label: 'Medicinsk',  color: '#EC4899', icon: 'plus' },
  medicinsk:   { label: 'Medicinsk',  color: '#EC4899', icon: 'plus' },
  medicinskt:  { label: 'Medicinsk',  color: '#EC4899', icon: 'plus' },
};

const MAILBOX_COLORS = {
  egzona:  { label: 'Egzona',  color: '#BE2166' },
  contact: { label: 'Kontakt', color: '#4F46E5' },
  kontakt: { label: 'Kontakt', color: '#4F46E5' },
  fazli:   { label: 'Fazli',   color: '#5F2CFF' },
  receipt: { label: 'Kvitto',  color: '#0891B2' },
  kvitto:  { label: 'Kvitto',  color: '#0891B2' },
  info:    { label: 'Info',    color: '#0EA5E9' },
  consult: { label: 'Kons',    color: '#16A34A' },
  kons:    { label: 'Kons',    color: '#16A34A' },
  market:  { label: 'Marknad', color: '#F59E0B' },
  marknad: { label: 'Marknad', color: '#F59E0B' },
};

const KIND_MAP = {
  refresh: { color: '#4F46E5', icon: 'refresh', type: 'status' },
  risk:    { color: '#F59E0B', icon: 'warning', type: 'risk' },
  check:   { color: '#16A34A', icon: 'check',   type: 'status' },
  snooze:  { color: '#EAB308', icon: 'bell',    type: 'snooze' },
  cta:     { color: '#4F46E5', icon: 'refresh', type: 'cta' },
};

// ─────────── Helpers ───────────

function pickFirst(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return '';
}

function normalizeLane(laneId) {
  return String(laneId || '').toLowerCase().replace(/_/g, '-');
}

/**
 * Härled status-pill från thread.whyText/whyKind.
 * Identiskt med signal-bar.js deriveStatusFromWhy men data-driven.
 */
function deriveStatusPill(thread) {
  const txt = pickFirst(thread.whyText, thread.statusReason, thread.why);
  if (!txt) return null;
  const kind = String(thread.whyKind || thread.statusKind || '').toLowerCase();

  // Primär: kind-attribut (stabilt)
  if (kind && KIND_MAP[kind]) {
    return {
      label: txt.length > 24 ? `${txt.slice(0, 22)}…` : txt,
      ...KIND_MAP[kind],
    };
  }

  // Fallback: regex-matchning (samma som signal-bar.js)
  if (/svar krävs|behöver svar|^svara nu$/i.test(txt)) {
    return { label: 'Svara nu', color: '#4F46E5', icon: 'refresh', type: 'status' };
  }
  if (/^svara$/i.test(txt)) {
    return { label: 'Svara', color: '#4F46E5', icon: 'refresh', type: 'status' };
  }
  if (/granska/i.test(txt)) {
    return { label: 'Granska', color: '#F59E0B', icon: 'eye', type: 'status' };
  }
  if (/bekräfta/i.test(txt)) {
    return { label: 'Bekräfta', color: '#16A34A', icon: 'check', type: 'status' };
  }
  if (/pågår|in.progress/i.test(txt)) {
    return { label: 'Pågår', color: '#6366F1', icon: 'bolt', type: 'status' };
  }
  if (/miss.risk/i.test(txt)) {
    return { label: 'Miss-risk', color: '#F59E0B', icon: 'warning', type: 'risk' };
  }
  if (/hög risk/i.test(txt)) {
    return { label: 'Hög risk', color: '#EF4444', icon: 'warning', type: 'risk' };
  }
  if (/otillgänglig/i.test(txt)) {
    return { label: 'Otillgänglig', color: '#94A3B8', icon: 'warning', type: 'status' };
  }
  if (/tid kan erbjudas|redo att boka/i.test(txt)) {
    return { label: txt.slice(0, 24), color: '#16A34A', icon: 'check', type: 'status' };
  }
  return { label: txt.slice(0, 24), color: '#4F46E5', icon: 'refresh', type: 'status' };
}

function laneToKey(addr) {
  return String(addr || '').split('@')[0].toLowerCase().trim();
}

// ─────────── Huvud-export ───────────

/**
 * Pure function: thread-objekt → pills-array.
 * Replikerar 8 pill-typer från signal-bar.js's buildSignals.
 */
export function buildPillsFromThread(thread) {
  if (!thread || typeof thread !== 'object') return [];
  const out = [];
  const seenTypes = new Set();
  const seenLabels = new Set();

  const pushPill = (pill) => {
    out.push(pill);
    seenTypes.add(pill.type);
    if (pill.label) seenLabels.add(String(pill.label).toLowerCase());
  };

  // 1) Status från whyText/whyKind
  const status = deriveStatusPill(thread);
  if (status) pushPill(status);

  // 2) Lane
  const laneKey = normalizeLane(thread.primaryLaneId || thread.laneId || thread.lane);
  const lane = LANES[laneKey];
  if (lane) {
    pushPill({ ...lane, type: 'lane' });
  }

  // 3) Risk-tags från runtimeTags
  const tags = String(thread.runtimeTags || (thread.tags || []).join(',')).toLowerCase();
  if (/high-risk|hög.risk/.test(tags) && !seenLabels.has('hög risk')) {
    pushPill({ label: 'Hög risk', color: '#EF4444', icon: 'warning', type: 'risk' });
  } else if (/miss.risk/.test(tags) && !seenLabels.has('miss-risk')) {
    pushPill({ label: 'Miss-risk', color: '#F59E0B', icon: 'warning', type: 'risk' });
  }

  // 4) Mailbox — multi om cross, single annars
  let mailboxAddresses = [];
  if (Array.isArray(thread.mailboxAddresses)) {
    mailboxAddresses = thread.mailboxAddresses.filter(Boolean);
  } else if (typeof thread.mailboxAddresses === 'string') {
    mailboxAddresses = thread.mailboxAddresses.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (mailboxAddresses.length < 2 && Array.isArray(thread.mailboxTrail)) {
    const trail = thread.mailboxTrail
      .map((label) => String(label).toLowerCase().trim())
      .filter(Boolean);
    if (trail.length > 1) mailboxAddresses = trail;
  }

  if (mailboxAddresses.length > 1) {
    // Cross-mailbox: en pill per unik mailbox
    const sorted = mailboxAddresses.slice().sort((a, b) => {
      const ka = laneToKey(a);
      const kb = laneToKey(b);
      if (/^contact|kontakt/.test(ka)) return -1;
      if (/^contact|kontakt/.test(kb)) return 1;
      return 0;
    });
    const seenKeys = new Set();
    sorted.forEach((addr) => {
      const key = laneToKey(addr);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      const m = MAILBOX_COLORS[key];
      if (m) pushPill({ ...m, icon: 'inbox', type: 'mailbox' });
    });
  } else {
    // Single mailbox
    const key = laneToKey(
      pickFirst(thread.mailboxKey, thread.mailboxId, thread.mailboxLabel),
    );
    const m = MAILBOX_COLORS[key];
    if (m) pushPill({ ...m, icon: 'inbox', type: 'mailbox' });
  }

  // 5) Ägare
  const owner = pickFirst(thread.displayOwnerLabel, thread.ownerLabel, thread.owner);
  if (owner) {
    if (/ej.tilldelad|oägd|unassigned/i.test(owner)) {
      pushPill({ label: 'Ej tilldelad', color: '#F59E0B', icon: 'userQuestion', type: 'owner' });
    } else if (owner.length < 18) {
      pushPill({ label: owner, color: '#64748B', icon: 'user', type: 'owner' });
    }
  }

  // 6) AI-utkast
  if (thread.hasAiDraft || thread.aiDraft || thread.draftPill) {
    pushPill({ label: 'AI-utkast', color: '#EC4899', icon: 'sparkle', type: 'ai' });
  }

  // 7) Snooze / Återkommer
  if (thread.isSnoozed || thread.snoozed) {
    if (!seenTypes.has('snooze')) {
      pushPill({ label: 'Snooze', color: '#EAB308', icon: 'bell', type: 'snooze' });
    }
  }
  if (thread.isJustReturned || thread.justReturned) {
    pushPill({ label: 'Återkommer', color: '#3B82F6', icon: 'undo', type: 'returned' });
  }

  // Customer-cluster
  const clusterCount = Number(thread.customerClusterCount || thread.ccClusterSize || 0);
  const isPrimary =
    thread.ccClusterRole === 'primary' ||
    thread.customerClusterRole === 'primary' ||
    clusterCount > 1;
  if (isPrimary && clusterCount > 1) {
    pushPill({
      label: `${clusterCount} trådar`,
      color: '#7C3AED',
      icon: 'inbox',
      type: 'cluster',
    });
  }

  // System-mail label
  if (thread.systemMailLabel) {
    pushPill({
      label: thread.systemMailLabel,
      color: '#64748B',
      icon: 'gear',
      type: 'system-mail',
    });
  }

  // 8) Next-action CTA
  const ctaText = pickFirst(thread.nextAction, thread.ctaLabel, thread.cta);
  if (ctaText && String(ctaText).length < 30 && !seenLabels.has(String(ctaText).toLowerCase())) {
    if (/svara nu|svar krävs/i.test(ctaText)) {
      pushPill({ label: 'Svara nu', color: '#4F46E5', icon: 'refresh', type: 'cta' });
    } else if (/granska/i.test(ctaText)) {
      pushPill({ label: ctaText, color: '#F59E0B', icon: 'eye', type: 'cta' });
    } else if (/bekräfta|boka/i.test(ctaText)) {
      pushPill({ label: ctaText, color: '#16A34A', icon: 'check', type: 'cta' });
    }
  }

  return out;
}

// Exponera för debug
if (typeof window !== 'undefined') {
  window.__buildPillsFromThread = buildPillsFromThread;
}
