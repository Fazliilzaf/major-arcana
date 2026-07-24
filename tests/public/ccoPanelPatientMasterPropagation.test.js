'use strict';

/* Inkoppling #2: efter Svarstudio (#1189) ska ÄVEN iframe-panelerna (Dossier/
 * Anteckning/Bokning/Signering) konsumera den redan lösta patient-ID-kopplingen.
 * Launchern bär nu det kanoniska patientId:t i panel-kontexten och postar en
 * berikad uppföljning med den RIKTIGA patient-master-kundposten; varje panels
 * applyContext binder då kanoniskt displayName i stället för hårdkodad demo
 * ("Anna Karlsson") / enbart tråd-namn. Fail-closed: utan patientId (t.ex. bara
 * e-post) hämtas inget. Rent surfacing av redan-löst identitet — ingen ny
 * datakoppling. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LAUNCHER = path.join(__dirname, '..', '..', 'public', 'konversationer-bottom-actions.js');
const PREVIEW = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview');

test('launchern bär kanoniskt patientId i panel-kontexten (fail-closed, aldrig e-post)', () => {
  const source = fs.readFileSync(LAUNCHER, 'utf8');
  assert.match(
    source,
    /patientId: cleanText\(ctx\.patientId\)/,
    'buildSmartAnteckningContext ska exponera kanoniskt patientId'
  );
});

test('launchern postar en berikad panel-kontext med patient-master-kortet', () => {
  const source = fs.readFileSync(LAUNCHER, 'utf8');
  assert.match(
    source,
    /function postPanelContextWithPatientMaster\(frame, type, context\)/,
    'ska finnas en delad berikningshjälpare'
  );
  // Bas-kontext direkt + berikad uppföljning på kanoniskt patientId.
  assert.match(
    source,
    /fetchPatientMasterCard\(context && context\.patientId\)/,
    'ska hämta patient-master på det kanoniska patientId:t (inte customerId/e-post)'
  );
  assert.match(
    source,
    /\.\.\.context, patientMaster: record/,
    'ska posta { patientMaster } så panelen kan uppgradera till kanonisk identitet'
  );
  // De fyra panelerna (Dossier/Anteckning/Bokning/Signering) ska gå via hjälparen.
  for (const type of [
    'cco:patienthub:context',
    'cco:smart-anteckning:context',
    'cco:booking:context',
    'cco:signaturer:context',
  ]) {
    assert.match(
      source,
      new RegExp('postPanelContextWithPatientMaster\\(frame, \'' + type.replace(/:/g, ':') + '\''),
      type + ' ska postas via berikningshjälparen'
    );
  }
  // Anteckning/Bokning tog tidigare inget presetContext → tappade launcher-
  // presetens patientId. Nu ska de acceptera det.
  assert.match(source, /function openSmartAnteckning\(presetContext\)/);
  assert.match(source, /function openBokningsyta\(presetContext\)/);
});

for (const file of [
  'cco-patient-hub-v3.html',
  'cco-smart-anteckning-v3.html',
  'cco-signaturer-v3.html',
  'cco-ny-bokning.html',
]) {
  test(`${file}: applyContext binder kanoniskt patient-master-namn (displayName)`, () => {
    const source = fs.readFileSync(path.join(PREVIEW, file), 'utf8');
    assert.match(
      source,
      /context\.patientMaster && context\.patientMaster\.card/,
      `${file}: ska läsa patient-master-kortet ur kontexten`
    );
    assert.match(
      source,
      /pmCard\.displayName/,
      `${file}: ska binda kanoniskt displayName`
    );
  });
}
