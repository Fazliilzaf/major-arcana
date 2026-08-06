#!/usr/bin/env node
'use strict';

/**
 * ORD-93 — read-only mätning av `cid:`-bilder utan bilagemetadata.
 *
 * Besvarar två frågor som ordern lämnar öppna:
 *
 *   Mätgrind steg 3 — deepScan-svep över alla brevlådor, jämförbart mot
 *                     tabellen i ORD-93.
 *   Uppgift 2       — går bilagorna att hämta om via Graph, eller tappades
 *                     de vid materialiseringen? Ordern säger uttryckligen
 *                     "Mät innan något byggs".
 *
 * Skriver ingenting. Anropar bara GET-endpoints med ägar-token.
 *
 *   node scripts/probe-cid-fidelity-prod.js
 *   node scripts/probe-cid-fidelity-prod.js --samples 5
 *   node scripts/probe-cid-fidelity-prod.js --mailbox fazli@... --mailbox egzona@...
 *   node scripts/probe-cid-fidelity-prod.js --json > /tmp/ord93.json
 *
 * Kräver `graphReadEnabled` i prod för probe-delen. Saknas den rapporteras
 * svepet ändå, och uppgift 2 markeras som obesvarad i stället för att gissas.
 */

require('dotenv').config({ quiet: true });
const { spawnSync } = require('node:child_process');

const BASE = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(/\/+$/, '');
const asJson = process.argv.includes('--json');

function argValues(flag) {
  const out = [];
  for (let i = 0; i < process.argv.length - 1; i += 1) {
    if (process.argv[i] === flag) out.push(process.argv[i + 1]);
  }
  return out.filter(Boolean);
}

function argNumber(flag, fallback) {
  const raw = argValues(flag)[0];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(1);
}

function ownerToken() {
  const result = spawnSync('node', ['scripts/get-prod-auth-token.js', '--owner', '--no-fallback'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  });
  if (result.status !== 0) fail(result.stderr?.trim() || 'owner-token misslyckades');
  const token = (result.stdout || '').trim().split(/\r?\n/).filter(Boolean).pop();
  if (!token) fail('tom owner-token');
  return token;
}

async function getJson(token, path) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function discoverMailboxes(token) {
  const explicit = argValues('--mailbox');
  if (explicit.length) return explicit;
  const { ok, body } = await getJson(token, '/api/v1/cco/runtime/history/status');
  if (!ok) return [];
  const candidates = [
    ...(Array.isArray(body.mailboxIds) ? body.mailboxIds : []),
    ...(Array.isArray(body.mailboxes) ? body.mailboxes.map((m) => m?.mailboxId || m?.id || m) : []),
  ];
  return [...new Set(candidates.map((v) => String(v || '').trim()).filter(Boolean))];
}

async function main() {
  const token = ownerToken();
  const sampleCount = argNumber('--samples', 3);
  const mailboxIds = await discoverMailboxes(token);
  if (!mailboxIds.length) {
    fail('hittade inga brevlador — ange dem med --mailbox <id> (kan upprepas)');
  }

  const report = {
    base: BASE,
    mailboxes: [],
    probe: {
      attempted: 0,
      recoverable: 0,
      cidMismatch: 0,
      lost: 0,
      messageNotFound: 0,
      notFound: [],
      mismatchSamples: [],
    },
  };
  let probeUnavailableReason = '';

  for (const mailboxId of mailboxIds) {
    const query = `?mailboxId=${encodeURIComponent(mailboxId)}&deepScan=true&limit=1000`;
    const { ok, status, body } = await getJson(
      token,
      `/api/v1/cco/runtime/history/fidelity/manifest${query}`
    );
    if (!ok) {
      report.mailboxes.push({ mailboxId, error: body?.error || `HTTP ${status}` });
      continue;
    }
    const summary = body?.manifest?.summary || {};
    const entries = Array.isArray(body?.manifest?.entries) ? body.manifest.entries : [];
    report.mailboxes.push({
      mailboxId,
      messagesWithMissingCidMetadata: Number(summary.messagesWithMissingCidMetadata || 0),
      cidReferencesWithoutAttachmentMetadata: Number(
        summary.cidReferencesWithoutAttachmentMetadata || 0
      ),
      bodySource: summary.bodySource || null,
      byFolderType: summary.byFolderType || {},
      truncated: Boolean(summary.truncated),
      entriesReturned: entries.length,
    });

    // Uppgift 2: proba ett fatal exemplar per brevlada. Fragan ar binar —
    // ligger bilagan kvar i Graph eller inte — sa nagra stickprov racker.
    for (const entry of entries.slice(0, sampleCount)) {
      if (!entry?.messageId || !entry?.cid) continue;
      report.probe.attempted += 1;
      const probeQuery =
        `?mailboxId=${encodeURIComponent(mailboxId)}` +
        `&messageId=${encodeURIComponent(entry.messageId)}` +
        `&cid=${encodeURIComponent(entry.cid)}`;
      const probe = await getJson(token, `/api/v1/cco/runtime/history/fidelity/probe${probeQuery}`);

      // 503 = graphReadEnabled ar av. Det ar ett infrastrukturfel och gor hela
      // uppgift 2 omatbar — sluta proba, men fortsatt svepet.
      //
      // Allt annat (typiskt Graph 404 "not found in the store") ar ett SVAR:
      // just det meddelandet gar inte att hamta om. Ett stickprov som misslyckas
      // ar data, inte ett avbrott. Forsta versionen av skriptet brot loopen har
      // och rapporterade hela koringen som obesvarad pa ett enda 404.
      if (!probe.ok) {
        if (probe.status === 503) {
          probeUnavailableReason = probe.body?.error || `HTTP ${probe.status}`;
          report.probe.attempted -= 1;
          break;
        }
        report.probe.messageNotFound += 1;
        report.probe.notFound.push({
          mailboxId,
          status: probe.status,
          error: String(probe.body?.error || '').slice(0, 160),
        });
        continue;
      }

      // Tre utfall, inte tva. Kodens egen kommentar i capabilities.js sager
      // varfor: matchCount 0 kan betyda "Graph gav noll bilagor" (inget att
      // hamta) ELLER "Graph gav N men ingen matchade pa contentId"
      // (normaliseringen ar fel — bytesen finns kvar). De kraver helt olika
      // atgard: backfill respektive rattad cid-normalisering.
      const graph = probe.body?.graph || {};
      const attachmentCount = Number(graph.attachmentCount || 0);
      const matchCount = Number(graph.matchCount || 0);
      if (graph.attachment) {
        report.probe.recoverable += 1;
      } else if (attachmentCount > 0 && matchCount === 0) {
        report.probe.cidMismatch += 1;
        report.probe.mismatchSamples.push({ mailboxId, attachmentCount, cid: entry.cid });
      } else {
        report.probe.lost += 1;
      }
    }
    if (probeUnavailableReason) break;
  }

  if (probeUnavailableReason) report.probe.unavailable = probeUnavailableReason;

  if (asJson) return process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  console.log('ORD-93 — cid-fidelity (read-only)\n');
  let totalMessages = 0;
  let totalRefs = 0;
  for (const row of report.mailboxes) {
    if (row.error) {
      console.log(`- ${row.mailboxId} · FEL: ${row.error}`);
      continue;
    }
    totalMessages += row.messagesWithMissingCidMetadata;
    totalRefs += row.cidReferencesWithoutAttachmentMetadata;
    const folders = Object.entries(row.byFolderType)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    console.log(
      `- ${row.mailboxId}\n` +
        `    meddelanden med saknad cid-metadata : ${row.messagesWithMissingCidMetadata}\n` +
        `    cid-referenser utan bilagemetadata  : ${row.cidReferencesWithoutAttachmentMetadata}\n` +
        `    bodySource                          : ${row.bodySource}${row.truncated ? ' (TRUNKERAD)' : ''}\n` +
        `    per mapp                            : ${folders || '—'}`
    );
  }
  console.log(`\nTotalt: ${totalMessages} meddelanden · ${totalRefs} cid-referenser\n`);

  console.log('Uppgift 2 — gar bilagorna att hamta om?');
  if (report.probe.unavailable) {
    console.log(`  OBESVARAD — proben ar inte tillganglig: ${report.probe.unavailable}`);
    console.log('  Kraver graphReadEnabled i prod. Gissa inte utfallet.');
  } else if (report.probe.attempted === 0) {
    console.log('  OBESVARAD — inga probbara poster hittades.');
  } else {
    const p = report.probe;
    console.log(`  ${p.attempted} stickprov:`);
    console.log(`    bilagan hittad i Graph            : ${p.recoverable}`);
    console.log(`    bilagor finns men cid matchar ej  : ${p.cidMismatch}`);
    console.log(`    Graph hade inga bilagor alls      : ${p.lost}`);
    console.log(`    meddelandet fanns inte i Graph    : ${p.messageNotFound}`);
    for (const miss of p.notFound.slice(0, 3)) {
      console.log(`      · ${miss.mailboxId} HTTP ${miss.status}: ${miss.error}`);
    }
    console.log('');
    if (p.cidMismatch > 0) {
      console.log('  → Bytesen FINNS i Graph men contentId-matchningen traffar inte.');
      console.log('    Ratt atgard ar rattad cid-normalisering, INTE backfill.');
    } else if (p.recoverable > 0 && p.lost === 0 && p.messageNotFound === 0) {
      console.log('  → Backfill ar ratt atgard: metadatan finns kvar i Graph.');
    } else if (p.recoverable === 0 && p.cidMismatch === 0) {
      console.log('  → Ingen bilaga gick att na. Markeringen som redan finns ar');
      console.log('    ratt slutgiltig atgard — men se antalen ovan innan beslut.');
    } else {
      console.log('  → Blandat utfall. Se antalen ovan; en enda kategori rader inte.');
    }
  }
}

main().catch((error) => fail(error.message || String(error)));
