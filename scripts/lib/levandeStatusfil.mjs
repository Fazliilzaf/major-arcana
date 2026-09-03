/**
 * Vakt mot att skriva vid sidan om en fil som den körande servern äger.
 *
 * DET HÄR HÄNDE 2026-09-02, i ORD-165:
 *
 *   20:54:32   serverprocessen startar, läser in 24 medlemskap i minnet
 *   21:02:24   ett skript skriver 30 medlemskap till /var/data/auth.json
 *   21:03:08   servern sparar sin minnesbild — 24 igen
 *
 * Skriptet rapporterade sex skapade medlemskap med id och allt. Fyrtiofyra
 * sekunder senare fanns inget av dem. Ingen felutskrift, inget larm.
 *
 * Storarna i den här kodbasen laddar filen en gång vid start och skriver
 * `state` — hela minnesbilden — vid varje spara. En skrivning vid sidan om
 * försvinner därför vid nästa gång servern sparar, och tvärtom: en skrivning
 * som råkar hamna efter serverns kan radera det servern nyss sparade.
 *
 * `auth.json` är det värsta fallet eftersom sessioner och revisionshändelser
 * skrivs kontinuerligt. `cco-journal.json` skrivs bara vid journaländring, och
 * där räckte det i ORD-166 att starta om servern direkt efter skrivningen.
 *
 * REGELN: skriv via API:t mot den körande servern. Går inte det — stoppa
 * servern först, eller skriv och starta om innan nästa spara hinner ske, och
 * var medveten om vad som kan gå förlorat i fönstret.
 */

import { execSync } from 'node:child_process';

/**
 * Filer som den körande servern håller i minnet och skriver om i sin helhet.
 * Listan är mätt, inte gissad — utöka den när en fil visar sig bete sig så.
 */
export const LEVANDE_STATUSFILER = Object.freeze([
  'auth.json', // sessioner + revisionshändelser, skrivs kontinuerligt
  'cco-journal.json',
  'cco-customers.json',
  'cco-patient-master.json',
  'cco-patient-care-state.json',
  'tenant-config.json',
  // Laddas vid start i server.js:12838. Tillagd 2026-09-03 när utkasten skulle
  // arkiveras — samma fil, samma fälla, och den här gången fångad i förväg.
  'cco-comm-draft.json',
]);

/** Är en serverprocess igång på den här maskinen? */
export function serverKor() {
  try {
    const ut = execSync('ps -o args= -C node 2>/dev/null || true', { encoding: 'utf8' });
    return /server\.js/.test(ut);
  } catch {
    return false; // kan inte avgöra — behandla som att den inte kör
  }
}

/**
 * Stoppar körningen om filen ägs av en levande server.
 *
 * @param {string} filPath      filen skriptet tänker skriva
 * @param {object} [opts]
 * @param {boolean} [opts.tillatMedOmstart]  anroparen tar ansvar för omstart
 * @param {string}  [opts.varfor]            varför det ändå är säkert
 */
export function kravSakerSkrivning(filPath, { tillatMedOmstart = false, varfor = '' } = {}) {
  const namn = String(filPath).split('/').pop();
  if (!LEVANDE_STATUSFILER.includes(namn)) return;

  if (!serverKor()) return;

  if (tillatMedOmstart) {
    if (!varfor.trim()) {
      throw new Error(
        `${namn}: tillatMedOmstart kräver en skriven motivering. ` +
          'Vad hindrar att servern skriver över, och vad kan gå förlorat i fönstret?'
      );
    }
    console.warn(
      `VARNING  ${namn} ägs av en körande server. Fortsätter på anroparens ansvar.\n` +
        `         ${varfor}\n` +
        '         Starta om servern omedelbart efter skrivningen, och verifiera på disk efteråt.'
    );
    return;
  }

  throw new Error(
    `${namn} ägs av en körande serverprocess — en skrivning här försvinner tyst ` +
      'vid nästa gång servern sparar sin minnesbild.\n' +
      '  Det hände 2026-09-02: sex medlemskap skrevs, servern skrev över dem 44 s senare, ' +
      'och skriptet rapporterade framgång.\n' +
      '  Skriv via API:t mot den körande servern i stället. Måste du skriva på disk: ' +
      'stoppa servern först, eller anropa med { tillatMedOmstart: true, varfor: "…" } ' +
      'och starta om direkt efteråt.'
  );
}
