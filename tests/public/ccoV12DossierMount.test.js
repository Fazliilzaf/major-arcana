'use strict';

/**
 * V12-ARBETSYTAN MONTERADES ALDRIG — TYST.
 *
 * Mätt i prod 2026-08-23: flaggan `data-v12-workspace` stod på `"on"`,
 * `__ARCANA_V12_WORKSPACE_ENABLED__` var `true`, alla V12-moduler låg laddade,
 * och `CcoV12Canon.render()` returnerade 15 347 tecken giltig HTML med markören
 * `data-v12-canon="1"`. Ändå fanns noll V12-element i DOM och sex V11-element.
 *
 * Orsaken var en cirkel i `openBlueprintFullDossier`:
 *
 *   1. Funktionen krävde `[data-v9-dossier-deep]` innan den gjorde något.
 *   2. Den behållaren skapas av `renderV11RailDetailShell` och
 *      `renderV9MockupDetailShell` — men INTE av `renderV12WorkspaceDetailShell`.
 *   3. Alltså: behållaren krävdes innan det skal anropades som skulle skapa den.
 *   4. `if (!deep || !body) return;` → returnerade varje gång.
 *   5. `renderV12WorkspaceDetailShell` har dessutom en tyst `try/catch` som
 *      faller tillbaka på V11 utan att logga.
 *
 * Följden: fotosektionen, rit-editorn ("Rita på bild") och kopplingen
 * behandlingsplan → offert var osynliga för all personal, i månader, utan ett
 * enda felmeddelande.
 *
 * Fixen: `ensureDossierDeepShell(root)` skapar behållaren när den saknas i
 * stället för att ge upp. Det här testet vaktar att cirkeln inte återinförs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app', 'patient-master-ui.js'),
  'utf8'
);

function bodyOf(fnName) {
  const start = SOURCE.indexOf(`function ${fnName}(`);
  assert.notEqual(start, -1, `${fnName} saknas i patient-master-ui.js`);
  // Ta ett generöst fönster — vi letar efter tidiga rader, inte hela kroppen.
  return SOURCE.slice(start, start + 1400);
}

test('ensureDossierDeepShell finns och skapar behållaren när den saknas', () => {
  const fn = bodyOf('ensureDossierDeepShell');
  assert.match(
    fn,
    /renderV9MockupDossierDeepShell\(\)/,
    'ensureDossierDeepShell måste rendera dossier-skalet när det saknas'
  );
  assert.match(fn, /appendChild/, 'den nyskapade behållaren måste fästas i root');
});

test('openBlueprintFullDossier hämtar behållaren via ensureDossierDeepShell', () => {
  const fn = bodyOf('openBlueprintFullDossier');
  assert.match(
    fn,
    /ensureDossierDeepShell\(\s*root\s*\)/,
    'openBlueprintFullDossier måste gå via ensureDossierDeepShell'
  );
});

test('openBlueprintFullDossier frågar inte längre root direkt efter behållaren', () => {
  const fn = bodyOf('openBlueprintFullDossier');
  assert.doesNotMatch(
    fn,
    /root\?\.querySelector\(\s*['"]\[data-v9-dossier-deep\]['"]\s*\)/,
    'Den direkta uppslagningen på root återinförd — det är cirkeln som gjorde ' +
      'att V12 aldrig monterade. Använd ensureDossierDeepShell i stället.'
  );
});

test('V12-skalet renderar fortfarande genom CcoV12Canon', () => {
  // Skyddar mot att någon "löser" monteringen genom att koppla bort canon.
  assert.match(
    SOURCE,
    /window\.CcoV12Canon\s*&&\s*typeof window\.CcoV12Canon\.render === 'function'/,
    'renderV12WorkspaceDetailShell måste fortfarande gå via CcoV12Canon.render'
  );
});
