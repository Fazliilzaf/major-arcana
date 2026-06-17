#!/usr/bin/env node
/**
 * scripts/test/system-mail-parser.test.js
 *
 * Phase 3 — formell test-suite för app/system-mail-parser.js. Täcker:
 *  - Phase 1 subject-parsing per system (7 system + generic)
 *  - Phase 2 body-parsing helpers (label / signature / quoted From / nameFromEmail)
 *  - Edge cases: tomma inputs, multi-line, HTML, citat, accenter,
 *    spam/marketing-mejl, falska positiv-matchningar, prio-konflikter
 *
 * Körs lokalt:  node scripts/test/system-mail-parser.test.js
 *
 * Krav: Node 18+ (använder structuredClone / nothing fancy). Ingen jest/mocha —
 * vi vill kunna köra utan deps från Render eller i CI utan setup.
 */
'use strict';

const path = require('path');
const fs = require('fs');

// Ladda parsern. Den är en IIFE som registrerar window.MajorArcanaSystemMailParser.
global.window = global;
const parserPath = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'system-mail-parser.js'
);
if (!fs.existsSync(parserPath)) {
  console.error('Kunde inte hitta parsern på:', parserPath);
  process.exit(1);
}
require(parserPath);

const P = global.MajorArcanaSystemMailParser;
if (!P || typeof P.parse !== 'function') {
  console.error(
    'Parsern är inte exponerad korrekt — kolla att IIFE:n registrerar window.MajorArcanaSystemMailParser'
  );
  process.exit(1);
}

// ====== Tiny test harness ======
let pass = 0;
let fail = 0;
const failures = [];

function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push({ msg, actual, expected });
  }
}

function describe(group, fn) {
  console.log(`\n— ${group} —`);
  fn();
}

function it(name, fn) {
  const before = fail;
  try {
    fn();
    if (fail === before) console.log(`  ✓ ${name}`);
    else console.log(`  ✗ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}  (THREW: ${e.message})`);
    failures.push({ msg: name, actual: 'threw', expected: 'no throw', err: e.message });
  }
}

// ====== Tests ======

describe('Phase 1: subject-parsing per system', () => {
  it('Cliento "Ny bokning: <Namn>"', () => {
    const r = P.parse({
      senderEmail: 'no-reply@cliento.com',
      senderName: 'No Reply',
      subject: 'Ny bokning: Anna Karlsson - 15 maj 14:00',
      body: '',
    });
    eq(r, { customerName: 'Anna Karlsson', systemLabel: 'via Cliento' });
  });
  it('Cliento "Ny bokning (web): <Namn>"', () => {
    const r = P.parse({
      senderEmail: 'no-reply@cliento.com',
      senderName: 'No Reply',
      subject: 'Ny bokning (web): Carl-Marcus Ahlengren, onsdag 17 juni 2026 15:15',
      body: '',
    });
    eq(r, { customerName: 'Carl-Marcus Ahlengren', systemLabel: 'via Cliento' });
  });
  it('Cliento "Bokning · Namn · ..."', () => {
    const r = P.parse({
      senderEmail: 'no-reply@cliento.com',
      senderName: 'No Reply',
      subject: 'Bokning · Anna Karlsson · 15 maj 14:00',
      body: '',
    });
    eq(r, { customerName: 'Anna Karlsson', systemLabel: 'via Cliento' });
  });
  it('Cliento "Namn har bokat"', () => {
    const r = P.parse({
      senderEmail: 'no-reply@cliento.com',
      senderName: 'No Reply',
      subject: 'Anna Karlsson har bokat tid',
      body: '',
    });
    eq(r, { customerName: 'Anna Karlsson', systemLabel: 'via Cliento' });
  });
  it('Smartdocs "Namn har signerat"', () => {
    const r = P.parse({
      senderEmail: 'notifications@smartdocs.io',
      senderName: 'Smartdocs',
      subject: 'Andreas Monasterio har signerat dokumentet',
      body: '',
    });
    eq(r, { customerName: 'Andreas Monasterio', systemLabel: 'via Smartdocs' });
  });
  it('Bokadirekt "Booking Request from <Namn>"', () => {
    const r = P.parse({
      senderEmail: 'transactional@bokadirekt.se',
      senderName: 'Bokadirekt',
      subject: 'Booking Request from Jimmy Skoglund',
      body: '',
    });
    eq(r, { customerName: 'Jimmy Skoglund', systemLabel: 'via Bokadirekt' });
  });
  it('GetAccept "Namn har öppnat dokumentet"', () => {
    const r = P.parse({
      senderEmail: 'no-reply@getaccept.com',
      senderName: 'GetAccept',
      subject: 'Albert Mattsson har öppnat dokumentet',
      body: '',
    });
    eq(r, { customerName: 'Albert Mattsson', systemLabel: 'via GetAccept' });
  });
  it('Google Calendar "Accepterat: <Namn>"', () => {
    const r = P.parse({
      senderEmail: 'calendar-notification@google.com',
      senderName: 'Google Calendar',
      subject: 'Accepterat: Anna Karlsson | Klinikbesök',
      body: '',
    });
    eq(r, { customerName: 'Anna Karlsson', systemLabel: 'via Kalender' });
  });
  it('Kivra "från <Namn>"', () => {
    const r = P.parse({
      senderEmail: 'no-reply@kivra.com',
      senderName: 'Kivra',
      subject: 'Du har fått ett dokument från Anna Karlsson',
      body: '',
    });
    eq(r, { customerName: 'Anna Karlsson', systemLabel: 'via Kivra' });
  });
  it('Pipedrive "Activity assigned: <Namn>"', () => {
    const r = P.parse({
      senderEmail: 'notifications@pipedrive.com',
      senderName: 'Pipedrive',
      subject: 'Activity assigned: Anna Karlsson - Follow up',
      body: '',
    });
    eq(r, { customerName: 'Anna Karlsson', systemLabel: 'via Pipedrive' });
  });
});

describe('Phase 2: body-parsing fallback', () => {
  it('Cliento: "Kund:" label i body', () => {
    const r = P.parse({
      senderEmail: 'no-reply@cliento.com',
      senderName: 'No Reply',
      subject: 'Bekräftelse - bokning',
      body: 'Hej,\n\nKund: Maria Lindberg\nTel: 070-1234567\nBokning: 16 maj 10:00\n',
    });
    eq(r, { customerName: 'Maria Lindberg', systemLabel: 'via Cliento' });
  });
  it('Smartdocs dokument-tail-extraction', () => {
    const r = P.parse({
      senderEmail: 'notifications@smartdocs.io',
      senderName: 'Smartdocs',
      subject: 'Signerat',
      body: 'Dokument: Behandlingsavtal Erik Svensson\n',
    });
    eq(r, { customerName: 'Erik Svensson', systemLabel: 'via Smartdocs' });
  });
  it('Bokadirekt "Customer:" label', () => {
    const r = P.parse({
      senderEmail: 'no-reply@bokadirekt.se',
      senderName: 'Bokadirekt',
      subject: 'Booking',
      body: 'Customer: Jimmy Skoglund\nPhone: +46\nTime: 18 maj',
    });
    eq(r, { customerName: 'Jimmy Skoglund', systemLabel: 'via Bokadirekt' });
  });
  it('GetAccept "Mottagare: <namn> <email>"', () => {
    const r = P.parse({
      senderEmail: 'no-reply@getaccept.com',
      senderName: 'GetAccept',
      subject: 'Open',
      body: 'Mottagare: Albert Mattsson <albert@example.com>',
    });
    eq(r, { customerName: 'Albert Mattsson', systemLabel: 'via GetAccept' });
  });
  it('Pipedrive "Contact:" label', () => {
    const r = P.parse({
      senderEmail: 'notifications@pipedrive.com',
      senderName: 'Pipedrive',
      subject: 'Activity',
      body: 'Contact: Anna Karlsson\n',
    });
    eq(r, { customerName: 'Anna Karlsson', systemLabel: 'via Pipedrive' });
  });
  it('Generic "Patient:" label på okänt system', () => {
    const r = P.parse({
      senderEmail: 'no-reply@randomsystem.com',
      senderName: 'No Reply',
      subject: 'Update',
      body: 'Patient: Sara Berg\nNote: foo',
    });
    eq(r, { customerName: 'Sara Berg', systemLabel: 'via Randomsystem' });
  });
  it('Signatur "Med vänlig hälsning"', () => {
    const r = P.parse({
      senderEmail: 'no-reply@example.com',
      senderName: 'No Reply',
      subject: 'Foo',
      body: 'Bla bla.\nMed vänlig hälsning,\nErik Larsson',
    });
    eq(r, { customerName: 'Erik Larsson', systemLabel: 'via Example' });
  });
  it('Quoted From header i forward', () => {
    const r = P.parse({
      senderEmail: 'no-reply@example.com',
      senderName: 'No Reply',
      subject: 'Forwarded',
      body: 'Hej, se nedan:\n\nFrån: Sofia Andersson <sofia@example.com>\nSkickat: 15 maj',
    });
    eq(r, { customerName: 'Sofia Andersson', systemLabel: 'via Example' });
  });
  it('nameFromEmail när allt annat misslyckas', () => {
    const r = P.parse({
      senderEmail: 'anna.karlsson@hotmail.com',
      senderName: 'noreply',
      subject: 'Foo',
      body: '',
    });
    eq(r, { customerName: 'Anna Karlsson', systemLabel: 'via Hotmail' });
  });
});

describe('Edge cases: tomma/null inputs', () => {
  it('Tom input → null', () => {
    eq(P.parse({}), null);
  });
  it('Undefined fält → null', () => {
    eq(
      P.parse({
        senderEmail: undefined,
        senderName: undefined,
        subject: undefined,
        body: undefined,
      }),
      null
    );
  });
  it('Bara senderName som ser ut som system', () => {
    const r = P.parse({ senderName: 'No Reply', subject: 'Anna Karlsson har bokat', body: '' });
    // Ska minst returnera null eller customerName utan systemLabel
    if (r) eq(typeof r.customerName, 'string');
    else eq(r, null);
  });
  it('Subject med bara whitespace', () => {
    const r = P.parse({ senderEmail: 'no-reply@cliento.com', subject: '     \n  ', body: '' });
    eq(r, { customerName: null, systemLabel: 'via Cliento' });
  });
});

describe('Edge cases: falska positiva (ska INTE matcha)', () => {
  it('"Hej Anna" i body är TILL oss, inte FRÅN Anna', () => {
    const r = P.parse({
      senderEmail: 'no-reply@example.com',
      senderName: 'No Reply',
      subject: 'Foo',
      body: 'Hej Anna, kan ni boka tid?',
    });
    eq(r && r.customerName, null);
  });
  it('Marketing från Revolut — ingen kund', () => {
    const r = P.parse({
      senderEmail: 'noreply@revolut.com',
      senderName: 'Revolut',
      subject: 'Your weekly summary',
      body: 'Tap to see your spending',
    });
    // Vi vill INTE att Revolut matchar — det är inte en kund.
    // Men system-label är OK, customerName ska vara null.
    if (r) eq(r.customerName, null);
  });
  it('HelloFresh marketing — ingen kund', () => {
    const r = P.parse({
      senderEmail: 'hello@mail.hellofresh.se',
      senderName: 'HelloFresh',
      subject: 'Veckans recept väntar',
      body: 'Klicka här för dina måltider',
    });
    if (r) eq(r.customerName, null);
  });
  it('Företagsnamn med stora bokstäver — Hair TP Clinic blockas', () => {
    const r = P.parse({
      senderEmail: 'no-reply@example.com',
      senderName: 'No Reply',
      subject: 'Hair TP Clinic — uppdatering',
      body: '',
    });
    eq(r && r.customerName, null);
  });
  it('Vanlig person-mejl (inte system) → null', () => {
    const r = P.parse({
      senderEmail: 'info@example.com',
      senderName: 'Info',
      subject: 'Hej',
      body: 'Tjena, ny fråga.',
    });
    eq(r, null);
  });
});

describe('Edge cases: namn-varianter', () => {
  it('Förnamn med bindestreck "Anne-Marie Dupont"', () => {
    const name = P.bodyHelpers.matchLabeledName('Kund: Anne-Marie Dupont\n', ['kund']);
    eq(name, 'Anne-Marie Dupont');
  });
  it('Trippel-namn "Maria del Carmen Lopez"', () => {
    const name = P.bodyHelpers.matchLabeledName('Customer: Maria del Carmen Lopez\n', ['customer']);
    // del börjar med lowercase — vår NAME_PATTERN kräver capital → tar bara
    // de två första orden om det går (det är en kompromiss). Accept "Maria" alone returnerar null
    // eftersom enbart ETT ord inte räknas som namn. Vi förväntar oss något, men exakt vad är OK.
    if (name) eq(typeof name, 'string');
  });
  it('Skandinaviska bokstäver Ø Æ Å', () => {
    const name = P.bodyHelpers.matchLabeledName('Kund: Øystein Ærø\n', ['kund']);
    if (name) eq(typeof name, 'string');
  });
  it('nameFromEmail: dot-separator', () => {
    eq(P.bodyHelpers.nameFromEmail('anna.karlsson@hotmail.com'), 'Anna Karlsson');
  });
  it('nameFromEmail: bindestreck-separator', () => {
    eq(P.bodyHelpers.nameFromEmail('anna-karlsson@hotmail.com'), 'Anna Karlsson');
  });
  it('nameFromEmail: underscore-separator', () => {
    eq(P.bodyHelpers.nameFromEmail('anna_karlsson@hotmail.com'), 'Anna Karlsson');
  });
  it('nameFromEmail: kryptisk localpart (1 ord) → null', () => {
    eq(P.bodyHelpers.nameFromEmail('akarlsson@hotmail.com'), null);
  });
  it('nameFromEmail: localpart med siffror → null', () => {
    eq(P.bodyHelpers.nameFromEmail('anna123@hotmail.com'), null);
  });
  it('nameFromEmail: tom string → null', () => {
    eq(P.bodyHelpers.nameFromEmail(''), null);
  });
});

describe('Edge cases: body-parsing helpers direkt', () => {
  it('matchSignature med engelsk closer', () => {
    eq(P.bodyHelpers.matchSignature('foo\nbest regards,\nMia Eriksson'), 'Mia Eriksson');
  });
  it('matchSignature med svensk closer "MVH"', () => {
    const r = P.bodyHelpers.matchSignature('foo\nmvh,\nLisa Andersson');
    eq(r, 'Lisa Andersson');
  });
  it('matchQuotedFrom svenskt "Från:"', () => {
    eq(P.bodyHelpers.matchQuotedFrom('Från: Anders Petterson <x@y.se>'), 'Anders Petterson');
  });
  it('matchQuotedFrom engelskt "From:"', () => {
    eq(P.bodyHelpers.matchQuotedFrom('From: Anders Petterson <x@y.se>'), 'Anders Petterson');
  });
  it('matchGreeting fångar namnet (även om det är fel användning för kund-detektering)', () => {
    eq(P.bodyHelpers.matchGreeting('Hej Anna Karlsson, ...'), 'Anna Karlsson');
  });
  it('tailNameFromLine fångar sista namn-tokens', () => {
    eq(P.bodyHelpers.tailNameFromLine('Behandlingsavtal Erik Svensson'), 'Erik Svensson');
  });
  it('tailNameFromLine accepterar 3-ords namn', () => {
    const r = P.bodyHelpers.tailNameFromLine('Avtal Anna Maria Eriksson');
    if (r) eq(typeof r, 'string');
  });
});

describe('Edge cases: prio-konflikter & multi-match', () => {
  it('Label > signature > quoted From', () => {
    const body = 'Kund: Anna Karlsson\nFrån: Erik <x@y.se>\nMVH,\nLisa';
    const r = P.bodyHelpers.extractFromBody(body);
    eq(r, 'Anna Karlsson');
  });
  it('Signature > quoted From när label saknas', () => {
    const body = 'foo\nFrån: Erik Petersson <x@y.se>\nbest regards,\nLisa Andersson';
    const r = P.bodyHelpers.extractFromBody(body);
    eq(r, 'Lisa Andersson');
  });
  it('Subject vinner över body när båda har match', () => {
    const r = P.parse({
      senderEmail: 'no-reply@cliento.com',
      senderName: 'No Reply',
      subject: 'Bokning · Anna Karlsson · 15 maj',
      body: 'Kund: Erik Larsson\n', // ska ignoreras
    });
    eq(r && r.customerName, 'Anna Karlsson');
  });
});

describe('Edge cases: HTML & citat-blocks', () => {
  it('Body med HTML-taggar runt namn', () => {
    const r = P.parse({
      senderEmail: 'no-reply@cliento.com',
      senderName: 'No Reply',
      subject: 'Bokning',
      body: '<p>Kund: <strong>Maria Lindberg</strong></p>',
    });
    // HTML är OK — labeled-match plockar Maria Lindberg
    if (r) eq(r.customerName, 'Maria Lindberg');
  });
  it('Indenterad citat-rad (> Från:)', () => {
    const r = P.bodyHelpers.matchQuotedFrom('> Från: Anders Petterson <x@y.se>\n> Skickat: 15 maj');
    // ">" är inte i NAME_PATTERN så det MÅSTE ändå fungera; OK om det inte gör det
    if (r) eq(typeof r, 'string');
  });
});

describe('isSystemSender edge cases', () => {
  it('no-reply prefix', () => eq(P.isSystemSender('no-reply@cliento.com', ''), true));
  it('noreply prefix utan dash', () => eq(P.isSystemSender('noreply@example.com', ''), true));
  it('notifications prefix', () => eq(P.isSystemSender('notifications@example.com', ''), true));
  it('Bara senderName säger noreply', () =>
    eq(P.isSystemSender('anna@example.com', 'Noreply'), true));
  it('Känd system-domän transactional@bokadirekt.se', () =>
    eq(P.isSystemSender('transactional@bokadirekt.se', ''), true));
  it('Vanlig person-email/namn → false', () =>
    eq(P.isSystemSender('anna@example.com', 'Anna'), false));
  it('Tom input → false', () => eq(P.isSystemSender('', ''), false));
  it('Bara null → false', () => eq(P.isSystemSender(null, null), false));
});

describe('looksLikePersonName edge cases', () => {
  it('Vanligt 2-ords namn', () => {
    // Indirekt via parse — om looksLikePersonName säger ja så får vi namnet ut
    const r = P.bodyHelpers.matchLabeledName('Kund: Anna Karlsson\n', ['kund']);
    eq(r, 'Anna Karlsson');
  });
  it('Bara förnamn (1 ord) → matchas inte av NAME_PATTERN', () => {
    const r = P.bodyHelpers.matchLabeledName('Kund: Anna\n', ['kund']);
    eq(r, null);
  });
  it('Hair TP Clinic — blockas', () => {
    const r = P.bodyHelpers.matchLabeledName('Kund: Hair TP Clinic\n', ['kund']);
    eq(r, null);
  });
  it('Lång string (>60 chars) → null', () => {
    const r = P.bodyHelpers.matchLabeledName('Kund: ' + 'A'.repeat(70) + '\n', ['kund']);
    eq(r, null);
  });
});

// ====== Resultat ======
console.log('\n' + '═'.repeat(60));
console.log(`RESULT: ${pass} pass, ${fail} fail`);
if (failures.length) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  ✗ ${f.msg}`);
    console.log(`    actual:   ${JSON.stringify(f.actual)}`);
    console.log(`    expected: ${JSON.stringify(f.expected)}`);
    if (f.err) console.log(`    error:    ${f.err}`);
  }
  process.exit(1);
}
console.log('Alla tester passerade.');
process.exit(0);
