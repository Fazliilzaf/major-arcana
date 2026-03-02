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

async function getTemplateVersionToEvaluate({ baseUrl, token, templateId }) {
  const payload = await httpJson(`${baseUrl}/api/v1/templates/${templateId}/versions`, {
    method: 'GET',
    token,
  });
  const versions = Array.isArray(payload?.versions) ? payload.versions : [];
  if (!versions.length) return '';
  const active = versions.find((item) => String(item?.state || '').toLowerCase() === 'active');
  return String((active || versions[0])?.id || '');
}

async function ensureEvaluationForVersion({ baseUrl, token, templateId, versionId }) {
  if (!templateId || !versionId) {
    return { evaluationId: '', created: false, decision: 'allow', riskLevel: 1 };
  }

  const existingEvaluationId = await findLatestEvaluationId({
    baseUrl,
    token,
    templateId,
    versionId,
  });
  if (existingEvaluationId) {
    const payload = await httpJson(
      `${baseUrl}/api/v1/risk/evaluations?templateId=${encodeURIComponent(
        templateId
      )}&templateVersionId=${encodeURIComponent(versionId)}&limit=1`,
      {
        method: 'GET',
        token,
      }
    );
    const first = Array.isArray(payload?.evaluations) ? payload.evaluations[0] : null;
    return {
      evaluationId: existingEvaluationId,
      created: false,
      decision: String(first?.decision || 'allow'),
      riskLevel: Number(first?.riskLevel || 1),
    };
  }

  const evaluationResult = await httpJson(
    `${baseUrl}/api/v1/templates/${templateId}/versions/${versionId}/evaluate`,
    {
      method: 'POST',
      token,
      body: {},
    }
  );
  const evaluationId = await findLatestEvaluationId({
    baseUrl,
    token,
    templateId,
    versionId,
  });
  return {
    evaluationId,
    created: true,
    decision: String(evaluationResult?.version?.risk?.decision || 'allow'),
    riskLevel: Number(evaluationResult?.version?.risk?.riskLevel || 1),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const baseUrl = String(process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
  const email = String(process.env.ARCANA_OWNER_EMAIL || 'fazli@hairtpclinic.com');
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
  const ensureEvaluations = !hasFlag(args, '--no-ensure-evaluations');
  const evaluateExisting = !hasFlag(args, '--skip-existing-evaluations');

  console.log('== Mail seeds: apply + activate ==');
  console.log(`BASE_URL: ${baseUrl}`);
  console.log(`TENANT_ID: ${tenantId}`);
  console.log(`LIMIT: ${limit}`);
  console.log(`OFFSET: ${offsetStart}`);
  console.log(`ALL: ${applyAll ? 'yes' : 'no'}`);
  console.log(`SKIP_EXISTING: ${skipExisting ? 'yes' : 'no'}`);
  console.log(`OVERRIDE_REVIEW: ${overrideReview ? 'yes' : 'no'}`);
  console.log(`ENSURE_EVALUATIONS: ${ensureEvaluations ? 'yes' : 'no'}`);
  console.log(
    `EVALUATE_EXISTING: ${ensureEvaluations && evaluateExisting ? 'yes' : 'no'}`
  );

  const token = await login({ baseUrl, email, password, tenantId });
  console.log(`✅ Login OK (token längd: ${token.length})`);

  const summary = {
    created: 0,
    activated: [],
    skipped: [],
    failed: [],
    evaluationsCreated: 0,
    evaluationsExisting: 0,
    evaluationsFailed: [],
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
      let decision = String(item?.decision || 'allow');
      let riskLevel = Number(item?.riskLevel || 1);
      const labelBase = item?.templateName || templateId;
      let label = `${labelBase} (L${riskLevel}, ${decision})`;

      if (!templateId || !versionId) {
        summary.failed.push({ label, reason: 'saknar template/version-id' });
        continue;
      }

      let evaluationId = '';
      if (ensureEvaluations) {
        try {
          const ensured = await ensureEvaluationForVersion({
            baseUrl,
            token,
            templateId,
            versionId,
          });
          evaluationId = ensured.evaluationId;
          decision = ensured.decision;
          riskLevel = ensured.riskLevel;
          label = `${labelBase} (L${riskLevel}, ${decision})`;
          if (ensured.created) summary.evaluationsCreated += 1;
          else summary.evaluationsExisting += 1;
        } catch (error) {
          summary.evaluationsFailed.push({
            label: `${labelBase} (${versionId})`,
            reason: error?.message || 'kunde inte evaluera version',
          });
          continue;
        }
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
          if (!evaluationId) {
            evaluationId = await findLatestEvaluationId({
              baseUrl,
              token,
              templateId,
              versionId,
            });
          }
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

    if (ensureEvaluations && evaluateExisting && skippedTemplates.length) {
      for (const skippedItem of skippedTemplates) {
        const templateId = String(skippedItem?.templateId || '');
        const templateName = String(
          skippedItem?.templateName || skippedItem?.templateId || 'existing-template'
        );
        if (!templateId) continue;
        try {
          const versionId = await getTemplateVersionToEvaluate({
            baseUrl,
            token,
            templateId,
          });
          if (!versionId) {
            summary.evaluationsFailed.push({
              label: `${templateName} (${templateId})`,
              reason: 'kunde inte hitta version att evaluera',
            });
            continue;
          }
          const ensured = await ensureEvaluationForVersion({
            baseUrl,
            token,
            templateId,
            versionId,
          });
          if (ensured.created) summary.evaluationsCreated += 1;
          else summary.evaluationsExisting += 1;
        } catch (error) {
          summary.evaluationsFailed.push({
            label: `${templateName} (${templateId})`,
            reason: error?.message || 'kunde inte evaluera befintlig template',
          });
        }
      }
    }

    const nextOffset = offset + selected;
    const reachedEnd = selected <= 0 || nextOffset >= totalAvailable;
    if (!applyAll || reachedEnd) break;
    offset = nextOffset;
  }

  console.log(`✅ Total apply: ${summary.created}`);
  console.log(`✅ Activation klart: ${summary.activated.length} aktiverade`);
  if (ensureEvaluations) {
    console.log(
      `✅ Evaluations: created=${summary.evaluationsCreated}, existing=${summary.evaluationsExisting}, failed=${summary.evaluationsFailed.length}`
    );
  }
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
  if (summary.evaluationsFailed.length) {
    console.log(`⚠️ Evaluation-fel (${summary.evaluationsFailed.length}):`);
    for (const row of summary.evaluationsFailed.slice(0, 20)) {
      console.log(`- ${row.label}: ${row.reason}`);
    }
  }
}

main().catch((error) => {
  console.error('❌ apply-activate misslyckades');
  console.error(error?.message || error);
  process.exit(1);
});
