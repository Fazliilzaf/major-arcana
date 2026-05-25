#!/usr/bin/env node
/**
 * Validera NOTION_API_KEY + databasåtkomst utan att skriva ut token.
 * Usage: node scripts/check-notion-sync-prereqs.mjs
 */
import 'dotenv/config';

const DB_ID = '7e2211ad-1af3-4d10-9e73-9c330fdce0d0';
const token = String(process.env.NOTION_API_KEY || '').trim();

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

if (!token) {
  fail('NOTION_API_KEY saknas (.env eller miljö). Skapa integration på notion.so/my-integrations och dela databasen.');
}

if (!token.startsWith('secret_') && !token.startsWith('ntn_')) {
  console.warn('⚠ Token-format oväntat (förväntar secret_… eller ntn_…)');
}

const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
  headers: {
    Authorization: `Bearer ${token}`,
    'Notion-Version': '2022-06-28',
  },
});

const data = await res.json().catch(() => ({}));

if (res.status === 401) {
  fail('NOTION_API_KEY ogiltig (401 Unauthorized).');
}
if (res.status === 404) {
  fail(
    'Databas hittades inte (404). Dela "Major Arcana — Master TODO" med integrationen (Connections).'
  );
}
if (!res.ok) {
  fail(`Notion API ${res.status}: ${data.message || 'okänt fel'}`);
}

const title =
  data.title?.map((t) => t.plain_text).join('') ||
  data.title?.[0]?.plain_text ||
  '(okänd titel)';

console.log('✅ NOTION_API_KEY giltig');
console.log(`✅ Databas ${DB_ID} → HTTP ${res.status}`);
console.log(`   Titel: ${title}`);
console.log('   Kör: npm run sync:notion-master-todo');
