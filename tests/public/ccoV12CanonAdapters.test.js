'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAdapters() {
  const src = fs.readFileSync(
    path.join(__dirname, '../../public/major-arcana-preview/app/cco-v11-rail-adapters.js'),
    'utf8'
  );
  const sandbox = { window: {}, console };
  vm.runInNewContext(`${src}\n;this.exports = window.CcoV11RailAdapters;`, sandbox);
  return sandbox.exports;
}

const A = loadAdapters();

test('buildStepAssets mappar dokument → rätt steg via filnamn', () => {
  const journey = {
    steps: [
      { id: 1, label: 'Bokning konsultation' },
      { id: 2, label: 'Bokningsbekräftelse-mail' },
      { id: 3, label: 'Hälsodeklaration' },
      { id: 4, label: 'Konsultation' },
      { id: 5, label: 'Offert = Behandlingsplan' },
      { id: 7, label: 'Avtal + behandlingssamtycke' },
    ],
  };
  const files = [
    { id: 'a', name: 'Hälsodeklaration signerad.pdf', fileType: 'document' },
    { id: 'b', name: 'Offert PRP-paket.pdf', fileType: 'document' },
    { id: 'c', name: 'Avtal + samtycke.pdf', fileType: 'document' },
    { id: 'd', name: 'Bokningsbekräftelse.pdf', fileType: 'document' },
    { id: 'p1', name: 'fore.jpg', fileType: 'image', category: 'photo_before' },
    { id: 'p2', name: 'efter.jpg', fileType: 'image', category: 'photo_after' },
  ];
  const entries = [{ title: 'PRP-protokoll 1/3' }, { title: 'Konsultationsjournal' }];
  const sa = A.buildStepAssets(journey, files, entries);
  assert.equal(sa[3].docs, 1, 'HD-dok → steg 3');
  assert.equal(sa[5].docs, 1, 'Offert-dok → steg 5');
  assert.equal(sa[7].docs, 1, 'Avtal-dok → steg 7');
  assert.equal(sa[2].docs, 1, 'Bokningsbekräftelse → steg 2');
  assert.equal(sa[4].photos, 2, '2 foton → konsultation');
  assert.equal(sa[4].journals, 2, '2 journaler → konsultation');
});

test('buildStepAssets tom när inga assets/steg', () => {
  assert.equal(Object.keys(A.buildStepAssets({ steps: [] }, [], [])).length, 0);
  assert.equal(Object.keys(A.buildStepAssets(null, null, null)).length, 0);
});

test('buildHealthPreview exponerar per-frågesvar (answers)', () => {
  const hp = A.buildHealthPreview({
    healthDeclaration: {
      signedAt: '2026-06-12',
      answers: [
        { label: 'Allergier', value: 'Ja', detail: 'Penicillin', risk: 'red' },
        { label: 'Graviditet', value: 'Nej' },
      ],
    },
  });
  assert.equal(hp.answers.length, 2);
  assert.equal(hp.answers[0].label, 'Allergier');
  assert.equal(hp.answers[0].risk, 'red');
  assert.equal(hp.answers[0].detail, 'Penicillin');
  assert.equal(hp.answers[1].risk, '');
});

test('buildCommunicationFromState läser communicationMessages med preview + dir', () => {
  const comm = A.buildCommunicationFromState({}, [], {
    communicationMessages: [
      {
        type: 'mail',
        direction: 'in',
        subject: 'Re: PRP-bekräftelse',
        preview: 'Tack, det stämmer.',
        occurredAt: '2026-05-18',
      },
      {
        type: 'sms',
        direction: 'out',
        subject: '',
        preview: 'Påminnelse',
        occurredAt: '2026-05-19',
      },
    ],
  });
  assert.equal(comm.items.length, 2);
  assert.equal(comm.items[0].preview, 'Tack, det stämmer.');
  assert.equal(comm.items[0].dir, 'in');
  assert.equal(comm.items[0].text, 'Re: PRP-bekräftelse');
  // SMS utan ämne → tomt subject (ej "Mejl")
  assert.equal(comm.items[1].dir, 'out');
  assert.equal(comm.items[1].text, '');
});

test('buildFilesFromDriveFiles släpper igenom status/datum', () => {
  const res = A.buildFilesFromDriveFiles([
    {
      id: 'd',
      name: 'Friskförsäkran.pdf',
      fileType: 'document',
      status: 'Vänta sign',
      documentDate: '12 maj',
    },
  ]);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].status, 'Vänta sign');
  assert.equal(res.items[0].dateLabel, '12 maj');
});

test('buildEconomyFromCard ger fyra celler ur lifetimeValue/visitCount', () => {
  const econ = A.buildEconomyFromCard({
    lifetimeValue: 38400,
    visitCount: 3,
    lifetimeValueLabel: '~58 000',
    outstandingBalance: '0 kr',
  });
  assert.equal(econ.items.length, 4);
  const labels = econ.items.map((i) => i.label);
  assert.ok(labels.indexOf('Total intäkt') >= 0);
  assert.ok(labels.indexOf('Utestående') >= 0);
});

test('buildRecentEvents härleder events ur tidsstämplar, nyast först', () => {
  const ev = A.buildRecentEvents(
    { healthDeclaration: { signedAt: '2026-06-12' } },
    {
      activeVisit: { checkedInAt: '2026-06-25T14:30:00' },
      paymentHistory: [{ dateIso: '2026-05-05', method: 'invoice', ref: 'F-1042' }],
    },
    [{ signedAt: '2026-05-05' }]
  );
  assert.ok(ev.length >= 1);
  assert.ok(ev.every((e) => e.what && e.when));
});
