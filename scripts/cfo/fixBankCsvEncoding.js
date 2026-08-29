'use strict';

/**
 * Rensar trasigt double-encoded UTF-8 (Windows-1252/Latin-1 tolkat som UTF-8)
 * från inklistrade bankutdrag och skriver ut ren CSV.
 *
 * Användning:
 *   cat tmp/bank-raw.txt | node scripts/cfo/fixBankCsvEncoding.js > tmp/bank-clean.csv
 */

const fs = require('node:fs');

function fixEncoding(text) {
  return text
    .replace(/‚àí/g, '-') // minus
    .replace(/‚Äì/g, '-') // en dash
    .replace(/‚Äî/g, '-') // em dash
    .replace(/‚Äù/g, '"') // höger citationstecken
    .replace(/‚Äú/g, '"') // vänster citationstecken
    .replace(/¬†/g, ' ') // non-breaking space
    .replace(/√ñ/g, 'Ö') // Ö
    .replace(/√∂/g, 'ö') // ö
    .replace(/√§/g, 'ä') // ä
    .replace(/√•/g, 'å') // å
    .replace(/√Ö/g, 'Å') // Å
    .replace(/√ú/g, 'ü') // ü
    .replace(/√ü/g, 'ÿ')
    .replace(/√©/g, 'é')
    .replace(/√®/g, 'è')
    .replace(/√†/g, 'à')
    .replace(/√§/g, 'ä')
    .replace(/√¶/g, 'æ')
    .replace(/√∏/g, 'ø')
    .replace(/√∫/g, 'ú')
    .replace(/√≥/g, 'ó')
    .replace(/√≠/g, 'í')
    .replace(/√°/g, 'á')
    .replace(/√±/g, 'ñ')
    .replace(/√ß/g, 'ß')
    .replace(/‚Äö/g, ',')
    .replace(/‚Äú/g, '"')
    .replace(/‚Äù/g, '"')
    .replace(/‚Äô/g, "'")
    .replace(/‚Äò/g, "'")
    .replace(/‚Ä¶/g, '...')
    .replace(/¬∞/g, '°')
    .replace(/¬∑/g, '·')
    .replace(/¬™/g, 'ª')
    .replace(/¬∫/g, 'º')
    .replace(/√Ç/g, 'Â')
    .replace(/√É/g, 'Ã')
    .replace(/√Ñ/g, 'Ä')
    .replace(/√Ö/g, 'Å')
    .replace(/√Ü/g, 'Æ')
    .replace(/√á/g, 'Ç')
    .replace(/√à/g, 'È')
    .replace(/√â/g, 'É')
    .replace(/√ä/g, 'Ê')
    .replace(/√ã/g, 'Ë')
    .replace(/√å/g, 'Ì')
    .replace(/√ç/g, 'Í')
    .replace(/√é/g, 'Î')
    .replace(/√è/g, 'Ï')
    .replace(/√ê/g, 'Ð')
    .replace(/√ë/g, 'Ñ')
    .replace(/√í/g, 'Ó')
    .replace(/√ì/g, 'Ò')
    .replace(/√î/g, 'Ô')
    .replace(/√ï/g, 'Õ')
    .replace(/√ñ/g, 'Ö')
    .replace(/√ó/g, '×')
    .replace(/√ò/g, 'Ø')
    .replace(/√ô/g, 'Û')
    .replace(/√ö/g, 'Ú')
    .replace(/√õ/g, 'Ù')
    .replace(/√ú/g, 'Ü')
    .replace(/√ù/g, 'Ý')
    .replace(/√û/g, 'Þ')
    .replace(/√ü/g, 'ß');
}

function main() {
  const raw = fs.readFileSync(0, 'utf8');
  const clean = fixEncoding(raw);
  // Normalisera radbrytningar
  const lines = clean.split(/\r?\n/);
  // Se till att rubriken är rätt
  if (!/^datum/i.test(lines[0] || '')) {
    lines.unshift('Datum,Beskrivning,Belopp');
  }
  // Rensa tomma rader
  const out = lines.filter((l) => l.trim()).join('\n') + '\n';
  process.stdout.write(out);
}

main();
