const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  createCcoSendActionStore,
  isDryRunDefault,
  FORM_TEMPLATES,
  CONSENT_TEMPLATES,
  ALLOWED_MIME_BY_KIND,
  SEND_KINDS,
} = require('../../src/ops/ccoSendActionStore');

async function withTempStore(fn, opts = {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-send-'));
  const filePath = path.join(tempDir, 'cco-send-actions.json');
  try {
    const store = await createCcoSendActionStore({ filePath, ...opts });
    await fn(store, filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test('exports constants and factory', () => {
  assert.equal(typeof createCcoSendActionStore, 'function');
  assert.equal(typeof isDryRunDefault, 'function');
  assert.equal(typeof FORM_TEMPLATES, 'object');
  assert.equal(typeof CONSENT_TEMPLATES, 'object');
  assert.ok(FORM_TEMPLATES.health_declaration);
  assert.ok(CONSENT_TEMPLATES.photo_publish);
  assert.ok(Array.isArray(ALLOWED_MIME_BY_KIND.file));
  assert.ok(ALLOWED_MIME_BY_KIND.file.includes('application/pdf'));
  assert.ok(Array.isArray(SEND_KINDS) && SEND_KINDS.includes('form'));
});

test('buildFormPayload shape', async () => {
  await withTempStore(async (store) => {
    const payload = store.buildFormPayload({
      customerId: 'CUST-1',
      customerName: 'Anna',
      customerEmail: 'anna@example.com',
      formKind: 'health_declaration',
      urlToken: 'tok123',
    });
    assert.equal(payload.kind, 'form');
    assert.equal(payload.formKind, 'health_declaration');
    assert.equal(payload.to, 'anna@example.com');
    assert.ok(payload.subject.length > 0);
    assert.match(payload.html, /Anna/);
    assert.match(payload.url, /tok123/);
    assert.equal(payload.meta.customerId, 'cust-1');
  });
});

test('buildFormPayload rejects unknown formKind', async () => {
  await withTempStore(async (store) => {
    assert.throws(
      () => store.buildFormPayload({ customerEmail: 'x@y.se', formKind: 'nope' }),
      (e) => e.statusCode === 400
    );
  });
});

test('buildConsentPayload shape', async () => {
  await withTempStore(async (store) => {
    const payload = store.buildConsentPayload({
      customerId: 'C2',
      customerName: 'Bo',
      customerEmail: 'bo@example.com',
      consentKind: 'photo_publish',
    });
    assert.equal(payload.kind, 'consent');
    assert.equal(payload.consentKind, 'photo_publish');
    assert.equal(payload.to, 'bo@example.com');
    assert.ok(payload.subject);
  });
});

test('buildFilePayload validates mime', async () => {
  await withTempStore(async (store) => {
    const ok = store.buildFilePayload({
      customerEmail: 'c@d.se',
      customerName: 'Cee',
      fileName: 'avtal.pdf',
      fileMime: 'application/pdf',
      fileNote: 'Se bifogat',
    });
    assert.equal(ok.kind, 'file');
    assert.equal(ok.attachments[0].filename, 'avtal.pdf');
    assert.equal(ok.attachments[0].contentType, 'application/pdf');
    assert.match(ok.html, /Se bifogat/);

    assert.throws(
      () =>
        store.buildFilePayload({
          customerEmail: 'c@d.se',
          fileName: 'x.exe',
          fileMime: 'application/x-msdownload',
        }),
      (e) => e.statusCode === 400
    );
  });
});

test('buildEncounterPayload shape', async () => {
  await withTempStore(async (store) => {
    const payload = store.buildEncounterPayload({
      customerEmail: 'e@f.se',
      customerName: 'Eva',
      encounterDate: '2026-07-01',
      encounterTime: '10:00',
      treatmentLabel: 'hårtransplantation',
      staffName: 'Dr Test',
      encounterId: 'ENC-9',
    });
    assert.equal(payload.kind, 'encounter');
    assert.match(payload.subject, /hårtransplantation/);
    assert.match(payload.url, /ENC-9/);
    assert.equal(payload.meta.encounterId, 'ENC-9');
  });
});

test('commonCtx requires customerEmail', async () => {
  await withTempStore(async (store) => {
    assert.throws(
      () => store.buildFormPayload({ customerName: 'NoEmail' }),
      (e) => e.statusCode === 400
    );
  });
});

test('performSend dry-run records without mailer', async () => {
  await withTempStore(async (store) => {
    const payload = store.buildFormPayload({
      customerEmail: 'dry@run.se',
      customerName: 'Dry',
      formKind: 'health_declaration',
    });
    const result = await store.performSend({
      kind: 'form',
      payload,
      customerId: 'CUST-DRY',
      role: 'staff',
      dryRunOverride: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(result.status, 'dry-run');
    assert.ok(result.sendId);

    const list = store.listSends({});
    assert.equal(list.length, 1);
    assert.equal(list[0].dryRun, true);
    assert.equal(list[0].status, 'dry-run');
  });
});

test('performSend with stub mailer records a sent send', async () => {
  const calls = [];
  const stubMailer = {
    async sendEmail(input) {
      calls.push(input);
      return { ok: true, mode: 'live', messageId: 'msg-abc' };
    },
  };
  await withTempStore(
    async (store) => {
      const payload = store.buildConsentPayload({
        customerEmail: 'live@send.se',
        customerName: 'Live',
        consentKind: 'photo_publish',
      });
      const result = await store.performSend({
        kind: 'consent',
        payload,
        customerId: 'CUST-LIVE',
        dryRunOverride: false,
      });
      assert.equal(result.ok, true);
      assert.equal(result.dryRun, false);
      assert.equal(result.status, 'sent');
      assert.equal(result.messageId, 'msg-abc');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].to, 'live@send.se');

      const list = store.listSends({ kind: 'consent' });
      assert.equal(list.length, 1);
      assert.equal(list[0].status, 'sent');
    },
    { mailer: stubMailer }
  );
});

test('performSend failed mailer is recorded', async () => {
  const stubMailer = {
    async sendEmail() {
      return { ok: false, error: 'boom' };
    },
  };
  await withTempStore(
    async (store) => {
      const payload = store.buildFilePayload({
        customerEmail: 'fail@x.se',
        fileName: 'a.pdf',
        fileMime: 'application/pdf',
      });
      const result = await store.performSend({
        kind: 'file',
        payload,
        dryRunOverride: false,
      });
      assert.equal(result.ok, false);
      assert.equal(result.status, 'failed');
      assert.equal(result.error, 'boom');
    },
    { mailer: stubMailer }
  );
});

test('performSend rejects unknown kind and missing payload', async () => {
  await withTempStore(async (store) => {
    await assert.rejects(
      () => store.performSend({ kind: 'nope', payload: { to: 'a@b.se' } }),
      (e) => e.statusCode === 400
    );
    await assert.rejects(
      () => store.performSend({ kind: 'form' }),
      (e) => e.statusCode === 400
    );
  });
});

test('performSend resolves template snapshot via templateRegistry (guarded)', async () => {
  const templateRegistry = {
    snapshotForSend(id, lang) {
      return { templateId: id, lang, version: 3 };
    },
  };
  await withTempStore(
    async (store) => {
      const payload = store.buildFormPayload({
        customerEmail: 't@t.se',
        formKind: 'health_declaration',
      });
      const result = await store.performSend({
        kind: 'form',
        payload,
        dryRunOverride: true,
        templateRef: 'tpl-1',
        templateLang: 'sv',
      });
      assert.ok(result.templateSnapshot);
      assert.equal(result.templateSnapshot.templateId, 'tpl-1');
      assert.equal(result.templateSnapshot.version, 3);
    },
    { templateRegistry }
  );
});

test('listSends + stats', async () => {
  await withTempStore(async (store) => {
    for (const kind of ['form', 'consent', 'form']) {
      const build =
        kind === 'form'
          ? store.buildFormPayload({ customerEmail: 's@s.se', formKind: 'health_declaration' })
          : store.buildConsentPayload({ customerEmail: 's@s.se', consentKind: 'photo_publish' });
      await store.performSend({ kind, payload: build, customerId: 'CC', dryRunOverride: true });
    }
    const all = store.listSends({});
    assert.equal(all.length, 3);
    const forms = store.listSends({ kind: 'form' });
    assert.equal(forms.length, 2);
    const byCustomer = store.listSends({ customerId: 'CC' });
    assert.equal(byCustomer.length, 3);
    const limited = store.listSends({ limit: 1 });
    assert.equal(limited.length, 1);

    const s = store.stats();
    assert.equal(s.total, 3);
    assert.equal(s.dryRunCount, 3);
    assert.equal(s.byKind.form, 2);
    assert.equal(s.byKind.consent, 1);
    assert.equal(typeof s.dryRunDefault, 'boolean');
  });
});

test('persistence: sends survive reload', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-cco-send-persist-'));
  const filePath = path.join(tempDir, 'cco-send-actions.json');
  try {
    const store1 = await createCcoSendActionStore({ filePath });
    const payload = store1.buildFormPayload({
      customerEmail: 'p@p.se',
      formKind: 'health_declaration',
    });
    await store1.performSend({ kind: 'form', payload, dryRunOverride: true });

    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    assert.equal(raw.version, 1);
    assert.equal(raw.sends.length, 1);

    const store2 = await createCcoSendActionStore({ filePath });
    assert.equal(store2.listSends({}).length, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('audit log append is called when provided', async () => {
  const entries = [];
  const auditLog = { append: (e) => entries.push(e) };
  await withTempStore(
    async (store) => {
      const payload = store.buildFormPayload({
        customerEmail: 'a@a.se',
        formKind: 'health_declaration',
      });
      await store.performSend({ kind: 'form', payload, dryRunOverride: true, role: 'admin' });
      assert.equal(entries.length, 1);
      assert.equal(entries[0].action, 'cco.send.performed');
      assert.equal(entries[0].target.kind, 'send');
    },
    { auditLog }
  );
});
