/**
 * app/components/thread-to-card-props.js
 * Fas 3 av Lit-migration — adapter mellan dagens worklist-API thread-objekt
 * och arcana-thread-card-komponentens props.
 *
 * Tar ett thread (sådant som app.js's buildQueueHistoryItems producerar) och
 * returnerar en flat card-props-form:
 *   { id, sender, subject, preview, lane, time, owner, pills, systemMailLabel }
 *
 * Replikerar logik från:
 *   - app/signal-bar.js's buildSignals (för pills)
 *   - app/system-mail-display.js (för systemMailLabel + sender-fallback)
 *   - app/customer-cluster.js (för cluster-pill när primary)
 *   - app.js's getQueueHistoryCounterpartyLabel (för sender)
 *
 * Använding:
 *   import { threadToCardProps } from './thread-to-card-props.js';
 *   const props = threadToCardProps(threadFromApi);
 *   document.querySelector('arcana-thread-card').thread = props;
 */

// --- Lane-färger (samma som signal-bar.js) ---
const LANE_META = {
  'act-now':   { label: 'Agera nu',  color: '#ef4444' },
  'act_now':   { label: 'Agera nu',  color: '#ef4444' },
  'agera-nu':  { label: 'Agera nu',  color: '#ef4444' },
  sprint:      { label: 'Sprint',    color: '#16a34a' },
  bookable:    { label: 'Bokning',   color: '#0891b2' },
  bokning:     { label: 'Bokning',   color: '#0891b2' },
  review:      { label: 'Granska',   color: '#f59e0b' },
  granska:     { label: 'Granska',   color: '#f59e0b' },
  unclear:     { label: 'Oklart',    color: '#7c3aed' },
  oklart:      { label: 'Oklart',    color: '#7c3aed' },
  later:       { label: 'Senare',    color: '#6366f1' },
  senare:      { label: 'Senare',    color: '#6366f1' },
  admin:       { label: 'Admin',     color: '#64748b' },
  medical:     { label: 'Medicinsk', color: '#ec4899' },
  medicinsk:   { label: 'Medicinsk', color: '#ec4899' },
};

const MAILBOX_META = {
  egzona:  { label: 'Egzona',  color: '#be2166' },
  contact: { label: 'Kontakt', color: '#4f46e5' },
  kontakt: { label: 'Kontakt', color: '#4f46e5' },
  fazli:   { label: 'Fazli',   color: '#5f2cff' },
  receipt: { label: 'Kvitto',  color: '#0891b2' },
  kvitto:  { label: 'Kvitto',  color: '#0891b2' },
  info:    { label: 'Info',    color: '#0ea5e9' },
  consult: { label: 'Kons',    color: '#16a34a' },
  kons:    { label: 'Kons',    color: '#16a34a' },
  market:  { label: 'Marknad', color: '#f59e0b' },
  marknad: { label: 'Marknad', color: '#f59e0b' },
};

function normalizeKey(s) {
  return String(s || '').trim().toLowerCase();
}

function pickFirst(...values) {
  for (const v of values) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return '';
}

function laneMeta(laneId) {
  return LANE_META[normalizeKey(laneId)] || null;
}

function mailboxMeta(mailboxKey) {
  return MAILBOX_META[normalizeKey(mailboxKey)] || null;
}

/**
 * Hitta systemMailLabel + ev. customerName via window-parsern.
 * Returnerar { sender, systemMailLabel } eller null om parsern inte
 * är laddad eller om inputen inte ser ut som system-mail.
 */
function applySystemMailParser(thread) {
  if (typeof window === 'undefined') return null;
  const parser = window.MajorArcanaSystemMailParser;
  if (!parser || typeof parser.parse !== 'function') return null;

  const senderEmail = pickFirst(
    thread.customerEmail,
    thread.fromEmail,
    thread.from?.address,
    thread.from?.emailAddress?.address,
    thread.raw?.from?.address,
    thread.raw?.latestMessage?.from?.address,
  );
  const senderName = pickFirst(
    thread.customerName,
    thread.fromName,
    thread.from?.name,
    thread.raw?.from?.name,
  );

  if (typeof parser.isSystemSender === 'function') {
    if (!parser.isSystemSender(senderEmail, senderName)) return null;
  }

  const subject = pickFirst(thread.subject, thread.displaySubject, thread.title);
  const body = pickFirst(thread.preview, thread.systemPreview, thread.detail);
  const result = parser.parse({ senderEmail, senderName, subject, body });
  if (!result) return null;

  let sender = result.customerName;
  if (!sender && result.systemLabel) {
    // Fallback: visa system-namn (Klarna, Cliento) istället för "No Reply"
    sender = String(result.systemLabel).replace(/^via\s+/i, '');
  }
  return {
    sender: sender || null,
    systemMailLabel: result.systemLabel || null,
  };
}

/**
 * Bygg pills-array från thread. Replikerar förenklat buildSignals från
 * signal-bar.js. Pillar adderas baserat på thread-fält + härledda flags.
 */
function buildPills(thread) {
  const pills = [];

  // 1. Status / "Behöver svar"
  const why = pickFirst(thread.whyText, thread.statusReason);
  if (why) {
    const lower = String(why).toLowerCase();
    let color = '#4f46e5';
    if (/miss|risk|hög/i.test(lower)) color = '#ef4444';
    else if (/snart|approach/i.test(lower)) color = '#f59e0b';
    else if (/agera/i.test(lower)) color = '#dc2626';
    pills.push({ type: 'status', label: why, color });
  }

  // 2. Lane-pill
  const lane = laneMeta(thread.primaryLaneId || thread.laneId || thread.lane);
  if (lane) {
    pills.push({ type: 'lane', label: lane.label, color: lane.color });
  }

  // 3. Mailbox-pill (om vi har mailbox-info)
  const mailbox = mailboxMeta(thread.mailboxLabel || thread.mailbox);
  if (mailbox && !thread.crossMailboxProvenanceEvidence) {
    pills.push({ type: 'mailbox', label: mailbox.label, color: mailbox.color });
  }

  // 4. Cross-mailbox-pill
  if (thread.crossMailboxProvenanceEvidence || thread.mailboxProvenanceEvidence) {
    const trail = Array.isArray(thread.mailboxTrail) ? thread.mailboxTrail.slice(0, 2) : [];
    if (trail.length >= 2) {
      pills.push({
        type: 'mailbox',
        label: trail.join(' + '),
        color: '#ec4899',
      });
    }
  }

  // 5. Owner-pill
  const owner = pickFirst(thread.displayOwnerLabel, thread.ownerLabel);
  if (owner && /tilldelad|unassigned/i.test(owner)) {
    pills.push({ type: 'owner', label: 'Ej tilldelad', color: '#64748b' });
  }

  // 6. Cluster-pill (om cluster-primary)
  if (
    thread.customerClusterCount > 1 ||
    thread.ccClusterRole === 'primary'
  ) {
    const count = thread.customerClusterCount || thread.ccClusterSize || 0;
    if (count > 1) {
      pills.push({
        type: 'cluster',
        label: `${count} trådar`,
        color: '#7c3aed',
      });
    }
  }

  // 7. AI-utkast
  if (thread.hasAiDraft || thread.draftPill) {
    pills.push({ type: 'ai', label: 'AI-utkast', color: '#ec4899' });
  }

  // 8. Snooze
  if (thread.isSnoozed) {
    pills.push({ type: 'snooze', label: 'Snooze', color: '#eab308' });
  }

  return pills;
}

/**
 * Huvud-adapter: thread (API-format) → komponent-props.
 */
export function threadToCardProps(thread) {
  if (!thread || typeof thread !== 'object') {
    return {
      id: '',
      sender: 'Okänd avsändare',
      subject: '',
      preview: '',
      lane: '',
      time: '',
      owner: 'Ej tilldelad',
      pills: [],
      systemMailLabel: null,
    };
  }

  // Sender — prio: parser-resolved > customerName > fromName > email-localpart
  const parsed = applySystemMailParser(thread);
  let sender = parsed?.sender || pickFirst(
    thread.counterpartyLabel,
    thread.customerName,
    thread.fromName,
    thread.from?.name,
  );
  const email = pickFirst(thread.customerEmail, thread.from?.address);
  if (!sender && email) {
    sender = String(email).split('@')[0];
  }
  sender = sender || 'Okänd avsändare';

  const systemMailLabel =
    parsed?.systemMailLabel ||
    thread.systemMailLabel ||
    null;

  // Lane-string (för CSS-färg på vänster border)
  const lane = pickFirst(thread.primaryLaneId, thread.laneId, thread.lane);

  return {
    id: pickFirst(thread.id, thread.conversationId, thread.messageId),
    sender,
    subject: pickFirst(thread.displaySubject, thread.subject, thread.title),
    preview: pickFirst(thread.preview, thread.systemPreview, thread.detail),
    lane,
    time: pickFirst(thread.lastActivityLabel, thread.time, thread.timeLabel),
    owner: pickFirst(thread.displayOwnerLabel, thread.ownerLabel, 'Ej tilldelad'),
    pills: buildPills(thread),
    systemMailLabel,
  };
}

/**
 * Convenience: skapa ett <arcana-thread-card> element från ett API-thread.
 */
export function createCardElement(thread) {
  const el = document.createElement('arcana-thread-card');
  el.thread = threadToCardProps(thread);
  return el;
}

// Exponera för debug + integration från icke-ESM-kod
if (typeof window !== 'undefined') {
  window.__threadToCardProps = threadToCardProps;
  window.__createArcanaCardElement = createCardElement;
}
