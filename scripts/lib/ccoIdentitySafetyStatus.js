'use strict';

const https = require('node:https');

const IDENTITY_PAGES = Object.freeze([
  { id: 'preSignCheck', label: 'Pre-signering check', path: '/cco-pre-signering-check.html' },
  {
    id: 'reviewMaterialWarning',
    label: 'Review-material warning',
    path: '/cco-review-material-warning.html',
  },
  {
    id: 'staffDay1Checklist',
    label: 'Staff day-1 checklist',
    path: '/cco-staff-day1-checklist.html',
  },
  { id: 'signoffSheet', label: 'Sign-off sheet', path: '/journal-pilot-signoff-sheet.html' },
  { id: 'staffTraining', label: 'Staff training mode', path: '/cco-staff-training-mode.html' },
  { id: 'journalFaq', label: 'Journalpilot FAQ', path: '/cco-journalpilot-faq.html' },
  { id: 'goLiveSupport', label: 'Go-live support', path: '/cco-journalpilot-go-live.html' },
  {
    id: 'personalStart',
    label: 'Personal-start (identitet i flöde)',
    path: '/cco-personal-start.html',
  },
]);

function probePage(base, urlPath) {
  return new Promise((resolve) => {
    const url = new URL(urlPath, base);
    const req = https.request(url, { method: 'HEAD', timeout: 12000 }, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', () => resolve(0));
    req.on('timeout', () => {
      req.destroy();
      resolve(0);
    });
    req.end();
  });
}

async function collectIdentitySafetyStatus({ base }) {
  const pages = await Promise.all(
    IDENTITY_PAGES.map(async (p) => {
      const status = await probePage(base, p.path);
      return {
        ...p,
        status,
        available: status === 200,
      };
    })
  );

  const allOk = pages.every((p) => p.available);
  const coreOk = pages
    .filter((p) =>
      ['preSignCheck', 'reviewMaterialWarning', 'staffDay1Checklist', 'signoffSheet'].includes(p.id)
    )
    .every((p) => p.available);

  return {
    generatedAt: new Date().toISOString(),
    overall: allOk ? 'PASS' : coreOk ? 'PARTIAL' : 'FAIL',
    identityCheckAvailable: pages.find((p) => p.id === 'personalStart')?.available === true,
    preSignCheckAvailable: pages.find((p) => p.id === 'preSignCheck')?.available === true,
    reviewMaterialWarningAvailable:
      pages.find((p) => p.id === 'reviewMaterialWarning')?.available === true,
    staffChecklistAvailable: pages.find((p) => p.id === 'staffDay1Checklist')?.available === true,
    signoffSheetAvailable: pages.find((p) => p.id === 'signoffSheet')?.available === true,
    staffTrainingAvailable: pages.find((p) => p.id === 'staffTraining')?.available === true,
    journalFaqAvailable: pages.find((p) => p.id === 'journalFaq')?.available === true,
    goLiveSupportAvailable: pages.find((p) => p.id === 'goLiveSupport')?.available === true,
    pages,
    note: 'Read-only sidor — stödjer identitet/review-material före signering, ingen journalmotor',
  };
}

module.exports = {
  IDENTITY_PAGES,
  collectIdentitySafetyStatus,
};
