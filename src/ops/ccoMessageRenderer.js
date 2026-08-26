// src/ops/ccoMessageRenderer.js
// Renderar en mall-revision + variabler till ett KLART mailmeddelande.
//
// Används av eftervårds-vägen (ccoAftercareSchedulerStore) och framtida vägar.
// Den bygger INTE send-posten (ccoSendActionStore) — den store:n tar emot ett
// färdigt meddelande (subject/text/html) och ska inte behöva veta hur mallen
// byggdes.
//
// Konvention: camelCase-variabler ({{firstName}}, {{treatment}}), samma som
// registrets befintliga ~20 mallar. prepareResponseDrafts migreras till samma
// renderare (dess snake_case-hårdkodning tas bort).
//
// VAL: när en variabel saknar värde STANNAR vi (throw) i stället för att fylla
// med tom text eller skicka rå {{namn}}. En patient ska aldrig se ofyllda
// {{namn}}-platshållare — tom text vore dataförlust och sämre för mottagaren.
// Den som skickar får därmed veta exakt vilken variabel som saknas.

'use strict';

const DEFAULT_LANG = 'sv';

function extractVariables(text) {
  const out = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

function getValue(vars, name) {
  // Saknad nyckel, null/undefined OCH tom sträng räknas alla som "saknar värde"
  // så att substitute()/firstMissingVariable() enhetligt kan stoppa en
  // ofylld variabel i stället för att släppa igenom rå {{namn}} eller tom text.
  if (!vars || !Object.prototype.hasOwnProperty.call(vars, name)) return '';
  const v = vars[name];
  if (v === undefined || v === null) return '';
  return typeof v === 'string' ? v.trim() : String(v);
}

// returns first missing variable name, or null.
function firstMissingVariable(text, vars) {
  for (const name of extractVariables(text)) {
    const v = getValue(vars, name);
    if (v === '') return name;
  }
  return null;
}

function substitute(text, vars, { missing = 'throw' } = {}) {
  return String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, name) => {
    const v = getValue(vars, name);
    if (v === '') {
      if (missing === 'throw') {
        const err = new Error(`Variabel saknar värde: {{${name}}}`);
        err.code = 'TEMPLATE_MISSING_VARIABLE';
        err.variable = name;
        throw err;
      }
      return '';
    }
    return v;
  });
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Rendera en snapshot ({subject, body, lang}) + variabler → {subject, text, html, lang}.
// Throws TEMPLATE_MISSING_VARIABLE om en variabel saknas (se VAL ovan).
function renderMessage(snapshot, vars, opts = {}) {
  const missing = opts.missing || 'throw';
  const subject = substitute(snapshot.subject, vars, { missing });
  const text = substitute(snapshot.body, vars, { missing });
  const html = text
    .split('\n')
    .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<br/>'))
    .join('');
  return { subject, text, html, lang: snapshot.lang || DEFAULT_LANG };
}

module.exports = {
  DEFAULT_LANG,
  extractVariables,
  firstMissingVariable,
  substitute,
  renderMessage,
  escapeHtml,
};
