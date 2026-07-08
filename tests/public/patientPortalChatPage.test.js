'use strict';

/* Patient-landningssidan för den fria chatt-kanalen (Fas 2, steg 5). Öppnas via
 * /portal-chat/:token. Testlåser att sidan är self-contained (ingen extern hotlink),
 * läser token ur path och pratar med det magisk-länk-grindade meddelande-API:t. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../../public/patient-portal-chat.html'), 'utf8');

test('sidan är self-contained och robots-noindex', () => {
  assert.match(html, /<title>Meddelanden · Hair TP Clinic<\/title>/);
  assert.match(html, /name="robots"\s+content="noindex,nofollow"/);
  // Ingen extern hotlink (skript/stil/font/bild) — allt inlinat.
  assert.doesNotMatch(html, /src="https?:\/\//);
  assert.doesNotMatch(html, /<link[^>]+href="https?:\/\//);
});

test('token läses ur /portal-chat/:token och driver meddelande-API:t', () => {
  assert.ok(html.includes('\\/portal-chat\\/([^/?#]+)'));
  assert.match(html, /'\/api\/patient-portal\/' \+ encodeURIComponent\(TOKEN\) \+ '\/messages'/);
});

test('läser (GET) och skickar (POST body) patient-meddelanden', () => {
  assert.match(html, /fetch\(API, \{ cache: 'no-store'/);
  assert.match(html, /method: 'POST'[\s\S]{0,120}JSON\.stringify\(\{ body: body \}\)/);
  // outbound = kliniken, inbound = patientens egna
  assert.match(html, /m\.direction === 'outbound'/);
});

test('ogiltig/utgången länk visar ett tryggt fel, inte en tom vy', () => {
  assert.match(html, /Länken är inte giltig längre/);
  assert.match(html, /Kontakta kliniken/);
});
