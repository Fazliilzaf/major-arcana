#!/usr/bin/env node
'use strict';

/**
 * Markera legacy-bokningsarenden med RFC-2606-testadresser (example.com,
 * example.org, example.net, .invalid) som isTestData = true.
 *
 * Default: torrkorning. Inga skrivningar gors.
 * --commit: skarpt lage. Backup tas automatiskt fore skrivning.
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const TEST_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'example.invalid',
  'invalid',
]);

function isTestEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at < 0) return false;
  const domain = normalized.slice(at + 1);
  // RFC 2606: *.example, *.invalid, *.test, *.localhost, *.local
  if (TEST_DOMAINS.has(domain)) return true;
  if (domain.endsWith('.example') || domain.endsWith('.invalid') || domain.endsWith('.test')) {
    return true;
  }
  return false;
}

function isTestDataCase(bookingCase) {
  if (isTestEmail(bookingCase.customerEmail)) return true;
  return false;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes('--commit');
  const stateRoot = process.env.ARCANA_STATE_ROOT || '/var/data';
  const filePath = path.join(stateRoot, 'cco-booking.json');

  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    console.error(`Kunde inte lasa ${filePath}:`, err.message);
    process.exit(1);
  }

  const data = JSON.parse(raw);
  const cases = Array.isArray(data?.cases) ? data.cases : [];

  const toMark = [];
  const alreadyMarked = [];

  for (const bookingCase of cases) {
    if (bookingCase.isTestData) {
      alreadyMarked.push(bookingCase.bookingCaseId || bookingCase.conversationId);
      continue;
    }
    if (isTestDataCase(bookingCase)) {
      toMark.push(bookingCase.bookingCaseId || bookingCase.conversationId || bookingCase.customerEmail);
    }
  }

  console.log(`Legacy-bokningsarenden totalt: ${cases.length}`);
  console.log(`Redan markerade:               ${alreadyMarked.length}`);
  console.log(`Att markera:                   ${toMark.length}`);

  if (!commit) {
    console.log('\nTorrkorning. Kor med --commit for att skriva.');
    console.log('Exempel pa adresser som skulle markeras:');
    toMark.slice(0, 10).forEach((id) => console.log(`  - ${id}`));
    return;
  }

  if (toMark.length === 0) {
    console.log('Inget att markera. Avslutar.');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${filePath}.pre-testdata-flag-${timestamp}.json`;
  await fs.copyFile(filePath, backupPath);
  console.log(`Backup skapad: ${backupPath}`);

  let markedCount = 0;
  for (const bookingCase of cases) {
    if (!bookingCase.isTestData && isTestDataCase(bookingCase)) {
      bookingCase.isTestData = true;
      markedCount += 1;
    }
  }

  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  // Oberoende efterkontroll: las tillbaka filen och rakna.
  const verifyRaw = await fs.readFile(filePath, 'utf8');
  const verifyData = JSON.parse(verifyRaw);
  const verifyCases = Array.isArray(verifyData?.cases) ? verifyData.cases : [];
  const verifiedMarked = verifyCases.filter((c) => c.isTestData).length;
  const verifiedToMark = verifyCases.filter((c) => isTestDataCase(c)).length;

  console.log(`Markerade: ${markedCount}`);
  console.log(`Efterkontroll: ${verifiedMarked} arenden har isTestData=true, ${verifiedToMark} matchar testkriteriet.`);

  if (verifiedMarked !== verifiedToMark) {
    console.error('EFTERKONTROLLEN MISSLYCKADES.');
    console.error(`Aterstall med: cp ${backupPath} ${filePath}`);
    process.exit(1);
  }

  console.log('OK. Kom ihag att starta om tjansten sa att in-memory state lases in pa nytt.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
