const crypto = require('node:crypto');
const express = require('express');
const { buildBookingCaseBlockerReadout } = require('../ops/ccoBookingStore');

const WORKSPACE_ID = 'major-arcana-preview';
const DEFAULT_CONTEXT = Object.freeze({
  workspaceId: WORKSPACE_ID,
  conversationId: 'conv-anna-karlsson-prp-2026-04-22',
  customerId: 'anna.karlsson@email.com',
  customerName: 'Anna Karlsson',
  ownerName: 'Sara',
  doctorName: 'Dr. Eriksson',
  treatmentName: 'PRP håravfall',
  treatmentSeriesLabel: 'PRP 2/3',
  preferredDayLabel: 'Fredag',
  preferredWindowLabel: '09:00-12:00',
  suggestedDate: '2026-03-27',
  suggestedTime: '10:30',
  avgReplyHours: '2.5h',
});

const NOTE_TEMPLATES = {
  ombokning: {
    key: 'ombokning',
    label: 'Ombokning begärd',
    text:
      'Kunden önskar ombokning av PRP 2/3. Föredrar fredagar 09:00-12:00 med Dr. Eriksson. Var mycket nöjd med senaste behandlingen.',
    tags: ['ombokning', 'prp-serie', 'nöjd-kund'],
  },
  allergi: {
    key: 'allergi',
    label: 'Allergier / kontraindikationer',
    text:
      'Kunden uppger känslighet efter senaste behandlingen och vill säkerställa att inga kontraindikationer missas inför nästa steg. Behöver medicinsk kontroll före ny tid föreslås.',
    tags: ['allergi', 'medicinsk-koll', 'uppföljning'],
  },
  betalning: {
    key: 'betalning',
    label: 'Betalningsplan',
    text:
      'Kunden vill fortsätta sin PRP-serie men behöver dela upp nästa betalning. Önskar tydligt betalningsupplägg innan ny tid bekräftas.',
    tags: ['betalning', 'prp-serie', 'prisdialog'],
  },
};

const NOTE_VISIBILITY_RULES = {
  kundprofil: ['team', 'all_operators'],
  konversation: ['team', 'all_operators'],
  medicinsk: ['team', 'internal'],
  betalning: ['team', 'internal'],
  sla: ['team', 'all_operators'],
  intern: ['internal', 'team'],
  uppfoljning: ['team', 'all_operators'],
};

const NOTE_LABELS = {
  kundprofil: 'Kundprofil',
  konversation: 'Konversation',
  medicinsk: 'Medicinsk',
  betalning: 'Betalning',
  sla: 'SLA / eskalering',
  intern: 'Intern',
  uppfoljning: 'Uppföljning',
};

const SCHEDULE_OPTIONS = {
  doctors: ['Dr. Eriksson', 'Dr. Sara', 'Dr. Lindberg'],
  categories: ['Ombokning', 'Uppföljning', 'Konsultation'],
  reminders: [
    { label: '2 timmar innan', minutes: 120 },
    { label: '24 timmar innan', minutes: 1440 },
    { label: '48 timmar innan', minutes: 2880 },
  ],
};

const EMPTY_CONTEXT = Object.freeze({
  customerName: '',
  ownerName: '',
  doctorName: 'Dr. Eriksson',
  treatmentName: '',
  treatmentSeriesLabel: '',
  preferredDayLabel: '',
  preferredWindowLabel: '',
  suggestedDate: '',
  suggestedTime: '',
  avgReplyHours: '',
});

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeVisibility(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (
    ['alla operatörer', 'alla operatorer', 'all operators', 'all_operators'].includes(normalized)
  ) {
    return 'all_operators';
  }
  if (['intern', 'internal'].includes(normalized)) return 'internal';
  return 'team';
}

function normalizePriority(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (['hög', 'hog', 'high'].includes(normalized)) return 'high';
  if (['låg', 'lag', 'low'].includes(normalized)) return 'low';
  return 'medium';
}

function mapPriorityLabel(value) {
  if (value === 'high') return 'Hög';
  if (value === 'low') return 'Låg';
  return 'Medel';
}

function mapVisibilityLabel(value) {
  if (value === 'all_operators') return 'Alla operatörer';
  if (value === 'internal') return 'Intern';
  return 'Team';
}

function tagsFrom(values) {
  const tags = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const lowered = normalized.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    tags.push(normalized);
    if (tags.length >= 12) break;
  }
  return tags;
}

function reminderLabelFromMinutes(value) {
  const match = SCHEDULE_OPTIONS.reminders.find((item) => item.minutes === Number(value));
  return match ? match.label : '2 timmar innan';
}

function toWorkspaceContentContext(context = null) {
  if (
    context &&
    normalizeText(context.conversationId) &&
    normalizeText(context.customerId) &&
    normalizeText(context.customerName)
  ) {
    return {
      ...EMPTY_CONTEXT,
      customerName: normalizeText(context.customerName),
    };
  }
  return EMPTY_CONTEXT;
}

function buildScheduleIsoOrThrow(date, time) {
  const safeDate = normalizeText(date);
  const safeTime = normalizeText(time);
  const parsed = new Date(`${safeDate}T${safeTime}:00.000Z`);
  if (!safeDate || !safeTime || Number.isNaN(parsed.getTime())) {
    throw createValidationError('Ogiltigt datum eller tid.');
  }
  return parsed.toISOString();
}

function isLocalPreviewRequest(req) {
  const host = normalizeText(req.hostname || req.get('host')).split(':')[0].toLowerCase();
  const ip = normalizeText(req.ip || req.socket?.remoteAddress || '').toLowerCase();
  return (
    ['localhost', '127.0.0.1', '::1'].includes(host) ||
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)
  );
}

function getAuthToken(req) {
  const authHeader = normalizeText(req.get('authorization'));
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return normalizeText(req.get('x-auth-token'));
}

async function resolveWorkspaceActor(req, { authStore, config }) {
  const token = getAuthToken(req);
  if (token) {
    const context = await authStore.getSessionContextByToken(token);
    if (!context) {
      const error = new Error('Sessionen är ogiltig eller har gått ut.');
      error.statusCode = 401;
      throw error;
    }
    await authStore.touchSession(context.session.id);
    return {
      tenantId: context.membership.tenantId,
      userId: context.user.id,
      role: context.membership.role,
      authMode: 'session',
    };
  }

  if (isLocalPreviewRequest(req)) {
    return {
      tenantId: config.defaultTenantId,
      userId: 'preview-local',
      role: 'OWNER',
      authMode: 'preview_local',
    };
  }

  const error = new Error('Inloggning krävs.');
  error.statusCode = 401;
  throw error;
}

function buildNoteDefinitions({ latestFollowUp = null, workspaceContext = null }) {
  const contentContext = toWorkspaceContentContext(workspaceContext);
  const followUpDate = normalizeText(latestFollowUp?.date) || contentContext.suggestedDate;
  const followUpTime = normalizeText(latestFollowUp?.time) || contentContext.suggestedTime;
  const followUpDoctor = normalizeText(latestFollowUp?.doctorName) || contentContext.doctorName;
  const followUpCategory = normalizeText(latestFollowUp?.category) || 'Uppföljning';
  const followUpReminder = reminderLabelFromMinutes(latestFollowUp?.reminderLeadMinutes);
  const followUpNotes =
    normalizeText(latestFollowUp?.notes) ||
    (contentContext.customerName && contentContext.treatmentSeriesLabel
      ? `Uppföljning: kontakta kunden vecka 11 för att boka ${contentContext.treatmentSeriesLabel}. Föreslå fredag 09:00-12:00 med ${contentContext.doctorName}. SMS-påminnelse aktiveras vid bokning.`
      : '');

  return {
    kundprofil: {
      targetLabel: 'Kundprofil',
      livePreview: 'Permanent kundprofil · Synlig i alla framtida interaktioner',
      defaultText:
        'VIP-kund med högt engagemang. Föredrar snabb e-postkommunikation. Total investering i kliniken: 142 500 kr över 8 behandlingar.',
      defaultTags: ['vip', 'högt-engagemang', 'premium-kund'],
      dataCards: [
        { label: 'VIP-status', value: 'VIP-kund sedan 2024-01-15', meta: 'Kundprofil' },
        { label: 'Engagemangspoäng', value: '87% (mycket hög)', meta: 'Beteendeanalys' },
        { label: 'Kundvärde', value: '142 500 kr', meta: 'Ekonomisystem' },
        {
          label: 'Kommunikationspreferens',
          value: 'E-post föredras, svar inom 2 h',
          meta: 'Historik',
        },
      ],
      linkedItems: contentContext.customerName ? [contentContext.customerName] : [],
    },
    konversation: {
      targetLabel: 'Konversation',
      livePreview: 'Konversationstråd · Synlig när denna tråd öppnas',
      defaultText: NOTE_TEMPLATES.ombokning.text,
      defaultTags: NOTE_TEMPLATES.ombokning.tags,
      dataCards: [
        {
          label: 'Konversations-ID',
          value:
            'SLA är bruten och kunden behöver två konkreta ombokningsalternativ före 15:15 för att vi ska rädda morgondagens behandling och behålla förtroendet.',
          meta: 'Nuvarande tråd',
        },
        { label: 'Sentiment', value: 'Positivt (92%)', meta: 'Sentimentanalys' },
        { label: 'Avsikt', value: 'Ombokning + uppföljning', meta: 'Intent-detektion' },
        { label: 'Svarstid', value: 'Svarade inom 45 min', meta: 'SLA-system' },
      ],
      linkedItems: [
        'SLA är bruten och kunden behöver två konkreta ombokningsalternativ före 15:15.',
        contentContext.doctorName,
      ],
    },
    medicinsk: {
      targetLabel: 'Medicinsk',
      livePreview: 'Medicinsk journal · GDPR-skyddad · Endast behörig personal',
      defaultText:
        'PRP håravfall - session 1/3 genomförd 2025-02-28. Patienten följer eftervårdsinstruktionerna väl. Inga biverkningar rapporterade. Nästa session planerad vecka 12.',
      defaultTags: ['prp-behandling', 'håravfall', 'pågående-serie'],
      dataCards: [
        {
          label: 'Aktiv behandling',
          value: 'PRP håravfall - session 1/3 genomförd',
          meta: 'Behandlingssystem',
        },
        {
          label: 'Senaste behandling',
          value: '2025-02-28 med Dr. Eriksson',
          meta: 'Medicinsk journal',
        },
        { label: 'Allergier', value: 'Inga kända allergier', meta: 'Hälsoformulär' },
        {
          label: 'Efterlevnad',
          value: '95% (följer rekommendationer)',
          meta: 'Behandlingsuppföljning',
        },
      ],
      linkedItems: [contentContext.treatmentSeriesLabel && 'PRP-Serie-2025-02', contentContext.customerName, contentContext.doctorName].filter(Boolean),
    },
    betalning: {
      targetLabel: 'Betalning',
      livePreview: 'Ekonomisystem · Synlig i faktura och bokföring',
      defaultText:
        'Betalningsplan för PRP-serie (3×25 000 kr). Första betalningen mottagen 2025-02-28. Nästa faktura skickas efter session 2/3.',
      defaultTags: ['betalningsplan', 'prp-paket', 'faktura'],
      dataCards: [
        { label: 'Utestående saldo', value: '0 kr (allt betalt)', meta: 'Ekonomisystem' },
        {
          label: 'Betalningshistorik',
          value: '100% i tid (8/8 betalningar)',
          meta: 'Fakturahistorik',
        },
        { label: 'Aktiv betalningsplan', value: 'PRP-paket 3×25 000 kr', meta: 'Avtal' },
        {
          label: 'Betalningsmetod',
          value: 'Kort som slutar på 4523',
          meta: 'Betalningsmetoder',
        },
      ],
      linkedItems: ['Booking-2025-02-28', contentContext.customerName].filter(Boolean),
    },
    sla: {
      targetLabel: 'SLA / eskalering',
      livePreview: 'SLA-system · Skapar automatisk uppföljning och notifikation',
      defaultText:
        'VIP-kund behöver ombokning inom 24 h. Eskalera till Dr. Eriksson om det inte är löst inom 2 h. Kundens SLA-förväntan är svar inom 1 h.',
      defaultTags: ['urgent', 'vip-prioritet', 'ombokning'],
      dataCards: [
        { label: 'SLA-status', value: 'Inom SLA (2 h 15 min kvar)', meta: 'SLA-system' },
        { label: 'Prioritetspoäng', value: 'Medel (VIP = auto-hög)', meta: 'Smart scoring' },
        { label: 'Eskalationsrisk', value: 'Låg (15% risk)', meta: 'Prediktiv analys' },
        { label: 'Svarshistorik', value: 'Genomsnitt 1 h 23 min', meta: 'Historisk data' },
      ],
      linkedItems: [
        contentContext.customerName
          ? 'SLA är bruten och kunden behöver två konkreta ombokningsalternativ före 15:15 för att vi ska rädda morgondagens behandling och behålla förtroendet.'
          : '',
        [contentContext.doctorName, contentContext.ownerName && 'Sara - Reception'].filter(Boolean).join(', '),
      ],
    },
    intern: {
      targetLabel: 'Intern',
      livePreview: 'Intern databas · Endast synlig för teamet · Aldrig för kund',
      defaultText:
        'INTERNT: Kunden föredrar rum 3 för lugnare miljö. Erbjud alltid kaffe vid ankomst. Dr. Eriksson har starkast relation och bör prioriteras vid ombokning.',
      defaultTags: ['intern-info', 'preferenser', 'team-only'],
      dataCards: [
        {
          label: 'Teamkontext',
          value: 'Sara hanterar, Dr. Eriksson cc:ad',
          meta: 'Teamsystem',
        },
        { label: 'Interna anteckningar', value: '3 tidigare interna noteringar', meta: 'Internlogg' },
        { label: 'Kundhistorik', value: 'Aldrig klagomål, alltid positiv', meta: 'Feedback-system' },
        { label: 'Särskilda önskemål', value: 'Föredrar rum 3 (lugnast)', meta: 'Preferenser' },
      ],
      linkedItems: [contentContext.customerName, [contentContext.ownerName && 'Sara - Reception', contentContext.doctorName].filter(Boolean).join(', ')].filter(Boolean),
    },
    uppfoljning: {
      targetLabel: 'Uppföljning',
      livePreview: 'Uppföljningskö · Skapar automatisk CRM-påminnelse',
      defaultText: followUpNotes,
      defaultTags: ['uppföljning', 'prp-2/3', 'schemaläggning'],
      dataCards: [
        {
          label: 'Nästa behandling',
          value: `${contentContext.treatmentSeriesLabel} - ${followUpDate} ${followUpTime}`.trim(),
          meta: 'Behandlingsschema',
        },
        {
          label: 'Automatisk påminnelse',
          value: followUpReminder,
          meta: 'Notifikationssystem',
        },
        {
          label: 'Föreslagen tid',
          value: `${followUpDate} ${followUpTime} med ${followUpDoctor}`,
          meta: 'Smart schemaläggning',
        },
        {
          label: 'Kategori',
          value: followUpCategory,
          meta: 'Uppföljningsflöde',
        },
      ],
      linkedItems: [
        contentContext.treatmentSeriesLabel ? `Future-Booking-${contentContext.treatmentSeriesLabel}` : '',
        contentContext.customerName,
        contentContext.ownerName ? 'Sara - Reception' : '',
      ].filter(Boolean),
    },
  };
}

function mergeSavedNotes(definitions, savedNotes) {
  const notesByDestination = Object.fromEntries(
    (Array.isArray(savedNotes) ? savedNotes : []).map((note) => [normalizeKey(note.destinationKey), note])
  );
  const merged = {};
  for (const [key, definition] of Object.entries(definitions)) {
    const saved = notesByDestination[key];
    merged[key] = {
      ...definition,
      savedNote: saved || null,
      text: normalizeText(saved?.text) || definition.defaultText,
      tags: tagsFrom(saved?.tags?.length ? saved.tags : definition.defaultTags),
      priority: mapPriorityLabel(saved?.priority || 'medium'),
      visibility: mapVisibilityLabel(saved?.visibility || 'team'),
      templateKey: saved?.templateKey || null,
    };
  }
  return merged;
}

function buildScheduleDraft(latestFollowUp, workspaceContext = null) {
  const contentContext = toWorkspaceContentContext(workspaceContext);
  const followUp = latestFollowUp || {};
  return {
    customerName: contentContext.customerName,
    date: normalizeText(followUp.date) || contentContext.suggestedDate,
    time: normalizeText(followUp.time) || contentContext.suggestedTime,
    doctorName: normalizeText(followUp.doctorName) || contentContext.doctorName,
    category: normalizeText(followUp.category) || 'Ombokning',
    reminderLeadMinutes: Number(followUp.reminderLeadMinutes) || 120,
    reminderLabel: reminderLabelFromMinutes(followUp.reminderLeadMinutes),
    notes:
      normalizeText(followUp.notes) ||
      (contentContext.treatmentSeriesLabel
        ? `PRP 2/3 - Ombokning. Kunden bekräftar vanligtvis inom ${contentContext.avgReplyHours}.`
        : ''),
    latestFollowUp: latestFollowUp || null,
    recommendations: {
      preferredDay: contentContext.preferredDayLabel,
      timeWindow: contentContext.preferredWindowLabel,
      doctorName: contentContext.doctorName,
      avgReplyHours: contentContext.avgReplyHours,
    },
    linkedItems: ['Future-Booking-PRP-2', contentContext.customerName, contentContext.ownerName ? 'Sara - Reception' : ''].filter(Boolean),
  };
}

function buildBookingReadout(bookingCase, workspaceContext = null) {
  const contentContext = toWorkspaceContentContext(workspaceContext);
  const safeCase = bookingCase && typeof bookingCase === 'object' ? bookingCase : null;
  const selectedSlots = Array.isArray(safeCase?.selectedSlots) ? safeCase.selectedSlots : [];
  return {
    enabled: hasWorkspaceConversationContext(workspaceContext),
    status: normalizeText(safeCase?.status) || 'needs_triage',
    blocker: buildBookingCaseBlockerReadout(safeCase || {}),
    source: normalizeText(safeCase?.source) || 'operator',
    requestedTreatment:
      normalizeText(safeCase?.requestedTreatment) ||
      contentContext.treatmentName ||
      'Bokningsdialog',
    preferredWindow:
      normalizeText(safeCase?.preferredWindow) ||
      [contentContext.preferredDayLabel, contentContext.preferredWindowLabel].filter(Boolean).join(' · '),
    notes:
      normalizeText(safeCase?.notes) ||
      (contentContext.customerName
        ? `${contentContext.customerName} behöver konkreta tider och ett tydligt nästa steg.`
        : ''),
    selectedSlots,
    attention: {
      what:
        normalizeText(safeCase?.requestedTreatment) ||
        contentContext.treatmentName ||
        'Identifiera rätt behandling eller ärendetyp.',
      where:
        normalizeText(safeCase?.ownerName) ||
        contentContext.ownerName ||
        'Reception / operatör',
      when:
        selectedSlots[0]?.startsAt ||
        normalizeText(safeCase?.preferredWindow) ||
        contentContext.suggestedDate ||
        'Väntar på tidsförslag',
      confidence: selectedSlots.length ? 'Hög - kandidat-tider valda' : 'Medel - operatören behöver validera tider',
    },
    handoffCopy:
      selectedSlots.length > 0
        ? 'Tider är valda. Infoga i Svarstudio och låt kunden bekräfta innan extern bokning markeras.'
        : 'Hämta eller ange tider, validera dem manuellt, och erbjud kunden 1-3 alternativ.',
  };
}

function createValidationError(message, statusCode = 400, metadata = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.metadata = metadata;
  return error;
}

function hasWorkspaceConversationContext(context) {
  return Boolean(normalizeText(context?.conversationId) && normalizeText(context?.customerId));
}

function assertWorkspaceConversationContext(context) {
  if (hasWorkspaceConversationContext(context)) return;
  throw createValidationError('Välj en live-tråd först.', 400, {
    missing: ['conversationId', 'customerId'],
  });
}

function assertAllowedVisibility(destinationKey, visibility) {
  const key = normalizeKey(destinationKey);
  if (!NOTE_LABELS[key]) {
    throw createValidationError('Okänd anteckningskategori.', 400, {
      destinationKey: key,
    });
  }
  const allowed = NOTE_VISIBILITY_RULES[key] || ['team'];
  const normalized = normalizeVisibility(visibility);
  if (!allowed.includes(normalized)) {
    throw createValidationError('Synlighet är inte tillåten för denna anteckningstyp.', 400, {
      destinationKey: key,
      visibility: normalized,
      allowed,
    });
  }
  return normalized;
}

async function safeAudit(authStore, event) {
  if (!authStore || typeof authStore.addAuditEvent !== 'function') return;
  await authStore.addAuditEvent(event);
}

function createCcoWorkspaceRouter({
  noteStore,
  followUpStore,
  bookingStore,
  workspacePrefsStore,
  authStore,
  config,
}) {
  const router = express.Router();

  async function getRequestContext(req) {
    const actor = await resolveWorkspaceActor(req, { authStore, config });
    const workspaceId =
      normalizeText(req.query.workspaceId) ||
      normalizeText(req.body?.workspaceId) ||
      WORKSPACE_ID;
    const conversationId =
      normalizeText(req.query.conversationId) ||
      normalizeText(req.body?.conversationId);
    const customerId =
      normalizeText(req.query.customerId) ||
      normalizeText(req.body?.customerId);
    const customerName =
      normalizeText(req.query.customerName) ||
      normalizeText(req.body?.customerName);
    return {
      actor,
      workspaceId,
      tenantId: actor.tenantId,
      userId: actor.userId,
      conversationId,
      customerId,
      customerName,
    };
  }

  router.get('/cco-workspace/bootstrap', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      const hasLiveContext = hasWorkspaceConversationContext(context);
      const [savedNotes, latestFollowUp, bookingCase, prefs] = await Promise.all([
        hasLiveContext ? noteStore.getNotesByConversation(context) : Promise.resolve([]),
        hasLiveContext ? followUpStore.getLatestFollowUp(context) : Promise.resolve(null),
        hasLiveContext && bookingStore && typeof bookingStore.ensureCase === 'function'
          ? bookingStore.ensureCase({
              tenantId: context.tenantId,
              workspaceId: context.workspaceId,
              conversationId: context.conversationId,
              customerEmail: context.customerId,
              customerName: context.customerName,
              status: 'needs_triage',
              source: 'workspace_bootstrap',
            })
          : Promise.resolve(null),
        workspacePrefsStore.getWorkspacePrefs({
          tenantId: context.tenantId,
          userId: context.userId,
          workspaceId: context.workspaceId,
        }),
      ]);

      const noteDefinitions = mergeSavedNotes(
        buildNoteDefinitions({ latestFollowUp, workspaceContext: context }),
        savedNotes
      );
      const scheduleDraft = buildScheduleDraft(latestFollowUp, context);

      return res.json({
        workspaceId: context.workspaceId,
        authMode: context.actor.authMode,
        customer: {
          customerId: context.customerId || null,
          customerName: context.customerName || null,
          conversationId: context.conversationId || null,
        },
        noteTemplates: Object.values(NOTE_TEMPLATES),
        noteDefinitions,
        savedNotes,
        latestFollowUp,
        bookingCase,
        bookingReadout: buildBookingReadout(bookingCase, context),
        scheduleDraft,
        scheduleOptions: SCHEDULE_OPTIONS,
        workspacePrefs: prefs
          ? {
              leftWidth: prefs.leftWidth,
              rightWidth: prefs.rightWidth,
            }
          : null,
        visibilityRules: NOTE_VISIBILITY_RULES,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte ladda CCO workspace.' });
    }
  });

  router.get('/cco-workspace/notes', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      const notes = hasWorkspaceConversationContext(context)
        ? await noteStore.getNotesByConversation(context)
        : [];
      return res.json({ notes });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa anteckningar.' });
    }
  });

  router.post('/cco-workspace/notes/validate-visibility', async (req, res) => {
    try {
      await getRequestContext(req);
      const destinationKey = normalizeKey(req.body?.destinationKey);
      const visibility = assertAllowedVisibility(destinationKey, req.body?.visibility);
      return res.json({
        ok: true,
        destinationKey,
        visibility,
        allowed: NOTE_VISIBILITY_RULES[destinationKey] || ['team'],
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte validera synlighet.' });
    }
  });

  router.post('/cco-workspace/notes', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      assertWorkspaceConversationContext(context);
      const destinationKey = normalizeKey(req.body?.destinationKey);
      const destinationLabel = NOTE_LABELS[destinationKey] || normalizeText(req.body?.destinationLabel);
      const visibility = assertAllowedVisibility(destinationKey, req.body?.visibility);

      const saved = await noteStore.saveNote({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        customerId: context.customerId,
        customerName: context.customerName,
        destinationKey,
        destinationLabel,
        text: req.body?.text,
        tags: req.body?.tags,
        priority: normalizePriority(req.body?.priority),
        visibility,
        templateKey: req.body?.templateKey,
        actorUserId: context.userId,
      });

      await safeAudit(authStore, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: 'cco.workspace.note.save',
        outcome: 'success',
        targetType: 'cco_note',
        targetId: saved.noteId,
        metadata: {
          workspaceId: context.workspaceId,
          destinationKey,
          visibility,
          priority: saved.priority,
          authMode: context.actor.authMode,
        },
      });

      return res.json({
        note: saved,
        message: 'Anteckningen sparades.',
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte spara anteckning.' });
    }
  });

  router.get('/cco-workspace/follow-ups', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      const items = hasWorkspaceConversationContext(context)
        ? await followUpStore.listFollowUps(context)
        : [];
      return res.json({ followUps: items, latestFollowUp: items[0] || null });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa uppföljningar.' });
    }
  });

  router.post('/cco-workspace/follow-ups/validate-conflict', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      const date = normalizeText(req.body?.date);
      const time = normalizeText(req.body?.time);
      const doctorName = normalizeText(req.body?.doctorName);
      const scheduledForIso = buildScheduleIsoOrThrow(date, time);
      const conflict = await followUpStore.findConflict({
        tenantId: context.tenantId,
        doctorName,
        scheduledForIso,
      });
      return res.json({
        ok: !conflict,
        conflict,
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte validera uppföljning.' });
    }
  });

  router.post('/cco-workspace/follow-ups', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      assertWorkspaceConversationContext(context);
      const date = normalizeText(req.body?.date);
      const time = normalizeText(req.body?.time);
      const doctorName = normalizeText(req.body?.doctorName);
      if (!date || !time || !doctorName) {
        throw createValidationError('Datum, tid och läkare krävs.');
      }

      const scheduledForIso = buildScheduleIsoOrThrow(date, time);
      const conflict = await followUpStore.findConflict({
        tenantId: context.tenantId,
        doctorName,
        scheduledForIso,
      });
      if (conflict) {
        throw createValidationError('Tiden är redan bokad för vald läkare.', 409, { conflict });
      }

      const created = await followUpStore.createFollowUp({
        tenantId: context.tenantId,
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        customerId: context.customerId,
        customerName: context.customerName,
        date,
        time,
        doctorName,
        category: req.body?.category,
        reminderLeadMinutes: req.body?.reminderLeadMinutes,
        notes: req.body?.notes,
        actorUserId: context.userId,
      });

      await safeAudit(authStore, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: 'cco.workspace.follow_up.create',
        outcome: 'success',
        targetType: 'cco_follow_up',
        targetId: created.followUpId,
        metadata: {
          workspaceId: context.workspaceId,
          scheduledForIso: created.scheduledForIso,
          doctorName: created.doctorName,
          category: created.category,
          authMode: context.actor.authMode,
        },
      });

      return res.json({
        followUp: created,
        scheduleDraft: buildScheduleDraft(created),
        message: 'Uppföljningen schemalades.',
      });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message, metadata: error.metadata || null });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte schemalägga uppföljning.' });
    }
  });

  router.get('/cco-workspace/preferences', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      const prefs = await workspacePrefsStore.getWorkspacePrefs({
        tenantId: context.tenantId,
        userId: context.userId,
        workspaceId: context.workspaceId,
      });
      return res.json({ preferences: prefs });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte läsa workspace-preferenser.' });
    }
  });

  router.put('/cco-workspace/preferences', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      const leftWidth = Number.parseInt(String(req.body?.leftWidth ?? ''), 10);
      const rightWidth = Number.parseInt(String(req.body?.rightWidth ?? ''), 10);
      if (!Number.isFinite(leftWidth) || !Number.isFinite(rightWidth)) {
        throw createValidationError('Ogiltiga panelbredder.');
      }

      const prefs = await workspacePrefsStore.saveWorkspacePrefs({
        tenantId: context.tenantId,
        userId: context.userId,
        workspaceId: context.workspaceId,
        leftWidth,
        rightWidth,
      });

      await safeAudit(authStore, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: 'cco.workspace.preferences.save',
        outcome: 'success',
        targetType: 'cco_workspace',
        targetId: context.workspaceId,
        metadata: {
          leftWidth: prefs.leftWidth,
          rightWidth: prefs.rightWidth,
          authMode: context.actor.authMode,
        },
      });

      return res.json({ preferences: prefs });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte spara workspace-preferenser.' });
    }
  });

  router.delete('/cco-workspace/preferences', async (req, res) => {
    try {
      const context = await getRequestContext(req);
      const result = await workspacePrefsStore.resetWorkspacePrefs({
        tenantId: context.tenantId,
        userId: context.userId,
        workspaceId: context.workspaceId,
      });

      await safeAudit(authStore, {
        tenantId: context.tenantId,
        actorUserId: context.userId,
        action: 'cco.workspace.preferences.reset',
        outcome: 'success',
        targetType: 'cco_workspace',
        targetId: context.workspaceId,
        metadata: {
          authMode: context.actor.authMode,
          reset: result.reset,
        },
      });

      return res.json({ ok: true, result });
    } catch (error) {
      const statusCode = Number(error?.statusCode || 500);
      if (statusCode < 500) {
        return res.status(statusCode).json({ error: error.message });
      }
      console.error(error);
      return res.status(500).json({ error: 'Kunde inte återställa workspace-preferenser.' });
    }
  });

  return router;
}

module.exports = {
  createCcoWorkspaceRouter,
};
