'use strict';

/**
 * Mäter hur stor del av ett behandlingsavtal som är Nordbros text, ordagrant.
 *
 * Bakgrunden: `contentSource` i document-inventory.json var ett enda ord —
 * "Nordbro" eller "klinik" — och båda var fel. Mätt 2026-09-01 bär varje avtal
 * 17–18 meningar som står teckenidentiskt i Nordbros .docx, och resten är
 * klinikens egen text: behandlingsbeskrivning, pris, avbokningsvillkor.
 *
 * offert_prp_hair stod som "klinik" och offert_tp som "Nordbro" — samma
 * juridiska kärna i båda. Ett halvår senare hade den som frågade "är den här
 * texten godkänd?" fått olika svar för identisk text.
 *
 * Därför räknas proveniensen fram ur filerna i stället för att skrivas för
 * hand. Ett påstående som ingen mäter slutar vara sant utan att någon märker det.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');
const NORDBRO_DIR = path.join(REPO_ROOT, 'docs', 'legal', 'nordbro');

const KALLOR = Object.freeze({
  2: '2025-12-03-behandlingsavtal-dhi-2-dagar.docx',
  7: '2025-12-03-behandlingsavtal-dhi-7-dagar.docx',
});

const norm = (s) =>
  s
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** Löptexten ur en .docx, utan externa beroenden. */
function docxText(fil) {
  const xml = execFileSync('unzip', ['-p', fil, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return norm(xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ''));
}

/**
 * Meningarna i dokumentets juridiska brödtext. Korta fragment räknas inte —
 * "Ja." eller "Se ovan." finns i vilken text som helst och skulle blåsa upp
 * träffkvoten utan att betyda något.
 */
function juridiskaMeningar(html) {
  const stycken = [...html.matchAll(/<p class="doc-text"[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
    norm(m[1].replace(/<[^>]+>/g, ''))
  );
  return stycken
    .flatMap((s) => s.split(/(?<=\.)\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 60);
}

/**
 * @param {string} htmlSokvag absolut sökväg till avtalets HTML
 * @returns {{kalla: string|null, dagar: number|null, ordagranna: number,
 *            totalt: number, andel: number}}
 */
function matProvenance(htmlSokvag) {
  const meningar = juridiskaMeningar(fs.readFileSync(htmlSokvag, 'utf8'));

  let bast = { kalla: null, dagar: null, ordagranna: 0 };
  for (const [dagar, fil] of Object.entries(KALLOR)) {
    const kallText = docxText(path.join(NORDBRO_DIR, fil));
    const traff = meningar.filter((m) => kallText.includes(m)).length;
    if (traff > bast.ordagranna) bast = { kalla: fil, dagar: Number(dagar), ordagranna: traff };
  }

  return {
    ...bast,
    totalt: meningar.length,
    andel: meningar.length ? Math.round((100 * bast.ordagranna) / meningar.length) : 0,
  };
}

module.exports = { matProvenance, juridiskaMeningar, docxText, KALLOR, NORDBRO_DIR, REPO_ROOT };
