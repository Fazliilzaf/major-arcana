'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bundlePath = path.join(
  __dirname,
  '../../public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const cloudPath = path.join(
  __dirname,
  '../../public/major-arcana-preview/app/cco-hairtp-document-cloud.js'
);
const meridiqPath = path.join(
  __dirname,
  '../../public/major-arcana-preview/app/cco-meridiq-content.js'
);
const step789Path = path.join(
  __dirname,
  '../../public/major-arcana-preview/data/meridiq-step789-content.json'
);

const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
const step789 = JSON.parse(fs.readFileSync(step789Path, 'utf8'));

function loadCloud() {
  const events = [];
  const globalObj = {
    console,
    global: {},
    document: {
      addEventListener: () => {},
      getElementById: () => null,
      createElement: () => ({
        classList: { add: () => {}, remove: () => {} },
        setAttribute: () => {},
        appendChild: () => {},
        querySelector: () => null,
        querySelectorAll: () => [],
      }),
      body: { appendChild: () => {} },
    },
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    location: { search: '', pathname: '/staff' },
    CcoMeridiqContent: {
      findDocumentByRegistryId(bundleArg, registryId) {
        for (const section of ['customerFilled', 'staffFilled', 'information']) {
          const hit = (bundleArg[section] || []).find((doc) => doc.registryId === registryId);
          if (hit) return { section, document: hit };
        }
        return null;
      },
    },
  };
  globalObj.global = globalObj;
  globalObj.window = globalObj;

  vm.runInNewContext(fs.readFileSync(cloudPath, 'utf8'), globalObj, {
    filename: 'cco-hairtp-document-cloud.js',
  });

  return { cloud: globalObj.CcoHairtpDocumentCloud, events, globalObj };
}

test('loadForSteg8 merges 13 Meridiq questions from bundle friskfoers_tp', () => {
  const globalObj = {
    console,
    global: {},
    CcoHairtpDocumentCloud: { ensureDocumentBundle: async () => bundle },
  };
  globalObj.global = globalObj;
  globalObj.window = globalObj;
  vm.runInNewContext(fs.readFileSync(meridiqPath, 'utf8'), globalObj, {
    filename: 'cco-meridiq-content.js',
  });

  const merged = globalObj.CcoMeridiqContent.mergeSteg8FromBundle(step789, bundle);
  assert.equal(merged.steg8.form.questions.length, 13);
  assert.equal(merged.steg8.formMeta.registryId, 'friskfoers_tp');
  assert.equal(merged.steg8.formMeta.contentStatus, 'FULL');
  assert.equal(merged.steg8.form.questions[0].id, 450966);
});

test('post-8 journals are excluded from V11 bundle payload journals group', () => {
  const { cloud } = loadCloud();
  const payload = cloud.buildV11DocumentPayloadFromBundle(bundle);
  const journalIds = payload.journals.map((row) => row.registryId);
  assert.ok(journalIds.includes('journal_tp'));
  assert.ok(journalIds.includes('journal_prp_multi'));
  assert.ok(!journalIds.includes('journal_tp_follow_4'));
  assert.ok(!journalIds.includes('journal_tp_post_prp'));
});

test('resolveStaffJournalRegistryId picks PRP journal for prp_hair flow', () => {
  const { cloud } = loadCloud();
  assert.equal(cloud.resolveStaffJournalRegistryId('tp'), 'journal_tp');
  assert.equal(cloud.resolveStaffJournalRegistryId('prp_hair'), 'journal_prp_multi');
  assert.equal(cloud.resolveStaffJournalPatientAction('journal_prp_multi'), 'new-prp-journal');
});

test('openStaffJournal dispatches patient action event', () => {
  const { cloud, events } = loadCloud();
  cloud.openStaffJournal({ flow: 'prp_hair' });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'cco:cloud-staff-action');
  assert.equal(events[0].detail.patientAction, 'new-prp-journal');
  assert.equal(events[0].detail.registryId, 'journal_prp_multi');
});

test('staff preview html includes ordination stub text from bundle', () => {
  const { cloud } = loadCloud();
  const html = cloud.buildStaffDocumentPreviewHtml('ordination_tp', bundle);
  assert.match(html, /Ordination enligt behandlingsplan/);
  assert.match(html, /PARTIAL/);
});

test('fore_efter_bildmall preview lists photo stages', () => {
  const { cloud } = loadCloud();
  const html = cloud.buildStaffDocumentPreviewHtml('fore_efter_bildmall', bundle);
  assert.match(html, /Före/);
  assert.match(html, /Efter/);
});
