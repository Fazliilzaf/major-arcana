'use strict';

const fs = require('node:fs');
const path = require('node:path');

/* ─── ORD-221 · inventering av varje väg ut till Microsoft Graph ─────────────
 *
 * VARFÖR FILEN FINNS. Det här är TREDJE gången samma hål hittas.
 *
 *   ORD-184  la `bedomKundutskick` i transactionalMailer och smsConnector, och
 *            jag beskrev det för ägaren som "hård spärr mot kundutskick".
 *   ORD-197  mätte att kundposten inte gick den vägen alls — server.js
 *            injicerar resendMailer rakt in i ccoSendActionStore, förbi
 *            spärren. Hål nummer två.
 *   ORD-221  mätte den tredje: TOLV anropsställen går direkt på
 *            graphSendConnector, och exakt ETT av dem (transactionalMailer)
 *            ligger bakom spärren.
 *
 * Mönstret är inte slarv utan struktur. Att grinda "alla anropsställen" kräver
 * att den som bygger hittar dem alla, och att nästa person hittar det
 * trettonde. Det går inte att lita på.
 *
 * DÄRFÖR TVÅ LAGER, och den här filen är det ena.
 *
 *   1. KÖRTID, fail-closed: spärren sitter i sendComposeDocument inne i
 *      microsoftGraphSendConnector — den enda punkt som sendReply,
 *      sendNewMessage och sendComposeDocument alla passerar. Ett nytt
 *      anropsställe är blockerat tills någon aktivt märker det.
 *
 *   2. STATISKT, den här filen: räkna upp anropsställena i källkoden och
 *      jämför mot facit. Lager 1 kan inte mätas av testerna, eftersom nästan
 *      alla tester matar in en attrapp i stället för den riktiga connectorn —
 *      en attrapp har ingen spärr. Ett nytt anropsställe som glömmer
 *      deklarera sin mottagargrupp syns alltså inte i sviten. Det syns här.
 *
 * VARFÖR INTE BARA LAGER 1. För att felmeddelandet kommer i produktion, vid
 * första utskicket, och då är frågan "varför gick inte brevet?" i stället för
 * "vem ska det här brevet till?". Lager 2 ställer den frågan vid bygget.
 *
 * VARFÖR INTE BARA LAGER 2. För att en statisk kontroll kan kringgås av allt
 * som inte ser ut som ett anrop — en metod som slås upp dynamiskt, en connector
 * som skickas vidare. Lager 1 bryr sig inte om hur anropet såg ut.
 * ────────────────────────────────────────────────────────────────────────── */

/** Metoderna som når Graphs sändnings-API. Allt annat på connectorn läser. */
const SANDMETODER = Object.freeze(['sendComposeDocument', 'sendNewMessage', 'sendReply']);

/**
 * Filer som INTE är anropsställen, med skäl. Listan är kort med flit — varje
 * rad är ett undantag från mätningen och måste kunna försvaras.
 */
const UNDANTAGNA_FILER = Object.freeze({
  'src/infra/microsoftGraphSendConnector.js':
    'Connectorn själv. sendReply och sendNewMessage bygger båda ett compose-dokument ' +
    'och anropar sendComposeDocument internt — det är stryppunkten, inte en väg förbi den.',
});

/** Alla .js-filer under en katalog, rekursivt. */
function jsFiler(dir, ut = []) {
  let poster;
  try {
    poster = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return ut;
  }
  for (const post of poster) {
    const p = path.join(dir, post.name);
    if (post.isDirectory()) {
      if (post.name === 'node_modules' || post.name.startsWith('.')) continue;
      jsFiler(p, ut);
    } else if (post.name.endsWith('.js')) {
      ut.push(p);
    }
  }
  return ut;
}

/**
 * Argumenttexten till ett anrop, från `(` till dess matchande `)`.
 *
 * BALANSERAD RÄKNING, inte regex. Ett `sendComposeDocument({ composeDocument:
 * { recipients: { to: [...] } } })` har fyra nivåer nästlade klamrar, och ett
 * mönster som stannar på första `}` läser bara halva anropet — då ser en
 * deklarerad audience längre ner ut som en saknad.
 *
 * Strängar och kommentarer hoppas över, annars räknar en apostrof i en svensk
 * kommentar ("patientens") upp balansen och resten av filen blir "inuti en
 * sträng".
 */
function argumentText(kalla, parenIndex) {
  let djup = 0;
  let i = parenIndex;
  while (i < kalla.length) {
    const c = kalla[i];
    const nasta = kalla[i + 1];

    if (c === '/' && nasta === '/') {
      const slut = kalla.indexOf('\n', i);
      i = slut === -1 ? kalla.length : slut;
      continue;
    }
    if (c === '/' && nasta === '*') {
      const slut = kalla.indexOf('*/', i + 2);
      i = slut === -1 ? kalla.length : slut + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const citat = c;
      i += 1;
      while (i < kalla.length) {
        if (kalla[i] === '\\') i += 2;
        else if (kalla[i] === citat) {
          i += 1;
          break;
        } else i += 1;
      }
      continue;
    }
    if (c === '(') djup += 1;
    else if (c === ')') {
      djup -= 1;
      if (djup === 0) return kalla.slice(parenIndex + 1, i);
    }
    i += 1;
  }
  return '';
}

/**
 * Alla anropsställen av Graphs sändmetoder under `rot`.
 *
 * Kravet på `(` direkt efter metodnamnet är avsiktligt: det utesluter
 * `typeof connector.sendNewMessage !== 'function'`, som förekommer på nio
 * ställen och är en tillgänglighetskontroll, inte ett utskick. Utan det kravet
 * rapporterar mätningen dubbelt så många anropsställen som det finns.
 */
function hittaAnropsstallen(rot) {
  const filer = [...jsFiler(path.join(rot, 'src'))];
  const serverJs = path.join(rot, 'server.js');
  if (fs.existsSync(serverJs)) filer.push(serverJs);

  const monster = new RegExp(`[\\w$)\\]]\\s*\\.\\s*(${SANDMETODER.join('|')})\\s*\\(`, 'g');
  const funna = [];
  const raknare = new Map();

  for (const fil of filer.sort()) {
    const relativ = path.relative(rot, fil).split(path.sep).join('/');
    if (UNDANTAGNA_FILER[relativ]) continue;
    const kalla = fs.readFileSync(fil, 'utf8');
    monster.lastIndex = 0;
    let m;
    while ((m = monster.exec(kalla)) !== null) {
      const parenIndex = kalla.indexOf('(', m.index + m[0].length - 1);
      const argument = argumentText(kalla, parenIndex);
      // Två anrop av SAMMA metod i samma fil (ccoBookingStaffNotify har det:
      // bekräftad och avbokad) måste kunna skiljas åt i facit. Radnumret duger
      // inte — det flyttar sig när någon redigerar ovanför. Ordningen i filen
      // gör det.
      const bas = `${relativ}:${m[1]}`;
      const ordning = (raknare.get(bas) || 0) + 1;
      raknare.set(bas, ordning);
      funna.push({
        fil: relativ,
        rad: kalla.slice(0, m.index).split('\n').length,
        metod: m[1],
        ordning,
        audienceDeklaration: lasAudience(argument),
      });
    }
  }
  return funna;
}

/**
 * Vad anropet deklarerar som mottagargrupp, som rå text — `'staff'`, eller ett
 * variabelnamn, eller null när ingenting deklareras.
 *
 * ATT BARA SVARA JA/NEJ RÄCKER INTE. En kundväg som skickar `audience:
 * 'staff'` deklarerar visserligen något, men den ljuger, och en boolesk
 * mätning ser ingen skillnad på den och en ärlig personalnotis. Därför läses
 * värdet ut och jämförs mot facit.
 */
function lasAudience(argument) {
  const m = /\baudience\s*:\s*([^,}\n]+)/.exec(argument);
  return m ? m[1].trim() : null;
}

/** `fil:metod:ordning` — nyckeln facit använder. */
function nyckel(a) {
  return `${a.fil}:${a.metod}:${a.ordning}`;
}

/**
 * Jämför uppmätta anropsställen mot facit.
 *
 * TRE SORTERS AVVIKELSE, och de betyder olika saker:
 *
 *   odeklarerade  — ett anropsställe finns i koden men inte i facit. Det är
 *                   det farliga fallet: en ny sändväg som ingen tagit ställning
 *                   till. Fail-closed betyder att den är blockerad i körtid,
 *                   men den ska också stoppa bygget.
 *   forsvunna     — facit beskriver ett anropsställe som inte finns längre.
 *                   Ofarligt men gör facit osant, och ett osant facit slutar
 *                   man läsa.
 *   felDeklarerade— koden och facit säger olika saker om mottagargruppen. Det
 *                   inkluderar att koden inte deklarerar något alls, och —
 *                   viktigare — att koden säger 'staff' där facit säger
 *                   'customer'. Den senare är hur en kundväg skulle kunna
 *                   smyga sig förbi körtidsspärren.
 */
function jamforMotFacit(anropsstallen, facit) {
  const deklarerade = new Map(
    (facit?.anropsstallen || []).map((rad) => [`${rad.fil}:${rad.metod}:${rad.ordning}`, rad])
  );
  const sedda = new Set();

  const odeklarerade = [];
  const felDeklarerade = [];

  for (const a of anropsstallen) {
    const k = nyckel(a);
    sedda.add(k);
    const d = deklarerade.get(k);
    if (!d) {
      odeklarerade.push(`${a.fil}:${a.rad} (${a.metod} #${a.ordning})`);
      continue;
    }
    if (a.audienceDeklaration !== d.deklaration) {
      felDeklarerade.push(
        `${a.fil}:${a.rad} (${a.metod} #${a.ordning}) — koden säger ` +
          `${a.audienceDeklaration === null ? 'ingenting' : a.audienceDeklaration}, ` +
          `facit säger ${d.deklaration === null ? 'ingenting' : d.deklaration}`
      );
    }
  }

  const forsvunna = [...deklarerade.keys()].filter((k) => !sedda.has(k));

  return { odeklarerade, forsvunna, felDeklarerade };
}

module.exports = {
  SANDMETODER,
  UNDANTAGNA_FILER,
  argumentText,
  hittaAnropsstallen,
  jamforMotFacit,
};
