#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * recover-halso-screen.js
 * ────────────────────────────────────────────────────────────────────────────
 * ENGÅNGS-VERKTYG: Återtar de historiska patientunderlagen från de gamla
 * /screen-formulären (hälsodeklarationer m.m.) som skickades till
 * halso@hairtpclinic.com, och sparar dem strukturerat och lokalt.
 *
 * VIKTIGT (patientdatalagen + GDPR):
 *   - Detta skript läser KÄNSLIGA personuppgifter (hälsodata). Kör det ENDAST i
 *     en säker miljö som du kontrollerar (er Render-tjänst eller en låst dator).
 *   - Inget skickas till någon extern tjänst. Skriptet pratar bara med
 *     Microsoft Graph (er egen Microsoft 365-tenant) och skriver till en lokal
 *     mapp. Ingen OpenAI, ingen tredje part.
 *   - Originalmejlen ligger kvar i brevlådan, skriptet raderar ingenting.
 *   - Lägg utdatamappen på en krypterad/åtkomststyrd disk och radera den när
 *     underlagen importerats till journalsystemet.
 *
 * KREDENTIALER (samma app-registrering som Arcana redan använder):
 *   ARCANA_GRAPH_TENANT_ID      (eller GRAPH_TENANT_ID)
 *   ARCANA_GRAPH_CLIENT_ID      (eller GRAPH_CLIENT_ID)
 *   ARCANA_GRAPH_CLIENT_SECRET  (eller GRAPH_CLIENT_SECRET)
 *   App-registreringen måste ha APPLICATION-permission "Mail.Read" (admin-
 *   consentad). Det har ni redan för Arcanas inbox-läsning.
 *
 * ANVÄNDNING:
 *   1) Kartlägg först vad som finns (skriver INGA underlag, bara ämnesrader):
 *        node scripts/recover-halso-screen.js --list
 *   2) Identifiera avsändaren/ämnet för /screen-mejlen i listan, filtrera och
 *      hämta hem allt:
 *        node scripts/recover-halso-screen.js \
 *          --mailbox halso@hairtpclinic.com \
 *          --subject "hälsodeklaration" \
 *          --since 2019-01-01 \
 *          --out ./halso-recovery
 *
 * FLAGGOR:
 *   --mailbox <upn>     Brevlåda att läsa (default halso@hairtpclinic.com)
 *   --since <YYYY-MM-DD> Hämta bara mejl mottagna fr.o.m. detta datum
 *   --until <YYYY-MM-DD> Hämta bara mejl mottagna t.o.m. detta datum
 *   --subject <text>    Behåll bara mejl vars ämne innehåller texten (case-insensitivt)
 *   --from <text>       Behåll bara mejl från avsändare som innehåller texten
 *   --out <dir>         Utdatamapp (default ./halso-recovery-<datum>)
 *   --max <n>           Max antal mejl att hämta (default obegränsat)
 *   --list              Lista bara ämnesrader/avsändare, spara inga underlag
 *   --no-attachments    Hoppa över nedladdning av bilagor
 * ────────────────────────────────────────────────────────────────────────────
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const GRAPH = 'https://graph.microsoft.com/v1.0';
const LOGIN = 'https://login.microsoftonline.com';

// ── argv-parsing ────────────────────────────────────────────────────────────
function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return !v || v.startsWith('--') ? fallback : v;
}
function flag(name) {
  return process.argv.includes(`--${name}`);
}

const CONFIG = {
  tenantId: process.env.ARCANA_GRAPH_TENANT_ID || process.env.GRAPH_TENANT_ID || '',
  clientId: process.env.ARCANA_GRAPH_CLIENT_ID || process.env.GRAPH_CLIENT_ID || '',
  clientSecret: process.env.ARCANA_GRAPH_CLIENT_SECRET || process.env.GRAPH_CLIENT_SECRET || '',
  mailbox: arg('mailbox', 'halso@hairtpclinic.com'),
  since: arg('since', ''),
  until: arg('until', ''),
  subjectFilter: arg('subject', '').toLowerCase(),
  fromFilter: arg('from', '').toLowerCase(),
  outDir: arg('out', `./halso-recovery-${new Date().toISOString().slice(0, 10)}`),
  max: Number.parseInt(arg('max', '0'), 10) || 0,
  listOnly: flag('list'),
  skipAttachments: flag('no-attachments'),
};

// ── helpers ──────────────────────────────────────────────────────────────────
function nowIso() {
  return new Date().toISOString();
}

function safeKey(value, fallback = 'okand') {
  const cleaned = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function htmlToText(input) {
  let t = String(input || '');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '');
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '');
  t = t.replace(/<(br|hr)\s*\/?>/gi, '\n');
  t = t.replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, '\n');
  t = t.replace(/<td[^>]*>/gi, '\t');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return t
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Heuristisk fält-extraktion. /screen-formulären mejlades typiskt som
 * "Etikett: värde" rader eller HTML-tabeller. Vi plockar ut alla "nyckel: värde"
 * par vi hittar. Originalkroppen sparas alltid oavsett, så inget går förlorat.
 */
function extractFields(text) {
  const fields = {};
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.trim();
    const m = line.match(/^([A-Za-zÅÄÖåäö0-9 ./()\-]{2,60}?)\s*[:\t]\s*(.+)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim();
      if (key && val && val.length < 2000) fields[key] = val;
    }
  }
  return fields;
}

async function getToken() {
  const body = new URLSearchParams({
    client_id: CONFIG.clientId,
    client_secret: CONFIG.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(`${LOGIN}/${CONFIG.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Token-fel ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  return json.access_token;
}

async function graphGet(token, url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const retry = Number.parseInt(res.headers.get('retry-after') || '5', 10);
    await new Promise((r) => setTimeout(r, (retry + 1) * 1000));
    return graphGet(token, url);
  }
  if (!res.ok) throw new Error(`Graph-fel ${res.status} (${url}): ${await res.text()}`);
  return res.json();
}

function buildMessagesUrl() {
  const mbox = encodeURIComponent(CONFIG.mailbox);
  const select = 'id,subject,from,toRecipients,receivedDateTime,hasAttachments,bodyPreview,internetMessageId';
  const params = [`$select=${select}`, '$top=50', '$orderby=receivedDateTime desc'];
  const filters = [];
  if (CONFIG.since) filters.push(`receivedDateTime ge ${CONFIG.since}T00:00:00Z`);
  if (CONFIG.until) filters.push(`receivedDateTime le ${CONFIG.until}T23:59:59Z`);
  if (filters.length) params.push(`$filter=${encodeURIComponent(filters.join(' and '))}`);
  return `${GRAPH}/users/${mbox}/messages?${params.join('&')}`;
}

function keep(msg) {
  const subject = (msg.subject || '').toLowerCase();
  const from = (msg.from?.emailAddress?.address || '').toLowerCase();
  if (CONFIG.subjectFilter && !subject.includes(CONFIG.subjectFilter)) return false;
  if (CONFIG.fromFilter && !from.includes(CONFIG.fromFilter)) return false;
  return true;
}

async function main() {
  // Validering
  const missing = ['tenantId', 'clientId', 'clientSecret'].filter((k) => !CONFIG[k]);
  if (missing.length) {
    console.error(
      `Saknar kredentialer: ${missing.join(', ')}.\n` +
        `Sätt ARCANA_GRAPH_TENANT_ID / ARCANA_GRAPH_CLIENT_ID / ARCANA_GRAPH_CLIENT_SECRET ` +
        `(samma app-registrering som Arcana använder, med Mail.Read application-permission).`,
    );
    process.exit(1);
  }

  console.log(`[${nowIso()}] Hämtar token...`);
  const token = await getToken();
  console.log(`[${nowIso()}] OK. Läser brevlåda: ${CONFIG.mailbox}`);

  const index = [];
  let url = buildMessagesUrl();
  let scanned = 0;
  let kept = 0;

  if (!CONFIG.listOnly) {
    await fs.mkdir(CONFIG.outDir, { recursive: true });
    await fs.mkdir(path.join(CONFIG.outDir, 'rader'), { recursive: true });
  }

  while (url) {
    const page = await graphGet(token, url);
    for (const msg of page.value || []) {
      scanned += 1;
      if (!keep(msg)) continue;
      kept += 1;

      const received = msg.receivedDateTime || '';
      const fromAddr = msg.from?.emailAddress?.address || 'okand';
      const subject = msg.subject || '(utan ämne)';

      if (CONFIG.listOnly) {
        console.log(`${received}  |  ${fromAddr}  |  ${subject}`);
        if (CONFIG.max && kept >= CONFIG.max) { url = null; break; }
        continue;
      }

      // Hämta full kropp (HTML) för meddelandet
      const full = await graphGet(
        token,
        `${GRAPH}/users/${encodeURIComponent(CONFIG.mailbox)}/messages/${msg.id}?$select=id,subject,from,toRecipients,receivedDateTime,body,internetMessageId`,
      );
      const bodyHtml = full.body?.content || '';
      const bodyText = htmlToText(bodyHtml);
      const fields = extractFields(bodyText);

      const stamp = (received || nowIso()).replace(/[:.]/g, '-');
      const shortId = crypto.createHash('sha1').update(msg.id).digest('hex').slice(0, 8);
      const base = `${stamp}__${safeKey(subject).slice(0, 40)}__${shortId}`;

      const record = {
        recoveredAt: nowIso(),
        source: { mailbox: CONFIG.mailbox, messageId: msg.id, internetMessageId: full.internetMessageId || '' },
        receivedDateTime: received,
        from: fromAddr,
        subject,
        fields,
        bodyText,
      };

      await fs.writeFile(
        path.join(CONFIG.outDir, 'rader', `${base}.json`),
        JSON.stringify(record, null, 2),
        'utf8',
      );
      await fs.writeFile(
        path.join(CONFIG.outDir, 'rader', `${base}.html`),
        bodyHtml,
        'utf8',
      );

      // Bilagor (t.ex. uppladdade foton/PDF i hälsodeklarationen)
      if (msg.hasAttachments && !CONFIG.skipAttachments) {
        try {
          const att = await graphGet(
            token,
            `${GRAPH}/users/${encodeURIComponent(CONFIG.mailbox)}/messages/${msg.id}/attachments`,
          );
          let n = 0;
          for (const a of att.value || []) {
            if (a['@odata.type'] === '#microsoft.graph.fileAttachment' && a.contentBytes) {
              n += 1;
              const safeName = safeKey(a.name || `bilaga-${n}`).slice(0, 50);
              await fs.writeFile(
                path.join(CONFIG.outDir, 'rader', `${base}__bilaga-${n}-${safeName}`),
                Buffer.from(a.contentBytes, 'base64'),
              );
            }
          }
          record.attachmentCount = n;
        } catch (e) {
          console.warn(`  ! Kunde inte hämta bilagor för ${base}: ${e.message}`);
        }
      }

      index.push({
        file: `rader/${base}.json`,
        receivedDateTime: received,
        from: fromAddr,
        subject,
        fieldCount: Object.keys(fields).length,
        hasAttachments: !!msg.hasAttachments,
      });

      if (kept % 25 === 0) console.log(`  ...${kept} underlag sparade`);
      if (CONFIG.max && kept >= CONFIG.max) { url = null; break; }
    }
    if (url) url = page['@odata.nextLink'] || null;
  }

  if (CONFIG.listOnly) {
    console.log(`\n[${nowIso()}] KLART (list). Skannade ${scanned} mejl, ${kept} matchade filtren.`);
    return;
  }

  // Index + sammanfattning
  index.sort((a, b) => String(a.receivedDateTime).localeCompare(String(b.receivedDateTime)));
  await fs.writeFile(path.join(CONFIG.outDir, 'index.json'), JSON.stringify(index, null, 2), 'utf8');

  const csv = ['mottaget;avsandare;amne;antal_falt;bilagor;fil']
    .concat(
      index.map((r) =>
        [r.receivedDateTime, r.from, String(r.subject).replace(/;/g, ','), r.fieldCount, r.hasAttachments, r.file].join(';'),
      ),
    )
    .join('\n');
  await fs.writeFile(path.join(CONFIG.outDir, 'index.csv'), csv, 'utf8');

  const summary = [
    `Återtagning av halso@-underlag`,
    `Tidpunkt: ${nowIso()}`,
    `Brevlåda: ${CONFIG.mailbox}`,
    `Filter: subject="${CONFIG.subjectFilter}" from="${CONFIG.fromFilter}" since="${CONFIG.since}" until="${CONFIG.until}"`,
    `Skannade mejl: ${scanned}`,
    `Sparade underlag: ${kept}`,
    `Utdatamapp: ${path.resolve(CONFIG.outDir)}`,
    ``,
    `OBS: Mappen innehåller känsliga personuppgifter (patientdatalagen).`,
    `Förvara åtkomststyrt och radera när underlagen importerats till journalsystemet.`,
  ].join('\n');
  await fs.writeFile(path.join(CONFIG.outDir, 'SAMMANFATTNING.txt'), summary, 'utf8');

  console.log(`\n[${nowIso()}] KLART. ${kept} underlag sparade i ${path.resolve(CONFIG.outDir)}`);
  console.log(`Se index.json / index.csv för översikt, och SAMMANFATTNING.txt.`);
}

main().catch((e) => {
  console.error(`\nFEL: ${e.message}`);
  process.exit(1);
});
