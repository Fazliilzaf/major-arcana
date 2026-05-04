'use strict';

/**
 * CCO Conversation messages — full tråd-historik för en given conversation key.
 *
 * Endpoint: GET /api/v1/cco/runtime/conversation/:key/messages
 *
 * Frontend (/cco/) anropar detta när en tråd väljs i listan. Worklist-consumer
 * returnerar bara metadata + senaste preview — denna endpoint ger alla
 * messages med body, from, time och dir så att tråd-vyn visar hela historiken.
 *
 * Datakälla: ccoMailboxTruthStore.listMessages() filtrerat på
 * mailboxConversationId (samma key som returneras som row.id i consumer-modellen).
 *
 * Designprinciper:
 *   • Read-only — påverkar inget state.
 *   • Sorterad äldst-först (kronologisk läsordning).
 *   • Returnerar minimal shape som /cco/ förväntar: { from, dir, time, body, initials }.
 *   • Inga personliga uppgifter (ID:n) exponeras utöver vad som redan finns i worklist.
 */

const express = require('express');
const { SummarizeThreadCapability } = require('../capabilities/summarizeThread');

// Heuristisk fallback om OpenAI inte är konfigurerad — säker, generisk
function buildHeuristicDraft({ customerName, latestInboundBody, ownerName }) {
  const greeting = customerName ? `Hej ${customerName.split(/\s+/)[0]}!` : 'Hej!';
  const sign = ownerName ? `Mvh,\n${ownerName}\nHair TP Clinic` : 'Mvh,\nHair TP Clinic';
  return `${greeting}\n\nTack för ditt mejl. Vi återkommer skyndsamt med nästa steg.\n\n${sign}`;
}

// Generera nästa N lediga slots (heuristisk — antar arbetsdagar mån-fre 09-17 med lunch 12-13).
// Hoppar över datum då kunden redan har en bokning.
function generateSuggestedSlots({ existingBookings = [], count = 6, startFromIso = null, slotMinutes = 30 } = {}) {
  const startMs = startFromIso ? Date.parse(startFromIso) : Date.now();
  const safeStart = Number.isFinite(startMs) ? startMs : Date.now();
  // Börja från nästa heltimme + minst 24h framåt (klinik behöver ledtid)
  const ledtidMs = 24 * 60 * 60 * 1000;
  const cursor = new Date(safeStart + ledtidMs);
  cursor.setMinutes(0, 0, 0);
  const slotsPerDay = ['09:00', '11:00', '13:30', '15:00'];
  const existingDays = new Set(
    (existingBookings || [])
      .map((b) => normalizeText(b?.startsAt))
      .filter(Boolean)
      .map((iso) => iso.slice(0, 10))
  );
  const out = [];
  let safety = 0;
  while (out.length < count && safety < 60) {
    safety += 1;
    const day = cursor.getDay(); // 0=söndag, 6=lördag
    if (day === 0 || day === 6) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    const dayKey = cursor.toISOString().slice(0, 10);
    if (existingDays.has(dayKey)) {
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }
    for (const slotTime of slotsPerDay) {
      if (out.length >= count) break;
      const [hh, mm] = slotTime.split(':').map(Number);
      const slot = new Date(cursor);
      slot.setHours(hh, mm, 0, 0);
      if (slot.getTime() <= Date.now() + ledtidMs) continue;
      out.push({
        startsAt: slot.toISOString(),
        durationMinutes: slotMinutes,
        weekday: ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'][slot.getDay()],
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

function describeSlotSv(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const wd = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][d.getDay()];
  const day = d.getDate();
  const mon = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][d.getMonth()];
  const time = d.toLocaleTimeString('sv', { hour: '2-digit', minute: '2-digit' });
  return `${wd} ${day} ${mon} kl ${time}`;
}

async function generateOpenAIReply({ openai, model, messages, customerName, ownerName, subject, tone = 'warm' }) {
  if (!openai || !model) return null;
  const toneInstruction = (() => {
    if (tone === 'concise') return 'Skriv kort och rakt på sak. Max 4 meningar.';
    if (tone === 'professional') return 'Skriv professionellt och formellt. Inga utropstecken.';
    return 'Skriv varmt och empatiskt. Använd kundens förnamn naturligt.';
  })();
  const safeMessages = (Array.isArray(messages) ? messages : [])
    .slice(-12) // bara senaste 12 för att hålla prompten kort
    .map((m) => {
      const dir = String(m.direction || m.dir || '').toLowerCase() === 'outbound' ? 'KLINIK' : 'KUND';
      const time = String(m.sentAt || m.recordedAt || m.time || '').slice(0, 19);
      const body = String(m.body || m.bodyPreview || m.text || '').slice(0, 1200);
      return `[${dir} · ${time}] ${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
  const sys = `Du är AI-assistent för Hair TP Clinic, en hårtransplantation-klinik i Sverige. Du svarar på kundmejl på svenska. Behåll klinikens röst: kunnig, varm, professionell. Hitta INTE på fakta som inte finns i tråden (priser, datum, tider). Om tråden frågar om något du inte vet — föreslå att kunden bokar konsultation.`;
  const user = `Kund: ${customerName || '(okänd)'}\nÄmne: ${subject || '(utan ämne)'}\nMejlhistorik (kronologisk):\n\n${safeMessages || '(tom)'}\n\nUppgift: Skriv ett komplett svarsmejl från kliniken till kunden. ${toneInstruction} Avsluta med: "Mvh, ${ownerName || 'Hair TP Clinic'}". Returnera ENDAST mejltext (ingen ämnesrad, inga citat, ingen markdown).`;
  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });
    const draft = completion?.choices?.[0]?.message?.content;
    return typeof draft === 'string' && draft.trim() ? draft.trim() : null;
  } catch (err) {
    return null;
  }
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function deriveDir(folderType) {
  const ft = String(folderType || '').toLowerCase();
  if (ft === 'sent' || ft.includes('sent')) return 'outbound';
  if (ft === 'drafts' || ft.includes('draft')) return 'draft';
  return 'inbound';
}

function deriveFromName(message) {
  const safe = asObject(message);
  const candidates = [
    safe.senderName,
    safe.fromName,
    asObject(asObject(safe.from).emailAddress).name,
    asObject(safe.from).name,
    asObject(asObject(safe.sender).emailAddress).name,
  ];
  for (const c of candidates) {
    const t = normalizeText(c);
    if (t) return t;
  }
  const emailFallback =
    normalizeText(safe.senderEmail) ||
    normalizeText(safe.fromAddress) ||
    normalizeText(asObject(asObject(safe.from).emailAddress).address);
  return emailFallback || '(okänd avsändare)';
}

function deriveTime(message) {
  const safe = asObject(message);
  return (
    normalizeText(safe.sentAt) ||
    normalizeText(safe.receivedAt) ||
    normalizeText(safe.lastModifiedAt) ||
    ''
  );
}

function deriveBody(message) {
  const safe = asObject(message);
  return (
    normalizeText(safe.bodyPreview) ||
    normalizeText(safe.preview) ||
    normalizeText(safe.snippet) ||
    normalizeText(asObject(safe.body).content) ||
    ''
  );
}

function deriveInitials(name) {
  const parts = String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (!parts.length) return '?';
  return parts.map((p) => p[0]).join('').toUpperCase();
}

function fetchSortedConversationMessages(store, key) {
  if (!store || typeof store.listMessages !== 'function') return [];
  const all = store.listMessages({});
  const matches = all.filter(
    (m) => normalizeText(asObject(m).mailboxConversationId) === key
  );
  return [...matches].sort((a, b) =>
    String(deriveTime(a)).localeCompare(String(deriveTime(b)))
  );
}

// Mappa lagrade meddelanden → SummarizeThread input-shape
function toSummarizeInputMessage(m) {
  const safe = asObject(m);
  const dir = deriveDir(safe.folderType);
  // SummarizeThread förväntar 'direction' = 'inbound' eller 'outbound'
  const direction = dir === 'outbound' ? 'outbound' : 'inbound';
  return {
    direction,
    body: deriveBody(safe),
    bodyPreview: normalizeText(safe.bodyPreview) || '',
    sentAt: deriveTime(safe),
    recordedAt: deriveTime(safe),
    from: deriveFromName(safe),
  };
}

function createCcoConversationRouter({
  ccoMailboxTruthStore,
  requireAuth,
  openai = null,
  openaiModel = '',
  graphSendConnector = null,
  graphReadConnector = null,
  runtimeStreamRouter = null,
  mailboxIdsForSync = [],
  syncLookbackDays = 14,
  ccoConversationStateStore = null,
  ccoConversationNotesStore = null,
  ccoMailTemplateStore = null,
  clientoBookingStore = null,
  defaultTenantId = 'cco',
} = {}) {
  const router = express.Router();
  const authMiddleware =
    typeof requireAuth === 'function' ? requireAuth : (_req, _res, next) => next();

  router.get(
    '/cco/runtime/conversation/:key/messages',
    authMiddleware,
    (req, res) => {
      try {
        if (
          !ccoMailboxTruthStore ||
          typeof ccoMailboxTruthStore.listMessages !== 'function'
        ) {
          return res
            .status(503)
            .json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res
            .status(400)
            .json({ ok: false, error: 'missing_conversation_key' });
        }
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        const messages = sorted.map((m) => {
          const safe = asObject(m);
          const from = deriveFromName(safe);
          return {
            id: normalizeText(safe.graphMessageId) || normalizeText(safe.messageId) || null,
            from,
            initials: deriveInitials(from),
            dir: deriveDir(safe.folderType),
            time: deriveTime(safe),
            body: deriveBody(safe),
            subject: normalizeText(safe.subject) || null,
            mailboxId: normalizeText(safe.mailboxId) || null,
            folderType: normalizeText(safe.folderType) || null,
          };
        });
        return res.json({
          ok: true,
          conversationKey: key,
          messageCount: messages.length,
          messages,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- AI-summary + nextBestAction -----
  // GET /cco/runtime/conversation/:key/summary
  // Kör SummarizeThread-capabilityn på trådens meddelanden och returnerar
  // headline + bullets + nextBestAction + sentiment + intent. Frontend kan
  // använda detta för att fylla AI-summary-blocket samt risk/nästa-steg.
  router.get(
    '/cco/runtime/conversation/:key/summary',
    authMiddleware,
    async (req, res) => {
      try {
        if (
          !ccoMailboxTruthStore ||
          typeof ccoMailboxTruthStore.listMessages !== 'function'
        ) {
          return res
            .status(503)
            .json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res
            .status(400)
            .json({ ok: false, error: 'missing_conversation_key' });
        }
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.json({
            ok: true,
            conversationKey: key,
            summary: null,
            note: 'no_messages',
          });
        }
        // Härled customerName + subject från första inkommande meddelandet
        const firstInbound =
          sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
        const customerName = deriveFromName(firstInbound);
        const subject = normalizeText(asObject(firstInbound).subject) || '';

        const inputMessages = sorted.map(toSummarizeInputMessage);

        const capability = new SummarizeThreadCapability();
        const result = await capability.execute({
          channel: 'admin',
          tenantId: normalizeText(req.tenantId) || 'cco',
          // OpenAI passas in om servern har en konfigurerad client; annars
          // faller capabilityn tillbaka på heuristiken automatiskt.
          openai: openai || null,
          openaiModel: normalizeText(openaiModel) || '',
          input: {
            conversationId: key,
            customerName,
            subject,
            messages: inputMessages,
          },
        });
        const data = asObject(result?.data);
        const nba = asObject(data.nextBestAction);
        const primary = asObject(nba.primaryAction);
        // Bygg en kort risk-text baserat på sentiment + intent + anomalies
        const sentimentLabel = normalizeText(asObject(data.sentiment).label);
        const intentLabel = normalizeText(asObject(data.intent).label);
        const anomalies = Array.isArray(data.anomalies) ? data.anomalies : [];
        const riskParts = [];
        if (sentimentLabel && sentimentLabel.toLowerCase() !== 'neutral') {
          riskParts.push(`Stämning: ${sentimentLabel}`);
        }
        if (intentLabel && intentLabel.toLowerCase() !== 'oklart') {
          riskParts.push(`Avsikt: ${intentLabel}`);
        }
        if (anomalies.length > 0) {
          riskParts.push(`${anomalies.length} avvikelse${anomalies.length === 1 ? '' : 'r'} upptäckta`);
        }
        const risk = riskParts.length > 0 ? riskParts.join(' · ') : '';
        // nextStep = primaryButton + ev. första-reasoning som förklaring
        const nextStepLabel = normalizeText(primary.primaryButton) || normalizeText(primary.label);
        const reasoning = Array.isArray(primary.reasoning) ? primary.reasoning : [];
        const nextStep = nextStepLabel
          ? reasoning.length > 0
            ? `${nextStepLabel} — ${reasoning[0]}`
            : nextStepLabel
          : '';
        return res.json({
          ok: true,
          conversationKey: key,
          summary: {
            headline: normalizeText(data.headline),
            bullets: Array.isArray(data.bullets) ? data.bullets.filter(Boolean) : [],
            risk,
            nextStep,
            sentiment: data.sentiment || null,
            intent: data.intent || null,
            primaryAction: primary || null,
            secondaryActions: Array.isArray(nba.secondaryActions) ? nba.secondaryActions : [],
            source: normalizeText(data.source) || 'heuristic',
            generatedAt: normalizeText(data.generatedAt),
          },
          warnings: Array.isArray(result?.warnings) ? result.warnings : [],
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Cliento-bokningar: kund-historik + föreslagna lediga tider -----
  // GET /cco/runtime/conversation/:key/bookings  → { existingBookings, suggestedSlots }
  router.get(
    '/cco/runtime/conversation/:key/bookings',
    authMiddleware,
    (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        const firstInbound = sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0] || {};
        const customerEmail =
          normalizeText(asObject(asObject(firstInbound).from).emailAddress?.address) ||
          normalizeText(firstInbound.senderEmail) ||
          normalizeText(firstInbound.fromAddress) ||
          '';
        let existingBookings = [];
        if (clientoBookingStore && typeof clientoBookingStore.getBookingsForCustomer === 'function' && customerEmail) {
          existingBookings = clientoBookingStore.getBookingsForCustomer({
            tenantId: defaultTenantId,
            customerEmail,
          }) || [];
        }
        const suggestedSlots = generateSuggestedSlots({
          existingBookings,
          count: 6,
          slotMinutes: 30,
        }).map((s) => ({
          ...s,
          label: describeSlotSv(s.startsAt),
        }));
        // Sortera existerande bokningar — kommande först (status='upcoming' eller startsAt > now)
        const nowMs = Date.now();
        const sortedBookings = [...existingBookings]
          .map((b) => ({
            bookingId: normalizeText(b.bookingId),
            startsAt: normalizeText(b.startsAt),
            durationMinutes: Number(b.durationMinutes) || null,
            service: normalizeText(b.service) || normalizeText(b.serviceType) || null,
            staff: normalizeText(b.staff) || normalizeText(b.staffName) || null,
            status: normalizeText(b.status) || 'unknown',
            label: describeSlotSv(b.startsAt),
            isUpcoming: b.startsAt && Date.parse(b.startsAt) > nowMs && b.status !== 'cancelled',
          }))
          .sort((a, b) => {
            // upcoming först (asc), sen past (desc)
            if (a.isUpcoming && !b.isUpcoming) return -1;
            if (!a.isUpcoming && b.isUpcoming) return 1;
            return String(a.isUpcoming ? a.startsAt : b.startsAt).localeCompare(
              String(a.isUpcoming ? b.startsAt : a.startsAt)
            );
          });
        return res.json({
          ok: true,
          conversationKey: key,
          customerEmail: customerEmail || null,
          existingBookings: sortedBookings,
          suggestedSlots,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Generera bekräftelse-utkast med vald tid -----
  // POST /cco/runtime/conversation/:key/booking-confirm  body: { slot: ISO }
  // Returnerar AI-utkast som bekräftar tiden — operatören kan justera + skicka
  router.post(
    '/cco/runtime/conversation/:key/booking-confirm',
    authMiddleware,
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const slotIso = normalizeText(asObject(req.body).slot);
        if (!slotIso || Number.isNaN(Date.parse(slotIso))) {
          return res.status(400).json({ ok: false, error: 'invalid_slot', detail: 'slot måste vara giltig ISO-tid.' });
        }
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.status(404).json({ ok: false, error: 'conversation_not_found' });
        }
        const firstInbound = sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
        const customerName = deriveFromName(firstInbound);
        const subject = normalizeText(asObject(firstInbound).subject) || '';
        const lastOutbound = [...sorted].reverse().find((m) => deriveDir(asObject(m).folderType) === 'outbound');
        const ownerName = lastOutbound ? deriveFromName(lastOutbound) : '';
        const inputMessages = sorted.map(toSummarizeInputMessage);
        const slotLabel = describeSlotSv(slotIso);

        // Bygg en mer specifik prompt — be GPT bekräfta valda tiden
        let draft = null;
        if (openai && openaiModel) {
          const sys = 'Du är AI-assistent för Hair TP Clinic. Skriv ett kort bekräftelse-mejl på svenska som bekräftar en föreslagen bokningstid. Behåll varm och professionell ton. Skriv inget om priser eller behandlingsdetaljer som inte står i tråden.';
          const userMsg = `Kund: ${customerName}\nÄmne: ${subject || '(utan ämne)'}\nKundens senaste mejl: ${deriveBody(firstInbound).slice(0, 600)}\n\nUppgift: Skriv ett bekräftelse-mejl till kunden. Föreslå tiden: ${slotLabel}. Be kunden bekräfta. Avsluta med "Mvh, ${ownerName || 'Hair TP Clinic'}". Returnera ENDAST mejltext (max 5 meningar, ingen ämnesrad).`;
          try {
            const completion = await openai.chat.completions.create({
              model: openaiModel,
              temperature: 0.3,
              max_tokens: 350,
              messages: [
                { role: 'system', content: sys },
                { role: 'user', content: userMsg },
              ],
            });
            const text = completion?.choices?.[0]?.message?.content;
            if (typeof text === 'string' && text.trim()) draft = text.trim();
          } catch (_e) { /* fall through */ }
        }
        if (!draft) {
          // Heuristisk fallback
          const greeting = customerName ? `Hej ${customerName.split(/\s+/)[0]}!` : 'Hej!';
          const sign = ownerName ? `Mvh,\n${ownerName}\nHair TP Clinic` : 'Mvh,\nHair TP Clinic';
          draft = `${greeting}\n\nTack för ditt mejl. Vi har en ledig tid ${slotLabel} — passar det dig? Bekräfta gärna så bokar vi in dig.\n\n${sign}`;
        }
        return res.json({
          ok: true,
          conversationKey: key,
          slot: slotIso,
          slotLabel,
          draft,
          source: openai && openaiModel ? 'openai' : 'heuristic',
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'booking_confirm_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- AI-utkast (genererar svar från noll baserat på tråden) -----
  // POST /cco/runtime/conversation/:key/draft   body: { tone?: 'warm'|'concise'|'professional' }
  router.post(
    '/cco/runtime/conversation/:key/draft',
    authMiddleware,
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res.status(404).json({ ok: false, error: 'conversation_not_found' });
        }
        const firstInbound = sorted.find((m) => deriveDir(asObject(m).folderType) === 'inbound') || sorted[0];
        const customerName = deriveFromName(firstInbound);
        const subject = normalizeText(asObject(firstInbound).subject) || '';
        // Hitta ägaren av aktuell mailbox (sista skickade meddelandet visar oftast vem som svarar)
        const lastOutbound = [...sorted].reverse().find((m) => deriveDir(asObject(m).folderType) === 'outbound');
        const ownerName = lastOutbound ? deriveFromName(lastOutbound) : '';
        const tone = normalizeText(asObject(req.body).tone).toLowerCase() || 'warm';
        const inputMessages = sorted.map(toSummarizeInputMessage);

        let draft = null;
        let source = 'heuristic';
        if (openai && openaiModel) {
          draft = await generateOpenAIReply({
            openai,
            model: openaiModel,
            messages: inputMessages,
            customerName,
            ownerName,
            subject,
            tone: ['warm', 'concise', 'professional'].includes(tone) ? tone : 'warm',
          });
          if (draft) source = 'openai';
        }
        if (!draft) {
          const latestInbound = [...sorted].reverse().find((m) => deriveDir(asObject(m).folderType) === 'inbound') || firstInbound;
          draft = buildHeuristicDraft({
            customerName,
            latestInboundBody: deriveBody(latestInbound),
            ownerName,
          });
          source = 'heuristic';
        }
        return res.json({
          ok: true,
          conversationKey: key,
          draft,
          source,
          tone,
          generatedAt: new Date().toISOString(),
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'draft_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Skicka svar (reply) via Microsoft Graph -----
  // POST /cco/runtime/conversation/:key/reply { body, bodyHtml? }
  // Hittar senaste inkommande meddelandet i tråden, använder det som
  // replyToMessageId och låter graphSendConnector skicka svaret.
  router.post(
    '/cco/runtime/conversation/:key/reply',
    authMiddleware,
    express.json({ limit: '64kb' }),
    async (req, res) => {
      try {
        if (!graphSendConnector || typeof graphSendConnector.sendReply !== 'function') {
          return res.status(503).json({
            ok: false,
            error: 'graph_send_unavailable',
            detail: 'ARCANA_GRAPH_SEND_ENABLED måste vara true och Graph-credentials konfigurerade.',
          });
        }
        if (
          !ccoMailboxTruthStore ||
          typeof ccoMailboxTruthStore.listMessages !== 'function'
        ) {
          return res
            .status(503)
            .json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res
            .status(400)
            .json({ ok: false, error: 'missing_conversation_key' });
        }
        const body = normalizeText(asObject(req.body).body);
        const bodyHtml = normalizeText(asObject(req.body).bodyHtml);
        if (!body) {
          return res
            .status(400)
            .json({ ok: false, error: 'missing_body' });
        }
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        if (sorted.length === 0) {
          return res
            .status(404)
            .json({ ok: false, error: 'conversation_not_found' });
        }
        // Hitta senaste inkommande meddelande — det är vad vi svarar på
        const latestInbound = [...sorted]
          .reverse()
          .find((m) => deriveDir(asObject(m).folderType) === 'inbound');
        if (!latestInbound) {
          return res.status(409).json({
            ok: false,
            error: 'no_inbound_message',
            detail: 'Tråden saknar inkommande meddelande att svara på.',
          });
        }
        const target = asObject(latestInbound);
        const senderMailboxId =
          normalizeText(target.mailboxId) || normalizeText(target.mailboxAddress);
        const replyToMessageId = normalizeText(target.graphMessageId) || normalizeText(target.messageId);
        const conversationId = normalizeText(target.conversationId) || normalizeText(target.mailboxConversationId);
        if (!senderMailboxId || !replyToMessageId) {
          return res.status(409).json({
            ok: false,
            error: 'missing_send_metadata',
            detail: 'Saknar mailboxId eller graphMessageId i tråden.',
          });
        }
        // Resolve customer email (recipient) — för säkerhets skull även när
        // sendReply mest använder replyToMessageId i samma mailbox
        const customerEmail =
          normalizeText(asObject(asObject(target.from).emailAddress).address) ||
          normalizeText(target.senderEmail) ||
          normalizeText(target.fromAddress);
        const result = await graphSendConnector.sendReply({
          mailboxId: senderMailboxId,
          sourceMailboxId: senderMailboxId,
          conversationId,
          replyToMessageId,
          body,
          bodyHtml: bodyHtml || undefined,
          subject: normalizeText(target.subject),
          to: customerEmail ? [customerEmail] : [],
        });
        return res.json({
          ok: true,
          conversationKey: key,
          replyToMessageId,
          mailboxId: senderMailboxId,
          recipient: customerEmail || null,
          sendResult: result || null,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'send_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Klar / Senare / Schemalägg — uppdatera tråd-status -----
  // POST /cco/runtime/conversation/:key/action
  // Body: { action: 'handled' | 'reply_later' | 'reopen', followUpDueAt?: ISO, note?: string }
  //   handled        → tråd markerad som klar (försvinner från Olast/Agera-listan)
  //   reply_later    → "Senare", kräver followUpDueAt (om saknas: nu+24h)
  //   reopen         → ångra en tidigare action (superseder befintligt state)
  router.post(
    '/cco/runtime/conversation/:key/action',
    authMiddleware,
    express.json({ limit: '32kb' }),
    async (req, res) => {
      try {
        if (!ccoConversationStateStore || typeof ccoConversationStateStore.writeConversationState !== 'function') {
          return res
            .status(503)
            .json({ ok: false, error: 'conversation_state_store_unavailable' });
        }
        if (!ccoMailboxTruthStore || typeof ccoMailboxTruthStore.listMessages !== 'function') {
          return res
            .status(503)
            .json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) {
          return res
            .status(400)
            .json({ ok: false, error: 'missing_conversation_key' });
        }
        const body = asObject(req.body);
        const action = normalizeText(body.action).toLowerCase();
        if (!['handled', 'reply_later', 'reopen'].includes(action)) {
          return res.status(400).json({
            ok: false,
            error: 'invalid_action',
            detail: 'action måste vara handled | reply_later | reopen',
          });
        }
        const note = normalizeText(body.note).slice(0, 260);

        // Reopen → supersede existing state
        if (action === 'reopen') {
          if (typeof ccoConversationStateStore.supersedeConversationState !== 'function') {
            return res
              .status(503)
              .json({ ok: false, error: 'supersede_unavailable' });
          }
          const result = await ccoConversationStateStore.supersedeConversationState({
            tenantId: defaultTenantId,
            canonicalConversationKey: key,
            supersededReason: 'manual_clear',
          });
          return res.json({ ok: true, action, conversationKey: key, state: result || null });
        }

        // Hitta första meddelandet i tråden för att lista
        // underlying mailbox/conversation IDs
        const sorted = fetchSortedConversationMessages(ccoMailboxTruthStore, key);
        const firstMessage = asObject(sorted[0] || {});
        const underlyingMailboxIds = sorted
          .map((m) => normalizeText(asObject(m).mailboxId))
          .filter(Boolean);
        const underlyingConversationIds = sorted
          .map((m) => normalizeText(asObject(m).conversationId))
          .filter(Boolean);
        const primaryConversationId =
          normalizeText(firstMessage.conversationId) || normalizeText(firstMessage.mailboxConversationId);

        // followUpDueAt: använd från body om finns, annars nu+24h för reply_later
        let followUpDueAt = null;
        if (action === 'reply_later') {
          const requested = normalizeText(body.followUpDueAt);
          if (requested && !Number.isNaN(Date.parse(requested))) {
            followUpDueAt = new Date(Date.parse(requested)).toISOString();
          } else {
            followUpDueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          }
        }

        const actionState = action; // 'handled' | 'reply_later'
        const needsReplyStatusOverride = action === 'handled' ? 'handled' : 'needs_reply';
        const nextActionLabel = action === 'handled' ? 'Markerad som klar' : 'Påminnelse senare';

        // Identifiera operatör från req.session/auth
        const actorUserId = normalizeText(req?.user?.id || req?.user?.userId || req?.session?.userId);
        const actorEmail = normalizeText(req?.user?.email || req?.session?.email).toLowerCase();

        const result = await ccoConversationStateStore.writeConversationState({
          tenantId: defaultTenantId,
          canonicalConversationKey: key,
          canonicalConversationSource: 'mailbox_conversation_fallback',
          canonicalConversationType: 'conversationKey',
          primaryConversationId: primaryConversationId || null,
          underlyingConversationIds: [...new Set(underlyingConversationIds)],
          underlyingMailboxIds: [...new Set(underlyingMailboxIds.map((id) => id.toLowerCase()))],
          actionState,
          needsReplyStatusOverride,
          followUpDueAt,
          waitingOn: action === 'reply_later' ? 'customer' : null,
          nextActionLabel,
          nextActionSummary: note || null,
          actionAt: new Date().toISOString(),
          actionByUserId: actorUserId || null,
          actionByEmail: actorEmail || null,
        });
        return res.json({
          ok: true,
          action,
          conversationKey: key,
          state: result || null,
        });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'action_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Anteckningar (interna, per tråd) -----
  // GET  /cco/runtime/conversation/:key/notes        → lista nyaste först
  // POST /cco/runtime/conversation/:key/notes { body }  → lägg till anteckning
  router.get(
    '/cco/runtime/conversation/:key/notes',
    authMiddleware,
    (req, res) => {
      try {
        if (!ccoConversationNotesStore || typeof ccoConversationNotesStore.listNotes !== 'function') {
          return res.status(503).json({ ok: false, error: 'notes_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const notes = ccoConversationNotesStore.listNotes({ conversationKey: key });
        return res.json({ ok: true, conversationKey: key, count: notes.length, notes });
      } catch (err) {
        return res.status(500).json({
          ok: false,
          error: 'internal_error',
          detail: String((err && err.message) || err),
        });
      }
    }
  );
  router.post(
    '/cco/runtime/conversation/:key/notes',
    authMiddleware,
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (!ccoConversationNotesStore || typeof ccoConversationNotesStore.addNote !== 'function') {
          return res.status(503).json({ ok: false, error: 'notes_store_unavailable' });
        }
        const key = normalizeText(req.params.key);
        if (!key) return res.status(400).json({ ok: false, error: 'missing_conversation_key' });
        const body = normalizeText(asObject(req.body).body);
        if (!body) return res.status(400).json({ ok: false, error: 'missing_body' });
        const authorEmail = normalizeText(req?.user?.email || req?.session?.email);
        const authorName = normalizeText(req?.user?.name || req?.session?.name);
        const note = await ccoConversationNotesStore.addNote({
          conversationKey: key,
          body,
          authorEmail,
          authorName,
        });
        return res.json({ ok: true, conversationKey: key, note });
      } catch (err) {
        const message = String((err && err.message) || err);
        const isTooLong = message.toLowerCase().includes('för lång');
        return res.status(isTooLong ? 400 : 500).json({
          ok: false,
          error: isTooLong ? 'too_long' : 'internal_error',
          detail: message,
        });
      }
    }
  );

  // ----- Manuell mailbox-sync trigger -----
  // POST /cco/runtime/sync   (body: { mailboxIds?: string[], lookbackDays?: number })
  // Triggar Microsoft Graph mailbox-backfill för de angivna mailboxarna
  // (eller defaults). När det är klart: broadcasta ett SSE-event så att
  // frontend refreshar worklisten.
  let syncInFlight = false;
  router.post(
    '/cco/runtime/sync',
    authMiddleware,
    express.json({ limit: '8kb' }),
    async (req, res) => {
      try {
        if (syncInFlight) {
          return res.status(429).json({ ok: false, error: 'sync_in_flight', detail: 'En sync pågår redan.' });
        }
        if (!graphReadConnector) {
          return res.status(503).json({ ok: false, error: 'graph_read_unavailable', detail: 'ARCANA_GRAPH_READ_ENABLED måste vara true.' });
        }
        if (!ccoMailboxTruthStore) {
          return res.status(503).json({ ok: false, error: 'mailbox_truth_store_unavailable' });
        }
        const reqMailboxIds = Array.isArray(asObject(req.body).mailboxIds)
          ? req.body.mailboxIds.map((s) => normalizeText(s).toLowerCase()).filter(Boolean)
          : [];
        const mailboxIds = reqMailboxIds.length > 0 ? reqMailboxIds : (mailboxIdsForSync || []);
        if (mailboxIds.length === 0) {
          return res.status(400).json({ ok: false, error: 'no_mailboxes', detail: 'Inga mailboxar att synca.' });
        }
        const lookbackDays = Math.max(1, Math.min(90, Number(asObject(req.body).lookbackDays) || syncLookbackDays || 14));
        syncInFlight = true;
        const startedAt = new Date().toISOString();
        // Kör bakgrundskörningen — vi väntar inte på fullt resultat innan
        // vi svarar (kan ta minuter); vi svarar omedelbart med "started"
        // och broadcastar ett event när det är klart.
        const runPromise = (async () => {
          try {
            const { runGraphBackfill } = require('../ops/bootstrapRunner');
            const result = await runGraphBackfill({
              graphReadConnector,
              ccoMailboxTruthStore,
              mailboxIds,
              lookbackDays,
              logger: console,
            });
            if (runtimeStreamRouter && typeof runtimeStreamRouter.broadcast === 'function') {
              runtimeStreamRouter.broadcast('worklist_updated', {
                source: 'manual_sync',
                mailboxIds,
                folderCount: result?.folderCount || 0,
                completedAt: new Date().toISOString(),
              });
            }
          } catch (err) {
            console.warn('[cco-sync] backfill misslyckades', err?.message);
            if (runtimeStreamRouter && typeof runtimeStreamRouter.broadcast === 'function') {
              runtimeStreamRouter.broadcast('worklist_sync_failed', {
                error: String(err?.message || err),
                completedAt: new Date().toISOString(),
              });
            }
          } finally {
            syncInFlight = false;
          }
        })();
        // Don't block the response on the async runPromise — handle 'unhandled rejection' silently above
        runPromise.catch(() => {});
        return res.json({
          ok: true,
          started: true,
          startedAt,
          mailboxIds,
          lookbackDays,
        });
      } catch (err) {
        syncInFlight = false;
        return res.status(500).json({
          ok: false,
          error: 'sync_failed',
          detail: String((err && err.message) || err),
        });
      }
    }
  );

  // ----- Mejl-mallar -----
  // GET /cco/runtime/mail-templates                          → lista alla
  // POST /cco/runtime/mail-templates                         → upsert (templateId optional)
  // DELETE /cco/runtime/mail-templates/:templateId           → ta bort
  router.get(
    '/cco/runtime/mail-templates',
    authMiddleware,
    (_req, res) => {
      try {
        if (!ccoMailTemplateStore) {
          return res.status(503).json({ ok: false, error: 'template_store_unavailable' });
        }
        const templates = ccoMailTemplateStore.listTemplates();
        return res.json({ ok: true, count: templates.length, templates });
      } catch (err) {
        return res.status(500).json({ ok: false, error: 'internal_error', detail: String((err && err.message) || err) });
      }
    }
  );
  router.post(
    '/cco/runtime/mail-templates',
    authMiddleware,
    express.json({ limit: '32kb' }),
    async (req, res) => {
      try {
        if (!ccoMailTemplateStore) {
          return res.status(503).json({ ok: false, error: 'template_store_unavailable' });
        }
        const body = asObject(req.body);
        const saved = await ccoMailTemplateStore.saveTemplate({
          templateId: normalizeText(body.templateId) || undefined,
          label: normalizeText(body.label),
          icon: normalizeText(body.icon),
          body: normalizeText(body.body),
        });
        return res.json({ ok: true, template: saved });
      } catch (err) {
        const msg = String((err && err.message) || err);
        const isValidation = /krävs|max/.test(msg);
        return res.status(isValidation ? 400 : 500).json({
          ok: false,
          error: isValidation ? 'validation' : 'internal_error',
          detail: msg,
        });
      }
    }
  );
  router.delete(
    '/cco/runtime/mail-templates/:templateId',
    authMiddleware,
    async (req, res) => {
      try {
        if (!ccoMailTemplateStore) {
          return res.status(503).json({ ok: false, error: 'template_store_unavailable' });
        }
        const ok = await ccoMailTemplateStore.deleteTemplate(req.params.templateId);
        if (!ok) return res.status(404).json({ ok: false, error: 'not_found' });
        return res.json({ ok: true });
      } catch (err) {
        return res.status(500).json({ ok: false, error: 'internal_error', detail: String((err && err.message) || err) });
      }
    }
  );

  return router;
}

module.exports = { createCcoConversationRouter };
