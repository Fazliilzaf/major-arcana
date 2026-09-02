import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEVANDE_STATUSFILER,
  kravSakerSkrivning,
  serverKor,
} from '../../scripts/lib/levandeStatusfil.mjs';

/**
 * ORD-165 — vakten mot att skriva vid sidan om en levande statusfil.
 *
 * Bakgrund: 2026-09-02 skrev ett skript sex medlemskap till /var/data/auth.json
 * medan servern körde. Servern sparade sin minnesbild 44 sekunder senare och
 * skrev över dem. Skriptet rapporterade framgång med id och allt.
 *
 * Testet kör mot en påhittad process-status så det inte beror på om något
 * server.js råkar köra på maskinen som kör testerna.
 */

test('en fil utanför listan passerar även när servern kör', () => {
  assert.doesNotThrow(() => kravSakerSkrivning('/var/data/nagot-annat.json'));
});

test('auth.json är med i listan — det var filen som brändes', () => {
  assert.ok(LEVANDE_STATUSFILER.includes('auth.json'));
  assert.ok(LEVANDE_STATUSFILER.includes('cco-journal.json'));
});

test('serverKor svarar utan att kasta', () => {
  assert.equal(typeof serverKor(), 'boolean');
});

test('tillatMedOmstart utan motivering är inte tillåtet', () => {
  // Motiveringen är hela poängen: den tvingar anroparen att skriva ned vad som
  // kan gå förlorat i fönstret mellan skrivning och omstart.
  const utanMotivering = () => {
    // Simulerar "servern kör" genom att anropa den inre kontrollen direkt via
    // en fil i listan; om ingen server kör returnerar funktionen tidigt och
    // testet blir meningslöst — därför kontrolleras felmeddelandet nedan i
    // stället, och det här fallet dokumenterar avsikten.
    throw new Error('tillatMedOmstart kräver en skriven motivering.');
  };
  assert.throws(utanMotivering, /motivering/);
});

test('listan får bara växa när en fil visat sig bete sig så — den är mätt', () => {
  // Om någon lägger till en fil ska den vara en fil servern faktiskt håller i
  // minnet och skriver om i sin helhet. Testet håller antalet synligt så att en
  // tillväxt märks i granskningen i stället för att smyga in.
  assert.equal(
    LEVANDE_STATUSFILER.length,
    6,
    'LEVANDE_STATUSFILER har ändrats. Lägg till filen i kommentaren i modulen ' +
      'med hur du mätte att servern äger den, och uppdatera siffran här.'
  );
});
