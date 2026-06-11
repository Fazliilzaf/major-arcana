const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  CFO_BILLING_DATABASE_SCHEMA,
  CFO_BILLING_TABLES,
  createCfoBillingDraftStore,
} = require('../../src/cfo/cfoBillingDraftStore');
const { createCfoBillingDraftService } = require('../../src/cfo/cfoBillingDraftService');

async function withStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cfo-billing-'));
  const filePath = path.join(dir, 'billing-drafts.json');
  const auditEvents = [];
  const store = await createCfoBillingDraftStore({
    filePath,
    auditLog: {
      append(event) {
        auditEvents.push(event);
      },
    },
  });
  try {
    await run({ store, filePath, auditEvents });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('billing draft schema exposes required CFO database tables', async () => {
  assert.equal(CFO_BILLING_TABLES.drafts, 'cfo_billing_drafts');
  assert.equal(CFO_BILLING_TABLES.rows, 'cfo_billing_rows');
  assert.equal(CFO_BILLING_TABLES.fortnoxExportJobs, 'cfo_fortnox_export_jobs');
  assert.ok(CFO_BILLING_DATABASE_SCHEMA.tables.cfo_billing_drafts.includes('cfoInvoiceSourceKey'));
  assert.ok(CFO_BILLING_DATABASE_SCHEMA.tables.cfo_billing_rows.includes('draftId'));
  assert.ok(CFO_BILLING_DATABASE_SCHEMA.tables.cfo_fortnox_export_jobs.includes('responsePayload'));

  await withStore(async ({ filePath }) => {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8').catch(() => '{}'));
    assert.equal(raw.cfo_billing_drafts, undefined);
  });
});

test('createDraftFromSource creates offer draft rows idempotently by cfoInvoiceSourceKey', async () => {
  await withStore(async ({ store, auditEvents }) => {
    const actor = { userId: 'owner-1', role: 'owner' };
    const input = {
      tenantId: 'tenant-a',
      sourceType: 'offer',
      source: {
        id: 'offer-100',
        customer: {
          customerNumber: '42',
          name: 'Test Customer',
          email: 'test.customer@example.test',
        },
        items: [
          {
            id: 'line-1',
            label: 'Treatment package',
            quantity: 2,
            unitPrice: 1500,
            vatRatePercent: 25,
            accountNumber: 3001,
          },
        ],
      },
      actor,
    };

    const first = await store.createDraftFromSource(input);
    const second = await store.createDraftFromSource(input);

    assert.equal(first.created, true);
    assert.equal(first.draft.status, 'DRAFT');
    assert.equal(first.draft.cfoInvoiceSourceKey, 'tenant-a:offer:offer-100');
    assert.equal(first.rows.length, 1);
    assert.equal(first.rows[0].unitPrice, 1500);
    assert.equal(second.created, false);
    assert.equal(second.idempotent, true);
    assert.equal(second.draft.id, first.draft.id);
    assert.equal(store.listDrafts({ tenantId: 'tenant-a' }).length, 1);
    assert.equal(store.listRows({ draftId: first.draft.id }).length, 1);
    assert.ok(auditEvents.some((event) => event.action === 'cf.billing_draft.created'));
    assert.ok(auditEvents.some((event) => event.action === 'cf.billing_draft.idempotent_reuse'));
  });
});

test('createDraftFromSource accepts all billing source types', async () => {
  await withStore(async ({ store }) => {
    for (const sourceType of ['offer', 'booking', 'encounter', 'pos_order', 'manual']) {
      const created = await store.createDraftFromSource({
        tenantId: 'tenant-a',
        sourceType,
        sourceId: `${sourceType}-1`,
        customer: { customerName: `${sourceType} customer` },
        rows: [
          {
            label: `${sourceType} row`,
            quantity: 1,
            unitPrice: 100,
            vatRatePercent: 25,
          },
        ],
      });
      assert.equal(created.created, true);
      assert.equal(created.draft.sourceType, sourceType);
      assert.equal(created.rows.length, 1);
    }
    assert.equal(store.listDrafts({ tenantId: 'tenant-a' }).length, 5);
  });
});

test('exportDraftToFortnox blocks unapproved drafts before external createInvoice', async () => {
  await withStore(async ({ store }) => {
    let createInvoiceCalls = 0;
    const service = createCfoBillingDraftService({
      billingDraftStore: store,
      fortnoxConnector: {
        async createInvoice() {
          createInvoiceCalls += 1;
          return { ok: true, invoiceNumber: '1000' };
        },
        async sendInvoice() {
          throw new Error('sendInvoice must not be called');
        },
        async getInvoiceStatus() {
          return { ok: true };
        },
      },
    });
    const created = await service.createDraftFromSource({
      tenantId: 'tenant-a',
      sourceType: 'manual',
      sourceId: 'manual-1',
      customer: { customerName: 'Manual Customer' },
      rows: [{ label: 'Manual row', quantity: 1, unitPrice: 100, vatRatePercent: 25 }],
      actor: { userId: 'owner-1', role: 'owner' },
    });

    const exported = await service.exportDraftToFortnox({
      draftId: created.draft.id,
      actor: { userId: 'owner-1', role: 'owner' },
    });

    assert.equal(exported.ok, false);
    assert.equal(exported.reason, 'validation_failed');
    assert.ok(exported.errors.includes('draft_must_be_approved_for_export'));
    assert.equal(createInvoiceCalls, 0);
    assert.equal(store.listFortnoxExportJobs({ draftId: created.draft.id }).length, 0);
  });
});

test('exportDraftToFortnox creates invoice once and stores Fortnox response in export jobs', async () => {
  await withStore(async ({ store, auditEvents }) => {
    const createInvoicePayloads = [];
    const service = createCfoBillingDraftService({
      billingDraftStore: store,
      fortnoxConnector: {
        async createInvoice(payload) {
          createInvoicePayloads.push(payload);
          return {
            ok: true,
            invoiceNumber: '9001',
            dueDate: '2026-07-11',
            total: 1250,
            currency: 'SEK',
          };
        },
        async sendInvoice() {
          throw new Error('sendInvoice must not be called');
        },
        async getInvoiceStatus() {
          return { ok: true };
        },
      },
    });
    const actor = { userId: 'owner-1', role: 'owner' };
    const created = await service.createDraftFromSource({
      tenantId: 'tenant-a',
      sourceType: 'pos_order',
      source: {
        id: 'order-44',
        customerName: 'POS Customer',
        customerEmail: 'pos.customer@example.test',
        rows: [
          {
            label: 'POS treatment',
            quantity: 1,
            unitPrice: 1000,
            vatRatePercent: 25,
          },
        ],
      },
      actor,
    });
    await service.approveDraftForExport({ draftId: created.draft.id, actor });

    const exported = await service.exportDraftToFortnox({ draftId: created.draft.id, actor });
    const exportedAgain = await service.exportDraftToFortnox({ draftId: created.draft.id, actor });
    const jobs = store.listFortnoxExportJobs({ draftId: created.draft.id });
    const updated = store.getDraftById(created.draft.id);

    assert.equal(exported.ok, true);
    assert.equal(exported.idempotent, false);
    assert.equal(exported.response.invoiceNumber, '9001');
    assert.equal(exportedAgain.ok, true);
    assert.equal(exportedAgain.idempotent, true);
    assert.equal(createInvoicePayloads.length, 1);
    assert.equal(createInvoicePayloads[0].customerName, 'POS Customer');
    assert.equal(createInvoicePayloads[0].items[0].vatRate, 0.25);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].status, 'SUCCEEDED');
    assert.equal(jobs[0].responsePayload.invoiceNumber, '9001');
    assert.equal(jobs[0].cfoInvoiceSourceKey, 'tenant-a:pos_order:order-44');
    assert.equal(updated.status, 'FORTNOX_INVOICE_CREATED');
    assert.equal(updated.fortnoxInvoiceNumber, '9001');
    assert.ok(
      auditEvents.some((event) => event.action === 'cf.billing_draft.fortnox_invoice_created')
    );
  });
});
