const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const { ensureDirectoryWithRetry } = require('./persistentDir');

/** Plan A — tjänster som exponeras via /api/public/booking-engine/catalog */
const PLAN_A_PUBLIC_SERVICE_IDS = [
  'consultation-online',
  'consultation-physical',
  'followup-transplant',
  'fue',
  'dhi',
  'beard',
  'eyebrow',
  'prp-hair',
  'prp-skin',
  'microneedling',
  'followup',
];

/** Plan A web — läkare/konsulter som får synas i publik katalog (ej sjuksköterskor). */
const PLAN_A_PUBLIC_RESOURCE_IDS = ['fazli', 'egzona', 'arya'];

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeWeekdays(value) {
  const weekdays = asArray(value)
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return weekdays.length ? Array.from(new Set(weekdays)) : [1, 2, 3, 4, 5];
}

function normalizeStartTimes(value) {
  const times = asArray(value)
    .map((item) => normalizeText(item))
    .filter((item) => /^\d{2}:\d{2}$/.test(item));
  return times.length ? Array.from(new Set(times)) : ['09:30', '13:30', '15:00'];
}

function normalizeDateOnly(value) {
  const raw = normalizeText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function normalizeIso(value) {
  const raw = normalizeText(value);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function addMinutes(isoString, minutesToAdd) {
  const ms = Date.parse(normalizeText(isoString));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms + Math.max(0, Number(minutesToAdd) || 0) * 60 * 1000).toISOString();
}

function toSlotId({ resourceId = '', serviceId = '', startsAt = '' } = {}) {
  return [normalizeText(resourceId), normalizeText(serviceId), normalizeIso(startsAt)]
    .filter(Boolean)
    .join('::');
}

async function readJson(filePath, fallbackValue) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await ensureDirectoryWithRetry(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function defaultState() {
  const ts = nowIso();
  return {
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    // Riktigt Hair TP-team verifierat 2026-05-18.
    // Sjuksköterskor (Veronica, Clara, Wendela, Louise) lagdes till 2026-05-19
    // som bokningsbara resurser för konsultation, PRP, microneedling + efterkontroll.
    // De syns INTE på publik Team-sida (interna) — bara i operator-CCO-vyn.
    // Back-office (Måns, Felix, Britt-louise) är aldrig patient-bokningsbara.
    resources: [
      { id: 'fazli', label: 'Fazli Krasniqi', active: true, publicBookable: true },
      { id: 'egzona', label: 'Egzona Krasniqi', active: true, publicBookable: true },
      { id: 'arya', label: 'Dr. Arya Emami', active: true, publicBookable: true },
      {
        id: 'veronica',
        label: 'Veronica',
        active: true,
        publicBookable: false,
        role: 'Sjuksköterska',
      },
      {
        id: 'clara',
        label: 'Clara',
        active: true,
        publicBookable: false,
        role: 'Sjuksköterska',
      },
      {
        id: 'wendela',
        label: 'Wendela',
        active: true,
        publicBookable: false,
        role: 'Sjuksköterska',
      },
      {
        id: 'louise',
        label: 'Louise',
        active: true,
        publicBookable: false,
        role: 'Sjuksköterska',
      },
    ],
    // Plan A (go-live): tre publika mötestyper. Övriga tjänster inaktiva tills vidare.
    services: [
      {
        id: 'consultation-online',
        label: 'Online möte',
        durationMinutes: 30,
        active: true,
        publicBookable: true,
        meetingMode: 'online',
      },
      {
        id: 'consultation-physical',
        label: 'Fysisk konsultation',
        durationMinutes: 30,
        active: true,
        publicBookable: true,
        meetingMode: 'physical',
      },
      {
        id: 'followup-transplant',
        label: 'Uppföljning hårtransplantation',
        durationMinutes: 30,
        active: true,
        publicBookable: true,
      },
      { id: 'consultation', label: 'Kostnadsfri konsultation', durationMinutes: 30, active: false },
      { id: 'fue', label: 'FUE-hårtransplantation', durationMinutes: 480, active: false },
      { id: 'dhi', label: 'DHI-hårtransplantation', durationMinutes: 480, active: false },
      { id: 'beard', label: 'Skäggtransplantation', durationMinutes: 360, active: false },
      { id: 'eyebrow', label: 'Ögonbrynstransplantation', durationMinutes: 240, active: false },
      { id: 'prp-hair', label: 'PRP för hår', durationMinutes: 45, active: false },
      { id: 'prp-skin', label: 'PRP för hud', durationMinutes: 60, active: false },
      { id: 'microneedling', label: 'Microneedling + PRP', durationMinutes: 60, active: false },
      { id: 'followup', label: 'Efterkontroll', durationMinutes: 30, active: false },
    ],
    // Schema: Fazli + Egzona delar hårtransplantations-veckan (max 2 patienter/dag enligt
    // kvalitetslöfte). Arya tar konsultation + ögonbrynstransplantation.
    // Tider följer kliniköppettiderna Mån-Fre 08-20, Lör 10-18.
    availabilityRules: [
      // ── Konsultation (alla tre, korta möten) ──
      {
        ruleId: 'rule-consultation-fazli',
        resourceId: 'fazli',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['09:00', '11:00', '14:00', '16:00'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-consultation-egzona',
        resourceId: 'egzona',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['09:30', '11:30', '14:30', '16:30'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-consultation-arya',
        resourceId: 'arya',
        serviceId: 'consultation-physical',
        weekdays: [1, 3, 5],
        startTimes: ['10:00', '13:00', '15:00'],
        locationLabel: 'Hair TP Clinic',
      },
      // ── Online möte (Plan A1) ──
      {
        ruleId: 'rule-consultation-online-fazli',
        resourceId: 'fazli',
        serviceId: 'consultation-online',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['09:00', '11:00', '14:00', '16:00'],
        locationLabel: 'Online (videomöte)',
      },
      {
        ruleId: 'rule-consultation-online-egzona',
        resourceId: 'egzona',
        serviceId: 'consultation-online',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['09:30', '11:30', '14:30', '16:30'],
        locationLabel: 'Online (videomöte)',
      },
      {
        ruleId: 'rule-consultation-online-arya',
        resourceId: 'arya',
        serviceId: 'consultation-online',
        weekdays: [1, 3, 5],
        startTimes: ['10:00', '13:00', '15:00'],
        locationLabel: 'Online (videomöte)',
      },
      // ── Hårtransplantation (inaktiv i Plan A — regler kvar för intern migration) ──
      {
        ruleId: 'rule-fue-fazli',
        resourceId: 'fazli',
        serviceId: 'fue',
        weekdays: [2, 4],
        startTimes: ['08:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-fue-egzona',
        resourceId: 'egzona',
        serviceId: 'fue',
        weekdays: [1, 3],
        startTimes: ['08:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-dhi-fazli',
        resourceId: 'fazli',
        serviceId: 'dhi',
        weekdays: [5],
        startTimes: ['08:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-dhi-egzona',
        resourceId: 'egzona',
        serviceId: 'dhi',
        weekdays: [5],
        startTimes: ['08:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-beard-fazli',
        resourceId: 'fazli',
        serviceId: 'beard',
        weekdays: [3],
        startTimes: ['10:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      // ── Ögonbrynstransplantation (Arya, ögonplastikkirurg) ──
      {
        ruleId: 'rule-eyebrow-arya',
        resourceId: 'arya',
        serviceId: 'eyebrow',
        weekdays: [3, 5],
        startTimes: ['09:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      // ── PRP-behandlingar (alla tre kan göra) ──
      {
        ruleId: 'rule-prp-hair-fazli',
        resourceId: 'fazli',
        serviceId: 'prp-hair',
        weekdays: [2, 4],
        startTimes: ['15:00', '16:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-prp-hair-egzona',
        resourceId: 'egzona',
        serviceId: 'prp-hair',
        weekdays: [1, 3, 5],
        startTimes: ['10:00', '15:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-prp-skin-arya',
        resourceId: 'arya',
        serviceId: 'prp-skin',
        weekdays: [1, 3, 5],
        startTimes: ['11:00', '13:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      // ── Microneedling + PRP (Arya) ──
      {
        ruleId: 'rule-microneedling-arya',
        resourceId: 'arya',
        serviceId: 'microneedling',
        weekdays: [1, 5],
        startTimes: ['12:00', '16:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      // ── Efterkontroller (alla tre) ──
      {
        ruleId: 'rule-followup-fazli',
        resourceId: 'fazli',
        serviceId: 'followup-transplant',
        weekdays: [1, 3, 5],
        startTimes: ['17:00', '17:30'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-followup-egzona',
        resourceId: 'egzona',
        serviceId: 'followup-transplant',
        weekdays: [2, 4],
        startTimes: ['17:00', '17:30'],
        locationLabel: 'Hair TP Clinic',
      },

      // ── Sjuksköterskor (Veronica, Clara, Wendela, Louise) ──
      // Var och en gör konsultation, PRP-hår, PRP-hud, microneedling + followup.
      // Vi spreader veckodagar så de täcker hela arbetsveckan utan att alla bookas
      // samma slot. Mellan-tider (mest 10:00-15:00) reserveras för PRP/microneedling
      // som tar 45-60 min. Followup blir morgon/eftermiddag, korta 30-min-slots.

      // — Veronica: prp-hair Mån/Ons, prp-skin Fre, microneedling Tor, followup Tis —
      {
        ruleId: 'rule-cons-veronica',
        resourceId: 'veronica',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['10:30', '13:30'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-prp-hair-veronica',
        resourceId: 'veronica',
        serviceId: 'prp-hair',
        weekdays: [1, 3],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-prp-skin-veronica',
        resourceId: 'veronica',
        serviceId: 'prp-skin',
        weekdays: [5],
        startTimes: ['10:00', '13:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-micro-veronica',
        resourceId: 'veronica',
        serviceId: 'microneedling',
        weekdays: [4],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-followup-veronica',
        resourceId: 'veronica',
        serviceId: 'followup-transplant',
        weekdays: [2],
        startTimes: ['09:00', '09:30', '15:30', '16:00'],
        locationLabel: 'Hair TP Clinic',
      },

      // — Clara: prp-hair Tis/Tor, prp-skin Mån, microneedling Ons, followup Fre —
      {
        ruleId: 'rule-cons-clara',
        resourceId: 'clara',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-prp-hair-clara',
        resourceId: 'clara',
        serviceId: 'prp-hair',
        weekdays: [2, 4],
        startTimes: ['10:30', '13:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-prp-skin-clara',
        resourceId: 'clara',
        serviceId: 'prp-skin',
        weekdays: [1],
        startTimes: ['10:00', '13:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-micro-clara',
        resourceId: 'clara',
        serviceId: 'microneedling',
        weekdays: [3],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-followup-clara',
        resourceId: 'clara',
        serviceId: 'followup-transplant',
        weekdays: [5],
        startTimes: ['09:00', '09:30', '15:30', '16:00'],
        locationLabel: 'Hair TP Clinic',
      },

      // — Wendela: prp-hair Mån/Fre, prp-skin Ons, microneedling Tis, followup Tor —
      {
        ruleId: 'rule-cons-wendela',
        resourceId: 'wendela',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['10:00', '15:00'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-prp-hair-wendela',
        resourceId: 'wendela',
        serviceId: 'prp-hair',
        weekdays: [1, 5],
        startTimes: ['11:30', '14:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-prp-skin-wendela',
        resourceId: 'wendela',
        serviceId: 'prp-skin',
        weekdays: [3],
        startTimes: ['10:00', '13:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-micro-wendela',
        resourceId: 'wendela',
        serviceId: 'microneedling',
        weekdays: [2],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-followup-wendela',
        resourceId: 'wendela',
        serviceId: 'followup-transplant',
        weekdays: [4],
        startTimes: ['09:00', '09:30', '15:30', '16:00'],
        locationLabel: 'Hair TP Clinic',
      },

      // — Louise: prp-hair Ons, prp-skin Tor, microneedling Fre, followup Mån —
      {
        ruleId: 'rule-cons-louise',
        resourceId: 'louise',
        serviceId: 'consultation-physical',
        weekdays: [1, 2, 3, 4, 5],
        startTimes: ['11:30', '15:30'],
        locationLabel: 'Hair TP Clinic',
      },
      {
        ruleId: 'rule-prp-hair-louise',
        resourceId: 'louise',
        serviceId: 'prp-hair',
        weekdays: [3],
        startTimes: ['10:30', '13:30'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-prp-skin-louise',
        resourceId: 'louise',
        serviceId: 'prp-skin',
        weekdays: [4],
        startTimes: ['10:00', '13:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-micro-louise',
        resourceId: 'louise',
        serviceId: 'microneedling',
        weekdays: [5],
        startTimes: ['11:00', '14:00'],
        locationLabel: 'Hair TP Clinic',
        active: false,
      },
      {
        ruleId: 'rule-followup-louise',
        resourceId: 'louise',
        serviceId: 'followup-transplant',
        weekdays: [1],
        startTimes: ['09:00', '09:30', '15:30', '16:00'],
        locationLabel: 'Hair TP Clinic',
      },
    ],
    reservations: [],
    bookings: [],
  };
}

function migratePlanASchema(state) {
  const defaults = defaultState();
  let changed = false;
  const servicesById = new Map(state.services.map((item) => [item.id, item]));

  for (const svc of defaults.services) {
    const id = normalizeText(svc.id);
    const existing = servicesById.get(id);
    if (PLAN_A_PUBLIC_SERVICE_IDS.includes(id)) {
      const next = { ...svc, ...(existing || {}), ...svc, active: true, publicBookable: true };
      if (JSON.stringify(existing) !== JSON.stringify(next)) {
        servicesById.set(id, next);
        changed = true;
      }
      continue;
    }
    if (existing && existing.active !== false) {
      servicesById.set(id, { ...existing, active: false, publicBookable: false });
      changed = true;
    } else if (!existing) {
      servicesById.set(id, { ...svc, active: false, publicBookable: false });
      changed = true;
    }
  }

  state.services = Array.from(servicesById.values()).map(normalizeService).filter(Boolean);

  const ruleServiceMap = {
    consultation: 'consultation-physical',
    followup: 'followup-transplant',
  };
  const rulesById = new Map(state.availabilityRules.map((item) => [item.ruleId, item]));

  for (const rule of state.availabilityRules) {
    const mapped = ruleServiceMap[normalizeText(rule.serviceId)];
    if (!mapped || rule.serviceId === mapped) continue;
    rulesById.set(rule.ruleId, { ...rule, serviceId: mapped });
    changed = true;
  }

  for (const rule of defaults.availabilityRules) {
    const existing = rulesById.get(rule.ruleId);
    if (PLAN_A_PUBLIC_SERVICE_IDS.includes(normalizeText(rule.serviceId))) {
      const next = { ...(existing || {}), ...rule, active: true };
      if (!existing || JSON.stringify(existing) !== JSON.stringify(next)) {
        rulesById.set(rule.ruleId, next);
        changed = true;
      }
      continue;
    }
    if (existing && existing.active !== false) {
      rulesById.set(rule.ruleId, { ...existing, active: false });
      changed = true;
    }
  }

  state.availabilityRules = Array.from(rulesById.values())
    .map(normalizeAvailabilityRule)
    .filter(Boolean);
  return changed;
}

function normalizeResource(input = {}) {
  const safe = asObject(input);
  const id = normalizeText(safe.id);
  if (!id) return null;
  const publicBookable =
    safe.publicBookable === true || PLAN_A_PUBLIC_RESOURCE_IDS.includes(id);
  return {
    id,
    label: normalizeText(safe.label || safe.name || id),
    active: safe.active !== false,
    publicBookable,
    role: normalizeText(safe.role) || undefined,
  };
}

function normalizeService(input = {}) {
  const safe = asObject(input);
  const id = normalizeText(safe.id);
  if (!id) return null;
  return {
    id,
    label: normalizeText(safe.label || safe.title || safe.name || id),
    durationMinutes: Math.max(15, Number(safe.durationMinutes) || 60),
    active: safe.active !== false,
    publicBookable: safe.publicBookable === true,
    meetingMode: normalizeText(safe.meetingMode) || undefined,
  };
}

function normalizeAvailabilityRule(input = {}) {
  const safe = asObject(input);
  const resourceId = normalizeText(safe.resourceId);
  const serviceId = normalizeText(safe.serviceId);
  if (!resourceId || !serviceId) return null;
  return {
    ruleId: normalizeText(safe.ruleId) || crypto.randomUUID(),
    resourceId,
    serviceId,
    weekdays: normalizeWeekdays(safe.weekdays),
    startTimes: normalizeStartTimes(safe.startTimes),
    locationLabel: normalizeText(safe.locationLabel || 'Hair TP Clinic'),
    active: safe.active !== false,
  };
}

function normalizeEngineSlot(slot = {}, services = [], resources = []) {
  const safe = asObject(slot);
  const startsAt = normalizeIso(safe.startsAt || safe.start);
  const resourceId = normalizeText(safe.resourceId);
  const serviceId = normalizeText(safe.serviceId);
  if (!startsAt || !resourceId || !serviceId) return null;
  const service =
    asArray(services).find((item) => normalizeText(item.id) === serviceId) ||
    asObject(safe.service);
  const resource =
    asArray(resources).find((item) => normalizeText(item.id) === resourceId) ||
    asObject(safe.resource);
  return {
    slotId: normalizeText(safe.slotId || safe.id) || toSlotId({ resourceId, serviceId, startsAt }),
    startsAt,
    endsAt:
      normalizeIso(safe.endsAt || safe.end) ||
      addMinutes(startsAt, Number(service.durationMinutes) || 60),
    resourceId,
    resourceLabel: normalizeText(safe.resourceLabel || resource.label || resource.name),
    serviceId,
    serviceLabel: normalizeText(safe.serviceLabel || service.label || service.title),
    locationLabel: normalizeText(safe.locationLabel || safe.locationName || 'Hair TP Clinic'),
    source: 'cco_engine',
  };
}

function normalizeReservation(input = {}, { services = [], resources = [] } = {}) {
  const safe = asObject(input);
  const tenantId = normalizeText(safe.tenantId);
  const conversationId = normalizeText(safe.conversationId);
  const customerEmail = normalizeKey(safe.customerEmail || safe.customerId);
  const slot = normalizeEngineSlot(safe.slot || safe, services, resources);
  if (!tenantId || !conversationId || !customerEmail || !slot) return null;
  return {
    reservationId: normalizeText(safe.reservationId) || crypto.randomUUID(),
    tenantId,
    workspaceId: normalizeText(safe.workspaceId) || 'major-arcana-preview',
    conversationId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    slot,
    status: normalizeKey(safe.status) || 'active',
    source: normalizeText(safe.source) || 'cco_engine',
    ownerUserId: normalizeText(safe.ownerUserId),
    ownerName: normalizeText(safe.ownerName),
    createdAt: normalizeIso(safe.createdAt) || nowIso(),
    updatedAt: normalizeIso(safe.updatedAt) || nowIso(),
    expiresAt: normalizeIso(safe.expiresAt),
  };
}

function normalizeBookingRecord(input = {}, { services = [], resources = [] } = {}) {
  const safe = asObject(input);
  const tenantId = normalizeText(safe.tenantId);
  const conversationId = normalizeText(safe.conversationId);
  const customerEmail = normalizeKey(safe.customerEmail || safe.customerId);
  const slot = normalizeEngineSlot(safe.slot || safe, services, resources);
  if (!tenantId || !conversationId || !customerEmail || !slot) return null;
  return {
    bookingId: normalizeText(safe.bookingId) || crypto.randomUUID(),
    tenantId,
    workspaceId: normalizeText(safe.workspaceId) || 'major-arcana-preview',
    conversationId,
    customerEmail,
    customerName: normalizeText(safe.customerName),
    slot,
    status: normalizeKey(safe.status) || 'confirmed',
    source: normalizeText(safe.source) || 'cco_engine',
    ownerUserId: normalizeText(safe.ownerUserId),
    ownerName: normalizeText(safe.ownerName),
    confirmedAt: normalizeIso(safe.confirmedAt) || nowIso(),
    cancelledAt: normalizeIso(safe.cancelledAt),
    cancellationReason: normalizeText(safe.cancellationReason),
    createdAt: normalizeIso(safe.createdAt) || nowIso(),
    updatedAt: normalizeIso(safe.updatedAt) || nowIso(),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isReservationExpired(reservation = {}, referenceMs = Date.now()) {
  const expiresAtMs = Date.parse(normalizeText(reservation.expiresAt));
  return Number.isFinite(expiresAtMs) && expiresAtMs <= referenceMs;
}

function getReservationExpiryMeta(reservations = [], referenceMs = Date.now()) {
  const activeReservations = asArray(reservations).filter(
    (item) => normalizeKey(item?.status) === 'active'
  );
  const nextExpiringReservation = activeReservations
    .map((item) => ({
      reservation: item,
      expiresAt: normalizeIso(item.expiresAt),
      expiresAtMs: Date.parse(normalizeText(item.expiresAt)),
    }))
    .filter((item) => Number.isFinite(item.expiresAtMs))
    .sort((left, right) => left.expiresAtMs - right.expiresAtMs)[0];
  if (!nextExpiringReservation) {
    return {
      nextExpiryAt: '',
      expiresInMinutes: null,
      expiresSoon: false,
    };
  }
  const expiresInMinutes = Math.max(
    0,
    Math.ceil((nextExpiringReservation.expiresAtMs - referenceMs) / (60 * 1000))
  );
  return {
    nextExpiryAt: nextExpiringReservation.expiresAt,
    expiresInMinutes,
    expiresSoon: expiresInMinutes <= 120,
  };
}

function buildDateRange(fromDate, toDate) {
  const start = normalizeDateOnly(fromDate);
  const end = normalizeDateOnly(toDate);
  if (!start || !end) return [];
  const startMs = Date.parse(`${start}T00:00:00.000Z`);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];
  const days = [];
  for (let current = startMs; current <= endMs; current += 24 * 60 * 60 * 1000) {
    days.push(new Date(current));
  }
  return days;
}

async function createCcoBookingEngineStore({ filePath }) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoBookingEngineStore.');
  }

  const initial = await readJson(filePath, defaultState());
  const state = {
    ...defaultState(),
    ...(asObject(initial) || {}),
  };
  state.resources = asArray(state.resources).map(normalizeResource).filter(Boolean);
  state.services = asArray(state.services).map(normalizeService).filter(Boolean);
  state.availabilityRules = asArray(state.availabilityRules)
    .map(normalizeAvailabilityRule)
    .filter(Boolean);
  state.reservations = asArray(state.reservations)
    .map((item) => normalizeReservation(item, state))
    .filter(Boolean);
  state.bookings = asArray(state.bookings)
    .map((item) => normalizeBookingRecord(item, state))
    .filter(Boolean);

  const migrated = migratePlanASchema(state);

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  if (migrated) {
    await save();
  }

  async function expireStaleReservations() {
    const referenceMs = Date.now();
    let changed = false;
    state.reservations = state.reservations.map((item) => {
      if (normalizeKey(item.status) !== 'active') return item;
      if (!isReservationExpired(item, referenceMs)) return item;
      changed = true;
      return {
        ...item,
        status: 'expired',
        updatedAt: nowIso(),
      };
    });
    if (changed) {
      await save();
    }
    return changed;
  }

  function getResourceById(resourceId) {
    return state.resources.find((item) => item.id === normalizeText(resourceId)) || null;
  }

  function getServiceById(serviceId) {
    return state.services.find((item) => item.id === normalizeText(serviceId)) || null;
  }

  function slotsOverlap(left = {}, right = {}) {
    const leftResourceId = normalizeText(left.resourceId);
    const rightResourceId = normalizeText(right.resourceId);
    if (!leftResourceId || !rightResourceId || leftResourceId !== rightResourceId) return false;
    const leftStart = Date.parse(normalizeText(left.startsAt));
    const leftEnd = Date.parse(normalizeText(left.endsAt));
    const rightStart = Date.parse(normalizeText(right.startsAt));
    const rightEnd = Date.parse(normalizeText(right.endsAt));
    if (!Number.isFinite(leftStart) || !Number.isFinite(leftEnd)) return false;
    if (!Number.isFinite(rightStart) || !Number.isFinite(rightEnd)) return false;
    return leftStart < rightEnd && rightStart < leftEnd;
  }

  function isSlotTaken(slot = {}, { excludeConversationId = '' } = {}) {
    const slotId = normalizeText(slot.slotId);
    return (
      state.reservations.some((item) => {
        if (normalizeKey(item.status) !== 'active') return false;
        if (
          excludeConversationId &&
          normalizeText(item.conversationId) === normalizeText(excludeConversationId)
        ) {
          return false;
        }
        return normalizeText(item.slot.slotId) === slotId || slotsOverlap(item.slot, slot);
      }) ||
      state.bookings.some((item) => {
        if (normalizeKey(item.status) !== 'confirmed') return false;
        if (
          excludeConversationId &&
          normalizeText(item.conversationId) === normalizeText(excludeConversationId)
        ) {
          return false;
        }
        return normalizeText(item.slot.slotId) === slotId || slotsOverlap(item.slot, slot);
      })
    );
  }

  function buildAvailabilitySlot(rule, day, timeLabel) {
    const dateOnly = day.toISOString().slice(0, 10);
    const startsAt = `${dateOnly}T${timeLabel}:00.000Z`;
    const service = getServiceById(rule.serviceId) || {};
    const resource = getResourceById(rule.resourceId) || {};
    return normalizeEngineSlot(
      {
        slotId: toSlotId({ resourceId: rule.resourceId, serviceId: rule.serviceId, startsAt }),
        startsAt,
        resourceId: rule.resourceId,
        resourceLabel: resource.label,
        serviceId: rule.serviceId,
        serviceLabel: service.label,
        locationLabel: rule.locationLabel,
      },
      state.services,
      state.resources
    );
  }

  async function listAvailability({
    tenantId,
    fromDate,
    toDate,
    resIds = '',
    srvIds = '',
    excludeConversationId = '',
    publicOnly = false,
  } = {}) {
    await expireStaleReservations();
    const tenant = normalizeText(tenantId);
    if (!tenant) throw new Error('tenantId krävs för booking engine availability.');
    let resourceIds = normalizeText(resIds)
      ? normalizeText(resIds)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    if (!resourceIds.length && publicOnly === true) {
      resourceIds = state.resources
        .filter(
          (item) =>
            item.active !== false &&
            (item.publicBookable === true ||
              PLAN_A_PUBLIC_RESOURCE_IDS.includes(normalizeText(item.id)))
        )
        .map((item) => normalizeText(item.id))
        .filter(Boolean);
    }
    const serviceIds = normalizeText(srvIds)
      ? normalizeText(srvIds)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const days = buildDateRange(fromDate, toDate);
    const slots = [];
    days.forEach((day) => {
      const weekday = day.getUTCDay();
      state.availabilityRules
        .filter((rule) => rule.active !== false)
        .filter((rule) => !resourceIds.length || resourceIds.includes(rule.resourceId))
        .filter((rule) => !serviceIds.length || serviceIds.includes(rule.serviceId))
        .filter((rule) => asArray(rule.weekdays).includes(weekday))
        .forEach((rule) => {
          asArray(rule.startTimes).forEach((timeLabel) => {
            const slot = buildAvailabilitySlot(rule, day, timeLabel);
            if (slot && !isSlotTaken(slot, { excludeConversationId })) {
              slots.push(slot);
            }
          });
        });
    });
    slots.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
    return clone(slots);
  }

  async function reserveSlots(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    if (!tenantId || !conversationId || !customerEmail) {
      throw new Error('Booking-reservation saknar tenant, conversation eller customer.');
    }
    const selectedSlots = asArray(input.selectedSlots || input.slots)
      .map((slot) => normalizeEngineSlot(slot, state.services, state.resources))
      .filter(Boolean)
      .slice(0, 3);
    selectedSlots.forEach((slot) => {
      if (isSlotTaken(slot, { excludeConversationId: conversationId })) {
        const error = new Error(`Tiden ${slot.startsAt} är inte längre ledig.`);
        error.statusCode = 409;
        throw error;
      }
    });
    state.reservations = state.reservations.filter((item) => {
      if (normalizeText(item.tenantId) !== tenantId) return true;
      if (normalizeText(item.conversationId) !== conversationId) return true;
      return normalizeKey(item.status) !== 'active';
    });
    const reservations = selectedSlots.map((slot) =>
      normalizeReservation(
        {
          tenantId,
          workspaceId: input.workspaceId,
          conversationId,
          customerEmail,
          customerName: input.customerName,
          ownerUserId: input.ownerUserId,
          ownerName: input.ownerName,
          slot,
          status: 'active',
          expiresAt: addMinutes(nowIso(), 72 * 60),
        },
        state
      )
    );
    state.reservations.push(...reservations);
    await save();
    return clone(reservations);
  }

  async function renewReservations(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    if (!tenantId || !conversationId || !customerEmail) {
      const error = new Error('Saknar aktiv reservation att förnya i CCO.');
      error.statusCode = 400;
      throw error;
    }
    const extensionMinutes = Math.max(60, Number(input.extensionMinutes) || 72 * 60);
    const renewedAt = nowIso();
    const nextExpiryAt = addMinutes(renewedAt, extensionMinutes);
    let renewedCount = 0;
    state.reservations = state.reservations.map((item) => {
      if (item.tenantId !== tenantId) return item;
      if (item.conversationId !== conversationId) return item;
      if (item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'active') return item;
      renewedCount += 1;
      return {
        ...item,
        updatedAt: renewedAt,
        expiresAt: nextExpiryAt,
      };
    });
    if (!renewedCount) {
      const error = new Error('Ingen aktiv reservation hittades att förnya.');
      error.statusCode = 404;
      throw error;
    }
    await save();
    return clone(
      state.reservations.filter((item) => {
        return (
          item.tenantId === tenantId &&
          item.conversationId === conversationId &&
          item.customerEmail === customerEmail &&
          normalizeKey(item.status) === 'active'
        );
      })
    );
  }

  async function getActiveReservations({ tenantId, conversationId, customerEmail } = {}) {
    await expireStaleReservations();
    const tenant = normalizeText(tenantId);
    const conversation = normalizeText(conversationId);
    const customer = normalizeKey(customerEmail);
    return clone(
      state.reservations.filter((item) => {
        if (tenant && item.tenantId !== tenant) return false;
        if (conversation && item.conversationId !== conversation) return false;
        if (customer && item.customerEmail !== customer) return false;
        return normalizeKey(item.status) === 'active';
      })
    );
  }

  function buildCaseWorkflowSummary({ reservations = [], booking = null } = {}) {
    const activeReservations = asArray(reservations).filter(
      (item) => normalizeKey(item?.status) === 'active'
    );
    const confirmedBooking =
      booking && normalizeKey(booking.status) === 'confirmed' ? booking : null;
    const primaryReservation = activeReservations[0] || null;
    const primarySlot = confirmedBooking?.slot || primaryReservation?.slot || null;
    const expiryMeta = getReservationExpiryMeta(activeReservations);
    const workflowState = confirmedBooking
      ? 'confirmed'
      : activeReservations.length
        ? 'reserved'
        : 'idle';
    return {
      state: workflowState,
      stateLabel:
        workflowState === 'confirmed'
          ? 'Bekräftad'
          : workflowState === 'reserved'
            ? activeReservations.length === 1
              ? 'Reserverad'
              : `${activeReservations.length} reserverade`
            : 'Ingen reservation',
      recommendedAction:
        workflowState === 'confirmed'
          ? 'none'
          : workflowState === 'reserved'
            ? expiryMeta.expiresSoon
              ? 'renew_reservation'
              : 'confirm_external'
            : 'candidate_slots',
      reservationCount: activeReservations.length,
      hasReservations: activeReservations.length > 0,
      hasConfirmedBooking: Boolean(confirmedBooking),
      activeReservation: primaryReservation ? clone(primaryReservation) : null,
      primarySlot: primarySlot ? clone(primarySlot) : null,
      nextExpiryAt: expiryMeta.nextExpiryAt,
      expiresInMinutes: Number.isFinite(expiryMeta.expiresInMinutes)
        ? expiryMeta.expiresInMinutes
        : null,
      expiresSoon: expiryMeta.expiresSoon === true,
      stateReason:
        workflowState === 'confirmed'
          ? 'Bokningen är bekräftad i CCO:s egen bokningsmotor.'
          : workflowState === 'reserved'
            ? expiryMeta.nextExpiryAt
              ? expiryMeta.expiresSoon
                ? `Reservationen håller tiden till ${expiryMeta.nextExpiryAt} och bör bekräftas snart.`
                : `Reservationen håller tiden till ${expiryMeta.nextExpiryAt}.`
              : 'Valda tider hålls i CCO i väntan på bekräftelse.'
            : 'Välj tider först och reservera dem sedan i CCO innan slutlig bekräftelse.',
      updatedAt:
        confirmedBooking?.updatedAt ||
        confirmedBooking?.confirmedAt ||
        primaryReservation?.updatedAt ||
        primaryReservation?.createdAt ||
        nowIso(),
    };
  }

  async function confirmBooking(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const preferredSlot =
      normalizeEngineSlot(input.slot || input.selectedSlot, state.services, state.resources) ||
      null;
    const activeReservations = await getActiveReservations({
      tenantId,
      conversationId,
      customerEmail,
    });
    const selectedReservation =
      activeReservations.find((item) => {
        if (!preferredSlot) return true;
        return normalizeText(item.slot.slotId) === normalizeText(preferredSlot.slotId);
      }) || null;
    const slot = selectedReservation?.slot || preferredSlot;
    if (!tenantId || !conversationId || !customerEmail || !slot) {
      const error = new Error('Saknar reserverad eller vald tid för att bekräfta bokningen.');
      error.statusCode = 400;
      throw error;
    }
    const existingConfirmedBooking =
      state.bookings.find((item) => {
        if (item.tenantId !== tenantId || item.conversationId !== conversationId) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;
    if (
      !selectedReservation &&
      preferredSlot &&
      isSlotTaken(preferredSlot, { excludeConversationId: conversationId })
    ) {
      const error = new Error(
        `Tiden ${preferredSlot.startsAt} är inte längre ledig för bekräftelse.`
      );
      error.statusCode = 409;
      throw error;
    }
    if (
      existingConfirmedBooking &&
      normalizeText(existingConfirmedBooking.slot?.slotId) &&
      normalizeText(existingConfirmedBooking.slot?.slotId) !== normalizeText(slot.slotId)
    ) {
      const error = new Error(
        'Det finns redan en bekräftad tid i CCO. Använd ombokning för att ersätta den.'
      );
      error.statusCode = 409;
      error.metadata = {
        code: 'booking_rebook_required',
        confirmedSlotId: normalizeText(existingConfirmedBooking.slot?.slotId),
        selectedSlotId: normalizeText(slot.slotId),
      };
      throw error;
    }
    state.reservations = state.reservations.map((item) => {
      if (item.tenantId !== tenantId || item.conversationId !== conversationId) return item;
      return {
        ...item,
        status:
          normalizeText(selectedReservation?.reservationId) === item.reservationId
            ? 'confirmed'
            : 'released',
        updatedAt: nowIso(),
      };
    });
    const existingBookingIndex = state.bookings.findIndex(
      (item) =>
        item.tenantId === tenantId &&
        item.conversationId === conversationId &&
        normalizeKey(item.status) === 'confirmed'
    );
    const bookingRecord = normalizeBookingRecord(
      {
        ...(existingBookingIndex >= 0 ? state.bookings[existingBookingIndex] : {}),
        tenantId,
        workspaceId: input.workspaceId,
        conversationId,
        customerEmail,
        customerName: input.customerName,
        ownerUserId: input.ownerUserId,
        ownerName: input.ownerName,
        slot,
        status: 'confirmed',
        confirmedAt: nowIso(),
      },
      state
    );
    if (existingBookingIndex >= 0) {
      state.bookings[existingBookingIndex] = bookingRecord;
    } else {
      state.bookings.push(bookingRecord);
    }
    await save();
    return clone(bookingRecord);
  }

  async function cancelBooking(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const reason = normalizeText(input.reason) || 'Avbokad i CCO';
    let changed = false;
    state.bookings = state.bookings.map((item) => {
      if (tenantId && item.tenantId !== tenantId) return item;
      if (conversationId && item.conversationId !== conversationId) return item;
      if (customerEmail && item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'confirmed') return item;
      changed = true;
      return {
        ...item,
        status: 'cancelled',
        cancelledAt: nowIso(),
        cancellationReason: reason,
        updatedAt: nowIso(),
      };
    });
    state.reservations = state.reservations.map((item) => {
      if (tenantId && item.tenantId !== tenantId) return item;
      if (conversationId && item.conversationId !== conversationId) return item;
      if (customerEmail && item.customerEmail !== customerEmail) return item;
      if (normalizeKey(item.status) !== 'active') return item;
      changed = true;
      return {
        ...item,
        status: 'released',
        updatedAt: nowIso(),
      };
    });
    if (!changed) {
      const error = new Error('Ingen aktiv bokning hittades att avboka.');
      error.statusCode = 404;
      throw error;
    }
    await save();
    return {
      tenantId,
      conversationId,
      customerEmail,
      status: 'cancelled',
      cancellationReason: reason,
    };
  }

  async function rebookBooking(input = {}) {
    await expireStaleReservations();
    const tenantId = normalizeText(input.tenantId);
    const conversationId = normalizeText(input.conversationId);
    const customerEmail = normalizeKey(input.customerEmail || input.customerId);
    const previousBooking =
      state.bookings.find((item) => {
        if (tenantId && item.tenantId !== tenantId) return false;
        if (conversationId && item.conversationId !== conversationId) return false;
        if (customerEmail && item.customerEmail !== customerEmail) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;
    await cancelBooking({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      customerEmail: input.customerEmail || input.customerId,
      reason: normalizeText(input.reason) || 'Ombokad i CCO',
    });
    await reserveSlots(input);
    const booking = await confirmBooking(input);
    return {
      ...booking,
      previousBooking: previousBooking ? clone(previousBooking) : null,
      previousSlot: previousBooking?.slot ? clone(previousBooking.slot) : null,
    };
  }

  async function getCaseSummary({ tenantId, conversationId, customerEmail } = {}) {
    const reservations = await getActiveReservations({ tenantId, conversationId, customerEmail });
    const booking =
      state.bookings.find((item) => {
        if (tenantId && item.tenantId !== normalizeText(tenantId)) return false;
        if (conversationId && item.conversationId !== normalizeText(conversationId)) return false;
        if (customerEmail && item.customerEmail !== normalizeKey(customerEmail)) return false;
        return normalizeKey(item.status) === 'confirmed';
      }) || null;
    const workflow = buildCaseWorkflowSummary({ reservations, booking });
    return {
      reservations,
      booking: clone(booking),
      ...workflow,
      resources: clone(state.resources.filter((item) => item.active !== false)),
      services: clone(state.services.filter((item) => item.active !== false)),
    };
  }

  return {
    listAvailability,
    reserveSlots,
    renewReservations,
    getActiveReservations,
    confirmBooking,
    cancelBooking,
    rebookBooking,
    getCaseSummary,
    listResources: async () => clone(state.resources.filter((item) => item.active !== false)),
    listServices: async () => clone(state.services.filter((item) => item.active !== false)),
    listPublicServices: async () =>
      clone(
        state.services.filter(
          (item) =>
            item.active !== false &&
            (item.publicBookable === true ||
              PLAN_A_PUBLIC_SERVICE_IDS.includes(normalizeText(item.id)))
        )
      ),
    listPublicResources: async () =>
      clone(
        state.resources.filter(
          (item) =>
            item.active !== false &&
            (item.publicBookable === true ||
              PLAN_A_PUBLIC_RESOURCE_IDS.includes(normalizeText(item.id)))
        )
      ),
    listPublicAvailability: async (input = {}) =>
      listAvailability({
        ...input,
        publicOnly: true,
      }),
    _state: state,
  };
}

module.exports = {
  createCcoBookingEngineStore,
  PLAN_A_PUBLIC_SERVICE_IDS,
  PLAN_A_PUBLIC_RESOURCE_IDS,
};
