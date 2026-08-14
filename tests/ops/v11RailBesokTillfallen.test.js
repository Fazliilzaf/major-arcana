'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const RK = path.join(ROOT, 'public', 'major-arcana-preview', 'app', 'cco-v11-rk.js');
const source = fs.readFileSync(RK, 'utf8');

require(RK);
const RailKomplett = globalThis.CcoV11RailKomplett;

test('V11 exponerar endast den ordinarie rail-renderaren', () => {
  assert.equal(typeof RailKomplett.render, 'function');
  assert.equal(RailKomplett.renderBesokOccasion, undefined);
  assert.equal(RailKomplett.hydrateBesok, undefined);
});

test('Besök tillfällen byggs från bokningshistorik enligt facit', () => {
  assert.match(source, /bundle && bundle\.historyBookings/);
  assert.match(source, /label\('Besök · tillfällen'\)/);
  assert.match(source, /b\.timeLabel \|\| b\.time/);
  assert.match(source, /b\.durationLabel \|\| b\.duration/);
  assert.match(source, /b\.staffName \|\| b\.providerName \|\| b\.resourceName/);
});

test('V11 visar besök, foton och filer i unifyade kort utan separat journalsektion', () => {
  const html = RailKomplett.render({
    card: { id: 'pat-42' },
    dossierBundle: {
      historyBookings: [
        {
          dayLabel: '05 maj',
          title: 'PRP 1/3',
          timeLabel: '11:15',
          durationLabel: '45 min',
          staffName: 'Erik Holm',
        },
      ],
    },
    journalEntries: [{ title: 'PRP-journal', status: 'signed' }],
    driveFiles: [],
  });

  assert.match(html, /Besök · tillfällen/);
  assert.match(html, /PRP 1\/3/);
  assert.match(html, /11:15 · 45 min · Erik Holm/);
  assert.doesNotMatch(html, /Journaler · personal/);
  assert.match(html, /data-v11-rk-besok="pat-42"/);
});

test('V11:s fotoöversikt är begränsad till tre bilder', () => {
  assert.match(source, /ph\s*\.slice\(0, 3\)/);
  assert.match(source, /data-patient-file-id/);
  assert.match(source, /data-v11-photo-edit/);
});

test('V11:s asynkrona besökssnabbvy visar senaste rummet och högst tre bilder', () => {
  assert.match(source, /var imgs = allImages\.slice\(0, 3\)/);
  assert.match(source, /var previewSegment =/);
  assert.match(source, /renderBesokOccasion\(previewSegment, pid\)/);
  assert.match(source, /Öppna hela besöket/);
});
