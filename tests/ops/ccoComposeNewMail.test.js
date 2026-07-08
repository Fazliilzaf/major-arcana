'use strict';

/* Komponera nytt mail till ny mottagare (följdsteg). Skapar enkel kontakt +
 * needs_approval-utkast med vald sändkanal. SKICKAR ALDRIG själv. Återanvänder
 * befintlig kontakt om e-posten redan finns. */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { composeNewMail, maskEmail } = require('../../src/ops/ccoComposeNewMail');
const { createCcoPatientMasterStore } = require('../../src/ops/ccoPatientMasterStore');
const { createCcoCommDraftStore } = require('../../src/ops/ccoCommDraftStore');

function tmp(n) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-'));
  return path.join(dir, n);
}

async function build() {
  return {
    patientMasterStore: await createCcoPatientMasterStore({ filePath: tmp('pm.json') }),
    draftStore: await createCcoCommDraftStore({ filePath: tmp('d.json') }),
  };
}

test('skapar kontakt + needs_approval-utkast med kanalval (graph)', async () => {
  const stores = await build();
  const res = await composeNewMail(
    {
      tenantId: 'hairtpclinic',
      recipientName: 'Ny Person',
      recipientEmail: 'ny.person@example.com',
      subject: 'Välkommen till Hair TP Clinic',
      body: 'Hej och välkommen!',
      channel: 'graph',
    },
    stores
  );
  assert.equal(res.status, 'prepared');
  assert.equal(res.contactCreated, true);
  assert.equal(res.channel, 'graph');
  assert.ok(res.draftId);
  assert.ok(res.customerId);

  // Kontakten finns nu och kan slås upp på e-post.
  const contact = await stores.patientMasterStore.findPatientByEmail({
    tenantId: 'hairtpclinic',
    email: 'ny.person@example.com',
  });
  assert.ok(contact);
  assert.equal(contact.displayName, 'Ny Person');

  // Utkastet är needs_approval (aldrig sent) och bär kanalvalet.
  const draft = stores.draftStore.getDraft(res.draftId);
  assert.equal(draft.status, 'needs_approval');
  assert.equal(draft.mergeFields.sendChannel, 'graph');
  assert.match(draft.recipientMasked, /@example\.com$/);
  assert.doesNotMatch(draft.recipientMasked, /ny\.person@/); // maskad
});

test('återanvänder befintlig kontakt om e-posten redan finns', async () => {
  const stores = await build();
  await stores.patientMasterStore.upsertPatient({
    tenantId: 'hairtpclinic',
    displayName: 'Redan Kund',
    emails: ['redan@example.com'],
  });
  const res = await composeNewMail(
    { recipientEmail: 'redan@example.com', subject: 'Hej igen', body: 'Text', channel: 'resend' },
    stores
  );
  assert.equal(res.status, 'prepared');
  assert.equal(res.contactCreated, false); // ingen dubblett
  assert.equal(res.channel, 'resend');
});

test('okänd kanal faller tillbaka på graph', async () => {
  const stores = await build();
  const res = await composeNewMail(
    { recipientEmail: 'x@example.com', subject: 's', body: 'b', channel: 'sms' },
    stores
  );
  assert.equal(res.channel, 'graph');
});

test('ogiltig e-post / saknat ämne / saknad text → skipped', async () => {
  const stores = await build();
  assert.equal(
    (await composeNewMail({ recipientEmail: 'inte-en-mejl', subject: 's', body: 'b' }, stores))
      .reason,
    'invalid_email'
  );
  assert.equal(
    (await composeNewMail({ recipientEmail: 'x@y.se', subject: '', body: 'b' }, stores)).reason,
    'missing_subject'
  );
  assert.equal(
    (await composeNewMail({ recipientEmail: 'x@y.se', subject: 's', body: '' }, stores)).reason,
    'missing_body'
  );
});

test('maskEmail döljer lokaldelen men behåller domänen', () => {
  const masked = maskEmail('anna.karlsson@mail.se');
  assert.match(masked, /^an•+@mail\.se$/); // två tecken + bullets + domän
  assert.doesNotMatch(masked, /karlsson/);
  assert.equal(maskEmail('trasig'), '•••');
});

// ── Portal-inbjudan + signatur (buildComposeBody + includePortalLink) ─────────

const { buildComposeBody, buildPortalUrl } = require('../../src/ops/ccoComposeNewMail');

test('buildComposeBody sätter ihop text → portal-länk → signatur i rätt ordning', () => {
  const out = buildComposeBody({
    userBody: 'Hej!',
    portalUrl: 'https://arcana.hairtpclinic.com/portal-chat/tok',
    signature: 'Mvh\nFazli',
  });
  assert.match(out, /^Hej!/);
  assert.match(out, /portal-chat\/tok/);
  assert.match(out, /Mvh\nFazli$/);
  // Ordning: portal-inbjudan före signaturen.
  assert.ok(out.indexOf('portal-chat') < out.indexOf('Mvh'));
});

test('buildComposeBody utan extra-delar returnerar bara användartexten', () => {
  assert.equal(buildComposeBody({ userBody: 'Bara text' }), 'Bara text');
});

test('includePortalLink myntar token och bäddar in /portal-chat-länken', async () => {
  const stores = await build();
  const issued = [];
  stores.accessStore = {
    issueToken: async ({ tenantId, customerId }) => {
      issued.push({ tenantId, customerId });
      return { token: 'magic-123' };
    },
  };
  const res = await composeNewMail(
    {
      recipientEmail: 'portal@example.com',
      subject: 'Välkommen',
      body: 'Hej och välkommen!',
      signature: 'Mvh\nFazli',
      includePortalLink: true,
      baseUrl: 'https://arcana.hairtpclinic.com',
    },
    stores
  );
  assert.equal(res.status, 'prepared');
  assert.equal(res.portalLinkIncluded, true);
  assert.equal(issued.length, 1);

  const draft = stores.draftStore.getDraft(res.draftId);
  assert.match(draft.body, /\/portal-chat\/magic-123/);
  assert.match(draft.body, /Mvh\nFazli$/); // signaturen sist
  assert.ok(draft.body.indexOf('portal-chat') < draft.body.indexOf('Mvh')); // länk före signatur
});

test('includePortalLink utan accessStore kraschar inte → portalLinkIncluded:false', async () => {
  const stores = await build();
  const res = await composeNewMail(
    {
      recipientEmail: 'ingen-access@example.com',
      subject: 'Hej',
      body: 'Text',
      includePortalLink: true,
    },
    stores
  );
  assert.equal(res.status, 'prepared');
  assert.equal(res.portalLinkIncluded, false);
  assert.doesNotMatch(stores.draftStore.getDraft(res.draftId).body, /portal-chat/);
});

test('buildPortalUrl faller tillbaka på prod-basen och kodar token', () => {
  assert.equal(buildPortalUrl('', 'a b'), 'https://arcana.hairtpclinic.com/portal-chat/a%20b');
});
