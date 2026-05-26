'use strict';

/**
 * Marketing SMS with segmentation.
 *
 * Allows sending targeted SMS campaigns to patient segments based on:
 * - Treatment type (FUE, DHI, PRP, etc.)
 * - Last visit date (re-engagement)
 * - Booking status (no upcoming booking)
 * - Tags/labels on patient
 * - Custom filters
 *
 * Integrates with smsConnector for delivery (46elks / Twilio).
 * Respects opt-out and GDPR consent.
 */

const crypto = require('node:crypto');
const { sendSms } = require('./smsConnector');

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

const SEGMENT_TYPES = Object.freeze([
  'all_patients',
  'treatment_type',
  'last_visit_before',
  'no_upcoming_booking',
  'tag',
  'vip',
  'new_patients',
  'follow_up_due',
  'custom',
]);

const CAMPAIGN_STATUSES = Object.freeze(['draft', 'scheduled', 'sending', 'sent', 'cancelled']);

function createMarketingSmsService({ filePath }) {
  const fs = require('node:fs/promises');
  const path = require('node:path');
  let state = { campaigns: [], optOuts: [] };

  async function load() {
    try {
      state = JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
      /* first run */
    }
  }

  async function persist() {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    await fs.rename(tmp, filePath);
  }

  function buildSegmentFilter(segment = {}) {
    const type = normalizeText(segment.type) || 'all_patients';
    return (patient) => {
      if (isOptedOut(patient.phone || patient.mobile)) return false;
      if (!normalizeText(patient.phone || patient.mobile)) return false;

      switch (type) {
        case 'all_patients':
          return true;
        case 'treatment_type':
          return (patient.treatments || []).some(
            (t) => t.serviceId === segment.serviceId || t.type === segment.treatmentType
          );
        case 'last_visit_before': {
          const cutoff = segment.beforeDate || '';
          return patient.lastVisitAt && patient.lastVisitAt < cutoff;
        }
        case 'no_upcoming_booking':
          return !patient.nextBookingAt;
        case 'tag':
          return (patient.tags || []).includes(segment.tag);
        case 'vip':
          return patient.isVip === true || (patient.tags || []).includes('vip');
        case 'new_patients': {
          const since =
            segment.sinceDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
          return patient.createdAt && patient.createdAt >= since;
        }
        case 'follow_up_due':
          return patient.followUpDue === true;
        case 'custom':
          return segment.patientIds ? segment.patientIds.includes(patient.patientId) : true;
        default:
          return true;
      }
    };
  }

  function mergeTemplate(template, patient) {
    let msg = template;
    msg = msg.replace(/\{namn\}/gi, normalizeText(patient.name || patient.firstName || ''));
    msg = msg.replace(
      /\{fornamn\}/gi,
      normalizeText(patient.firstName || patient.name?.split(' ')[0] || '')
    );
    msg = msg.replace(/\{efternamn\}/gi, normalizeText(patient.lastName || ''));
    msg = msg.replace(/\{behandling\}/gi, normalizeText(patient.lastTreatment || ''));
    msg = msg.replace(/\{datum\}/gi, normalizeText(patient.nextBookingDate || ''));
    msg = msg.replace(/\{klinik\}/gi, 'Hair TP Clinic');
    return msg;
  }

  async function createCampaign({
    tenantId,
    name,
    template,
    segment,
    scheduledAt,
    brand = 'HairTP',
  }) {
    const campaignId = crypto.randomUUID();
    const campaign = {
      campaignId,
      tenantId: normalizeText(tenantId),
      name: normalizeText(name) || 'Kampanj',
      template: normalizeText(template),
      segment: segment || { type: 'all_patients' },
      brand: normalizeText(brand) || 'HairTP',
      status: scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: normalizeText(scheduledAt) || null,
      sentAt: null,
      recipientCount: 0,
      deliveredCount: 0,
      failedCount: 0,
      results: [],
      createdAt: nowIso(),
    };
    state.campaigns.push(campaign);
    await persist();
    return campaign;
  }

  async function sendCampaign(campaignId, patients = []) {
    const campaign = state.campaigns.find((c) => c.campaignId === campaignId);
    if (!campaign) return { ok: false, error: 'campaign_not_found' };
    if (campaign.status === 'sent') return { ok: false, error: 'already_sent' };

    const filter = buildSegmentFilter(campaign.segment);
    const recipients = patients.filter(filter);
    campaign.status = 'sending';
    campaign.recipientCount = recipients.length;

    let delivered = 0;
    let failed = 0;

    for (const patient of recipients) {
      const phone = normalizeText(patient.phone || patient.mobile);
      const message = mergeTemplate(campaign.template, patient);
      const result = await sendSms({ to: phone, message, from: campaign.brand });

      campaign.results.push({
        patientId: patient.patientId || '',
        phone,
        ok: result.ok,
        messageId: result.messageId || null,
        error: result.error || null,
        sentAt: nowIso(),
      });

      if (result.ok) delivered++;
      else failed++;
    }

    campaign.deliveredCount = delivered;
    campaign.failedCount = failed;
    campaign.status = 'sent';
    campaign.sentAt = nowIso();
    await persist();

    return { ok: true, campaignId, recipientCount: recipients.length, delivered, failed };
  }

  function isOptedOut(phone) {
    const normalized = normalizeText(phone);
    return state.optOuts.some((o) => o.phone === normalized);
  }

  async function optOut(phone) {
    const normalized = normalizeText(phone);
    if (!normalized) return;
    if (!state.optOuts.some((o) => o.phone === normalized)) {
      state.optOuts.push({ phone: normalized, optedOutAt: nowIso() });
      await persist();
    }
  }

  async function optIn(phone) {
    const normalized = normalizeText(phone);
    state.optOuts = state.optOuts.filter((o) => o.phone !== normalized);
    await persist();
  }

  function getCampaign(campaignId) {
    return state.campaigns.find((c) => c.campaignId === campaignId) || null;
  }

  function listCampaigns(tenantId) {
    const tid = normalizeText(tenantId);
    return state.campaigns
      .filter((c) => !tid || c.tenantId === tid)
      .map((c) => ({
        campaignId: c.campaignId,
        name: c.name,
        status: c.status,
        recipientCount: c.recipientCount,
        deliveredCount: c.deliveredCount,
        sentAt: c.sentAt,
        createdAt: c.createdAt,
      }));
  }

  function getStats(tenantId) {
    const tid = normalizeText(tenantId);
    const campaigns = state.campaigns.filter((c) => !tid || c.tenantId === tid);
    return {
      totalCampaigns: campaigns.length,
      sentCampaigns: campaigns.filter((c) => c.status === 'sent').length,
      totalDelivered: campaigns.reduce((s, c) => s + (c.deliveredCount || 0), 0),
      totalFailed: campaigns.reduce((s, c) => s + (c.failedCount || 0), 0),
      optOutCount: state.optOuts.length,
    };
  }

  return {
    load,
    persist,
    createCampaign,
    sendCampaign,
    getCampaign,
    listCampaigns,
    getStats,
    optOut,
    optIn,
    isOptedOut,
    buildSegmentFilter,
    mergeTemplate,
    SEGMENT_TYPES,
    CAMPAIGN_STATUSES,
  };
}

module.exports = { createMarketingSmsService, SEGMENT_TYPES, CAMPAIGN_STATUSES };
