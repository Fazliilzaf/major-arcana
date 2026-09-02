'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  listE8SignRegistryIds,
  resolveSignConfig,
} = require('../../src/ops/patientDocumentSignRegistry.js');

const SCHEMA_BUNDLE = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'journal-clinical-schemas.js'
);

const SCHEMA_CATALOG = path.join(
  __dirname,
  '..',
  '..',
  'migration',
  'meridiq',
  'journal-schema-catalog.json'
);

/**
 * En signeringsrad får inte peka på ett formulär som inte finns.
 *
 * `patientDocumentSignRegistry` bestämmer vilken (formType, formVariant) en
 * signering skrivs med. Formuläret som ska renderas kommer från ett annat
 * håll: `journal-clinical-schemas.js`, härlett ur Meridiqs questionary-export.
 * Ingenting band ihop de två — så ett variantnamn kunde uppfinnas fritt.
 *
 * Det hände: friskfoers_curatiio_op skeppades 2026-09-01 med
 * formVariant 'curatiio_op'. Meridiq 16389 heter 'curatiio_bleph'. En patient
 * som signerat under den tiden hade fått en signering utan formulär bakom sig.
 * Att det inte gjorde skada berodde bara på att noll Curatiio-rader fanns i
 * prod — inte på att koden var rätt.
 *
 * Testet läser filsystemet, inte git-indexet (se tests/meta/testerFragarInteGit).
 */

function laddaKlientschemaregister() {
  const tidigareWindow = global.window;
  global.window = {};
  try {
    delete require.cache[require.resolve(SCHEMA_BUNDLE)];
    require(SCHEMA_BUNDLE);
    return global.window.ArcanaJournalClinicalSchemaRegistry;
  } finally {
    if (tidigareWindow === undefined) delete global.window;
    else global.window = tidigareWindow;
  }
}

function signeringsvarianter() {
  return listE8SignRegistryIds()
    .map((registryId) => ({ registryId, config: resolveSignConfig(registryId, { phase: 7 }) || {} }))
    .filter(({ config }) => config.formType && config.formVariant);
}

test('varje signeringsvariant finns i klientens schemaregister', () => {
  const register = laddaKlientschemaregister();
  assert.ok(register, 'journal-clinical-schemas.js exponerade inget register');

  const saknade = [];
  for (const { registryId, config } of signeringsvarianter()) {
    const varianter = register[config.formType];
    if (!varianter || !varianter[config.formVariant]) {
      saknade.push(
        `${registryId}: ${config.formType}:${config.formVariant} finns inte. ` +
          `Kända varianter: ${varianter ? Object.keys(varianter).join(', ') : '(ingen sådan formType)'}`
      );
    }
  }

  assert.deepEqual(
    saknade,
    [],
    'Signeringsregistret pekar på formulär som inte finns:\n  ' + saknade.join('\n  ')
  );
});

test('varje signeringsvariant finns i Meridiq-härledda schemakatalogen', () => {
  const katalog = require(SCHEMA_CATALOG);
  const schemaIds = new Set((katalog.schemas || katalog).map((s) => s.schemaId));

  const saknade = [];
  for (const { registryId, config } of signeringsvarianter()) {
    const schemaId = `${config.formType}:${config.formVariant}`;
    if (!schemaIds.has(schemaId)) saknade.push(`${registryId}: ${schemaId}`);
  }

  assert.deepEqual(
    saknade,
    [],
    'Signeringsvarianter utan schema i journal-schema-catalog.json:\n  ' + saknade.join('\n  ')
  );
});

test('minst en variant kontrolleras — testet får inte tomköra', () => {
  assert.ok(
    signeringsvarianter().length >= 4,
    `Bara ${signeringsvarianter().length} varianter hittades. Testet mäter inget om ` +
      'resolveSignConfig slutar returnera formType/formVariant.'
  );
});
