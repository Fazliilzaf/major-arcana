'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { isSendDryRunDefault } = require('./ccoSendLiveGate');
// ORD-197 §1: spärren låg bara på transactionalMailer/SMS. Den här storen får
// resendMailer injicerad direkt och gick alltså utanför den.
const { bedomKundutskick } = require('../infra/kundutskickGate');
// ORD-203 — avsändare per klinik. Det är HÄR offerter, avtal och portalsvar går.
const { avsandareForKlinik } = require('../infra/avsandarePerKlinik');

// ---------------------------------------------------------------------------
// ccoSendActionStore — bygger utgående meddelande-payloads (form/consent/file/
// encounter) och skickar dem via mailer (Resend). Varje send loggas i en
// JSON-fil med atomiska skrivningar. Stödjer dry-run (skickar inget men
// registrerar en post markerad dryRun:true).
//
// Central modul: andra stores (ccoOfferQuickStore, ccoAgreementQuickStore,
// ccoAftercareSchedulerStore) får `buildFilePayload` + `performSend` härifrån.
// ---------------------------------------------------------------------------

const SEND_KINDS = [
  'form',
  'consent',
  'file',
  'encounter',
  'aftercare',
  'notification',
  'offer',
  'agreement',
];

// Mall-kataloger — UI-dropdown läser id + dessa fält (server.js GET .../templates).
// Nycklarna används som `formKind` / `consentKind` i route-koden.
const FORM_TEMPLATES = {
  health_declaration: {
    label: 'Hälsodeklaration',
    subject: 'Hälsodeklaration inför ditt besök',
    path: 'health-declaration',
  },
  fitness_certificate: {
    label: 'Friskintyg',
    subject: 'Friskintyg inför ditt besök',
    path: 'fitness-certificate',
  },
  pre_treatment: {
    label: 'Förberedelser inför behandling',
    subject: 'Förberedelser inför din behandling',
    path: 'pre-treatment',
  },
};

const CONSENT_TEMPLATES = {
  photo_publish: {
    label: 'Samtycke: foto för publicering',
    subject: 'Samtycke till fotopublicering',
    path: 'consent/photo-publish',
  },
  data_processing: {
    label: 'Samtycke: databehandling',
    subject: 'Samtycke till databehandling',
    path: 'consent/data-processing',
  },
  marketing: {
    label: 'Samtycke: marknadsföring',
    subject: 'Samtycke till marknadsföring',
    path: 'consent/marketing',
  },
};

// Tillåtna MIME-typer per "kind". `file` används av route-koden
// (ALLOWED_MIME_BY_KIND.file) för att validera filuppladdningar.
const ALLOWED_MIME_BY_KIND = {
  file: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain'],
};

// Default dry-run: säkert default = true (skicka inget) om inte explicit
// opt-in via env. Delar flagga med ccoSendLiveGate (ORD-153 §6-åtgärd) så
// performSend och de andra grindade vägarna aldrig kan avvika.
function isDryRunDefault() {
  return isSendDryRunDefault(process.env);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, sends: [] };
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
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function createCcoSendActionStore({
  filePath,
  auditLog = null,
  mailer = null,
  baseUrl = 'https://hairtpclinic.com',
  https = null, // reserverat (route skickar inte längre detta); bakåtkomp.
  templateRegistry = null,
  snapshotForSend = null,
  // ORD-147 §3 — sändgränsen. En async-funktion som avgör om ett utskick ska
  // blockeras (t.ex. avliden mottagare). Returnerar `{ blocked, reason }` eller
  // null. Kallas för VARJE utskick, före mailer/dry-run — sista gemensamma punkt.
  sendBlocker = null,
} = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoSendActionStore.');
  }

  const cleanBaseUrl = normalizeText(baseUrl).replace(/\/+$/, '') || 'https://hairtpclinic.com';

  // snapshotForSend kan komma direkt eller via templateRegistry. Guard båda.
  function resolveSnapshot(templateRef, lang) {
    const ref = normalizeText(templateRef);
    if (!ref) return null;
    const fn =
      typeof snapshotForSend === 'function'
        ? snapshotForSend
        : templateRegistry && typeof templateRegistry.snapshotForSend === 'function'
          ? templateRegistry.snapshotForSend.bind(templateRegistry)
          : null;
    if (!fn) return null;
    try {
      const snap = fn(ref, normalizeText(lang) || 'sv');
      return snap || null;
    } catch (e) {
      // Juridisk grind (snapshotForSend kastar TEMPLATE_NOT_LEGALLY_APPROVED): låt det
      // propagera så ett icke-godkänt utskick stoppas — svälj det aldrig här, annars
      // skickas en patient ett mail som juridisk granskning inte godkänt.
      if (e && (e.code === 'TEMPLATE_NOT_LEGALLY_APPROVED' || e.statusCode === 403)) throw e;
      // Äkta saknad mall — degradera tyst, payload behåller sina defaults.
      return null;
    }
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    sends: Array.isArray(state?.sends) ? state.sends : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  // -- Payload-byggare ------------------------------------------------------

  function commonCtx(input = {}) {
    const customerEmail = normalizeText(input.customerEmail);
    if (!customerEmail) throw badRequest('customerEmail krävs.');
    return {
      customerId: normalizeKey(input.customerId),
      customerName: normalizeText(input.customerName) || 'kund',
      customerEmail,
      urlToken: normalizeText(input.urlToken),
    };
  }

  function actionUrl(suffix, token) {
    const base = `${cleanBaseUrl}/${String(suffix).replace(/^\/+/, '')}`;
    return token ? `${base}?token=${encodeURIComponent(token)}` : base;
  }

  function buildFormPayload(input = {}) {
    const ctx = commonCtx(input);
    const formKind = normalizeKey(input.formKind) || 'health_declaration';
    const tpl = FORM_TEMPLATES[formKind];
    if (!tpl) {
      throw badRequest(
        `Okänd formKind: ${formKind}. Tillåtna: ${Object.keys(FORM_TEMPLATES).join(', ')}.`
      );
    }
    const url = actionUrl(tpl.path, ctx.urlToken);
    const subject = tpl.subject;
    const safeName = escapeHtml(ctx.customerName);
    return {
      kind: 'form',
      formKind,
      to: ctx.customerEmail,
      subject,
      html: `<p>Hej ${safeName},</p><p>Vänligen fyll i din ${escapeHtml(tpl.label)}.</p><p><a href="${url}">Öppna formulär</a></p><p>Hair TP Clinic</p>`,
      text: `Hej ${ctx.customerName},\n\nVänligen fyll i din ${tpl.label}.\n\n${url}\n\nHair TP Clinic`,
      url,
      meta: {
        customerId: ctx.customerId,
        customerName: ctx.customerName,
        formKind,
        templateLabel: tpl.label,
      },
    };
  }

  function buildConsentPayload(input = {}) {
    const ctx = commonCtx(input);
    const consentKind = normalizeKey(input.consentKind) || 'photo_publish';
    const tpl = CONSENT_TEMPLATES[consentKind];
    if (!tpl) {
      throw badRequest(
        `Okänd consentKind: ${consentKind}. Tillåtna: ${Object.keys(CONSENT_TEMPLATES).join(', ')}.`
      );
    }
    const url = actionUrl(tpl.path, ctx.urlToken);
    const safeName = escapeHtml(ctx.customerName);
    return {
      kind: 'consent',
      consentKind,
      to: ctx.customerEmail,
      subject: tpl.subject,
      html: `<p>Hej ${safeName},</p><p>Vi behöver ditt ${escapeHtml(tpl.label)}.</p><p><a href="${url}">Granska och signera</a></p><p>Hair TP Clinic</p>`,
      text: `Hej ${ctx.customerName},\n\nVi behöver ditt ${tpl.label}.\n\n${url}\n\nHair TP Clinic`,
      url,
      meta: {
        customerId: ctx.customerId,
        customerName: ctx.customerName,
        consentKind,
        templateLabel: tpl.label,
      },
    };
  }

  function buildFilePayload(input = {}) {
    const ctx = commonCtx(input);
    const fileName = normalizeText(input.fileName);
    const fileMime = normalizeText(input.fileMime);
    if (!fileName) throw badRequest('fileName krävs.');
    if (!fileMime) throw badRequest('fileMime krävs.');
    if (!ALLOWED_MIME_BY_KIND.file.includes(fileMime)) {
      throw badRequest(
        `Otillåten fileMime: ${fileMime}. Tillåtna: ${ALLOWED_MIME_BY_KIND.file.join(', ')}.`
      );
    }
    const fileNote = normalizeText(input.fileNote);
    const safeName = escapeHtml(ctx.customerName);
    const subject = `Dokument: ${fileName}`;
    return {
      kind: 'file',
      to: ctx.customerEmail,
      subject,
      html: `<p>Hej ${safeName},</p><p>Bifogat hittar du <strong>${escapeHtml(fileName)}</strong>.</p>${
        fileNote ? `<p>${escapeHtml(fileNote)}</p>` : ''
      }<p>Hair TP Clinic</p>`,
      text: `Hej ${ctx.customerName},\n\nBifogat hittar du ${fileName}.${
        fileNote ? `\n\n${fileNote}` : ''
      }\n\nHair TP Clinic`,
      attachments: [{ filename: fileName, contentType: fileMime }],
      meta: {
        customerId: ctx.customerId,
        customerName: ctx.customerName,
        fileName,
        fileMime,
        fileNote,
      },
    };
  }

  function buildEncounterPayload(input = {}) {
    const ctx = commonCtx(input);
    const encounterDate = normalizeText(input.encounterDate);
    const encounterTime = normalizeText(input.encounterTime);
    const treatmentLabel = normalizeText(input.treatmentLabel) || 'behandling';
    const staffName = normalizeText(input.staffName) || 'Hair TP Clinic';
    const encounterId = normalizeText(input.encounterId);
    const url = actionUrl(
      `encounter/${encounterId ? encodeURIComponent(encounterId) : ''}`,
      ctx.urlToken
    );
    const safeName = escapeHtml(ctx.customerName);
    const whenText = [encounterDate, encounterTime].filter(Boolean).join(' ');
    const subject = `Din bokning: ${treatmentLabel}${whenText ? ` ${whenText}` : ''}`;
    return {
      kind: 'encounter',
      to: ctx.customerEmail,
      subject,
      html: `<p>Hej ${safeName},</p><p>Din ${escapeHtml(treatmentLabel)}${
        whenText ? ` är bokad ${escapeHtml(whenText)}` : ''
      } hos ${escapeHtml(staffName)}.</p><p><a href="${url}">Se detaljer</a></p><p>Hair TP Clinic</p>`,
      text: `Hej ${ctx.customerName},\n\nDin ${treatmentLabel}${
        whenText ? ` är bokad ${whenText}` : ''
      } hos ${staffName}.\n\n${url}\n\nHair TP Clinic`,
      url,
      meta: {
        customerId: ctx.customerId,
        customerName: ctx.customerName,
        encounterId,
        encounterDate,
        encounterTime,
        treatmentLabel,
        staffName,
      },
    };
  }

  // -- Send ------------------------------------------------------------------

  async function performSend({
    kind,
    payload,
    customerId = null,
    role = null,
    userId = null,
    dryRunOverride = null,
    templateRef = null,
    templateLang = 'sv',
    conversationKey = null,
    relatedEntityKind = null,
    relatedEntityId = null,
  } = {}) {
    const sendKind = normalizeKey(kind);
    if (!SEND_KINDS.includes(sendKind)) {
      throw badRequest(`Okänd send-kind: ${kind}. Tillåtna: ${SEND_KINDS.join(', ')}.`);
    }
    if (!payload || typeof payload !== 'object') {
      throw badRequest('payload krävs för performSend.');
    }

    const to = normalizeText(payload.to || payload.customerEmail);
    if (!to) throw badRequest('Mottagar-e-post (payload.to) krävs.');
    const subject = normalizeText(payload.subject);

    // ORD-147 §3 — spärren sitter vid sändgränsen, inte i gränssnittet. En
    // avliden mottagare får aldrig ett utskick, oavsett om det kom från en
    // schemalagd kö eller en manuell sändning. Kontrolleras FÖRE dry-run och
    // mailer — det här är den sista gemensamma punkten för alla utskick.
    if (sendBlocker && typeof sendBlocker === 'function') {
      const block = await sendBlocker({
        kind: sendKind,
        customerId:
          customerId !== null ? normalizeKey(customerId) : payload.meta?.customerId || null,
        customerEmail: to,
        payload,
      });
      if (block && block.blocked) {
        const err = new Error(block.reason || 'Utskick blockerat av sändgränsen.');
        err.code = 'SEND_BLOCKED';
        err.blockReason = normalizeText(block.reason) || 'blocked';
        throw err;
      }
    }

    const dryRun = typeof dryRunOverride === 'boolean' ? dryRunOverride : isDryRunDefault();
    // ORD-111 HÅRD STOPP: aldrig skicka skarpt med tomt ämne eller tom kropp.
    // Tidigare föll subject tillbaka på "(utan ämne)" och kroppen på undefined och
    // passerade — en patient skulle få ett tomt mail. I dry-run mäter vi bara i
    // stället (registreras som dry-run utan skarp sändning).
    const bodyText = normalizeText(payload.text);
    const bodyHtml = normalizeText(payload.html);
    if (!dryRun && (!subject || (!bodyText && !bodyHtml))) {
      const err = new Error(
        `Utskick stoppat: subject=${subject ? 'ja' : 'tom'} text=${bodyText ? 'ja' : 'tom'}`
      );
      err.code = 'TEMPLATE_EMPTY_MESSAGE';
      err.subject = subject;
      err.bodyEmpty = !bodyText && !bodyHtml;
      throw err;
    }

    /**
     * ORD-197 §1 — kundutskicksspärren täckte inte den här vägen.
     *
     * ORD-184 lade `bedomKundutskick` i transactionalMailer och smsConnector,
     * och jag beskrev det som en hård spärr med dubbelt skydd. Uppmätt i dag:
     * ccoSendActionStore får `resendMailer` injicerad DIREKT (server.js:6878),
     * inte transactionalMailer. Spärren låg alltså inte i vägen.
     *
     * Och det är den här vägen kundposten faktiskt går:
     *   ccoOfferQuickStore          offerter
     *   ccoAgreementQuickStore      avtal
     *   ccoAftercareSchedulerStore  eftervård
     *   ccoPortalReplyNotification  portalsvar
     *   ccoComposeSend              manuella utskick
     *
     * Att inget gått ut beror på att CCO_SEND_LIVE=false gör allt till
     * torrkörning — inte på spärren. Den dagen den flaggan sätts av
     * driftskäl hade kundposten börjat gå utan att någon bestämt det.
     *
     * Spärren sitter nu här, vid det som filen själv kallar "den sista
     * gemensamma punkten för alla utskick", och EFTER avlidenspärren: den
     * kastar, min returnerar, och ett blockerat utskick till en avliden får
     * inte se ut som vilket blockerat utskick som helst.
     *
     * PLACERINGEN ÄR MÄTT FRAM, INTE VALD PÅ KÄNSLA. Första versionen låg
     * direkt efter avlidenspärren, och två test gick rött:
     *
     *   ORD-111 #1: utskick utan brödtext går inte iväg skarpt
     *   FALL 3: mall godkänd → skickat, kroppen ur revisionen
     *
     * De testerna hade rätt. Kontrollerna ovanför — tom kropp, tomt ämne,
     * juridiskt godkänd mall — avslöjar FEL HOS ANROPAREN. Låter man en
     * avstängningsgrind returnera före dem försvinner de felen ur sikte, och
     * dyker upp först den dag grinden öppnas. Precis den sortens fördröjd
     * överraskning som spärren finns för att undvika.
     *
     * Ordningen är därför: kasta på det som är trasigt, blockera sedan det som
     * bara är avstängt.
     *
     * Fail-closed: utskick som inte deklarerar audience 'staff'/'ops'/
     * 'internal' behandlas som kundutskick.
     */
    const kundgrind = bedomKundutskick(payload.audience);
    if (kundgrind.blockerat) {
      const ts = nowIso();
      const blockerat = {
        sendId: crypto.randomUUID(),
        kind: sendKind,
        to,
        subject,
        customerId:
          customerId !== null ? normalizeKey(customerId) : payload.meta?.customerId || null,
        role: normalizeText(role) || null,
        userId: normalizeText(userId) || null,
        dryRun: false,
        // Eget status — inte 'dry-run' och inte 'sent'. Ett blockerat utskick
        // ska gå att räkna i loggen, inte gömma sig bland torrkörningarna.
        status: 'blocked',
        blockReason: kundgrind.skal,
        templateRef: normalizeText(templateRef) || null,
        templateLang: normalizeText(templateLang) || 'sv',
        meta: payload.meta || {},
        createdAt: ts,
      };
      state.sends.push(blockerat);
      await save();
      if (auditLog) {
        auditLog.append({
          action: 'cco.send.blocked',
          actor: { role: blockerat.role || 'system', userId: blockerat.userId },
          target: { kind: 'send', id: blockerat.sendId },
          detail: { sendKind, to, reason: kundgrind.skal, customerId: blockerat.customerId },
        });
      }
      return { ok: true, mode: 'blocked', sendId: blockerat.sendId, skipped: kundgrind.skal };
    }

    const templateSnapshot = resolveSnapshot(templateRef, templateLang);

    const ts = nowIso();
    const record = {
      sendId: crypto.randomUUID(),
      kind: sendKind,
      to,
      subject,
      customerId: customerId !== null ? normalizeKey(customerId) : payload.meta?.customerId || null,
      role: normalizeText(role) || null,
      userId: normalizeText(userId) || null,
      dryRun,
      status: 'pending',
      templateRef: normalizeText(templateRef) || null,
      templateLang: normalizeText(templateLang) || 'sv',
      templateSnapshot: templateSnapshot || null,
      meta: payload.meta || {},
      conversationKey: normalizeText(conversationKey) || null,
      relatedEntityKind: normalizeText(relatedEntityKind) || null,
      relatedEntityId: normalizeText(relatedEntityId) || null,
      linkedDocumentId: null,
      linkedAssetId: null,
      createdAt: ts,
    };

    let result = { ok: true, mode: dryRun ? 'dry-run' : 'mock' };

    if (dryRun) {
      record.status = 'dry-run';
    } else if (mailer && typeof mailer.sendEmail === 'function') {
      try {
        /**
         * ORD-203 — avsändare per klinik, även på den här vägen.
         *
         * Det är HÄR offerter, avtal, eftervård och portalsvar går ut. Att
         * bara koppla in klinikvalet i transactionalMailer hade lämnat den
         * största kundpostvägen orörd — samma miss som ORD-197 §1 rättade för
         * utskicksspärren.
         *
         * Vilande i dag: Curatiio faller tillbaka på Hair TP:s adress tills
         * brevlådan finns i allowlisten.
         */
        const klinik = avsandareForKlinik(payload.tenantId || payload.meta?.tenantId);
        result = await mailer.sendEmail({
          to,
          subject,
          html: payload.html,
          text: payload.text,
          attachments: payload.attachments,
          from: payload.from || klinik.avsandare,
          tenantId: payload.tenantId || payload.meta?.tenantId || null,
        });
        record.status = result && result.ok ? 'sent' : 'failed';
        record.mode = result && result.mode ? result.mode : null;
        record.messageId = (result && result.messageId) || null;
        if (result && result.ok === false) {
          record.error = result.error || 'send_failed';
        }
      } catch (err) {
        record.status = 'failed';
        record.error = String(err?.message || err).slice(0, 300);
        result = { ok: false, error: record.error };
      }
    } else {
      // Ingen mailer konfigurerad och inte dry-run → registrera som "skickad"
      // i mock-mode (mailer kan vara null i test/lokalt).
      record.status = 'sent';
      record.mode = 'mock';
      result = { ok: true, mode: 'mock' };
    }

    state.sends.push(record);
    await save();

    if (auditLog) {
      auditLog.append({
        action: 'cco.send.performed',
        actor: { role: record.role || 'system', userId: record.userId },
        target: { kind: 'send', id: record.sendId },
        detail: {
          sendKind,
          to,
          dryRun,
          status: record.status,
          customerId: record.customerId,
        },
      });
    }

    return {
      ok: result.ok !== false,
      sendId: record.sendId,
      kind: sendKind,
      to,
      subject,
      dryRun,
      status: record.status,
      mode: record.mode || (dryRun ? 'dry-run' : null),
      messageId: record.messageId || null,
      templateSnapshot: record.templateSnapshot,
      conversationKey: record.conversationKey,
      relatedEntityKind: record.relatedEntityKind,
      relatedEntityId: record.relatedEntityId,
      linkedDocumentId: record.linkedDocumentId,
      linkedAssetId: record.linkedAssetId,
      createdAt: record.createdAt,
      error: record.error || null,
    };
  }

  // -- Document / asset cross-linking (Fas 7) ---------------------------------

  function requireSend(sendId) {
    const id = normalizeText(sendId);
    const idx = state.sends.findIndex((s) => s.sendId === id);
    if (idx === -1) {
      const e = new Error(`send ${id} hittades inte.`);
      e.statusCode = 404;
      throw e;
    }
    return idx;
  }

  async function linkDocument(sendId, { documentId = null, assetId = null } = {}) {
    const idx = requireSend(sendId);
    const record = state.sends[idx];
    const docId = normalizeText(documentId);
    const aId = normalizeText(assetId);
    if (docId) record.linkedDocumentId = docId;
    if (aId) record.linkedAssetId = aId;
    record.updatedAt = nowIso();
    await save();
    if (auditLog) {
      auditLog.append({
        action: 'cco.send.document_linked',
        actor: { role: 'system', userId: null },
        target: { kind: 'send', id: record.sendId },
        detail: {
          linkedDocumentId: record.linkedDocumentId,
          linkedAssetId: record.linkedAssetId,
        },
      });
    }
    return { ...record };
  }

  /* Sortering på enbart createdAt räcker inte för att hitta "senaste".
   *
   * createdAt har millisekundupplösning. Två utskick som skapas i samma
   * millisekund — vilket händer så fort anroparen inte väntar på nätverk,
   * t.ex. vid dryRunOverride — får identisk stämpel. Komparatorn returnerar
   * då 0, och eftersom V8:s sort är STABIL behåller de sin ursprungliga
   * ordning. [0] blir därmed det FÖRST skapade, alltså precis tvärtom mot
   * vad funktionen lovar.
   *
   * Det är inte en teoretisk risk: testet "Fas 7: findSendByRelatedEntity
   * returnerar senaste matchande utskick" failade 5 av 10 lokala körningar
   * 2026-08-19, och två oberoende CI-jobb samtidigt. Utfallet beror på hur
   * snabb maskinen är, vilket är varför det setts som fladdrigt.
   *
   * state.sends är append-ordnad (state.sends.push(record) vid rad ~402), så
   * vid lika stämpel är den som ligger SENARE i arrayen den nyare. Därför
   * jämförs med >= i en enkel genomgång: senare index vinner oavgjort.
   */
  function findSendByRelatedEntity(kind, entityId) {
    const wantKind = normalizeText(kind);
    const wantId = normalizeText(entityId);
    if (!wantKind || !wantId) return null;

    let senaste = null;
    for (const s of state.sends) {
      if (s.relatedEntityKind !== wantKind || s.relatedEntityId !== wantId) continue;
      if (!senaste || String(s.createdAt) >= String(senaste.createdAt)) {
        senaste = s;
      }
    }
    return senaste ? { ...senaste } : null;
  }

  // -- Read ------------------------------------------------------------------

  function listSends({ kind = null, customerId = null, limit = 100 } = {}) {
    const wantKind = kind ? normalizeKey(kind) : null;
    const wantCustomer = customerId ? normalizeKey(customerId) : null;
    const cap = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 100;
    // Samma oavgjort-problem som i findSendByRelatedEntity: utskick i samma
    // millisekund får identisk createdAt, och en stabil sort lämnar dem i
    // append-ordning — alltså äldst först i en lista som utger sig för att
    // vara nyast först. Index används som sekundärnyckel, eftersom
    // state.sends är append-ordnad.
    return state.sends
      .map((s, index) => ({ s, index }))
      .filter(({ s }) => (wantKind ? s.kind === wantKind : true))
      .filter(({ s }) => (wantCustomer ? s.customerId === wantCustomer : true))
      .sort((a, b) => {
        const efterTid = String(b.s.createdAt).localeCompare(String(a.s.createdAt));
        return efterTid !== 0 ? efterTid : b.index - a.index;
      })
      .slice(0, cap)
      .map(({ s }) => ({ ...s }));
  }

  function stats() {
    const byKind = {};
    const byStatus = {};
    let dryRunCount = 0;
    let liveCount = 0;
    for (const s of state.sends) {
      byKind[s.kind] = (byKind[s.kind] || 0) + 1;
      byStatus[s.status] = (byStatus[s.status] || 0) + 1;
      if (s.dryRun) dryRunCount += 1;
      else liveCount += 1;
    }
    return {
      total: state.sends.length,
      dryRunCount,
      liveCount,
      dryRunDefault: isDryRunDefault(),
      mailerConfigured: Boolean(mailer && typeof mailer.sendEmail === 'function'),
      byKind,
      byStatus,
    };
  }

  return {
    buildFormPayload,
    buildConsentPayload,
    buildFilePayload,
    buildEncounterPayload,
    performSend,
    linkDocument,
    findSendByRelatedEntity,
    listSends,
    stats,
  };
}

module.exports = {
  createCcoSendActionStore,
  isDryRunDefault,
  FORM_TEMPLATES,
  CONSENT_TEMPLATES,
  ALLOWED_MIME_BY_KIND,
  SEND_KINDS,
};
