#!/usr/bin/env node
/**
 * Synka Notion "Major Arcana — Master TODO" från inbyggd lista (NOTION-SYNC-MANIFEST).
 * Kräver integration: NOTION_API_KEY i .env (secret_… från notion.so/my-integrations).
 *
 * Usage:
 *   NOTION_API_KEY=secret_… node scripts/sync-notion-master-todo.mjs
 *   NOTION_API_KEY=secret_… node scripts/sync-notion-master-todo.mjs --dry-run
 */
import 'dotenv/config';

const DRY = process.argv.includes('--dry-run');
const token = String(process.env.NOTION_API_KEY || '').trim();
const DB_ID = '7e2211ad-1af3-4d10-9e73-9c330fdce0d0';

const UPDATES = [
  {
    pageId: '36a060ccc15b815da38dddb69e5e91d7',
    Task: 'Drive-PDF på prod (Google Drive API)',
    Status: 'Done',
    Notes: 'U3.1+U3.2: 56554/57558 driveFileId (98%+). verify:migration-prod PASS.',
  },
  {
    pageId: '36a060ccc15b8198879effd097165b4d',
    Task: 'Verify prod efter Render duplicate-cleanup',
    Status: 'Done',
    Notes: '7219 kunder, needsReview 0. verify:migration-prod PASS.',
  },
  {
    pageId: '36a060ccc15b815886c7cb403c841807',
    Task: 'Pipedrive People+Deals export',
    Status: 'Done',
    Notes: '3362 pipedriveLinked prod. UI+merge.',
  },
  {
    pageId: '36a060ccc15b81f58133f064ab8abc8d',
    Task: 'MA-6.2 E2E pilot 5/5 prod',
    Status: 'Done',
    Notes: '5/5 PASS 2026-05-25. E2E återställning efter journal-push. MA-B.3/C.2/D OK.',
  },
  {
    pageId: '36a060ccc15b819abadbc37d21878f16',
    Task: 'Rollback-plan + underhållsfönster dokumenterat',
    Status: 'Done',
    Notes: 'auth-go-live-rollback-runbook.md',
  },
  {
    pageId: '36a060ccc15b8175a2efe48ce46f997d',
    Task: 'Underhållsfönster i produkt (P2)',
    Status: 'Done',
    Notes: 'GET /ops/maintenance-window + STAFF-banner.',
  },
  {
    pageId: '36a060ccc15b8199bdfcc893d723d388',
    Task: 'Plan A valfritt: Resend patient-mail + bokning→journal',
    Status: 'In progress',
    Notes: 'J-6.3 Done. Resend Blocked tills RESEND_API_KEY på Render.',
  },
  {
    pageId: '36a060ccc15b81efb78ad36a33abb1ac',
    Task: 'Mobil UX sweep #1–16 (kod + prod)',
    Status: 'Done',
    Notes: 'verify:cco-mobile-pilot-prod PASS.',
  },
  {
    pageId: '36a060ccc15b812a95f7ff7a0c6847c2',
    Task: 'Post-op Fas 1 — 4 beslut + Graph live + smoke',
    Status: 'Done',
    Notes: 'U4.4–U4.6 PASS.',
  },
];

const CREATE = [
  {
    Task: 'J-6.3 Bokning → journal (prod)',
    Status: 'Done',
    Area: 'Booking',
    Priority: 'P1',
    Owner: 'Agent',
    Notes: 'ccoJournalBookingBridge live. Plan A E2E PASS.',
  },
  {
    Task: 'J-7 Påminnelser (scheduler + operatör-digest)',
    Status: 'Done',
    Area: 'Booking',
    Priority: 'P2',
    Owner: 'Agent',
    Notes: 'cco_customer_reminders. Ej patient-SMS.',
  },
  {
    Task: 'J-8 CCO-care (formulär + draft-godkännande)',
    Status: 'Done',
    Area: 'Backlog',
    Priority: 'P1',
    Owner: 'Agent',
    Notes: 'Scheduler + ops API + UI. Ej full autonom agent.',
  },
  {
    Task: 'TL-B Tidslinje tillfälle (foto + flik)',
    Status: 'Done',
    Area: 'Pilot',
    Priority: 'P1',
    Owner: 'Agent',
    Notes: 'syncConsultationPhotoToEncounter + Tidslinje-flik.',
  },
  {
    Task: 'TL-C Journal per tillfälle (gruppering)',
    Status: 'Done',
    Area: 'Pilot',
    Priority: 'P2',
    Owner: 'Agent',
    Notes: 'Journaltyper grupperade per tillfälle i UI.',
  },
  {
    Task: 'U3.2 Drive enrich 98% (~1004 kvar)',
    Status: 'In progress',
    Area: 'Infra',
    Priority: 'P1',
    Owner: 'Agent',
    Notes: '56554/57558 driveFileId. Push endast --index-only.',
  },
  {
    Task: 'U5A.4 Resend patient-mail',
    Status: 'Blocked',
    Area: 'Booking',
    Priority: 'P1',
    Owner: 'Du',
    Notes: 'RESEND_API_KEY saknas på Render. Se docs/ops/resend-domain-go-live.md',
  },
  {
    Task: 'U2.2 OWNER MFA enforced prod',
    Status: 'In progress',
    Area: 'Auth',
    Priority: 'P1',
    Owner: 'Du',
    Notes: 'Kör npm run apply:auth-go-live-prod när redo.',
  },
];

async function notion(path, { method = 'GET', body } = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.message || JSON.stringify(data)}`);
  return data;
}

function props(row) {
  const p = {
    Task: { title: [{ text: { content: row.Task } }] },
    Status: { select: { name: row.Status } },
    Notes: { rich_text: [{ text: { content: String(row.Notes || '').slice(0, 2000) } }] },
  };
  if (row.Area) p.Area = { select: { name: row.Area } };
  if (row.Priority) p.Priority = { select: { name: row.Priority } };
  if (row.Owner) p.Owner = { select: { name: row.Owner } };
  return p;
}

async function main() {
  if (!token) {
    console.error('❌ Saknar NOTION_API_KEY. Skapa integration på notion.so/my-integrations, dela DB, lägg i .env');
    console.error('   Alternativ: Cursor MCP → Notion → koppla om, eller manuell sync via NOTION-SYNC-MANIFEST.md');
    process.exit(1);
  }

  for (const row of UPDATES) {
    const id = row.pageId.replace(/-/g, '');
    console.log(`${DRY ? '[dry-run] ' : ''}update ${row.Task} → ${row.Status}`);
    if (!DRY) await notion(`/pages/${id}`, { method: 'PATCH', body: { properties: props(row) } });
  }

  for (const row of CREATE) {
    console.log(`${DRY ? '[dry-run] ' : ''}create ${row.Task}`);
    if (!DRY) {
      await notion('/pages', {
        method: 'POST',
        body: { parent: { database_id: DB_ID }, properties: props(row) },
      });
    }
  }

  console.log('✅ Notion sync klar');
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
