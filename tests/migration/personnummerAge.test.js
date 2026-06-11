'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeAgeYearsFromPersonnummer,
  resolveBirthYyyymmddDigits,
} = require('../../scripts/migration/lib/migrationUtils');

test('resolveBirthYyyymmddDigits: 12-siffrigt personnummer', () => {
  assert.equal(resolveBirthYyyymmddDigits('19790615-1234'), '19790615');
  assert.equal(resolveBirthYyyymmddDigits('197906151234'), '19790615');
});

test('resolveBirthYyyymmddDigits: 10-siffrigt YYMMDD', () => {
  assert.equal(resolveBirthYyyymmddDigits('790615-1234'), '19790615');
  assert.equal(resolveBirthYyyymmddDigits('7906151234'), '19790615');
});

test('computeAgeYearsFromPersonnummer: födelsedag ej passerad ännu i år', () => {
  const age = computeAgeYearsFromPersonnummer('19790615-1234', new Date('2026-06-04T12:00:00Z'));
  assert.equal(age, 46);
});

test('computeAgeYearsFromPersonnummer: födelsedag passerad', () => {
  const age = computeAgeYearsFromPersonnummer('19790615-1234', new Date('2026-06-16T12:00:00Z'));
  assert.equal(age, 47);
});

test('computeAgeYearsFromPersonnummer: ogiltigt personnummer → null', () => {
  assert.equal(computeAgeYearsFromPersonnummer(''), null);
  assert.equal(computeAgeYearsFromPersonnummer('abc'), null);
});
