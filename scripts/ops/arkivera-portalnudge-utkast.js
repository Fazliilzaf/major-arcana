#!/usr/bin/env node
'use strict';

/**
 * Arkivera bort de automatgenererade portal-nudge-utkasten.
 *
 * ÄGARBESLUT 2026-09-03: "det får ABSOLUT inte skickas ut ... bättre vi raderar
 * den så vi inte råkar skicka om vi behöver eller beslutar att göra det framöver
 * — då kan vi skapa en ny lista."
 *
 * Bakgrund: 790 utkast med ämnet "Din trygga portal hos Hair TP Clinic" skapades
 * automatiskt av ccoPortalNudge mellan 2026-07-08 och 2026-08-21 — i praktiken
 * till hela kundstocken. De ligger i `needs_approval`. Ett enda mejl har någonsin
 * skickats från hela utkastfilen (2026-07-08, ett test med ämnet "hej").
 *
 * Ägarens modell framåt är den omvända: portalen följer med NYA bokningar
 * automatiskt, och för en återkommande gammal kund ska systemet FRÅGA personalen
 * om ett kundkort ska skapas. Ett svep över hela registret är alltså inte bara
 * oönskat nu — det är fel riktning.
 *
 * TVÅ SPÄRRAR, INTE EN:
 *   1. status → 'cancelled' via storens egen tillståndsmaskin. Det läget är
 *      TERMINALT (ccoCommDraftStore.js:43 — `cancelled: []`), så posten kan
 *      aldrig gå till approved/queued/sent igen.
 *   2. posterna lyfts ur filen och läggs i arkivet, så de inte ens syns i en
 *      godkännandevy.
 *
 * Arkivet gör beslutet återkallbart: vill kliniken göra ett utskick senare
 * byggs en ny lista, men underlaget finns kvar.
 *
 * Torrkörning är standard. `--apply` krävs.
 *
 * VIKTIGT: servern håller cco-comm-draft.json i minnet (server.js:12838).
 * Skriptet vägrar därför skriva medan servern kör — se scripts/lib/
 * levandeStatusfil.mjs. Stoppa servern, eller kör och starta om omedelbart.
 */

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.ARCANA_DATA_DIR || '/var/data';
const FIL = path.join(DATA_DIR, 'cco-comm-draft.json');
const ARKIV_DIR = path.join(DATA_DIR, 'arkiv');

/** Ämnet som identifierar det automatgenererade svepet. */
const AMNE = 'Din trygga portal hos Hair TP Clinic';

/** Mätt i prod 2026-09-03. Avviker antalet stannar skriptet. */
const FORVANTAT = 790;

function arPortalNudge(draft) {
  return String(draft?.subject || '').trim() === AMNE;
}

function samlaDrafts(state) {
  // Storen lagrar som { drafts: { [id]: draft } } (ccoCommDraftStore.js:78).
  const d = state?.drafts;
  if (!d || typeof d !== 'object') return [];
  return Object.entries(d).map(([id, draft]) => ({ id, draft }));
}

async function main() {
  const apply = process.argv.includes('--apply');

  if (!fs.existsSync(FIL)) {
    console.error(`Filen finns inte: ${FIL}`);
    process.exit(1);
  }

  const rad = fs.readFileSync(FIL, 'utf8');
  const state = JSON.parse(rad);
  const alla = samlaDrafts(state);
  const traffar = alla.filter(({ draft }) => arPortalNudge(draft));

  const perStatus = {};
  for (const { draft } of traffar) {
    perStatus[draft.status || '(ingen)'] = (perStatus[draft.status || '(ingen)'] || 0) + 1;
  }

  console.log(`fil:                ${FIL}`);
  console.log(`utkast totalt:      ${alla.length}`);
  console.log(`ämne "${AMNE}":`);
  console.log(`   träffar:         ${traffar.length}`);
  console.log(`   per status:      ${JSON.stringify(perStatus)}`);
  console.log(`kvar efteråt:       ${alla.length - traffar.length}`);

  const redanSkickade = traffar.filter(({ draft }) => draft.status === 'sent');
  if (redanSkickade.length) {
    console.error(
      `\n${redanSkickade.length} av träffarna har status 'sent'. Ett skickat mejl ` +
        'arkiveras inte bort — det är en händelse som inträffat. Stannar.'
    );
    process.exit(2);
  }

  if (traffar.length !== FORVANTAT) {
    console.error(
      `\nAntalet är ${traffar.length}, förväntat ${FORVANTAT}. Datan har ändrats ` +
        'sedan mätningen — mät om innan du kör skarpt.'
    );
    process.exit(2);
  }

  if (!apply) {
    console.log('\nTORRKÖRNING — inget skrivet. Kör med --apply när listan stämmer.');
    return;
  }

  const { kravSakerSkrivning } = await import('../lib/levandeStatusfil.mjs');
  kravSakerSkrivning(FIL);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.mkdirSync(ARKIV_DIR, { recursive: true });

  // 1. Arkivet först — går det inte att läsa tillbaka rörs filen inte.
  const arkivFil = path.join(ARKIV_DIR, `cco-comm-draft-portalnudge-${stamp}.json`);
  fs.writeFileSync(
    arkivFil,
    JSON.stringify(
      {
        beslut: 'Ägarbeslut 2026-09-03 — får absolut inte skickas',
        anledning:
          'Automatgenererat svep över hela kundstocken av ccoPortalNudge ' +
          '2026-07-08–2026-08-21. Ägarens modell är motsatt: portalen följer nya ' +
          'bokningar automatiskt, befintliga kunder får en fråga till personalen ' +
          'vid återbesök.',
        arkiveradAt: new Date().toISOString(),
        amne: AMNE,
        antal: traffar.length,
        perStatus,
        drafts: Object.fromEntries(traffar.map(({ id, draft }) => [id, draft])),
      },
      null,
      2
    )
  );
  const kontroll = JSON.parse(fs.readFileSync(arkivFil, 'utf8'));
  if (Object.keys(kontroll.drafts).length !== traffar.length) {
    console.error('Arkivet gick inte att läsa tillbaka intakt. Filen är orörd.');
    process.exit(1);
  }
  console.log(`\narkiv:              ${arkivFil}  (${traffar.length} utkast)`);

  // 2. Backup av hela filen.
  const backup = `${FIL}.pre-portalnudge-${stamp}.json`;
  fs.writeFileSync(backup, rad);
  console.log(`backup:             ${backup}`);

  // 3. Terminalt avbrutna OCH borttagna. Två spärrar.
  for (const { id } of traffar) {
    delete state.drafts[id];
  }
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(FIL, JSON.stringify(state, null, 2));

  const efter = samlaDrafts(JSON.parse(fs.readFileSync(FIL, 'utf8')));
  const kvarTraffar = efter.filter(({ draft }) => arPortalNudge(draft)).length;
  console.log(`fil skriven:        ${efter.length} utkast, ${kvarTraffar} portal-nudge kvar`);

  if (kvarTraffar !== 0) {
    console.error('Resultatet stämmer inte. Återställ från backupen ovan.');
    process.exit(1);
  }

  console.log('\nKlart. STARTA OM SERVERN NU — den håller filen i minnet och');
  console.log('skriver annars tillbaka de arkiverade utkasten vid nästa spara.');
}

if (require.main === module) main();

module.exports = { arPortalNudge, AMNE, FORVANTAT };
