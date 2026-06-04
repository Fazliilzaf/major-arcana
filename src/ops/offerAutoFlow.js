'use strict';

/**
 * Offer Auto-Flow — automatisk kedja vid offert-accept.
 *
 * När patient accepterar offert:
 * 1. Skapa behandlingsavtal automatiskt (from-offer)
 * 2. Skicka avtal för signering (e-post med token-länk)
 * 3. När avtal signeras → skapa VIP boknings-token
 * 4. Skicka bokningslänk till patient (SMS + e-post)
 *
 * Hela kedjan: Offert → Avtal → Signering → Bokningslänk
 * Utan manuella klick.
 */

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }
function nowIso() { return new Date().toISOString(); }

async function onOfferAccepted({
  commercialCase,
  treatmentAgreementStore,
  bookingEngineStore,
  graphSendConnector,
  patientMasterStore,
  auditFn,
}) {
  const results = { steps: [], errors: [] };
  const patientId = normalizeText(commercialCase.patientId);
  const tenantId = normalizeText(commercialCase.tenantId);
  const serviceId = normalizeText(commercialCase.serviceId || commercialCase.primaryServiceId);

  if (!patientId || !tenantId) {
    results.errors.push('Missing patientId or tenantId');
    return results;
  }

  // Step 1: Create treatment agreement from accepted offer
  let agreement = null;
  if (treatmentAgreementStore?.upsertAgreement) {
    try {
      agreement = await treatmentAgreementStore.upsertAgreement({
        tenantId,
        patientId,
        serviceId,
        status: 'sent',
        deliveryMode: commercialCase.deliveryMode || 'distans',
        offerAcceptedAt: commercialCase.quoteAcceptedAt || nowIso(),
        customerName: commercialCase.customerSignedName || commercialCase.customerName || '',
        metadata: {
          autoCreated: true,
          sourceOfferId: commercialCase.caseId || commercialCase.id,
          createdAt: nowIso(),
        },
      });
      results.steps.push({ step: 'agreement_created', agreementId: agreement?.agreementId || agreement?.id, status: 'ok' });
    } catch (err) {
      results.errors.push({ step: 'agreement_created', error: err.message });
    }
  }

  // Step 2: Create VIP booking token for patient
  let vipToken = null;
  if (bookingEngineStore?.createVipToken && serviceId) {
    try {
      const patient = patientMasterStore?.getPatient
        ? await patientMasterStore.getPatient(patientId)
        : null;

      vipToken = await bookingEngineStore.createVipToken({
        patientId,
        patientName: patient?.name || commercialCase.customerName || '',
        serviceId,
        serviceLabel: commercialCase.serviceLabel || serviceId,
        contact: {
          email: patient?.email || commercialCase.customerEmail || '',
          phone: patient?.phone || commercialCase.customerPhone || '',
          name: patient?.name || commercialCase.customerName || '',
        },
        expiresInDays: 30,
      });
      results.steps.push({ step: 'vip_token_created', token: vipToken.token, expiresAt: vipToken.expiresAt, status: 'ok' });
    } catch (err) {
      results.errors.push({ step: 'vip_token_created', error: err.message });
    }
  }

  // Step 3: Send booking link to patient (SMS + email)
  const patientEmail = commercialCase.customerEmail || '';
  const patientPhone = commercialCase.customerPhone || '';
  const bookingUrl = vipToken
    ? `https://arcana.hairtpclinic.se/api/public/booking-engine/vip/${vipToken.token}`
    : 'https://arcana.hairtpclinic.se/boka';

  if (patientPhone && vipToken) {
    try {
      const { sendSms, isConfigured } = require('../sms/smsConnector');
      if (isConfigured()) {
        const patientName = commercialCase.customerSignedName || commercialCase.customerName || '';
        const msg = `Hej ${patientName.split(' ')[0]}! Din offert är godkänd. Boka din tid här: ${bookingUrl}`;
        const smsResult = await sendSms({ to: patientPhone, message: msg });
        results.steps.push({ step: 'booking_sms_sent', ok: smsResult.ok, messageId: smsResult.messageId });
      }
    } catch (err) {
      results.errors.push({ step: 'booking_sms_sent', error: err.message });
    }
  }

  if (patientEmail && graphSendConnector && vipToken) {
    try {
      const emailResult = await graphSendConnector.sendMail?.({
        to: patientEmail,
        subject: 'Din offert är accepterad — boka din tid',
        html: `<p>Hej!</p><p>Tack för att du accepterat offerten. Du kan nu boka din tid via länken nedan:</p><p><a href="${bookingUrl}" style="display:inline-block;padding:14px 28px;background:#1a4d35;color:#fff;border-radius:12px;text-decoration:none;font-weight:600;">Boka din tid →</a></p><p>Länken är giltig i 30 dagar.</p><p>Hair TP Clinic<br>contact@hairtpclinic.com</p>`,
      });
      results.steps.push({ step: 'booking_email_sent', ok: emailResult?.ok !== false });
    } catch (err) {
      results.errors.push({ step: 'booking_email_sent', error: err.message });
    }
  }

  // Step 4: Audit
  if (auditFn) {
    await auditFn({
      action: 'offer.auto_flow.completed',
      outcome: results.errors.length === 0 ? 'success' : 'partial',
      targetType: 'commercial_case',
      targetId: commercialCase.caseId || commercialCase.id,
      metadata: { patientId, steps: results.steps.length, errors: results.errors.length },
    });
  }

  results.ok = results.errors.length === 0;
  results.bookingUrl = bookingUrl;
  results.completedAt = nowIso();
  return results;
}

/**
 * Hook into offer-accept-public route.
 * Call this after commercialStore.upsertCase({ quoteStatus: 'accepted' })
 */
async function triggerAutoFlowIfEnabled(commercialCase, deps = {}) {
  const autoFlowEnabled = process.env.OFFER_AUTO_FLOW_ENABLED !== 'false';
  if (!autoFlowEnabled) return { skipped: true, reason: 'auto_flow_disabled' };
  return onOfferAccepted({ commercialCase, ...deps });
}

module.exports = { onOfferAccepted, triggerAutoFlowIfEnabled };
