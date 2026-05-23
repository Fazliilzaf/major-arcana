'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const {
  RequestPostOpReviewCapability,
  _buildEmailSv,
  _buildEmailEn,
} = require('../../src/capabilities/requestPostOpReview');
const {
  createPostOpReviewStore,
  hashToken,
} = require('../../src/ops/postOpReviewStore');

async function tmpStorePath(suffix = '') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `post-op-review-test-${suffix}-`));
  return path.join(dir, 'post-op-reviews.json');
}

// ─── Capability contract ──────────────────────────────────────────────────

test('RequestPostOpReviewCapability has correct static contract', () => {
  assert.equal(RequestPostOpReviewCapability.name, 'RequestPostOpReview');
  assert.equal(RequestPostOpReviewCapability.version, '1.0.0');
  assert.deepEqual(RequestPostOpReviewCapability.allowedChannels, ['admin']);
  assert.equal(RequestPostOpReviewCapability.requiresInputRisk, true);
  assert.equal(RequestPostOpReviewCapability.requiresOutputRisk, true);
  assert.equal(RequestPostOpReviewCapability.requiresPolicyFloor, true);
  assert.equal(RequestPostOpReviewCapability.persistStrategy, 'analysis');
  assert.equal(RequestPostOpReviewCapability.auditStrategy, 'always');
});

// ─── Email-mall ───────────────────────────────────────────────────────────

test('Email SV — innehåller GBP-länk + privacy-text + signatur', () => {
  const email = _buildEmailSv({
    patientFirstName: 'Morten',
    reviewLink: 'https://arcana.hairtpclinic.se/uppfoljning/abc123',
  });
  assert.match(email.subject, /Morten/);
  assert.match(email.plain, /abc123/);
  assert.match(email.plain, /maps\.google\.com.*cid=/);
  assert.match(email.plain, /ögonbryn och uppåt/);
  assert.match(email.plain, /contact@hairtpclinic\.com/);
  assert.match(email.plain, /Hair TP Clinic/);
  assert.match(email.html, /<a href="https:\/\/arcana/);
});

test('Email EN — engelsk locale + EN-URL i CTA-text', () => {
  const email = _buildEmailEn({
    patientFirstName: 'Sara',
    reviewLink: 'https://arcana.hairtpclinic.se/uppfoljning/xyz789',
  });
  assert.match(email.subject, /Sara/);
  assert.match(email.plain, /xyz789/);
  assert.match(email.plain, /eyebrows up/);
  assert.match(email.plain, /Hair TP Clinic/);
});

test('Email utan patientFirstName ger neutral hälsning', () => {
  const sv = _buildEmailSv({ patientFirstName: '', reviewLink: 'https://x' });
  assert.match(sv.subject, /Tack för förtroendet/);
  assert.match(sv.plain, /^Hej,/m);
});

// ─── Capability execute ───────────────────────────────────────────────────

test('execute kräver bookingCaseId — varnar och returnerar null data', async () => {
  const cap = new RequestPostOpReviewCapability();
  const out = await cap.execute({
    tenantId: 'hair-tp-clinic',
    channel: 'admin',
    input: {},
  });
  assert.equal(out.data, null);
  assert.ok(out.warnings.some((w) => /bookingCaseId/i.test(w)));
});

test('execute varnar om postOpReviewStore saknas i context', async () => {
  const cap = new RequestPostOpReviewCapability();
  const out = await cap.execute({
    tenantId: 'hair-tp-clinic',
    channel: 'admin',
    input: { bookingCaseId: 'case-1' },
  });
  assert.equal(out.data, null);
  assert.ok(out.warnings.some((w) => /postOpReviewStore saknas/i.test(w)));
});

test('execute skapar submission + token + email-draft (SV)', async () => {
  const filePath = await tmpStorePath('happy-sv');
  const store = await createPostOpReviewStore({ filePath });

  const cap = new RequestPostOpReviewCapability();
  const out = await cap.execute({
    tenantId: 'hair-tp-clinic',
    channel: 'admin',
    requestId: 'req-1',
    input: {
      bookingCaseId: 'case-abc',
      customerName: 'Morten Bak Kristoffersen',
      locale: 'sv',
    },
    postOpReviewStore: store,
  });

  assert.equal(out.data.alreadyExists, false);
  assert.ok(out.data.submissionId, 'submissionId should exist');
  assert.ok(out.data.token, 'token should exist');
  assert.equal(out.data.token.length, 43, 'token should be 43 base64url chars');
  assert.match(out.data.reviewLink, /\/uppfoljning\//);
  assert.equal(out.data.emailDraft.fromAddress, 'contact@hairtpclinic.com');
  assert.equal(out.data.emailDraft.locale, 'sv');
  assert.match(out.data.emailDraft.subject, /Morten/);
  assert.equal(out.metadata.capability, 'RequestPostOpReview');
  assert.equal(out.metadata.tenantId, 'hair-tp-clinic');
});

test('execute med locale=en bygger engelsk e-postmall + EN-URL i text', async () => {
  const filePath = await tmpStorePath('happy-en');
  const store = await createPostOpReviewStore({ filePath });

  const cap = new RequestPostOpReviewCapability();
  const out = await cap.execute({
    tenantId: 'hair-tp-clinic',
    channel: 'admin',
    input: {
      bookingCaseId: 'case-en-1',
      customerName: 'Sara Holm',
      locale: 'en',
    },
    postOpReviewStore: store,
  });

  assert.equal(out.data.emailDraft.locale, 'en');
  assert.match(out.data.emailDraft.subject, /Thank you, Sara/);
  assert.match(out.data.emailDraft.plain, /eyebrows up/);
});

test('execute är idempotent — andra anrop returnerar alreadyExists utan ny token', async () => {
  const filePath = await tmpStorePath('idempotent');
  const store = await createPostOpReviewStore({ filePath });

  const cap = new RequestPostOpReviewCapability();
  const first = await cap.execute({
    tenantId: 'hair-tp-clinic',
    channel: 'admin',
    input: { bookingCaseId: 'case-x', customerName: 'A' },
    postOpReviewStore: store,
  });

  const second = await cap.execute({
    tenantId: 'hair-tp-clinic',
    channel: 'admin',
    input: { bookingCaseId: 'case-x', customerName: 'A' },
    postOpReviewStore: store,
  });

  assert.equal(first.data.alreadyExists, false);
  assert.equal(second.data.alreadyExists, true);
  assert.equal(second.data.token, null);
  assert.equal(second.data.submissionId, first.data.submissionId);
  assert.ok(second.warnings.some((w) => /redan/i.test(w)));
});

// ─── Store-API ────────────────────────────────────────────────────────────

test('store.createSubmission + findByToken — token roundtrip', async () => {
  const filePath = await tmpStorePath('store-roundtrip');
  const store = await createPostOpReviewStore({ filePath });
  const { submission, token } = await store.createSubmission({
    bookingCaseId: 'case-rt',
    tenantId: 'hair-tp-clinic',
    patientName: 'Test Patient',
  });

  const found = store.findByToken(token);
  assert.ok(found, 'findByToken returnerar submission');
  assert.equal(found.submissionId, submission.submissionId);
  // Klartext-token får ALDRIG lagras
  assert.equal(submission.tokenHash, hashToken(token));
  assert.ok(!Object.prototype.hasOwnProperty.call(submission, 'token'));
});

test('store.findByToken returnerar null för fel token', async () => {
  const filePath = await tmpStorePath('wrong-token');
  const store = await createPostOpReviewStore({ filePath });
  await store.createSubmission({
    bookingCaseId: 'case-wt',
    tenantId: 'hair-tp-clinic',
    patientName: 'X',
  });
  assert.equal(store.findByToken('not-a-real-token'), null);
});

test('store.addPhoto + submit + markReviewClicked — full flow', async () => {
  const filePath = await tmpStorePath('full-flow');
  const store = await createPostOpReviewStore({ filePath });
  const { submission, token } = await store.createSubmission({
    bookingCaseId: 'case-flow',
    tenantId: 'hair-tp-clinic',
    patientName: 'Flow Patient',
  });

  // Markera skickad (operatör → Graph → patient)
  await store.markSent(submission.submissionId, '2026-05-18T15:00:00Z');

  // Patient laddar upp 2 foton
  await store.addPhoto(submission.submissionId, { filename: 'a.webp', size: 12345 });
  await store.addPhoto(submission.submissionId, { filename: 'b.webp', size: 23456 });

  // Patient submittar med consent
  const submitted = await store.submit(submission.submissionId, {
    consentToPublish: true,
    patientNote: 'Mycket nöjd!',
  });

  assert.equal(submitted.photos.length, 2);
  assert.equal(submitted.consentToPublish, true);
  assert.equal(submitted.patientNote, 'Mycket nöjd!');
  assert.ok(submitted.submittedAt);

  // Patient klickar GBP-länk
  const clicked = await store.markReviewClicked(submission.submissionId);
  assert.equal(clicked.reviewClicked, true);
  assert.ok(clicked.reviewClickedAt);

  // findByToken fortfarande funkar (TTL inte slut)
  const refetched = store.findByToken(token);
  assert.equal(refetched.photos.length, 2);
  assert.equal(refetched.reviewClicked, true);
});

test('store.submit är idempotent — andra anropet ändrar inget', async () => {
  const filePath = await tmpStorePath('submit-idempotent');
  const store = await createPostOpReviewStore({ filePath });
  const { submission } = await store.createSubmission({
    bookingCaseId: 'case-si',
    tenantId: 'hair-tp-clinic',
    patientName: 'X',
  });
  const first = await store.submit(submission.submissionId, {
    consentToPublish: true,
    patientNote: 'A',
  });
  const second = await store.submit(submission.submissionId, {
    consentToPublish: false,
    patientNote: 'B',
  });
  // Andra anropet returnerar första submission utan att skriva över
  assert.equal(second.submittedAt, first.submittedAt);
  assert.equal(second.consentToPublish, true);
  assert.equal(second.patientNote, 'A');
});

test('store.deleteSubmission — GDPR-radering', async () => {
  const filePath = await tmpStorePath('gdpr-delete');
  const store = await createPostOpReviewStore({ filePath });
  const { submission } = await store.createSubmission({
    bookingCaseId: 'case-gdpr',
    tenantId: 'hair-tp-clinic',
    patientName: 'X',
  });
  assert.equal(store.count(), 1);
  const ok = await store.deleteSubmission(submission.submissionId);
  assert.equal(ok, true);
  assert.equal(store.count(), 0);
  assert.equal(store.findById(submission.submissionId), null);
});

test('store.deleteSubmission — rensar foto-mapp på disk', async () => {
  const filePath = await tmpStorePath('gdpr-delete-disk');
  const photosDir = path.join(path.dirname(filePath), 'post-op-photos');
  const store = await createPostOpReviewStore({ filePath, photosDir });
  const { submission } = await store.createSubmission({
    bookingCaseId: 'case-gdpr-disk',
    tenantId: 'hair-tp-clinic',
    patientName: 'X',
  });
  const submissionDir = path.join(photosDir, submission.submissionId);
  await fs.mkdir(submissionDir, { recursive: true });
  await fs.writeFile(path.join(submissionDir, 'photo-1.jpg'), Buffer.from('jpeg-bytes'));
  const ok = await store.deleteSubmission(submission.submissionId);
  assert.equal(ok, true);
  await assert.rejects(() => fs.stat(submissionDir), /ENOENT/);
});

test('store.pruneNoConsentPhotos — rensar foton för no-consent efter TTL', async () => {
  const filePath = await tmpStorePath('prune');
  const store = await createPostOpReviewStore({ filePath });
  const { submission } = await store.createSubmission({
    bookingCaseId: 'case-prune',
    tenantId: 'hair-tp-clinic',
    patientName: 'X',
  });
  await store.addPhoto(submission.submissionId, { filename: 'p.webp', size: 100 });
  await store.submit(submission.submissionId, { consentToPublish: false });

  // Tvinga submittedAt långt bak i tiden
  const found = store.findById(submission.submissionId);
  const yearAgo = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();
  found.submittedAt = yearAgo;

  const pruned = await store.pruneNoConsentPhotos({ ttlDays: 365 });
  assert.equal(pruned.length, 1);
  const refreshed = store.findById(submission.submissionId);
  assert.equal(refreshed.photos.length, 0);
  assert.ok(refreshed.photosDeletedAt);
});

test('store.pruneNoConsentPhotos — rensar INTE consent=true', async () => {
  const filePath = await tmpStorePath('prune-consent');
  const store = await createPostOpReviewStore({ filePath });
  const { submission } = await store.createSubmission({
    bookingCaseId: 'case-prune-c',
    tenantId: 'hair-tp-clinic',
    patientName: 'X',
  });
  await store.addPhoto(submission.submissionId, { filename: 'p.webp', size: 100 });
  await store.submit(submission.submissionId, { consentToPublish: true });

  const found = store.findById(submission.submissionId);
  found.submittedAt = new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString();

  const pruned = await store.pruneNoConsentPhotos({ ttlDays: 365 });
  assert.equal(pruned.length, 0, 'consent=true ska aldrig rensas av cron');
  const refreshed = store.findById(submission.submissionId);
  assert.equal(refreshed.photos.length, 1);
});

test('store rejects more than 6 photos per submission', async () => {
  const filePath = await tmpStorePath('photo-limit');
  const store = await createPostOpReviewStore({ filePath });
  const { submission } = await store.createSubmission({
    bookingCaseId: 'case-limit',
    tenantId: 'hair-tp-clinic',
    patientName: 'X',
  });
  for (let i = 0; i < 6; i++) {
    await store.addPhoto(submission.submissionId, { filename: `p${i}.webp`, size: 100 });
  }
  await assert.rejects(
    () => store.addPhoto(submission.submissionId, { filename: 'p7.webp', size: 100 }),
    /max 6/
  );
});

// ─── Registry-integration ────────────────────────────────────────────────

test('RequestPostOpReview är registrerad i registry', () => {
  const { listCapabilities, getCapabilityByName } = require('../../src/capabilities/registry');
  const names = listCapabilities().map((c) => c.name);
  assert.ok(
    names.includes('RequestPostOpReview'),
    `RequestPostOpReview saknas i registry. Faktiska: ${names.join(', ')}`
  );

  const cap = getCapabilityByName('RequestPostOpReview');
  assert.ok(cap);
  assert.equal(cap.name, 'RequestPostOpReview');
});
