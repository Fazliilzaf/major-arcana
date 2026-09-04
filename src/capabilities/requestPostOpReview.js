'use strict';

/**
 * RequestPostOpReview capability — Fas 1 (manuell operator-trigger)
 *
 * Spec: docs/strategy/post-op-review-photo-flow.md
 * Kontrakt: docs/architecture/capability-framework-contract-v1.md
 *
 * Triggers när CCO-operatör klickar "Markera sista uppföljning klar" i case-detaljvyn:
 *   1. Verifiera att booking-case finns + status är giltig för follow-up-completed
 *   2. Skapa submission-rad + token i postOpReviewStore
 *   3. Bygg e-postmall (SV/EN) med token-URL till /uppfoljning/[token]
 *   4. Returnera draft + token + reviewLink (operator skickar via gateway/Graph)
 *
 * Capability EXEKVERAS via ExecutionGateway — routes får INTE anropa execute()
 * direkt enligt capability-framework-contract-v1.md §Execution Rules.
 *
 * Risk-flaggor:
 *  - requiresInputRisk: true  — patient-PII (namn) går genom risk-scan
 *  - requiresOutputRisk: true — utgående e-posttext granskas
 *  - requiresPolicyFloor: true — medicinska disclaimers krävs
 */

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');
const { renderEmailShell, klinikIdentitet } = require('../templates/emailLayout');
const { formatTreatmentLabel } = require('../lib/postOpTreatmentLabel');
const { CANONICAL_PUBLIC_ORIGIN } = require('../brand/canonicalPublicOrigin');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(fullName) {
  const trimmed = normalizeText(fullName);
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0];
}

// ─────── Email-mall ──────────────────────────────────────────────────────

/**
 * ORD-210 — post-op-förfrågan följer kliniken.
 *
 * Fyra konstanter, alla Hair TP. Brevet går ut ETT ÅR efter ingreppet och ber
 * om foto och omdöme — en Curatiio-patient fick alltså en förfrågan i en annan
 * kliniks namn, med fel adress att återkalla sitt samtycke till.
 *
 * Samtyckesraden är den som betyder mest: den pekar ut vem patienten ska
 * vända sig till för att dra tillbaka sitt medgivande. Fel adress där är inte
 * ett skönhetsfel.
 */
function klinikuppgifter(tenantId) {
  const k = klinikIdentitet(tenantId);
  return {
    from: k.epost,
    namn: k.namn,
    adress: k.adress,
    telefon: k.telefonVisas,
    telefonIntl: k.telefon,
  };
}
function buildReviewGateLink(reviewLink) {
  return `${normalizeText(reviewLink).replace(/\/+$/, '')}/omdome`;
}

function emailCtaButton(href, label) {
  return [
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;">`,
    `<tr><td style="border-radius:999px;background:#231F1D;">`,
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 22px;font-size:14px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;color:#FAF6F2;">`,
    `${escapeHtml(label)}`,
    `</a></td></tr></table>`,
  ].join('');
}

function buildEmailSv({ patientFirstName, reviewLink, treatmentLabel = '', tenantId = null }) {
  const K = klinikuppgifter(tenantId);
  const greetName = patientFirstName ? `, ${patientFirstName}` : '';
  const treatment = formatTreatmentLabel(treatmentLabel, 'sv');
  const reviewGateLink = buildReviewGateLink(reviewLink);
  const photoCta = `Ladda upp dina bilder efter din ${treatment}`;
  const reviewCta = 'Dela din upplevelse (frivilligt)';
  const subject = patientFirstName
    ? `Tack för förtroendet, ${patientFirstName} — får vi se hur resultatet blev?`
    : 'Tack för förtroendet — får vi se hur resultatet blev?';

  const plain = [
    `Hej${greetName},`,
    '',
    'Det har gått ungefär ett år sedan din behandling hos oss. Vi hoppas du är',
    'nöjd med resultatet — och om du har möjlighet vore vi väldigt tacksamma',
    'om du kunde göra två snabba saker:',
    '',
    `1. ${photoCta}:`,
    `   ${reviewLink}`,
    '',
    `2. ${reviewCta}:`,
    `   ${reviewGateLink}`,
    '',
    'Bilderna används bara om du själv ger samtycke, och då publiceras endast',
    'bildutsnitt från ögonbryn och uppåt — inga drag som kan identifiera dig',
    'som person. Du kan när som helst be oss radera bilderna.',
    '',
    'Positiva omdömen kan du välja att publicera på Google via vår sida —',
    'annars tar vi emot din feedback internt så vi kan förbättra oss.',
    '',
    'Tack för förtroendet — det betyder mycket för oss och för andra som',
    'funderar på samma resa.',
    '',
    K.namn,
    K.adress,
    K.telefon,
    `Återkalla samtycke: ${K.from}`,
  ].join('\n');

  const bodyHtml = [
    `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">Hej${escapeHtml(greetName)},</p>`,
    `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">Det har gått ungefär ett år sedan din behandling hos oss. Vi hoppas du är nöjd med resultatet — och om du har möjlighet vore vi väldigt tacksamma om du kunde göra två snabba saker:</p>`,
    `<p style="font-size:15px;line-height:24px;margin:0 0 8px;"><strong>1.</strong> ${escapeHtml(photoCta)}</p>`,
    emailCtaButton(reviewLink, photoCta),
    `<p style="font-size:15px;line-height:24px;margin:20px 0 8px;"><strong>2.</strong> ${escapeHtml(reviewCta)}</p>`,
    emailCtaButton(reviewGateLink, reviewCta),
    `<p style="font-size:14px;line-height:22px;margin:0 0 20px;color:#6B5F58;">Positiva omdömen kan du välja att publicera på Google via vår sida. Annars sparar vi din feedback internt så vi kan förbättra oss.</p>`,
    `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">Bilderna används bara om du själv ger samtycke, och då publiceras endast bildutsnitt <strong>från ögonbryn och uppåt</strong> — inga drag som kan identifiera dig som person. Du kan när som helst be oss radera bilderna.</p>`,
    `<p style="font-size:15px;line-height:24px;margin:0 0 12px;">Tack för förtroendet — det betyder mycket för oss och för andra som funderar på samma resa.</p>`,
    `<p style="font-size:13px;line-height:20px;margin:24px 0 0;color:#6B5F58;">Återkalla samtycke: <a href="mailto:${escapeHtml(K.from)}" style="color:#6B5F58;">${escapeHtml(K.from)}</a></p>`,
  ].join('\n');

  const html = renderEmailShell({ locale: 'sv', bodyHtml, tenantId });

  return { subject, plain, html, reviewGateLink };
}

function buildEmailEn({ patientFirstName, reviewLink, treatmentLabel = '', tenantId = null }) {
  const K = klinikuppgifter(tenantId);
  const greetName = patientFirstName ? `, ${patientFirstName}` : '';
  const treatment = formatTreatmentLabel(treatmentLabel, 'en');
  const reviewGateLink = buildReviewGateLink(reviewLink);
  const photoCta = `Upload your photos after your ${treatment}`;
  const reviewCta = 'Share your experience (optional)';
  const subject = patientFirstName
    ? `Thank you, ${patientFirstName} — could we see how your results turned out?`
    : 'Thank you — could we see how your results turned out?';

  const plain = [
    `Hi${greetName},`,
    '',
    "It's been about a year since your treatment with us. We hope you're",
    "happy with the results — and if you have the time, we'd be very grateful",
    'if you could do two quick things:',
    '',
    `1. ${photoCta}:`,
    `   ${reviewLink}`,
    '',
    `2. ${reviewCta}:`,
    `   ${reviewGateLink}`,
    '',
    'Photos are only used with your consent, and we only publish the area',
    'from the eyebrows up — never anything that could identify you. You can',
    'ask us to delete the photos at any time.',
    '',
    'Positive reviews can be published on Google via our page — otherwise',
    'we keep your feedback internal so we can improve.',
    '',
    `Thank you — it means a lot to us and to others considering the same journey.`,
    '',
    K.namn,
    K.adress,
    K.telefonIntl,
    `Withdraw consent: ${K.from}`,
  ].join('\n');

  const bodyHtml = [
    `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">Hi${escapeHtml(greetName)},</p>`,
    `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">It's been about a year since your treatment with us. We hope you're happy with the results — and if you have the time, we'd be very grateful if you could do two quick things:</p>`,
    `<p style="font-size:15px;line-height:24px;margin:0 0 8px;"><strong>1.</strong> ${escapeHtml(photoCta)}</p>`,
    emailCtaButton(reviewLink, photoCta),
    `<p style="font-size:15px;line-height:24px;margin:20px 0 8px;"><strong>2.</strong> ${escapeHtml(reviewCta)}</p>`,
    emailCtaButton(reviewGateLink, reviewCta),
    `<p style="font-size:14px;line-height:22px;margin:0 0 20px;color:#6B5F58;">Positive reviews can be published on Google via our page. Otherwise we keep your feedback internal so we can improve.</p>`,
    `<p style="font-size:15px;line-height:24px;margin:0 0 20px;">Photos are only used with your consent, and we only publish <strong>the area from the eyebrows up</strong> — never anything that could identify you. You can ask us to delete the photos at any time.</p>`,
    `<p style="font-size:15px;line-height:24px;margin:0 0 12px;">Thank you — it means a lot to us and to others considering the same journey.</p>`,
    `<p style="font-size:13px;line-height:20px;margin:24px 0 0;color:#6B5F58;">Withdraw consent: <a href="mailto:${escapeHtml(K.from)}" style="color:#6B5F58;">${escapeHtml(K.from)}</a></p>`,
  ].join('\n');

  const html = renderEmailShell({ locale: 'en', bodyHtml, tenantId });

  return { subject, plain, html, reviewGateLink };
}

// ─────── Capability ──────────────────────────────────────────────────────

class RequestPostOpReviewCapability extends BaseCapability {
  static name = 'RequestPostOpReview';
  static version = '1.0.0';

  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];

  static requiresInputRisk = true;
  static requiresOutputRisk = true;
  static requiresPolicyFloor = true;

  static persistStrategy = 'analysis';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    properties: {
      bookingCaseId: { type: 'string', description: 'cco-bookings.json cases[].bookingCaseId' },
      customerName: { type: 'string' },
      locale: { type: 'string', enum: ['sv', 'en'] },
      treatmentLabel: { type: 'string', description: 'Visningsnamn på behandling i e-post-CTA' },
      baseUrl: {
        type: 'string',
        description: 'Origin för token-länken — default arcana.hairtpclinic.com',
      },
    },
    required: ['bookingCaseId'],
  };

  static outputSchema = {
    type: 'object',
    properties: {
      submissionId: { type: 'string' },
      token: {
        type: 'string',
        description: 'Klartext-token. Bara här en gång — lagras bara hashad.',
      },
      reviewLink: { type: 'string', format: 'uri' },
      emailDraft: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          plain: { type: 'string' },
          html: { type: 'string' },
          fromAddress: { type: 'string' },
        },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const warnings = [];

    const bookingCaseId = normalizeText(input.bookingCaseId);
    const customerName = normalizeText(input.customerName);
    const locale = input.locale === 'en' ? 'en' : 'sv';
    const treatmentLabel =
      normalizeText(input.treatmentLabel) ||
      formatTreatmentLabel(normalizeText(input.treatmentKey), locale);
    const baseUrl = normalizeText(input.baseUrl) || CANONICAL_PUBLIC_ORIGIN;
    const tenantId = normalizeText(safeContext.tenantId) || 'hair-tp-clinic';

    if (!bookingCaseId) {
      return {
        data: null,
        metadata: {
          capability: RequestPostOpReviewCapability.name,
          version: RequestPostOpReviewCapability.version,
          channel: normalizeText(safeContext.channel) || 'admin',
          tenantId,
        },
        warnings: ['bookingCaseId saknas i input — capability kan inte exekveras.'],
      };
    }

    const store = safeContext.postOpReviewStore;
    if (!store || typeof store.createSubmission !== 'function') {
      return {
        data: null,
        metadata: {
          capability: RequestPostOpReviewCapability.name,
          version: RequestPostOpReviewCapability.version,
          channel: normalizeText(safeContext.channel) || 'admin',
          tenantId,
        },
        warnings: ['postOpReviewStore saknas i context — bind store via gateway-config.'],
      };
    }

    // Idempotens: om submission redan finns för detta booking-case → returnera
    // dess metadata utan att skapa en ny (men returnera INTE token igen — den
    // går bara att hämta vid första skapandet).
    const existing =
      typeof store.findByBookingCaseId === 'function'
        ? store.findByBookingCaseId(bookingCaseId)
        : null;
    if (existing) {
      warnings.push(
        'Submission finns redan för detta booking-case — returnerar utan att skapa ny token.'
      );
      return {
        data: {
          submissionId: existing.submissionId,
          token: null,
          reviewLink: null,
          emailDraft: null,
          alreadyExists: true,
        },
        metadata: {
          capability: RequestPostOpReviewCapability.name,
          version: RequestPostOpReviewCapability.version,
          channel: normalizeText(safeContext.channel) || 'admin',
          tenantId,
        },
        warnings,
      };
    }

    const { submission, token } = await store.createSubmission({
      bookingCaseId,
      tenantId,
      patientName: customerName,
      treatmentLabel,
    });

    const reviewLink = `${baseUrl.replace(/\/+$/, '')}/uppfoljning/${encodeURIComponent(token)}`;

    const emailBuilder = locale === 'en' ? buildEmailEn : buildEmailSv;
    const email = emailBuilder({
      patientFirstName: firstName(customerName),
      reviewLink,
      treatmentLabel,
      // ORD-210 — samtyckesraden ska peka på RÄTT klinik.
      tenantId,
    });

    return {
      data: {
        submissionId: submission.submissionId,
        token,
        reviewLink,
        reviewGateLink: email.reviewGateLink,
        emailDraft: {
          ...email,
          fromAddress: klinikuppgifter(tenantId).from,
          locale,
        },
        alreadyExists: false,
      },
      metadata: {
        capability: RequestPostOpReviewCapability.name,
        version: RequestPostOpReviewCapability.version,
        channel: normalizeText(safeContext.channel) || 'admin',
        tenantId,
      },
      warnings,
    };
  }
}

module.exports = {
  RequestPostOpReviewCapability,
  // Exporta builders för enhetstester
  _buildEmailSv: buildEmailSv,
  _buildEmailEn: buildEmailEn,
  _buildReviewGateLink: buildReviewGateLink,
};
