'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const { createPostOpReviewRouter } = require('../../src/routes/postOpReview');
const { createPostOpReviewStore } = require('../../src/ops/postOpReviewStore');

async function withServer(app, run) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function createFixture() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'post-op-review-route-'));
  const postOpReviewStore = await createPostOpReviewStore({
    filePath: path.join(tempDir, 'post-op-reviews.json'),
  });
  const app = express();
  app.use(express.json());
  app.use(
    createPostOpReviewRouter({
      postOpReviewStore,
      capabilityExecutor: {
        async runCapability() {
          return { gatewayResult: { response_payload: { output: { data: null } } } };
        },
      },
      config: { defaultTenantId: 'hair-tp-clinic' },
    })
  );
  return { app, postOpReviewStore, tempDir };
}

test('review-feedback — alla betyg returnerar pendingStaffApproval utan Google-URL', async () => {
  const fixture = await createFixture();
  try {
    const { submission, token } = await fixture.postOpReviewStore.createSubmission({
      tenantId: 'hair-tp-clinic',
      bookingCaseId: 'case-feedback',
      patientName: 'Anna',
    });
    assert.ok(token);

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/post-op-review/${encodeURIComponent(token)}/review-feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: 5, feedback: 'Fantastiskt' }),
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.promoteToGoogle, false);
      assert.equal(payload.pendingStaffApproval, true);
      assert.equal(payload.googleReviewUrl, null);
      assert.equal(payload.googleClickPath, null);
      assert.equal(payload.submission.reviewRating, 5);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('review-clicked — blockerar redirect till Google utan staff-godkännande', async () => {
  const fixture = await createFixture();
  try {
    const { submission, token } = await fixture.postOpReviewStore.createSubmission({
      tenantId: 'hair-tp-clinic',
      bookingCaseId: 'case-click',
      patientName: 'Anna',
    });
    await fixture.postOpReviewStore.saveReviewFeedback(submission.submissionId, {
      rating: 5,
      feedback: 'Bra',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/post-op-review/${encodeURIComponent(token)}/review-clicked`,
        { redirect: 'manual' }
      );
      assert.equal(response.status, 302);
      const location = response.headers.get('location') || '';
      assert.match(location, /\/uppfoljning\/.+\/omdome\?pending=1$/);
      assert.doesNotMatch(location, /maps\.google\.com/);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('review-clicked — tillåter Google efter approveGoogleReview', async () => {
  const fixture = await createFixture();
  try {
    const { submission, token } = await fixture.postOpReviewStore.createSubmission({
      tenantId: 'hair-tp-clinic',
      bookingCaseId: 'case-approved-click',
      patientName: 'Anna',
    });
    await fixture.postOpReviewStore.saveReviewFeedback(submission.submissionId, {
      rating: 4,
      feedback: 'Nöjd',
    });
    await fixture.postOpReviewStore.approveGoogleReview(submission.submissionId, {
      approvedBy: 'staff-1',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/v1/post-op-review/${encodeURIComponent(token)}/review-clicked`,
        { redirect: 'manual' }
      );
      assert.equal(response.status, 302);
      const location = response.headers.get('location') || '';
      assert.match(location, /maps\.google\.com/);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('review-feedback — 2★ väntar också på staff', async () => {
  const fixture = await createFixture();
  try {
    const { token } = await fixture.postOpReviewStore.createSubmission({
      tenantId: 'hair-tp-clinic',
      bookingCaseId: 'case-low-feedback',
      patientName: 'Låg',
    });

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/post-op-review/${encodeURIComponent(token)}/review-feedback`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rating: 2, feedback: 'Inte nöjd' }),
      });
      const payload = await response.json();
      assert.equal(payload.pendingStaffApproval, true);
      assert.equal(payload.promoteToGoogle, false);
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('google-queue — listar alla 1–5★ som väntar', async () => {
  const fixture = await createFixture();
  try {
    const { submission: low } = await fixture.postOpReviewStore.createSubmission({
      tenantId: 'hair-tp-clinic',
      bookingCaseId: 'case-queue-low',
      patientName: 'Låg',
    });
    const { submission: high } = await fixture.postOpReviewStore.createSubmission({
      tenantId: 'hair-tp-clinic',
      bookingCaseId: 'case-queue-high',
      patientName: 'Hög',
    });
    await fixture.postOpReviewStore.saveReviewFeedback(low.submissionId, { rating: 2, feedback: 'Dåligt' });
    await fixture.postOpReviewStore.saveReviewFeedback(high.submissionId, { rating: 5, feedback: 'Toppen' });

    await withServer(fixture.app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/v1/post-op-reviews/google-queue`, {
        headers: { host: 'localhost' },
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.ok, true);
      assert.equal(payload.total, 2);
      assert.equal(payload.pending, 2);
      const ids = payload.items.map((item) => item.submissionId).sort();
      assert.deepEqual(ids, [low.submissionId, high.submissionId].sort());
    });
  } finally {
    await fs.rm(fixture.tempDir, { recursive: true, force: true });
  }
});
