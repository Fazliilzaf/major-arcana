#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');

const { evaluateGoldSetFile } = require('../src/risk/goldSet');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      out[key] = 'true';
      continue;
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

function formatUtcStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    '-',
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
  ].join('');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputFile = normalizeText(args.input) || path.join(process.cwd(), 'docs', 'risk', 'gold-set-v1.json');
  const outputDir = normalizeText(args.outDir) || path.join(process.cwd(), 'data', 'reports', 'risk');
  const outputFile = normalizeText(args.output);
  const modifier = Number.isFinite(Number(args.modifier)) ? Number(args.modifier) : 0;

  const evaluated = await evaluateGoldSetFile({
    filePath: inputFile,
    tenantRiskModifier: modifier,
  });

  await fs.mkdir(outputDir, { recursive: true });
  const fileName =
    outputFile ||
    `RiskGoldSetReport_${evaluated.dataset.version || 'unknown'}_${formatUtcStamp(new Date())}.json`;
  const outputPath = path.isAbsolute(fileName) ? fileName : path.join(outputDir, fileName);

  const payload = {
    generatedAt: new Date().toISOString(),
    inputFile,
    ...evaluated,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stdout.write(`✅ Risk gold-set-rapport sparad: ${outputPath}\n`);
  process.stdout.write(
    `   Band accuracy: ${payload.report?.totals?.bandAccuracyPercent || 0}% (${payload.report?.totals?.correctBand || 0}/${payload.report?.totals?.cases || 0})\n`
  );
  process.stdout.write(
    `   Level accuracy: ${payload.report?.totals?.levelAccuracyPercent || 0}% (${payload.report?.totals?.correctLevel || 0}/${payload.report?.totals?.withExpectedLevel || 0})\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
