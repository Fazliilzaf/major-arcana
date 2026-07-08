'use strict';

/**
 * ccoCustomerDossier — samlar "all info om kunden" för Svarstudion ur de
 * befintliga CCO-storarna. Alla är nycklade på patientId (=== customerId i CCO).
 *
 * Avgränsning (medvetet):
 *   - REN läsning/aggregering. Muterar inget, skickar inget.
 *   - PII-medveten: RÅ JOURNALTEXT tas ALDRIG med — bara antal + senaste datum.
 *     Känslig hälsodata får inte läcka in i Svarstudions läsyta eller AI-utkast.
 *     Journalinnehåll kräver en separat, RBAC-grindad väg (senare increment).
 *   - Varje store är valfri och anropas defensivt: saknas den eller kastar den,
 *     noteras det i `warnings` och resten av dossiern byggs ändå. Så en trasig
 *     delkälla stjälper aldrig hela kortet.
 *
 * Storarna injiceras (samma mönster som routrarna) så modulen är ren och
 * enhetstestbar utan att dra in server-wiring.
 */

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstStrings(...values) {
  const seen = new Set();
  const out = [];
  for (const value of values.flat()) {
    const v = text(value).toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(text(value));
    }
  }
  return out;
}

async function safe(label, warnings, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    warnings.push(`${label}: ${String(err?.message || err).slice(0, 120)}`);
    return fallback;
  }
}

/**
 * @param {{tenantId?:string, customerId?:string, patientId?:string, email?:string, nowIso?:string}} ref
 * @param {{
 *   patientMasterStore?:object, journeyStore?:object, bookingStore?:object,
 *   caseStore?:object, threadStore?:object, journalStore?:object
 * }} stores
 */
async function buildCustomerDossier(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  let patientId = text(ref.patientId) || text(ref.customerId);
  let customerId = text(ref.customerId) || text(ref.patientId);
  const email = text(ref.email);
  const warnings = [];

  const dossier = {
    tenantId,
    customerId: customerId || null,
    patientId: patientId || null,
    identity: { name: null, personnummerMasked: null },
    contact: { emails: firstStrings(email), phones: [] },
    journey: null,
    bookings: { upcoming: [], recent: [], count: 0 },
    cases: [],
    threads: { count: 0, needsReply: 0, summary: null },
    // Endast metadata om journalen — ALDRIG innehåll.
    journal: {
      count: 0,
      latestAt: null,
      note: 'Journalinnehåll visas inte här (kräver separat behörighet).',
    },
    photos: { count: 0 },
    warnings,
  };

  if (!patientId && !customerId && !email) {
    warnings.push('ingen kundnyckel (patientId/customerId/email) angavs');
    return dossier;
  }

  // ── Patient-master: identitet + kontaktvägar ──────────────────────────
  if (stores.patientMasterStore?.getPatient) {
    const patient = await safe('patient_master', warnings, () =>
      stores.patientMasterStore.getPatient({ tenantId, patientId, customerId, email })
    );
    if (patient) {
      const resolvedPatientId = text(patient.id) || text(patient.patientId);
      if (resolvedPatientId) {
        patientId = resolvedPatientId;
        dossier.patientId = resolvedPatientId;
        if (!customerId || customerId === email) {
          customerId = resolvedPatientId;
          dossier.customerId = resolvedPatientId;
        }
      }
      dossier.identity.name =
        text(patient.name) || text(patient.fullName) || text(patient.displayName) || null;
      const pnr = text(patient.personnummer);
      // Maska personnummer: visa bara sekelsiffror + de sista fyra som XXXX.
      if (pnr) dossier.identity.personnummerMasked = pnr.replace(/\d(?=\d{4})/g, '•');
      dossier.contact.emails = firstStrings(
        dossier.contact.emails,
        patient.emails,
        patient.email,
        patient.primaryEmail
      );
      dossier.contact.phones = firstStrings(
        patient.phones,
        patient.phone,
        patient.mobile,
        patient.primaryPhone
      );
    }
  }

  // ── Journey/status ────────────────────────────────────────────────────
  if (stores.journeyStore?.getOverview || stores.journeyStore?.getJourney) {
    const journey = await safe('journey', warnings, () =>
      (stores.journeyStore.getOverview || stores.journeyStore.getJourney).call(
        stores.journeyStore,
        { tenantId, patientId, customerId }
      )
    );
    if (journey) {
      dossier.journey = {
        step: text(journey.step) || text(journey.journeyStep) || null,
        stage: text(journey.stage) || null,
        status: text(journey.status) || null,
      };
    }
  }

  // ── Bokningar (kommande + senaste) ────────────────────────────────────
  if (stores.bookingStore?.getBookingsForCustomer) {
    const bookings = await safe(
      'bookings',
      warnings,
      () =>
        stores.bookingStore.getBookingsForCustomer({
          tenantId,
          customerEmail: email || dossier.contact.emails[0] || '',
          customerId,
          patientId,
        }),
      []
    );
    const list = Array.isArray(bookings)
      ? bookings
      : Array.isArray(bookings?.bookings)
        ? bookings.bookings
        : [];
    const norm = list.map((b) => ({
      id: text(b.id) || text(b.bookingId) || null,
      service: text(b.serviceLabel) || text(b.serviceName) || text(b.service) || null,
      startsAt: text(b.startsAt) || text(b.start) || text(b.date) || null,
      status: text(b.status) || null,
    }));
    const now = ref.nowIso ? text(ref.nowIso) : '';
    dossier.bookings.count = norm.length;
    dossier.bookings.upcoming = norm
      .filter((b) => b.startsAt && (!now || b.startsAt >= now))
      .slice(0, 5);
    dossier.bookings.recent = norm
      .filter((b) => b.startsAt && now && b.startsAt < now)
      .slice(-5)
      .reverse();
  }

  // ── Ärenden/case ──────────────────────────────────────────────────────
  if (stores.caseStore?.listCasesForCustomer) {
    const cases = await safe(
      'cases',
      warnings,
      () => stores.caseStore.listCasesForCustomer({ tenantId, patientId, customerId, email }),
      []
    );
    const list = Array.isArray(cases) ? cases : Array.isArray(cases?.cases) ? cases.cases : [];
    dossier.cases = list.slice(0, 8).map((c) => ({
      id: text(c.id) || null,
      title: text(c.title) || text(c.serviceLabel) || null,
      status: text(c.status) || text(c.state) || null,
    }));
  }

  // ── Trådar (antal + behöver-svar) ─────────────────────────────────────
  if (stores.threadStore?.buildThreadsForCustomer && customerId) {
    const built = await safe('threads', warnings, () =>
      stores.threadStore.buildThreadsForCustomer(customerId, { tenantId })
    );
    const threads = Array.isArray(built?.threads) ? built.threads : [];
    dossier.threads.count = threads.length;
    dossier.threads.needsReply = threads.filter((t) => {
      const s = String(t.needsReplyStatus || t.status || t.state || '').toLowerCase();
      return s.includes('need') || s.includes('open') || s.includes('pending');
    }).length;
    dossier.threads.summary = built?.summary || null;
  }

  // ── Journal: ENDAST metadata (antal + senaste), aldrig innehåll ───────
  if (stores.journalStore?.listEntries) {
    const entries = await safe(
      'journal',
      warnings,
      () => stores.journalStore.listEntries({ tenantId, patientId, customerId }),
      []
    );
    const list = Array.isArray(entries)
      ? entries
      : Array.isArray(entries?.entries)
        ? entries.entries
        : [];
    dossier.journal.count = list.length;
    dossier.journal.latestAt =
      list
        .map((e) => text(e.createdAt) || text(e.date) || '')
        .filter(Boolean)
        .sort()
        .pop() || null;
  }

  return dossier;
}

module.exports = { buildCustomerDossier };
