'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classify,
  buildPrecedents,
  autoApproveExpenses,
} = require('../../src/cfo/cfoExpenseAutoApprove');

const SYNCED = {
  id: 'exp_prec',
  supplier: 'Meta for Business',
  status: 'exported',
  fortnoxSyncStatus: 'synced',
  vatMode: 'reverse_charge_eu',
  updatedAt: '2026-07-17',
};

test('classify: full beviskedja + prejudikat → eligible med moms-arv', () => {
  const prec = buildPrecedents([SYNCED]);
  const c = classify(
    {
      id: 'e1',
      supplier: 'meta for business',
      status: 'categorized',
      amountSek: 7096,
      category: 'marknadsforing',
      attachmentKeys: ['k1'],
      vatMode: null,
    },
    prec
  );
  assert.equal(c.eligible, true);
  assert.equal(c.inheritVatMode, 'reverse_charge_eu');
});

test('classify: ny leverantör (inget prejudikat) → no_precedent', () => {
  const prec = buildPrecedents([SYNCED]);
  const c = classify(
    {
      id: 'e2',
      supplier: 'Booking.com',
      status: 'new',
      amountSek: 500,
      category: 'resor',
      attachmentKeys: ['k'],
    },
    prec
  );
  assert.deepEqual(c, { eligible: false, reason: 'no_precedent' });
});

test('classify: utan underlag / utan belopp / representation utan deductibleVat → stannar', () => {
  const prec = buildPrecedents([
    SYNCED,
    { ...SYNCED, id: 'exp_food', supplier: 'Foodora AB', vatMode: 'representation_limited' },
  ]);
  assert.equal(
    classify(
      {
        supplier: 'Meta for Business',
        status: 'new',
        amountSek: 100,
        category: 'x',
        attachmentKeys: [],
      },
      prec
    ).reason,
    'no_evidence'
  );
  assert.equal(
    classify(
      {
        supplier: 'Meta for Business',
        status: 'new',
        amountSek: 0,
        category: 'x',
        attachmentKeys: ['k'],
      },
      prec
    ).reason,
    'no_amount'
  );
  assert.equal(
    classify(
      {
        supplier: 'Foodora AB',
        status: 'new',
        amountSek: 500,
        category: 'mat_representation',
        attachmentKeys: ['k'],
        deductibleVatSek: null,
      },
      prec
    ).reason,
    'vat_uncertain'
  );
});

test('autoApproveExpenses: godkänner + ready via store-API, hoppar övriga', async () => {
  const state = {};
  const rows = [
    SYNCED,
    {
      id: 'e_ok',
      supplier: 'Meta',
      status: 'categorized',
      amountSek: 7096,
      category: 'marknadsforing',
      attachmentKeys: ['k'],
      vatMode: null,
    },
    {
      id: 'e_ny',
      supplier: 'Okänd AB',
      status: 'new',
      amountSek: 100,
      category: 'ovrigt',
      attachmentKeys: ['k'],
    },
  ];
  const precSynced = { ...SYNCED, supplier: 'Meta' };
  rows[0] = precSynced;
  const store = {
    listExpenses: () => rows,
    setVatMode: async ({ id, vatMode }) => {
      state.vat = id + ':' + vatMode;
    },
    transitionStatus: async ({ id, newStatus }) => {
      state[id] = (state[id] ? state[id] + '>' : '') + newStatus;
    },
  };
  const r = await autoApproveExpenses({ expenseStore: store });
  assert.equal(r.approved, 1);
  assert.equal(state.e_ok, 'approved>ready_for_export');
  assert.equal(state.vat, 'e_ok:reverse_charge_eu');
  assert.equal(r.skipped.no_precedent, 1);
});
