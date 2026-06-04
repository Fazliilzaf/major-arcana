'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  looksLikeTechnicalPatientName,
  patientDisplayNameForList,
  sanitizePatientDisplayName,
} = require('../../src/lib/patientDisplayName');

describe('patientDisplayName', () => {
  it('flags drive photo filenames and uuid slugs', () => {
    assert.equal(looksLikeTechnicalPatientName('4A61-A14D-766A3C251538_1_105_c.jpeg'), true);
    assert.equal(looksLikeTechnicalPatientName('4A61-A14D-766A3C251538_1_105_c'), true);
    assert.equal(looksLikeTechnicalPatientName('scan.pdf'), true);
    assert.equal(looksLikeTechnicalPatientName('IMG_1042.JPG'), true);
    assert.equal(looksLikeTechnicalPatientName('a1b2c3d4-e5f6-7890-abcd-ef1234567890'), true);
  });

  it('keeps real patient names', () => {
    assert.equal(looksLikeTechnicalPatientName('Anna Karlsson'), false);
    assert.equal(looksLikeTechnicalPatientName('Jean-Pierre Dupont'), false);
    assert.equal(looksLikeTechnicalPatientName('Östen Åberg'), false);
  });

  it('sanitizes technical names to fallback', () => {
    assert.equal(sanitizePatientDisplayName('4A61-A14D-766A3C251538_1_105_c.jpeg'), 'Namn saknas');
    assert.equal(sanitizePatientDisplayName('Anna Karlsson'), 'Anna Karlsson');
  });

  it('resolves list display from card fields', () => {
    assert.equal(
      patientDisplayNameForList({ displayName: '4A61-A14D-766A3C251538_1_105_c.jpeg' }),
      'Namn saknas'
    );
    assert.equal(
      patientDisplayNameForList({
        displayName: '4A61-A14D-766A3C251538_1_105_c.jpeg',
        firstName: 'Eva',
        lastName: 'Karlsson',
      }),
      'Eva Karlsson'
    );
    assert.equal(patientDisplayNameForList({}), 'Namn saknas');
  });
});
