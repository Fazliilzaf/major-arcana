#!/usr/bin/env node
/**
 * ORD-204 — är curatiio.com redo att skicka från Microsoft 365?
 *
 * Kör det här INNAN någon sätter `aktiv: true` i config/avsandare-per-klinik.json.
 * Skriptet mäter, det ändrar ingenting och det skickar ingen post.
 *
 *   npm run check:curatiio-mail
 *
 * Sex kontroller. Fyra går att göra var som helst (DNS är publik). Två kräver
 * appens Graph-nycklar och miljön där utskicken faktiskt sker — körs skriptet
 * lokalt blir de OMÄTT, och då är svaret nej. Ett skript som säger KLAR för att
 * det hoppade över två steg är sämre än inget skript alls.
 *
 * Exit 0 = klar att aktivera. Exit 1 = inte klar (eller kunde inte mätas).
 */
'use strict';

const dns = require('node:dns').promises;
const {
  bedomMx,
  bedomSpf,
  bedomDkim,
  bedomDmarc,
  bedomBeredskap,
} = require('../src/infra/curatiioMailBeredskap');

const DOMAN = process.env.DOMAN || 'curatiio.com';
const ADRESS = process.env.ADRESS || `contact@${DOMAN}`;

async function slaUpp(fn, ...args) {
  try {
    return await fn(...args);
  } catch (err) {
    // ENOTFOUND/ENODATA betyder "posten finns inte", vilket är ett mätvärde —
    // inte ett fel i mätningen. Andra fel kastas vidare: en trasig resolver
    // ska inte tolkas som "DKIM saknas".
    if (err && (err.code === 'ENOTFOUND' || err.code === 'ENODATA')) return [];
    throw err;
  }
}

async function main() {
  const kontroller = [];

  const mx = await slaUpp(dns.resolveMx.bind(dns), DOMAN);
  kontroller.push({ id: 'C1', namn: 'MX pekar på Exchange Online', ...bedomMx(mx) });

  const txt = await slaUpp(dns.resolveTxt.bind(dns), DOMAN);
  kontroller.push({ id: 'C2', namn: 'SPF tillåter Microsoft', ...bedomSpf(txt) });

  const selektorer = [];
  for (const s of ['selector1', 'selector2']) {
    const c = await slaUpp(dns.resolveCname.bind(dns), `${s}._domainkey.${DOMAN}`);
    selektorer.push(...c);
  }
  kontroller.push({
    id: 'C3',
    namn: 'DKIM signerar med domänens nyckel',
    ...bedomDkim(selektorer),
  });

  const dmarc = await slaUpp(dns.resolveTxt.bind(dns), `_dmarc.${DOMAN}`);
  kontroller.push({ id: 'C4', namn: 'DMARC finns', ...bedomDmarc(dmarc) });

  /**
   * C5 och C6 går inte att mäta utifrån.
   *
   * Att brevlådan finns och att appen får skicka som den syns bara med
   * tenantens egna nycklar. Att adressen står i allowlisten syns bara där
   * ARCANA_GRAPH_SEND_ALLOWLIST är satt, alltså i Render — inte lokalt.
   *
   * De rapporteras därför som OMÄTT när de inte kan mätas. Aldrig som pass.
   */
  const allowlist = (process.env.ARCANA_GRAPH_SEND_ALLOWLIST || '').toLowerCase();
  kontroller.push(
    allowlist
      ? {
          id: 'C5',
          namn: 'adressen står i ARCANA_GRAPH_SEND_ALLOWLIST',
          status: allowlist.includes(ADRESS.toLowerCase()) ? 'pass' : 'fail',
          skal: allowlist.includes(ADRESS.toLowerCase()) ? '' : `${ADRESS} saknas i listan`,
        }
      : {
          id: 'C5',
          namn: 'adressen står i ARCANA_GRAPH_SEND_ALLOWLIST',
          status: 'omatt',
          skal: 'ARCANA_GRAPH_SEND_ALLOWLIST är inte satt här (kör på Render)',
        }
  );

  kontroller.push({
    id: 'C6',
    namn: `${ADRESS} finns som brevlåda med Send-As för appen`,
    status: 'omatt',
    skal: 'kräver tenantens Graph-nycklar — verifiera i Microsoft 365 admin',
  });

  const dom = bedomBeredskap(kontroller);

  console.log(`\nORD-204 — beredskap för ${DOMAN}\n`);
  for (const k of kontroller) {
    const etikett = { pass: 'PASS ', fail: 'FAIL ', omatt: 'OMÄTT', varning: 'VARN ' }[k.status];
    console.log(`${etikett} ${k.id} ${k.namn}${k.skal ? ` — ${k.skal}` : ''}`);
  }

  console.log(
    `\n${dom.pass} godkända · ${dom.fail} underkända · ${dom.varning} varningar · ${dom.omatt} omätta`
  );

  if (dom.klar) {
    console.log('\nKLAR — sätt aktiv: true i config/avsandare-per-klinik.json.\n');
    process.exit(0);
  }

  console.log('\nINTE KLAR. Kvar att göra:');
  for (const s of dom.skal) console.log(`  · ${s}`);
  console.log('\nLåt aktiv: false stå kvar.\n');
  process.exit(1);
}

main().catch((err) => {
  console.error('Mätningen gick inte att göra:', err && err.message ? err.message : err);
  // Ett fel i mätningen är inte ett godkännande.
  process.exit(1);
});
