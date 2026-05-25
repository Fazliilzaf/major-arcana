'use strict';

/**
 * Post-op Auto-Trigger (U5B.3)
 *
 * Automatiskt skickar post-op review-förfrågan till patient X dagar efter behandling.
 * Beslut 2026-05-25:
 *   1. Kanal: E-post alltid + SMS valfritt
 *   2. Avsändare: contact@hairtpclinic.com
 *   3. Retention: 10 år (PDL — journal-kopplad behandlingsdata)
 *   4. UI: Foto + valfritt omdöme (patient väljer)
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseIso(value) {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysSince(iso) {
  const date = parseIso(iso);
  if (!date) return null;
  return (Date.now() - date.getTime()) / (24 * 60 * 60 * 1000);
}

const POST_OP_TRIGGER_CONFIG = Object.freeze({
  triggerAfterDays: 7,
  maxTriggerDays: 30,
  senderMailbox: 'contact@hairtpclinic.com',
  channelEmail: true,
  channelSms: false,
  retentionDays: 3650,
  uiMode: 'photo_with_optional_review',
});

async function findEligiblePatients({
  journalStore,
  patientMasterStore,
  postOpReviewStore,
  patientCareStateStore,
  tenantId,
  triggerAfterDays = POST_OP_TRIGGER_CONFIG.triggerAfterDays,
  maxTriggerDays = POST_OP_TRIGGER_CONFIG.maxTriggerDays,
  limit = 50,
} = {}) {
  if (!journalStore?.listEntries || !patientMasterStore?.listPatients) {
    return { eligible: [], skipped: true, reason: 'stores_missing' };
  }

  const patients = await patientMasterStore.listPatients({ tenantId, limit: 500 });
  const patientList = asArray(patients?.patients || patients);
  const eligible = [];

  for (const patient of patientList) {
    const patientId = normalizeText(patient.patientId || patient.id);
    if (!patientId) continue;

    const entries = await journalStore.listEntries({ tenantId, patientId });
    const entryList = asArray(entries?.entries || entries);

    const signedTreatments = entryList.filter((e) =>
      (e.journalType === 'tp_treatment' || e.journalType === 'prp_treatment' || e.journalType === 'bleph_treatment') &&
      (e.locked || e.signedAt || e.signatureStatus === 'signed')
    );

    if (signedTreatments.length === 0) continue;

    const latestTreatment = signedTreatments.sort((a, b) =>
      new Date(b.signedAt || b.updatedAt || 0).getTime() - new Date(a.signedAt || a.updatedAt || 0).getTime()
    )[0];

    const treatmentDate = latestTreatment.signedAt || latestTreatment.updatedAt;
    const days = daysSince(treatmentDate);
    if (days === null || days < triggerAfterDays || days > maxTriggerDays) continue;

    if (postOpReviewStore?.hasSubmission) {
      const alreadySent = await postOpReviewStore.hasSubmission({ tenantId, patientId });
      if (alreadySent) continue;
    }

    const reminderKey = `post_op_auto:${patientId}`;
    if (patientCareStateStore?.wasReminderSent) {
      const sent = await patientCareStateStore.wasReminderSent({ tenantId, reminderKey, withinHours: 168 });
      if (sent) continue;
    }

    eligible.push({
      patientId,
      displayName: patient.displayName || patient.fullName || '',
      primaryEmail: normalizeText(patient.primaryEmail),
      primaryPhone: normalizeText(patient.primaryPhone),
      treatmentDate,
      daysSinceTreatment: Math.round(days),
      journalType: latestTreatment.journalType,
      reminderKey,
    });

    if (eligible.length >= limit) break;
  }

  return { eligible, skipped: false, total: eligible.length };
}

async function dispatchPostOpTriggers({
  eligible = [],
  postOpReviewStore,
  patientCareStateStore,
  transactionalMailer,
  tenantId,
  senderMailbox = POST_OP_TRIGGER_CONFIG.senderMailbox,
  baseUrl = '',
} = {}) {
  const results = [];

  for (const patient of eligible) {
    if (!patient.primaryEmail) {
      results.push({ patientId: patient.patientId, skipped: true, reason: 'no_email' });
      continue;
    }

    let token = null;
    if (postOpReviewStore?.createSubmission) {
      const submission = await postOpReviewStore.createSubmission({
        tenantId,
        patientId: patient.patientId,
        source: 'auto_trigger',
        triggerType: 'scheduler_u5b3',
        treatmentDate: patient.treatmentDate,
      });
      token = submission?.token || submission?.submissionId;
    }

    const reviewUrl = token ? `${normalizeText(baseUrl)}/uppfoljning/${token}` : '';

    if (transactionalMailer?.send) {
      await transactionalMailer.send({
        to: patient.primaryEmail,
        from: senderMailbox,
        subject: `Uppföljning efter din behandling — Hair TP Clinic`,
        html: buildPostOpEmailHtml({ patient, reviewUrl }),
        text: buildPostOpEmailText({ patient, reviewUrl }),
        tags: ['post-op-auto-trigger', 'u5b3'],
      });
    }

    if (patientCareStateStore?.logReminder) {
      await patientCareStateStore.logReminder({
        tenantId,
        reminderKey: patient.reminderKey,
        reminderType: 'post_op_auto_trigger',
        patientId: patient.patientId,
        metadata: { reviewUrl, daysSinceTreatment: patient.daysSinceTreatment },
      });
    }

    results.push({
      patientId: patient.patientId,
      sent: true,
      email: patient.primaryEmail,
      reviewUrl,
      daysSinceTreatment: patient.daysSinceTreatment,
    });
  }

  return {
    dispatched: results.filter((r) => r.sent).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  };
}

function buildPostOpEmailHtml({ patient, reviewUrl }) {
  const name = normalizeText(patient.displayName) || 'du';
  return `
    <div style="font-family: 'Jost', Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #543940;">Hej ${name}!</h2>
      <p>Det har gått en vecka sedan din behandling hos oss. Vi hoppas att allt känns bra!</p>
      <p>Vi skulle uppskatta om du kunde dela några bilder på hur det ser ut nu — det hjälper oss följa din läkning och säkerställa bästa möjliga resultat.</p>
      ${reviewUrl ? `<p style="margin: 24px 0;"><a href="${reviewUrl}" style="background: #543940; color: #FAF4EE; padding: 14px 28px; border-radius: 14px; text-decoration: none; font-weight: 600;">Ladda upp foton</a></p>` : ''}
      <p>Du kan välja att bara ladda upp bilder, eller om du vill även lämna ett kort omdöme.</p>
      <p style="color: #8C7B70; font-size: 14px;">Bilderna används enbart för din journal och eftervård. Om du vill att vi använder dem i marknadsföring frågar vi separat om samtycke.</p>
      <p>Varma hälsningar,<br/>Hair TP Clinic</p>
    </div>
  `.trim();
}

function buildPostOpEmailText({ patient, reviewUrl }) {
  const name = normalizeText(patient.displayName) || 'du';
  return [
    `Hej ${name}!`,
    '',
    'Det har gått en vecka sedan din behandling hos oss.',
    'Vi hoppas att allt känns bra!',
    '',
    'Vi skulle uppskatta om du kunde dela några bilder på hur det ser ut nu.',
    '',
    reviewUrl ? `Ladda upp här: ${reviewUrl}` : '',
    '',
    'Du kan välja att bara ladda upp bilder, eller även lämna ett kort omdöme.',
    '',
    'Varma hälsningar,',
    'Hair TP Clinic',
  ].filter(Boolean).join('\n');
}

module.exports = {
  POST_OP_TRIGGER_CONFIG,
  findEligiblePatients,
  dispatchPostOpTriggers,
  buildPostOpEmailHtml,
  buildPostOpEmailText,
};
