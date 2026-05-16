/**
 * app/components/customer-cluster-grouper.js
 * Fas 7 av Lit-migration — customer-cluster utan DOM-beroende.
 *
 * Replikerar logiken i app/customer-cluster.js's scanAndCluster() men
 * opererar på thread-objekt istället för DOM-element. Returnerar ett
 * grouping-result som en parent-komponent kan använda för att rendera
 * primary/sub-cards med rätt klasser och expanded-state.
 *
 * Inga MutationObservers. Inga DOM-queries. Pure function:
 *   (threads, expandedKeys) → { groups, threadStateById }
 *
 * Persistens av expanded-state hanteras av caller (lit-switchover.js)
 * via localStorage med SAMMA key som customer-cluster.js använder
 * (cco.customerCluster.expanded.v1) → båda systemen hålls i sync så
 * legacy-cards och Lit-cards har samma expand/collapse-tillstånd.
 *
 * customer-cluster.js bibehålls oförändrad — den kör fortfarande mot
 * DOM:en för legacy cards som inte byggs av Lit-komponenten. När Fas 8-9
 * är klara och Lit används överallt → customer-cluster.js kan raderas helt.
 */

const LS_KEY = 'cco.customerCluster.expanded.v1';

// ─────────── localStorage helpers (samma format som customer-cluster.js) ───────────

/**
 * Läs expanded-keys från localStorage.
 * Returnerar Set<string>.
 */
export function readExpandedKeys() {
  if (typeof localStorage === 'undefined') return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) || '[]'));
  } catch (_e) {
    return new Set();
  }
}

/**
 * Skriv expanded-keys till localStorage.
 */
export function writeExpandedKeys(set) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(Array.from(set)));
  } catch (_e) {}
}

/**
 * Toggle expanded-state för en cluster-key.
 * Returnerar nya Set:et (också persisterat).
 */
export function toggleExpanded(key) {
  const next = readExpandedKeys();
  if (next.has(key)) next.delete(key);
  else next.add(key);
  writeExpandedKeys(next);
  return next;
}

// ─────────── Helpers för key-extraction ───────────

const MAILBOX_LABELS = new Set([
  'egzona', 'kontakt', 'contact', 'fazli', 'kvitto', 'receipt',
  'info', 'kons', 'consult', 'marknad', 'market',
]);

const FALLBACK_LABELS = new Set([
  'okänd avsändare', 'okand avsandare', 'unknown sender', 'unknown',
  'no sender', 'okänd', 'okand', 'utan avsändare', 'utan avsandare',
]);

function pickFirst(...vals) {
  for (const v of vals) {
    if (v != null && String(v).trim() !== '') return v;
  }
  return '';
}

/**
 * Härled customer-key från thread-objekt (legacy-fallback när server
 * inte gett ccClusterGroup). Returnerar null om threadet inte ska
 * grupperas (t.ex. fallback-sender, mailbox-namn, för kort/för långt).
 *
 * Replikerar customerKeyFromCard() i customer-cluster.js.
 */
function customerKeyFromThread(thread) {
  const explicit = pickFirst(thread.customerKey, thread.customerEmail);
  if (explicit) return String(explicit).toLowerCase().trim();

  const senderText = String(
    pickFirst(thread.sender, thread.customerName, thread.fromName) || ''
  ).toLowerCase().trim();

  if (senderText && senderText.length > 1 && senderText.length < 60) {
    if (MAILBOX_LABELS.has(senderText)) return null;
    if (FALLBACK_LABELS.has(senderText)) return null;
    return `sender:${senderText}`;
  }

  const id = String(pickFirst(thread.id, thread.conversationId) || '');
  const prefix = id.split(':')[0].toLowerCase();
  if (prefix && prefix.length > 3 && prefix !== 'runtime-unified-empty') {
    return `email:${prefix}`;
  }
  return null;
}

// ─────────── Huvud-export: pure grouper ───────────

/**
 * Gruppera threads per kund.
 *
 * Inputs:
 *   threads: Array<thread-object>  (samma form som threadToCardProps tar in,
 *                                   eller card-props med id/sender)
 *   expandedKeys: Set<string>      (från readExpandedKeys())
 *
 * Output:
 *   {
 *     groups: Array<{
 *       key: string,
 *       isExpanded: boolean,
 *       count: number,
 *       primary: thread,
 *       subs: Array<thread>,
 *     }>,
 *     ungrouped: Array<thread>,    (threads utan cluster eller med cluster-storlek 1)
 *     threadStateById: Map<id, { role: 'primary'|'sub'|null, key, count, isExpanded, hidden }>
 *   }
 *
 * threadStateById är en convenience så caller snabbt kan slå upp en
 * cards roll utan att traverse-a groups-arrayen.
 *
 * Två-tier prio:
 *   1. Server-styrd via ccClusterGroup/ccClusterRole/ccClusterSize
 *   2. Legacy: customerKeyFromThread heuristik (sender-text / email-prefix)
 */
export function groupThreadsByCustomer(threads, expandedKeys) {
  const expanded = expandedKeys instanceof Set ? expandedKeys : new Set();
  const list = Array.isArray(threads) ? threads : [];

  const groups = [];
  const ungrouped = [];
  const threadStateById = new Map();

  // ── 1) Server-styrd gruppering ──
  const serverGroups = new Map();
  const serverHandled = new Set();

  for (const t of list) {
    const gid = pickFirst(t.ccClusterGroup, t.customerClusterGroup);
    if (!gid) continue;
    if (!serverGroups.has(gid)) serverGroups.set(gid, []);
    serverGroups.get(gid).push(t);
    serverHandled.add(t);
  }

  for (const [gid, groupThreads] of serverGroups) {
    if (groupThreads.length < 2) {
      // Singleton → behandla som ungrouped
      groupThreads.forEach((t) => serverHandled.delete(t));
      continue;
    }
    const isExpanded = expanded.has(gid);
    const primary =
      groupThreads.find(
        (t) => (t.ccClusterRole || t.customerClusterRole) === 'primary',
      ) || groupThreads[0];
    const subs = groupThreads.filter((t) => t !== primary);
    const sizeHint = Number(
      primary.ccClusterSize || primary.customerClusterCount || 0,
    );
    const count = sizeHint > 0 ? sizeHint : groupThreads.length;

    groups.push({ key: gid, isExpanded, count, primary, subs });

    threadStateById.set(idOf(primary), {
      role: 'primary', key: gid, count, isExpanded, hidden: false,
    });
    subs.forEach((sub) => {
      threadStateById.set(idOf(sub), {
        role: 'sub', key: gid, count: 0, isExpanded, hidden: !isExpanded,
      });
    });
  }

  // ── 2) Legacy heuristik för cards utan ccClusterGroup ──
  const legacyCandidates = list.filter((t) => !serverHandled.has(t));
  const legacyGroups = new Map();
  for (const t of legacyCandidates) {
    const key = customerKeyFromThread(t);
    if (!key) continue;
    if (!legacyGroups.has(key)) legacyGroups.set(key, []);
    legacyGroups.get(key).push(t);
  }

  const legacyHandled = new Set();
  for (const [key, groupThreads] of legacyGroups) {
    if (groupThreads.length < 2) continue;
    const isExpanded = expanded.has(key);
    const primary = groupThreads[0];
    const subs = groupThreads.slice(1);
    const count = groupThreads.length;

    groups.push({ key, isExpanded, count, primary, subs });

    threadStateById.set(idOf(primary), {
      role: 'primary', key, count, isExpanded, hidden: false,
    });
    subs.forEach((sub) => {
      threadStateById.set(idOf(sub), {
        role: 'sub', key, count: 0, isExpanded, hidden: !isExpanded,
      });
    });
    groupThreads.forEach((t) => legacyHandled.add(t));
  }

  // ── 3) Ungrouped: allt som inte hamnade i grupp ──
  for (const t of list) {
    const id = idOf(t);
    if (!threadStateById.has(id)) {
      ungrouped.push(t);
      threadStateById.set(id, {
        role: null, key: null, count: 0, isExpanded: false, hidden: false,
      });
    }
  }

  return { groups, ungrouped, threadStateById };
}

function idOf(thread) {
  return String(
    pickFirst(thread.id, thread.conversationId, thread.messageId, thread.customerEmail)
    || Math.random().toString(36).slice(2),
  );
}

// ─────────── Convenience: rendrings-ordning ───────────

/**
 * Returnera threads i rätt rendrings-ordning:
 * primary följs direkt av sina subs (synliga eller hidden).
 * Ungrouped threads behåller sin originalordning relativt de andra.
 *
 * Användbart för en parent-komponent som vill rendera en flat lista
 * men i cluster-grupperad ordning.
 */
export function orderForRender(threads, grouped) {
  const groups = grouped?.groups || [];
  const handled = new Set();
  const ordered = [];

  // Bygg lookup: id → group
  const primaryToGroup = new Map();
  for (const g of groups) {
    primaryToGroup.set(idOf(g.primary), g);
    g.subs.forEach((s) => handled.add(idOf(s)));
  }

  for (const t of threads) {
    const id = idOf(t);
    if (handled.has(id)) continue; // sub renderas direkt efter primary
    if (primaryToGroup.has(id)) {
      const g = primaryToGroup.get(id);
      ordered.push(g.primary);
      g.subs.forEach((s) => ordered.push(s));
      handled.add(id);
    } else {
      ordered.push(t);
    }
  }

  return ordered;
}

// ─────────── Debug-export ───────────
if (typeof window !== 'undefined') {
  window.__customerClusterGrouper = {
    group: groupThreadsByCustomer,
    order: orderForRender,
    readExpandedKeys,
    writeExpandedKeys,
    toggleExpanded,
  };
}
