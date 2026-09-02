'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const {
  isAcceptableTenantId,
  HAIR_TP_CANONICAL,
  HAIR_TP_VARIANTS,
  canonicalTenantId,
  isKnownTenantId,
} = require('../../src/tenant/tenantIdCanonical');

test('canonicalTenantId normaliserar alla Hair TP-varianter till hair-tp-clinic', () => {
  for (const variant of ['hair-tp-clinic', 'hairtpclinic', 'hairtp-clinic', 'hair_tp', 'hair-tp']) {
    assert.equal(
      canonicalTenantId(variant),
      HAIR_TP_CANONICAL,
      `${variant} ska bli ${HAIR_TP_CANONICAL}`
    );
  }
  // Skiftläge och whitespace ska inte spela roll.
  assert.equal(canonicalTenantId('  Hair_TP  '), HAIR_TP_CANONICAL);
});

test('canonicalTenantId behåller curatiio som egen tenant', () => {
  assert.equal(canonicalTenantId('curatiio'), 'curatiio');
});

test('canonicalTenantId ger null för Hair TP-typo (anroparen ska larma, inte anta)', () => {
  // `hair_tp_clinic` stod här som exempel på stavfel fram till 2026-09-02.
  // Det är ingen typo — det är en av fyra kundhinkar i prod (cco-customers.json,
  // 11 kunder, frusen sedan 2026-08-31). Den datadrivna vakten hittade den.
  // Poängen: en handskriven typo-lista kan inte veta vad datan innehåller.
  for (const typo of ['', 'hairtpclinc', 'hair-tp-clinc', 'hairtp_clinik']) {
    assert.equal(canonicalTenantId(typo), null, `"${typo}" ska vara en Hair TP-typo`);
  }
  assert.equal(canonicalTenantId(undefined), null);
});

test('canonicalTenantId passerar andra tenants oförändrade', () => {
  assert.equal(canonicalTenantId('arcana'), 'arcana');
  assert.equal(canonicalTenantId('unknown-clinic'), 'unknown-clinic');
});

test('isKnownTenantId betyder "en av klinikens egna", inte "inte tom"', () => {
  assert.equal(isKnownTenantId('hair_tp'), true);
  assert.equal(isKnownTenantId('curatiio'), true);
  assert.equal(isKnownTenantId('typo-hair-tp'), false);

  // Det här är poängen med funktionen, och det som saknades 2026-09-02.
  // Den hette "isKnown" men returnerade canonicalTenantId(v) !== null, vilket
  // är true för varje sträng som inte är tom eller en Hair TP-typo. Testet
  // ovan var grönt både före och efter rättelsen — det mätte inget.
  for (const frammande of ['acme-corp', 'SLUMPSTRÄNG', 'x', 'curatiio-ab']) {
    assert.equal(
      isKnownTenantId(frammande),
      false,
      `${frammande} är inte klinikens tenant. En grind byggd på isKnownTenantId ` +
        'skulle annars släppa igenom vad som helst.'
    );
  }
});

test('isAcceptableTenantId släpper igenom andra tenants men inte typos', () => {
  assert.equal(isAcceptableTenantId('acme-corp'), true, 'en annan, avsiktlig tenant');
  assert.equal(isAcceptableTenantId('curatiio'), true);
  assert.equal(isAcceptableTenantId('hair-tp-clnic'), false, 'Hair TP-typo');
  assert.equal(isAcceptableTenantId(''), false);
});

// ---------------------------------------------------------------------------
// Datadriven vakt: modulen måste känna igen de stavningar som FAKTISKT
// förekommer i data/, inte en lista någon skrivit ur minnet. `hair-tp` slank
// igenom 2026-09-02 just för att HAIR_TP_VARIANTS byggdes ur koden, inte datan.
// ---------------------------------------------------------------------------

const REPO_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(REPO_ROOT, 'data');

// Längst-först så `hair-tp-clinic` inte delas upp i `hair-tp` + `clinic`.
const TENANT_STAVNING =
  /hair[-_]?tp[-_]?clinic|hairtpclinic|hairtp-clinic|hair_tp|hair-tp|curatiio/g;

function dataFiler(dir, ut = []) {
  let poster;
  try {
    poster = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return ut; // data/ saknas lokalt — inget att skanna
  }
  for (const post of poster) {
    if (post.name.startsWith('.') || post.name === 'node_modules') continue;
    const p = path.join(dir, post.name);
    if (post.isDirectory()) dataFiler(p, ut);
    else if (/\.(json|jsonl|txt|md|csv|html|js)$/.test(post.name)) ut.push(p);
  }
  return ut;
}

test('varje tenant-stavning som förekommer i data/ känns igen av modulen', () => {
  const hittade = new Set();
  for (const fil of dataFiler(DATA_DIR)) {
    let text;
    try {
      text = fs.readFileSync(fil, 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(TENANT_STAVNING)) {
      const v = m[0].toLowerCase();
      if (v) hittade.add(v);
    }
  }

  // Minst en stavning måste finnas — annars skannar testet ingenstans.
  assert.ok(hittade.size > 0, 'skanningen hittade inga tenant-stavningar i data/');

  const ohanterade = [];
  for (const v of hittade) {
    const out = canonicalTenantId(v);
    const ok = v === 'curatiio' ? out === 'curatiio' : out === HAIR_TP_CANONICAL;
    if (!ok) ohanterade.push(`${v} → ${out}`);
  }

  assert.deepEqual(
    ohanterade,
    [],
    `modulen känner inte igen dessa stavningar ur data/: ${ohanterade.join(', ')}`
  );
});

test('HAIR_TP_VARIANTS täcker Fortnox-nyckeln hair-tp (prod)', () => {
  assert.ok(HAIR_TP_VARIANTS.includes('hair-tp'), 'hair-tp saknas i HAIR_TP_VARIANTS');
  assert.equal(canonicalTenantId('hair-tp'), HAIR_TP_CANONICAL);
});

// ---------------------------------------------------------------------------
// Fält-medveten vakt. `hair_tp` betyder TRE saker: tenant (~30 ställen),
// brand (~15) och formVariant (~9). I prod bär 6 538 patientposter `hair_tp`
// i fältet formVariant (cco-patient-care-state.json + cco-journal.json) — det
// är en FORMULÄRVARIANT, inte en tenant. En normalisering som matchar på värdet
// i stället för fältet skriver sönder dem. Modulen är en värdematchare och får
// aldrig kopplas in på formVariant-värden; det här testet vaktar anropsnivån.
// ---------------------------------------------------------------------------

const SRC_DIR = path.join(REPO_ROOT, 'src');

function srcJsFiler(dir, ut = []) {
  let poster;
  try {
    poster = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return ut;
  }
  for (const post of poster) {
    if (post.name === 'node_modules' || post.name.startsWith('.')) continue;
    const p = path.join(dir, post.name);
    if (post.isDirectory()) srcJsFiler(p, ut);
    else if (post.name.endsWith('.js')) ut.push(p);
  }
  return ut;
}

test('formVariant är inte tenant — ingen kod normaliserar den via tenant-modulen', () => {
  const syndare = [];
  for (const fil of srcJsFiler(SRC_DIR)) {
    const rel = path.relative(REPO_ROOT, fil);
    if (fil === path.join(REPO_ROOT, 'src/tenant/tenantIdCanonical.js')) continue; // modulen själv
    let text;
    try {
      text = fs.readFileSync(fil, 'utf8');
    } catch {
      continue;
    }
    for (const [i, rad] of text.split('\n').entries()) {
      // Samma rad nämner både formVariant och tenant-modulen → misstänkt inkoppling.
      if (
        /formVariant/.test(rad) &&
        /canonicalTenantId|HAIR_TP_CANONICAL|tenantIdCanonical/.test(rad)
      ) {
        syndare.push(`${rel}:${i + 1}`);
      }
    }
  }

  assert.deepEqual(
    syndare,
    [],
    `formVariant kopplas in i tenant-modulen här (matcha på fältet, inte värdet): ${syndare.join(', ')}`
  );
});
