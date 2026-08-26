'use strict';

/**
 * CCO Recurring Series Store — persistering av återkommande bokningsserier.
 *
 * Block 4 i docs/handover/WORKFLOW-IN-I-CCO-TODO-2026-08-26.md:
 *   - 4.1  Persistera serien som riktiga reservationer i bokningsmotorn.
 *   - 4.2  Föreslå followup-transplant-serien när en transplantation journalförs.
 *   - 4.3  Koppla PRP-serierna till samma väg (förslag vid journalföring +
 *          persistering som reservation när personalen väljer).
 *
 * Två vägar:
 *   - `createSeries`            → Väg A: skapa serien, spara den, och (om
 *                                 bokningsmotorn är monterad) skriv varje
 *                                 tillfälle som en riktig reservation.
 *   - `suggestSeriesFromJournal`→ Väg B: ren föreslagsväg. Byggs endast som
 *                                 ett förslag (status 'suggested'), skrivs
 *                                 aldrig som bokning. Personalen väljer tider
 *                                 och bekräftar, först då blir det en bokning.
 *
 * OBS PDL/GDPR: filen innehåller patientkontakt och måste ligga under data/
 * (gitignorad), som eftervårdsschemaläggaren.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const {
  createRecurringSeries,
  getNextUnbooked,
  markOccurrenceBooked: applyBooked,
  markOccurrenceCompleted: applyCompleted,
  getSeriesProgress,
  findSeriesTemplatesForJournal,
  normalizeSeriesKey,
  SERIES_TEMPLATES,
} = require('./recurringBookings');

const SERIES_STATUSES = Object.freeze(['active', 'suggested', 'completed', 'cancelled']);

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function addDays(isoDate = '', days = 0) {
  const base = Date.parse(normalizeText(isoDate));
  const ms = Number.isFinite(base) ? base : Date.now();
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function addWeeks(isoDate = '', weeks = 0) {
  return addDays(isoDate, Number(weeks) * 7);
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

// Bygg en serie från en mall. mode avgör vilken väg serien ligger på:
//   'book'      → riktig serie (kan bli reservation, path A)
//   'suggest'   → ren föreslagsväg (path B), ingen auto-bokning
function buildSeriesFromTemplate(template, input = {}, mode = 'book') {
  if (!template?.templateId) throw httpError(400, 'templateId saknas');

  const anchorDate = normalizeText(input.startDate || input.completedAt || input.anchorDate);
  // I föreslagsvägen byggs serien från op-dagen (input.startDate) och
  // firstOccurrenceOffsetWeeks läggs till (t.ex. followup-transplant börjar
  // på op-dagen + 4 månader). Vid manuell bokning är startDate redan det
  // önskade första tillfället och offset appliceras inte.
  const firstOccurrenceOffsetWeeks =
    mode === 'suggest' ? (template.firstOccurrenceOffsetWeeks ?? 0) : 0;
  const firstTakenAt = addWeeks(anchorDate, firstOccurrenceOffsetWeeks);

  const series = createRecurringSeries({
    patientId: normalizeText(input.patientId),
    patientName:
      normalizeText(input.patientName) ||
      `${normalizeText(input.firstName)} ${normalizeText(input.lastName)}`.trim(),
    serviceId: normalizeText(input.serviceId) || template.serviceId,
    resourceId: normalizeText(input.resourceId),
    startDate: firstTakenAt || nowIso().slice(0, 10),
    count: template.count,
    intervalWeeks: template.intervalWeeks,
    templateId: template.templateId,
  });

  if (mode === 'suggest') {
    // Väg B: ett förslag, inte en bokning. Alla tillfällen är 'planned' och
    // serien 'suggested' tills personalen väljer och bekräftar.
    series.status = 'suggested';
    for (const occ of series.occurrences) {
      occ.status = 'planned';
    }
  }

  series.mode = mode;
  series.templateLabel = normalizeText(input.templateLabel) || template.label;
  return series;
}

async function createCcoRecurringSeriesStore({
  filePath,
  bookingEngineStore = null,
  tenantId = '',
  defaultStartTime = '09:00',
  auditLog = null,
  logger = console,
} = {}) {
  if (!filePath) throw new Error('filePath saknas for recurring series store.');

  let data = { version: 1, updatedAt: null, series: {} };
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.series &&
      typeof parsed.series === 'object'
    ) {
      data = parsed;
    }
  } catch {
    // Första körningen — filen skapas vid första persist.
  }

  let persistChain = Promise.resolve();
  function persist() {
    persistChain = persistChain
      .then(async () => {
        data.updatedAt = nowIso();
        const tmpPath = `${filePath}.tmp`;
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(tmpPath, JSON.stringify(data, null, 2));
        await fs.rename(tmpPath, filePath);
      })
      .catch((err) => {
        logger?.warn?.('[cco-recurring] persist misslyckades:', err.message);
      });
    return persistChain;
  }

  function audit(action, { target = null, result = 'ok', role = 'system', detail = null } = {}) {
    try {
      auditLog?.append?.({ action, actor: { role }, target, result, detail });
    } catch {
      // Audit får aldrig falla själva flödet.
    }
  }

  function storeSeries(series) {
    data.series[series.seriesId] = series;
    audit('recurring.series.saved', {
      target: { type: 'recurring_series', id: series.seriesId },
      detail: {
        templateId: series.templateId,
        mode: series.mode,
        count: series.count,
        status: series.status,
        patientId: series.patientId,
      },
    });
  }

  // Väg A: skapa serien och (om bokningsmotorn finns) skriv varje tillfälle som
  // en riktig reservation. Returnerar serien + reservationer + framsteg.
  async function createSeries(input = {}) {
    const templateId = normalizeText(input.templateId);
    const template = SERIES_TEMPLATES.find((item) => item.templateId === templateId) || null;
    if (!template) {
      const error = new Error(`okänd seriemall: ${templateId || '(saknas)'}`);
      error.statusCode = 400;
      throw error;
    }

    const series = buildSeriesFromTemplate(template, input, 'book');
    storeSeries(series);
    await persist();

    // Riktiga reservationer i bokningsmotorn (Block 4.1). Kräver en äkta
    // kund-e-postadress — utan den uppfinner vi ingen. Misslyckas det ska
    // serien ändå ha sparats — reservationen är ett planeringsunderlag.
    let reservations = [];
    const customerEmail = normalizeText(input.customerEmail);
    if (
      customerEmail &&
      bookingEngineStore &&
      typeof bookingEngineStore.upsertSeriesReservations === 'function'
    ) {
      try {
        reservations = await bookingEngineStore.upsertSeriesReservations({
          tenantId: normalizeText(input.tenantId) || tenantId,
          // Serie-scopad konversation om ingen ges — en serie-reservation ska inte
          // krocka med kundens bokningskonversation (reserveSlots rensar bort
          // aktiva reservationer per konversation).
          conversationId: normalizeText(input.conversationId) || `series:${series.seriesId}`,
          customerEmail,
          customerName: series.patientName,
          seriesId: series.seriesId,
          templateId: series.templateId,
          occurrences: series.occurrences,
          resourceId: series.resourceId,
          serviceId: series.serviceId,
          defaultStartTime: normalizeText(input.defaultStartTime) || defaultStartTime,
          durationMinutes: input.durationMinutes,
          ownerUserId: input.ownerUserId,
          ownerName: input.ownerName,
          workspaceId: input.workspaceId,
          metadata: {
            patientId: series.patientId,
          },
        });
      } catch (err) {
        logger?.warn?.('[cco-recurring] serie-reservation ej skriven:', err.message);
      }
    }

    audit('recurring.series.created', {
      target: { type: 'recurring_series', id: series.seriesId },
      detail: { templateId: series.templateId, reservations: reservations.length },
    });
    return { series, reservations, progress: getSeriesProgress(series) };
  }

  // Väg B: föreslå serien när en behandling journalförs. Matar behandlings-
  // journalTyp/tjänste-id mot mallarnas suggestOnJournalKeys. Bygger ETT förslag
  // per matchande mall (personalen väljer). Aldrig en bokning.
  //
  // Idempotent på (patientId + mall + sourceEncounterId): signeras samma
  // journalpost igen skapas inget dubbelt förslag. Ett förslag som redan
  // konsumerats (bookad/klar) kan föreslås på nytt av en ny journalpost.
  async function suggestSeriesFromJournal(input = {}) {
    const keys = [
      input.journalType,
      input.treatmentKey,
      input.serviceId,
      input.entryServiceId,
      input.treatment,
    ]
      .map(normalizeSeriesKey)
      .filter(Boolean);

    const templates = findSeriesTemplatesForJournal(keys);
    if (templates.length === 0) {
      return { matched: 0, suggestions: [], reason: 'ingen serie-mall matchar journalhändelsen' };
    }

    const patientId = normalizeText(input.patientId);
    const sourceEncounterId = normalizeText(input.sourceEncounterId);
    const suggestions = [];
    for (const template of templates) {
      // Redan föreslaget för samma kund+mall+journalpost? Hoppa över.
      const existing = Object.values(data.series).find(
        (item) =>
          normalizeSeriesKey(item.mode) === 'suggest' &&
          normalizeSeriesKey(item.status) === 'suggested' &&
          item.patientId === patientId &&
          item.templateId === template.templateId &&
          normalizeText(item.sourceEncounterId) === sourceEncounterId
      );
      if (existing) {
        suggestions.push({ ...existing });
        continue;
      }

      const series = buildSeriesFromTemplate(template, input, 'suggest');
      series.sourceEncounterId = sourceEncounterId;
      storeSeries(series);
      await persist();
      suggestions.push(series);
    }

    audit('recurring.series.suggested', {
      target: { type: 'recurring_series', id: suggestions.map((s) => s.seriesId).join(',') },
      detail: {
        templates: suggestions.map((s) => s.templateId),
        patientId: suggestions[0]?.patientId,
      },
    });
    return { matched: suggestions.length, suggestions };
  }

  function listSeries({
    patientId = '',
    templateId = '',
    status = '',
    mode = '',
    limit = 100,
  } = {}) {
    const wantPatient = normalizeText(patientId);
    const wantTemplate = normalizeText(templateId);
    const wantStatus = normalizeText(status).toLowerCase();
    const wantMode = normalizeText(mode).toLowerCase();
    const max = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;
    return Object.values(data.series)
      .filter((item) => {
        if (wantPatient && item.patientId !== wantPatient) return false;
        if (wantTemplate && item.templateId !== wantTemplate) return false;
        if (wantStatus && normalizeSeriesKey(item.status) !== wantStatus) return false;
        if (wantMode && normalizeSeriesKey(item.mode) !== wantMode) return false;
        return true;
      })
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(0, max)
      .map((item) => ({ ...item }));
  }

  function listSuggestions({ patientId = '', limit = 100 } = {}) {
    return listSeries({ patientId, status: 'suggested', mode: 'suggest', limit });
  }

  function getSeries(seriesId = '') {
    const item = data.series[normalizeText(seriesId)];
    return item ? { ...item } : null;
  }

  async function markOccurrenceBooked(seriesId = '', occurrenceId = '', bookingId = '') {
    const series = data.series[normalizeText(seriesId)];
    if (!series) throw httpError(404, 'serie saknas');
    const occ = applyBooked(series, occurrenceId, bookingId);
    if (!occ) throw httpError(404, 'tillfälle saknas i serien');
    // När personalen bekräftar ett tillfälle lämnar serien föreslagsvägen.
    if (series.status === 'suggested') series.status = 'active';
    await persist();
    return { series: { ...series }, occurrence: { ...occ } };
  }

  async function markOccurrenceCompleted(seriesId = '', occurrenceId = '') {
    const series = data.series[normalizeText(seriesId)];
    if (!series) throw httpError(404, 'serie saknas');
    const occ = applyCompleted(series, occurrenceId);
    if (!occ) throw httpError(404, 'tillfälle saknas i serien');
    await persist();
    return { series: { ...series }, occurrence: { ...occ } };
  }

  function listTemplates() {
    return SERIES_TEMPLATES.map((template) => ({
      ...template,
      suggestOnTreatmentKeys: template.suggestOnTreatmentKeys || [],
      suggestOnJournalTypes: template.suggestOnJournalTypes || [],
    }));
  }

  return {
    createSeries,
    suggestSeriesFromJournal,
    listSeries,
    listSuggestions,
    getSeries,
    getProgress: getSeriesProgress,
    getNextUnbooked,
    markOccurrenceBooked,
    markOccurrenceCompleted,
    listTemplates,
    stats: () => ({ total: Object.keys(data.series).length }),
  };
}

module.exports = {
  createCcoRecurringSeriesStore,
  buildSeriesFromTemplate,
  addDays,
  addWeeks,
  SERIES_STATUSES,
  SERIES_TEMPLATES,
};
