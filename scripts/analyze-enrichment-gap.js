#!/usr/bin/env node
'use strict';

/**
 * Read-only enrichment gap analysis against prod (or local server).
 * No writes, no raw mail bodies, no patient identifiers in output.
 *
 *   node scripts/analyze-enrichment-gap.js
 *   node scripts/analyze-enrichment-gap.js --write-report
 */

require('dotenv').config({ quiet: true });

const fs = require('node:fs/promises');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..');

function parseArgs(argv) {
  return {
    writeReport: argv.includes('--write-report'),
    detailLimit: (() => {
      const index = argv.indexOf('--detail-limit');
      if (index >= 0) return Number(argv[index + 1]) || 775;
      return 775;
    })(),
    json: argv.includes('--json'),
    saveJson: (() => {
      const index = argv.indexOf('--save-json');
      if (index >= 0) return argv[index + 1] || '';
      return '';
    })(),
  };
}

async function resolveOwnerToken() {
  const { execSync } = require('node:child_process');
  const base = process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com';
  const out = execSync('node scripts/get-prod-auth-token.js --owner', {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ARCANA_PROD_URL: base },
  });
  const token = out.trim().split('\n').pop();
  if (!token) throw new Error('owner token saknas');
  return token;
}

async function fetchGapAnalysis(token, detailLimit) {
  const base = (process.env.ARCANA_PROD_URL || 'https://arcana.hairtpclinic.com').replace(
    /\/+$/,
    ''
  );
  const query = new URLSearchParams({
    tenantId: 'hair-tp-clinic',
    detailLimit: String(detailLimit),
    snapshotProbeLimit: '25',
  });
  const res = await fetch(`${base}/api/v1/ops/cco/enrichment/gap-analysis?${query}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${res.status} gap-analysis`);
  return body;
}

function renderMarkdown(analysis) {
  const lines = [];
  lines.push('# CCO Mail Enrichment Gap Analysis');
  lines.push('');
  lines.push(`**Datum:** ${analysis.generatedAt?.slice(0, 10) || '2026-06-01'}`);
  lines.push('**Scope:** Frankfurt prod · truth-only · read-only');
  lines.push('**Regler:** Ingen rå mailtext · inga patient-ID/e-post i denna rapport');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## Sammanfattning');
  lines.push('');
  lines.push('| Metric | Värde |');
  lines.push('|--------|------:|');
  lines.push(`| Truth conversations | ${analysis.coverage?.truthConversationCount ?? '—'} |`);
  lines.push(`| Enriched | ${analysis.coverage?.enrichedConversationCount ?? '—'} |`);
  lines.push(`| **Gap (analyserat)** | **${analysis.totalGap ?? '—'}** |`);
  lines.push(`| Coverage | ${analysis.coverage?.coveragePercent ?? '—'}% |`);
  lines.push(`| Tröskel readyForWork | ${analysis.coverage?.readyThresholdPercent ?? 99.5}% |`);
  lines.push(`| Kan fallback-enrichas | ${analysis.canFallbackEnrichCount ?? '—'} |`);
  lines.push(
    `| Bör exkluderas från denominator | ${analysis.shouldExcludeFromThresholdCount ?? '—'} |`
  );
  lines.push(`| Verkliga blockers (exkl. exkludering) | ${analysis.trueBlockerCount ?? '—'} |`);
  lines.push(
    `| Projicerad coverage om exkludering | ${analysis.projectedCoverageIfExclude ?? '—'}% |`
  );
  lines.push('');
  lines.push('## Buckets');
  lines.push('');
  lines.push('| Bucket | Antal |');
  lines.push('|--------|------:|');
  for (const [bucket, count] of Object.entries(analysis.bucketCounts || {}).sort(
    (a, b) => b[1] - a[1]
  )) {
    if (!count) continue;
    lines.push(`| \`${bucket}\` | ${count} |`);
  }
  lines.push('');
  lines.push('## Rekommendation per bucket');
  lines.push('');
  for (const item of analysis.bucketRecommendations || []) {
    lines.push(`### \`${item.bucket}\` (${item.count})`);
    lines.push(`- **Beslut:** ${item.decision}`);
    lines.push(`- **Motivering:** ${item.rationale}`);
    lines.push('');
  }
  lines.push('## Strategi mot readyForWork=true');
  lines.push('');
  lines.push(
    '1. **Exkludera** system/scrap, dubbletter och out-of-scope mailbox från denominator.'
  );
  lines.push(
    '2. **Fallback-enrich** snapshot-viable rader där AnalyzeInbox gav tom parser-output.'
  );
  lines.push(
    '3. **Lämna unresolved** rader utan graphMessageId eller body/subject (truth repair).'
  );
  lines.push('4. **Manuell review** för missing_customer_identity utan auto-kundkoppling.');
  lines.push('');
  lines.push('### Risker');
  lines.push('');
  lines.push(
    '- **Sänka tröskel:** Maskerar datakvalitetsproblem; worklist fylls med osäkra rader.'
  );
  lines.push(
    '- **Fallback-enrich:** Säker för regelbaserade lanes om intent/SLA härleds från metadata; risk för fel klassning utan customerId.'
  );
  lines.push('');
  if (analysis.remainderSummary?.rowCount > 0) {
    lines.push('## Rest-sample (sammanfattning utöver detaljlimit)');
    lines.push('');
    lines.push(
      `Detaljerade rader: ${analysis.details?.length || 0}, rest: ${analysis.remainderSummary.rowCount}`
    );
    lines.push('');
    lines.push('| Bucket | Antal (rest) |');
    lines.push('|--------|-------------:|');
    for (const [bucket, count] of Object.entries(analysis.remainderSummary.bucketCounts || {})) {
      if (!count) continue;
      lines.push(`| \`${bucket}\` | ${count} |`);
    }
    lines.push('');
  }
  lines.push('## Gap-sample (detalj)');
  lines.push('');
  lines.push(
    '| threadKey | mailbox | customerId | graphMsgId | truth | ingestion | dir | date | system | dup | bucket | fallback | why |'
  );
  lines.push(
    '|-----------|---------|------------|------------|-------|-----------|-----|------|--------|-----|--------|----------|-----|'
  );
  for (const row of analysis.details || []) {
    lines.push(
      `| \`${row.threadKey}\` | ${row.mailboxId || '—'} | ${row.customerIdPresent ? 'yes' : 'no'} | ${row.graphMessageIdPresent ? 'yes' : 'no'} | ${row.truthRowPresent ? 'yes' : 'no'} | ${row.ingestionMatched ? 'matched' : row.ingestionMatchPresent ? 'present' : 'no'} | ${row.direction} | ${row.latestDate?.slice(0, 10) || '—'} | ${row.isSystemScrap ? 'yes' : 'no'} | ${row.duplicate ? 'yes' : 'no'} | \`${row.primaryBucket}\` | ${row.canFallbackEnrich ? 'yes' : 'no'} | ${row.whyEnrichmentMissing} |`
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = await resolveOwnerToken();
  const analysis = await fetchGapAnalysis(token, args.detailLimit);
  if (args.saveJson) {
    const savePath = path.isAbsolute(args.saveJson)
      ? args.saveJson
      : path.join(REPO, args.saveJson);
    await fs.mkdir(path.dirname(savePath), { recursive: true });
    await fs.writeFile(savePath, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
    console.error(`Saved ${savePath}`);
  }
  if (args.json) {
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }
  const markdown = renderMarkdown(analysis);
  console.log(markdown);
  if (args.writeReport) {
    const reportPath = path.join(
      REPO,
      'docs/strategy/CCO-MAIL-ENRICHMENT-GAP-ANALYSIS-2026-06-01.md'
    );
    await fs.writeFile(reportPath, markdown, 'utf8');
    console.error(`Wrote ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
