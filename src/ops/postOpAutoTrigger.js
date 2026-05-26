'use strict';

const { formatTreatmentLabel } = require('../lib/postOpTreatmentLabel');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

const FINAL_FOLLOWUP_TREATMENT_KEYS = Object.freeze([
  '12_manader',
  'followup_12',
  'follow_up_12',
  'follow_up_final',
  'final_follow_up',
]);

function isFinalFollowUpTreatment(value) {
  const key = normalizeKey(value);
  if (!key) return false;
  if (FINAL_FOLLOWUP_TREATMENT_KEYS.includes(key)) return true;
  return /(^|[^0-9])12(\s|_|-)?(man|month)/i.test(String(value || ''));
}

function hasPostOpDispatchEvent(bookingCase = {}) {
  return asArray(bookingCase.events).some((event) => {
    const type = normalizeKey(event?.type);
    return type === 'post_op_review_dispatched' || type === 'final_followup_marked';
  });
}

function getCaseConfirmationAt(bookingCase = {}) {
  const fromEvent = asArray(bookingCase.events)
    .filter((event) =>
      ['external_confirmation_marked', 'engine_booking_confirmed'].includes(normalizeKey(event?.type))
    )
    .map((event) => Date.parse(normalizeText(event.createdAt)))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (Number.isFinite(fromEvent)) return new Date(fromEvent).toISOString();
  return normalizeText(bookingCase.confirmedExternalAt) || normalizeText(bookingCase.updatedAt) || null;
}

async function listEligiblePostOpAutoCases({
  bookingStore,
  postOpReviewStore,
  tenantId,
  graceHours = 24,
  limit = 25,
} = {}) {
  if (!bookingStore || typeof bookingStore.listCases !== 'function') {
    return [];
  }
  const tenant = normalizeText(tenantId) || 'hair-tp-clinic';
  const graceMs = Math.max(0, Number(graceHours) || 24) * 3600000;
  const now = Date.now();
  const cases = await bookingStore.listCases({ tenantId: tenant, limit: 200 });
  const eligible = [];

  for (const bookingCase of cases) {
    if (eligible.length >= limit) break;
    const status = normalizeKey(bookingCase.status);
    if (status === 'follow_up_completed') {
      if (hasPostOpDispatchEvent(bookingCase)) continue;
    } else if (status !== 'confirmed_external') {
      continue;
    }

    if (!isFinalFollowUpTreatment(bookingCase.requestedTreatment)) continue;

    const bookingCaseId = normalizeText(bookingCase.bookingCaseId);
    if (!bookingCaseId) continue;

    if (postOpReviewStore?.findByBookingCaseId?.(bookingCaseId)) continue;

    const confirmedAt = getCaseConfirmationAt(bookingCase);
    const confirmedMs = Date.parse(confirmedAt || '');
    if (Number.isFinite(confirmedMs) && now - confirmedMs < graceMs) continue;

    eligible.push({
      bookingCaseId,
      customerEmail: normalizeText(bookingCase.customerEmail),
      customerName: normalizeText(bookingCase.customerName),
      requestedTreatment: normalizeText(bookingCase.requestedTreatment),
      status,
      confirmedAt,
    });
  }

  return eligible;
}

async function runPostOpAutoTrigger({
  bookingStore,
  postOpReviewStore,
  patientMasterStore,
  capabilityExecutor,
  graphSendConnector = null,
  config = {},
  tenantId,
  logger = console,
} = {}) {
  const tenant = normalizeText(tenantId) || normalizeText(config.defaultTenantId) || 'hair-tp-clinic';
  const graceHours = Number(config.postOpAutoTriggerGraceHours) || 24;
  const baseUrl = normalizeText(config.publicBaseUrl) || 'https://arcana.hairtpclinic.se';

  if (!capabilityExecutor || typeof capabilityExecutor.runCapability !== 'function') {
    return { tenantId: tenant, skipped: true, reason: 'capability_executor_missing' };
  }
  if (!postOpReviewStore) {
    return { tenantId: tenant, skipped: true, reason: 'post_op_review_store_missing' };
  }

  const eligible = await listEligiblePostOpAutoCases({
    bookingStore,
    postOpReviewStore,
    tenantId: tenant,
    graceHours,
  });

  const results = [];
  for (const row of eligible) {
    let patientEmail = normalizeText(row.customerEmail).toLowerCase();
    if (patientMasterStore && patientEmail) {
      const patient = await patientMasterStore.findPatientByEmail?.({
        tenantId: tenant,
        email: patientEmail,
      });
      if (patient?.primaryEmail) patientEmail = normalizeText(patient.primaryEmail).toLowerCase();
    }

    const locale = 'sv';
    const treatmentLabel = formatTreatmentLabel(row.requestedTreatment, locale);

    try {
      const run = await capabilityExecutor.runCapability({
        tenantId: tenant,
        actor: { id: 'scheduler:post_op_auto', role: 'owner' },
        channel: 'admin',
        capabilityName: 'RequestPostOpReview',
        input: {
          bookingCaseId: row.bookingCaseId,
          customerName: row.customerName,
          locale,
          baseUrl,
          treatmentLabel,
          treatmentKey: row.requestedTreatment,
        },
        idempotencyKey: `post-op-auto:${row.bookingCaseId}`,
        requestMetadata: { route: 'post_op_auto_trigger' },
      });

      const output = run?.gatewayResult?.response_payload?.output || {};
      const data = output?.data || null;
      let graphSend = null;

      if (
        graphSendConnector &&
        patientEmail &&
        data?.emailDraft &&
        !data?.alreadyExists &&
        typeof postOpReviewStore.markSent === 'function'
      ) {
        try {
          const senderMailbox =
            normalizeText(config.postOpReviewFromMailbox || config.defaultMailbox) ||
            'kons@hairtpclinic.com';
          const sent = await graphSendConnector.sendComposeDocument({
            composeDocument: {
              version: 'phase_5',
              kind: 'mail_compose_document',
              mode: 'compose',
              senderMailboxId: senderMailbox,
              sourceMailboxId: senderMailbox,
              recipients: { to: [patientEmail], cc: [], bcc: [] },
              subject: data.emailDraft.subject,
              content: { bodyText: data.emailDraft.plain, bodyHtml: data.emailDraft.html },
              delivery: { sendStrategy: 'send_mail' },
            },
          });
          await postOpReviewStore.markSent(data.submissionId, sent.sentAt);
          graphSend = { ok: true, to: patientEmail, sentAt: sent.sentAt };
        } catch (graphErr) {
          graphSend = { ok: false, error: graphErr?.message || 'graph_send_failed' };
          logger?.warn?.('[post-op-auto] graph send failed', row.bookingCaseId, graphSend.error);
        }
      }

      if (bookingStore?.updateStatus && row.status !== 'follow_up_completed') {
        try {
          const resolvedCase = bookingStore.findCaseByRef?.({
            tenantId: tenant,
            caseRef: row.bookingCaseId,
          });
          if (resolvedCase) {
            await bookingStore.updateStatus({
              tenantId: tenant,
              workspaceId: resolvedCase.workspaceId,
              conversationId: resolvedCase.conversationId,
              customerEmail: resolvedCase.customerEmail || row.customerEmail,
              status: 'follow_up_completed',
              ownerUserId: 'scheduler:post_op_auto',
            });
          }
        } catch {
          /* non-fatal */
        }
      }

      if (bookingStore?.addEvent) {
        try {
          await bookingStore.addEvent({
            tenantId: tenant,
            bookingCaseId: row.bookingCaseId,
            type: 'post_op_review_dispatched',
            metadata: {
              mode: 'auto_trigger',
              submissionId: data?.submissionId || null,
              graphSend,
            },
          });
        } catch {
          /* non-fatal */
        }
      }

      results.push({
        bookingCaseId: row.bookingCaseId,
        ok: Boolean(data),
        submissionId: data?.submissionId || null,
        alreadyExists: Boolean(data?.alreadyExists),
        graphSend,
        warnings: output?.warnings || [],
      });
    } catch (error) {
      results.push({
        bookingCaseId: row.bookingCaseId,
        ok: false,
        error: error?.message || 'auto_trigger_failed',
      });
      logger?.warn?.('[post-op-auto] capability failed', row.bookingCaseId, error?.message);
    }
  }

  return {
    tenantId: tenant,
    scanned: eligible.length,
    triggered: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
  };
}

module.exports = {
  FINAL_FOLLOWUP_TREATMENT_KEYS,
  isFinalFollowUpTreatment,
  listEligiblePostOpAutoCases,
  runPostOpAutoTrigger,
};
