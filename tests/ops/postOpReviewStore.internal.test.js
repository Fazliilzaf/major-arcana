'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { createPostOpReviewStore } = require('../../src/ops/postOpReviewStore');

async function createStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'post-op-internal-'));
  const filePath = path.join(dir, 'post-op-reviews.json');
  return createPostOpReviewStore({ filePath });
}

test('listInternalReviews — endast 1–3★ med feedback, sorterat nyast först', async () => {
  const store = await createStore();
  const { submission: low } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-low',
    patientName: 'Låg',
  });
  const { submission: high } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-high',
    patientName: 'Hög',
  });
  await store.saveReviewFeedback(low.submissionId, { rating: 2, feedback: 'Inte nöjd' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await store.saveReviewFeedback(high.submissionId, { rating: 5, feedback: 'Toppen' });

  const rows = store.listInternalReviews({ tenantId: 'hair-tp-clinic' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].submissionId, low.submissionId);
  assert.equal(rows[0].reviewRating, 2);
});

test('markInternalReviewHandled — döljer från kö om includeHandled är false', async () => {
  const store = await createStore();
  const { submission } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-handle',
    patientName: 'Kund',
  });
  await store.saveReviewFeedback(submission.submissionId, {
    rating: 3,
    feedback: 'Okej men kunde vara bättre',
  });

  await store.markInternalReviewHandled(submission.submissionId, { handledBy: 'operator-1' });

  const pending = store.listInternalReviews({ tenantId: 'hair-tp-clinic' });
  assert.equal(pending.length, 0);

  const withHandled = store.listInternalReviews({
    tenantId: 'hair-tp-clinic',
    includeHandled: true,
  });
  assert.equal(withHandled.length, 1);
  assert.ok(withHandled[0].internalReviewHandledAt);
  assert.equal(withHandled[0].internalReviewHandledBy, 'operator-1');
});

test('listPendingGoogleReviews — alla 1–5★ utan godkännande', async () => {
  const store = await createStore();
  const { submission: low } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-low-google',
    patientName: 'Låg',
  });
  const { submission: high } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-high-google',
    patientName: 'Hög',
  });
  await store.saveReviewFeedback(low.submissionId, { rating: 3, feedback: 'Okej' });
  await store.saveReviewFeedback(high.submissionId, { rating: 5, feedback: 'Fantastiskt' });

  const rows = store.listPendingGoogleReviews({ tenantId: 'hair-tp-clinic' });
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((row) => row.submissionId).sort(),
    [low.submissionId, high.submissionId].sort()
  );
});

test('approveGoogleReview — även 1–3★ kan godkännas för Google-väg', async () => {
  const store = await createStore();
  const { submission } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-low-approve',
    patientName: 'Låg',
  });
  await store.saveReviewFeedback(submission.submissionId, { rating: 2, feedback: 'Svag' });
  const approved = await store.approveGoogleReview(submission.submissionId, { approvedBy: 'staff' });
  assert.ok(approved.googleReviewApprovedAt);
  const clicked = await store.markReviewClicked(submission.submissionId);
  assert.equal(clicked.reviewClicked, true);
});

test('approveGoogleReview — krävs innan markReviewClicked', async () => {
  const store = await createStore();
  const { submission, token } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-approve',
    patientName: 'Glad',
  });
  await store.saveReviewFeedback(submission.submissionId, { rating: 4, feedback: 'Bra' });

  await assert.rejects(
    () => store.markReviewClicked(submission.submissionId),
    /google review not approved/
  );

  const approved = await store.approveGoogleReview(submission.submissionId, {
    approvedBy: 'staff-1',
  });
  assert.ok(approved.googleReviewApprovedAt);
  assert.equal(approved.googleReviewApprovedBy, 'staff-1');

  const clicked = await store.markReviewClicked(submission.submissionId);
  assert.equal(clicked.reviewClicked, true);
  assert.ok(clicked.reviewClickedAt);

  const pending = store.listPendingGoogleReviews({ tenantId: 'hair-tp-clinic' });
  assert.equal(pending.length, 0);

  const found = store.findByToken(token);
  assert.equal(found.submissionId, submission.submissionId);
});

test('rejectGoogleReview — tas bort från Google-kö', async () => {
  const store = await createStore();
  const { submission } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-reject',
    patientName: 'Kund',
  });
  await store.saveReviewFeedback(submission.submissionId, { rating: 5, feedback: 'Toppen' });

  const rejected = await store.rejectGoogleReview(submission.submissionId, {
    rejectedBy: 'staff-2',
  });
  assert.ok(rejected.googleReviewRejectedAt);
  assert.equal(rejected.googleReviewRejectedBy, 'staff-2');

  const rows = store.listPendingGoogleReviews({ tenantId: 'hair-tp-clinic' });
  assert.equal(rows.length, 0);
});
