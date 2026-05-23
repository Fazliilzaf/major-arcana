// Post-op patient flow E2E — kräver körande Arcana (lokal eller staging).
// Kör: CCO_E2E_BASE_URL=http://127.0.0.1:3099 npm run test:e2e -- tests/e2e/post-op-uppfoljning.spec.js

const { test, expect } = require('@playwright/test');

const BASE = (process.env.CCO_E2E_BASE_URL || 'http://127.0.0.1:3099').replace(/\/+$/, '');
const CASE_ID = `post-op-e2e-${Date.now()}`;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z5BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function extractToken(reviewLink = '') {
  const match = String(reviewLink).match(/\/uppfoljning\/([^/?#]+)/);
  return match ? match[1] : '';
}

async function isServerUp(request) {
  try {
    const res = await request.get(`${BASE}/readyz`);
    return res.ok();
  } catch {
    return false;
  }
}

test.describe('Post-op uppföljning', () => {
  test.beforeAll(async ({ request }) => {
    test.skip(!(await isServerUp(request)), `Arcana svarar inte på ${BASE}/readyz`);
  });

  test('patient kan öppna token-länk, ladda upp bild och skicka in', async ({ page, request }) => {
    const trigger = await request.post(
      `${BASE}/api/v1/cco-bookings/${encodeURIComponent(CASE_ID)}/mark-follow-up-completed`,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-arcana-client': 'major_arcana_admin',
        },
        data: {
          customerName: 'E2E Test Patient',
          locale: 'sv',
          baseUrl: BASE,
          skipGraphSend: true,
        },
      }
    );
    expect(trigger.ok()).toBeTruthy();
    const payload = await trigger.json();
    expect(payload.ok).toBe(true);
    const token = extractToken(payload.reviewLink);
    expect(token.length).toBeGreaterThan(8);

    await page.goto(`${BASE}/uppfoljning/${encodeURIComponent(token)}`);
    await expect(page.locator('#form-state')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#submit-form')).toBeVisible();

    await page.setInputFiles('#photo-input', {
      name: 'e2e-smoke.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await page.locator('#consent-publish').check();
    await page.locator('#patient-note').fill('E2E post-op smoke');
    await page.locator('#submit-btn').click();

    await expect(page.locator('#success-state')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#gbp-link')).toBeVisible();

    const lookup = await request.get(`${BASE}/api/v1/post-op-review/${encodeURIComponent(token)}/lookup`);
    expect(lookup.ok()).toBeTruthy();
    const lookupBody = await lookup.json();
    expect(lookupBody.submission.submittedAt).toBeTruthy();
    expect(lookupBody.submission.consentToPublish).toBe(true);
  });
});
