/* eslint-disable no-console */
function getArgValue(args, name, fallback = '') {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function asInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asJsonSafe(text) {
  try {
    return JSON.parse(String(text || '{}'));
  } catch {
    return {};
  }
}

async function httpJson(url, { method = 'GET', token = '', body } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  const data = asJsonSafe(raw);

  if (!response.ok) {
    const message = data?.error || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

async function login({ baseUrl, email, password, tenantId }) {
  const payload = await httpJson(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    body: { email, password, tenantId },
  });
  const token = String(payload?.token || '');
  if (!token) {
    throw new Error('Login lyckades inte: token saknas.');
  }
  return token;
}

async function findLatestEvaluationId({ baseUrl, token, templateId, versionId }) {
  const query = new URLSearchParams({
    templateId,
    templateVersionId: versionId,
    limit: '1',
  });
  const payload = await httpJson(`${baseUrl}/api/v1/risk/evaluations?${query.toString()}`, {
    method: 'GET',
    token,
  });
  const first = Array.isArray(payload?.evaluations) ? payload.evaluations[0] : null;
  return String(first?.id || '');
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = String(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const email = String(process.env.ARCANA_OWNER_EMAIL || 'owner@hairtpclinic.se');
  const password = String(process.env.ARCANA_OWNER_PASSWORD || 'ArcanaPilot!2026');
  const tenantId = String(process.env.ARCANA_DEFAULT_TENANT || 'hair-tp-clinic');

  const limit = Math.max(1, Math.min(50, asInt(getArgValue(args, '--limit', '20'), 20)));
  const offsetStart = Math.max(0, asInt(getArgValue(args, '--offset', '0'), 0));
  const category = getArgValue(args, '--category', '');
  const namePrefix = getArgValue(args, '--name-prefix', '');
  const applyAll = hasFlag(args, '--all');
  const allowDuplicates = hasFlag(args, '--allow-duplicates');
  const skipExisting = hasFlag(args, '--skip-existing') || !allowDuplicates;
  const overrideReview = hasFlag(args, '--override-review');
  const ownerAction = getArgValue(args, '--owner-action', 'approve_exception');

  console.log('== Mail seeds: apply + activate ==');
  console.log(`BASE_URL: ${baseUrl}`);
  console.log(`TENANT_ID: ${tenantId}`);
  console.log(`LIMIT: ${limit}`);
  console.log(`OFFSET: ${offsetStart}`);
  console.log(`ALL: ${applyAll ? 'yes' : 'no'}`);
  console.log(`SKIP_EXISTING: ${skipExisting ? 'yes' : 'no'}`);
  console.log(`OVERRIDE_REVIEW: ${overrideReview ? 'yes' : 'no'}`);

  const token = await login({ baseUrl, email, password, tenantId });
  console.log(`✅ Login OK (token längd: ${token.length})`);

  const summary = {
    created: 0,
    activated: [],
    skipped: [],
    failed: [],
  };
  let offset = offsetStart;
  let batch = 0;

  while (true) {
    batch += 1;
    const applyPayload = {
      dryRun: false,
      limit,
      offset,
      skipExisting,
    };
    if (category) applyPayload.category = category;
    if (namePrefix) applyPayload.namePrefix = namePrefix;

    const applyResult = await httpJson(`${baseUrl}/api/v1/mail/template-seeds/apply`, {
      method: 'POST',
      token,
      body: applyPayload,
    });

    const createdTemplates = Array.isArray(applyResult?.templates) ? applyResult.templates : [];
    const skippedTemplates = Array.isArray(applyResult?.skipped) ? applyResult.skipped : [];
    const selected = Number(applyResult?.selected || createdTemplates.length || 0);
    const totalAvailable = Number(applyResult?.totalAvailable || selected || 0);
    summary.created += createdTemplates.length;
    for (const skippedItem of skippedTemplates) {
      const skippedLabel = `${skippedItem?.templateName || skippedItem?.templateId || '-'} (existing)`;
      summary.skipped.push({
        label: skippedLabel,
        reason: `finns redan (templateId: ${skippedItem?.templateId || '-'})`,
      });
    }

    console.log(
      `✅ Batch ${batch}: created=${createdTemplates.length}, skippedExisting=${skippedTemplates.length}, selected=${selected}, offset=${offset}, total=${totalAvailable}`
    );

    for (const item of createdTemplates) {
      const templateId = String(item?.templateId || '');
      const versionId = String(item?.versionId || '');
      const decision = String(item?.decision || 'allow');
      const riskLevel = Number(item?.riskLevel || 1);
      const label = `${item?.templateName || templateId} (L${riskLevel}, ${decision})`;

      if (!templateId || !versionId) {
        summary.failed.push({ label, reason: 'saknar template/version-id' });
        continue;
      }

      if (decision !== 'allow' && !overrideReview) {
        summary.skipped.push({
          label,
          reason: `kräver owner-beslut (${decision})`,
        });
        continue;
      }

      try {
        if (decision !== 'allow' && overrideReview) {
          const evaluationId = await findLatestEvaluationId({
            baseUrl,
            token,
            templateId,
            versionId,
          });
          if (!evaluationId) {
            throw new Error('kunde inte hitta risk evaluation för owner-action');
          }
          await httpJson(`${baseUrl}/api/v1/risk/evaluations/${evaluationId}/owner-action`, {
            method: 'POST',
            token,
            body: {
              action: ownerAction,
              note: 'Automatisk owner action från apply-activate script',
            },
          });
        }

        await httpJson(`${baseUrl}/api/v1/templates/${templateId}/versions/${versionId}/activate`, {
          method: 'POST',
          token,
        });
        summary.activated.push({ label });
      } catch (error) {
        summary.failed.push({
          label,
          reason: error?.message || 'okänt fel',
        });
      }
    }

    const nextOffset = offset + selected;
    const reachedEnd = selected <= 0 || nextOffset >= totalAvailable;
    if (!applyAll || reachedEnd) break;
    offset = nextOffset;
  }

  console.log(`✅ Total apply: ${summary.created}`);
  console.log(`✅ Activation klart: ${summary.activated.length} aktiverade`);
  if (summary.skipped.length) {
    console.log(`ℹ️ Skippade (${summary.skipped.length}):`);
    for (const row of summary.skipped.slice(0, 20)) {
      console.log(`- ${row.label}: ${row.reason}`);
    }
  }
  if (summary.failed.length) {
    console.log(`⚠️ Misslyckade (${summary.failed.length}):`);
    for (const row of summary.failed.slice(0, 20)) {
      console.log(`- ${row.label}: ${row.reason}`);
    }
  }
}

main().catch((error) => {
  console.error('❌ apply-activate misslyckades');
  console.error(error?.message || error);
  process.exit(1);
});
