/**
 * Delad Playwright-hjälpare för mobil deep link → kunddetail på prod.
 * Speglar flödet i e2e-mobile-staff-click-audit-prod.js (warm session, commit, skeleton → detail).
 */

async function injectStaffToken(page, token) {
  await page.evaluate((t) => {
    try {
      localStorage.setItem('ARCANA_ADMIN_TOKEN', t);
      sessionStorage.setItem('ARCANA_ADMIN_TOKEN', t);
    } catch {
      /* ignore */
    }
  }, token);
}

async function waitForMobileShell(page, timeout = 45000) {
  try {
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-cco-mobile-shell') === 'on',
      undefined,
      { timeout, polling: 16 }
    );
  } catch {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-cco-mobile-shell') === 'on',
      undefined,
      { timeout: 20000, polling: 16 }
    );
  }
}

async function ensureStaffSession(page, token) {
  const needsLogin = await page.evaluate(() => Boolean(document.querySelector('[data-staff-login-form]')));
  if (!needsLogin) return;

  await injectStaffToken(page, token);
  await page.evaluate(() => {
    window.ArcanaPatientMasterUi?.renderStaffAuth?.();
  });
  await page
    .waitForFunction(() => !document.querySelector('[data-staff-login-form]'), undefined, {
      timeout: 15000,
      polling: 16,
    })
    .catch(async () => {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForMobileShell(page, 30000);
    });
}

function isPatientDetailReady() {
  const rt = window.ArcanaPatientMasterUi?.getRuntime?.();
  const bodyText = document.body?.innerText || '';
  if (/Patienten hittades inte|Kunde inte ladda kund/i.test(bodyText) && !rt?.detail?.card) {
    return false;
  }
  if (rt?.detailLoading) return false;
  const journalTab = document.querySelector(
    'button[data-patient-tab="journal"], .patient-master-tab[data-patient-tab="journal"]'
  );
  const journalPanel = document.querySelector('[data-patient-tab-panel="journal"]:not([hidden])');
  const camera = document.querySelector('.patient-master-camera-button, [data-patient-photo-camera]');
  const detailOn = document.documentElement.getAttribute('data-cco-patient-detail') === 'on';
  const mobileJournal = Boolean(rt?.preferJournalOnMobile) && detailOn;
  if (camera && (journalTab || journalPanel || mobileJournal)) return true;
  if (Boolean(rt?.detail?.card) && (journalTab || journalPanel || mobileJournal)) return true;
  if (detailOn && (journalTab || journalPanel || mobileJournal) && !rt?.detailLoading) return true;
  return false;
}

async function waitForPatientDetailReady(page, { timeout = 90000, patientId = '' } = {}) {
  try {
    await page.waitForFunction(isPatientDetailReady, undefined, { timeout, polling: 16 });
    return true;
  } catch {
    if (patientId) {
      await page.evaluate((id) => {
        const row = document.querySelector(`[data-patient-row="${id}"]`);
        row?.click();
      }, patientId);
      try {
        await page.waitForFunction(isPatientDetailReady, undefined, { timeout: 20000, polling: 16 });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

async function openMobilePatientDeepLink(page, { base, patientId, token, warmSession = true }) {
  const root = String(base || '').replace(/\/+$/, '');

  if (warmSession) {
    await page.goto(`${root}/staff?view=customers`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForMobileShell(page);
    await ensureStaffSession(page, token);
    await page
      .waitForFunction(
        () => {
          const rt = window.ArcanaPatientMasterUi?.getRuntime?.();
          const rows = document.querySelectorAll('[data-patient-row]').length;
          return rows > 0 || (rt?.loaded && Number(rt?.total || 0) > 0);
        },
        undefined,
        { timeout: 45000, polling: 200 }
      )
      .catch(() => {});
  }

  await page.goto(`${root}/staff?view=customers&patientId=${encodeURIComponent(patientId)}`, {
    waitUntil: 'commit',
    timeout: 60000,
  });
  await injectStaffToken(page, token);
  await waitForMobileShell(page);

  await page
    .waitForFunction(() => Number(window.__ARCANA_DEEPLINK_PRIME_MS__ || 0) > 0, undefined, {
      timeout: 8000,
      polling: 16,
    })
    .catch(() => {});

  await page
    .waitForFunction(
      () =>
        document.documentElement.getAttribute('data-cco-patient-detail') === 'on' ||
        Boolean(document.querySelector('[data-patient-loading="true"]')) ||
        Boolean(document.querySelector('.patient-master-camera-button')),
      undefined,
      { timeout: 20000, polling: 16 }
    )
    .catch(() => {});

  const ready = await waitForPatientDetailReady(page, { timeout: 90000, patientId });
  if (!ready) {
    throw new Error(`Kunddetail laddades inte inom timeout (${patientId.slice(0, 8)}…)`);
  }

  await page.evaluate(() => {
    window.ArcanaPatientMasterUi?.setPatientTab?.('journal');
  });
}

module.exports = {
  injectStaffToken,
  waitForMobileShell,
  ensureStaffSession,
  waitForPatientDetailReady,
  openMobilePatientDeepLink,
  isPatientDetailReady,
};
