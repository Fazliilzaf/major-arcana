'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

const { createPostOpReviewStore } = require('../../src/ops/postOpReviewStore');

async function createStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'post-op-google-'));
  const filePath = path.join(dir, 'post-op-reviews.json');
  return createPostOpReviewStore({ filePath });
}

test('listPendingGoogleReviews — 1–5★ med feedback, ej godkänd', async () => {
  const store = await createStore();
  const { submission } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-google',
    patientName: 'Glad',
  });
  await store.saveReviewFeedback(submission.submissionId, { rating: 5, feedback: 'Fantastiskt' });

  const pending = store.listPendingGoogleReviews({ tenantId: 'hair-tp-clinic' });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].submissionId, submission.submissionId);
});

test('approveGoogleReview — krävs innan markReviewClicked', async () => {
  const store = await createStore();
  const { submission } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-approve',
    patientName: 'Kund',
  });
  await store.saveReviewFeedback(submission.submissionId, { rating: 4, feedback: 'Bra' });

  await assert.rejects(
    () => store.markReviewClicked(submission.submissionId),
    (err) => err.code === 'GOOGLE_NOT_APPROVED'
  );

  await store.approveGoogleReview(submission.submissionId, { approvedBy: 'op-1' });
  const clicked = await store.markReviewClicked(submission.submissionId);
  assert.equal(clicked.reviewClicked, true);
});

test('rejectGoogleReview — försvinner från pending-kö', async () => {
  const store = await createStore();
  const { submission } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-reject',
    patientName: 'Kund',
  });
  await store.saveReviewFeedback(submission.submissionId, { rating: 5, feedback: 'Nej tack Google' });

  await store.rejectGoogleReview(submission.submissionId, { rejectedBy: 'op-2' });
  const pending = store.listPendingGoogleReviews({ tenantId: 'hair-tp-clinic' });
  assert.equal(pending.length, 0);
});

test('rejectGoogleReview — fungerar för 1★', async () => {
  const store = await createStore();
  const { submission } = await store.createSubmission({
    tenantId: 'hair-tp-clinic',
    bookingCaseId: 'case-reject-low',
    patientName: 'Kund',
  });
  await store.saveReviewFeedback(submission.submissionId, { rating: 1, feedback: 'Dåligt' });
  await store.rejectGoogleReview(submission.submissionId, { rejectedBy: 'op-3' });
  const pending = store.listPendingGoogleReviews({ tenantId: 'hair-tp-clinic' });
  assert.equal(pending.length, 0);
});
