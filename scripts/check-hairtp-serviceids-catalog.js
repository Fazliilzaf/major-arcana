#!/usr/bin/env node

'use strict';

/**
 * CLI: Kör `serviceIds`-valideringen mot katalogen.
 *
 * Dokumentationen till arbetsbladet och kopplingen finns i
 * MASTERPLAN-CCO-2026-08-27.md (DEL V · steg 1, DEL X · steg 4).
 * Datan i `serviceIds` fylls ur underlag-per-tjanst-ARBETSBLAD.csv av Fazli.
 * Det här skriptet utför datan aldrig — det varnar bara när arbetsbladet
 * är ifyllt men en katalograd saknar `serviceIds`.
 *
 * Användning:
 *   node scripts/check-hairtp-serviceids-catalog.js [arbetsblad.csv]
 *   UNDERLAG_PER_TJANST_CSV=/sok/stig/arbetsblad.csv node scripts/check-...
 *
 * Exit:
 *   0 — arbetsbladet saknas/tomt (inget att validera) ELLER allt OK.
 *   1 — arbetsbladet är ifyllt men en eller flera katalograder saknar serviceIds.
 */

const { validate } = require('../src/ops/ccoServiceIdsCatalogValidator');

const override = process.env.UNDERLAG_PER_TJANST_CSV || process.argv[2];
const result = validate({ workbookPath: override });

if (!result.workbookFound) {
  console.log(
    '[serviceIds] Arbetsbladet underlag-per-tjanst-ARBETSBLAD.csv finns inte än — inget att validera (Fazli fyller datan).'
  );
  process.exit(0);
}

if (!result.workbookFilled) {
  console.log(
    '[serviceIds] Arbetsbladet är tomt (inga datarader) — inget att validera (Fazli fyller datan).'
  );
  process.exit(0);
}

if (result.warnings.length > 0) {
  console.log(
    `[serviceIds] Arbetsbladet är ifyllt men ${result.warnings.length} katalograder saknar serviceIds:`
  );
  for (const warning of result.warnings) console.log('  - ' + warning);
  process.exit(1);
}

console.log(
  '[serviceIds] OK — arbetsbladet är ifyllt och alla katalograder har serviceIds.'
);
process.exit(0);
