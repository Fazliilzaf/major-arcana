'use strict';

/**
 * ORD-203 — avsändaradress per klinik.
 *
 * PROBLEMET. Uppmätt i prod 2026-09-04: det finns ingen Curatiio-gren i
 * sändvägen. `DEFAULT_GRAPH_FROM` är contact@hairtpclinic.com, varken
 * RESEND_FROM eller ARCANA_GRAPH_DEFAULT_SENDER är satt, och ingen kod läser
 * klinik. All post — även till Curatiios ögonlocks- och ortopedipatienter —
 * går ut från en hårklinik.
 *
 * VARFÖR MODULEN ÄNDÅ INTE ÄNDRAR NÅGOT I DAG. Att peka avsändaren mot
 * contact@curatiio.com innan brevlådan finns gör inte posten rätt — den gör
 * den OSKICKAD. Graph vägrar skicka som en adress appen inte får skicka som,
 * och allowlisten i prod innehåller enbart @hairtpclinic.com. Fel avsändare
 * kommer åtminstone fram; ingen avsändare gör det inte.
 *
 * Därför bär varje klinik en `aktiv`-flagga i facit. Är den false faller
 * modulen tillbaka på dagens beteende. Curatiio står på false tills brevlådan,
 * allowlisten och SPF/DKIM är på plats.
 *
 * Koden är alltså färdig och vilande. När IT är klart är det en rad i en
 * JSON-fil, inte ett utvecklingsjobb.
 */

const FACIT = require('../../config/avsandare-per-klinik.json');

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Adressdelen ur "Namn <a@b.se>" eller "a@b.se". */
function adressUr(from) {
  const raw = text(from);
  if (!raw) return '';
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim().toLowerCase();
}

/**
 * Adresser appen FÅR skicka som. Läses per anrop, inte vid uppstart, så att
 * prod-konfigurationen alltid vinner över det som råkade gälla vid deploy.
 *
 * Tom lista = ingen allowlist konfigurerad → ingen kontroll. Det är dagens
 * beteende i test och lokalt, och får inte tolkas som "allt är tillåtet" i
 * prod: där ÄR listan satt.
 */
function tillatnaAvsandare(env = process.env) {
  return text(env.ARCANA_GRAPH_SEND_ALLOWLIST)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function arTillaten(adress, env = process.env) {
  const lista = tillatnaAvsandare(env);
  if (!lista.length) return true;
  return lista.includes(adressUr(adress));
}

/**
 * Vilken avsändare kliniken ska använda.
 *
 * @param {string} tenantId
 * @param {object} [opts]
 * @param {string} [opts.standard]  Adressen som gäller när kliniken är vilande.
 * @returns {{avsandare:string, svaraTill:string, klinik:string, aktiv:boolean,
 *            skal:string}}
 *   `aktiv: false` betyder att `avsandare` är standardadressen, inte klinikens
 *   egen — och `skal` säger varför. Ett svar utan skäl går inte att felsöka.
 */
function avsandareForKlinik(tenantId, { standard = '', env = process.env } = {}) {
  const kliniker = FACIT.kliniker || {};
  const id = text(tenantId).toLowerCase();
  const fallback = kliniker[FACIT._standard] || {};
  const standardAdress = text(standard) || text(fallback.avsandare);

  const k = kliniker[id];
  if (!k) {
    return {
      avsandare: standardAdress,
      svaraTill: text(fallback.svaraTill) || standardAdress,
      klinik: text(fallback.namn),
      aktiv: false,
      skal: id ? `okänd klinik: ${id}` : 'ingen klinik angiven',
    };
  }

  if (k.aktiv !== true) {
    return {
      avsandare: standardAdress,
      svaraTill: text(fallback.svaraTill) || standardAdress,
      klinik: text(k.namn),
      aktiv: false,
      skal: `${text(k.namn)} är vilande — brevlådan är inte klar`,
    };
  }

  /**
   * SISTA KONTROLLEN, och den som gör skillnad i praktiken.
   *
   * Någon kan sätta aktiv: true innan brevlådan lagts i allowlisten. Då hade
   * posten slutat gå fram — tyst, eftersom Graph nekar och felet hamnar i en
   * logg ingen läser. Vi faller hellre tillbaka på en avsändare som fungerar
   * och säger varför.
   */
  if (!arTillaten(k.avsandare, env)) {
    return {
      avsandare: standardAdress,
      svaraTill: text(fallback.svaraTill) || standardAdress,
      klinik: text(k.namn),
      aktiv: false,
      skal: `${adressUr(k.avsandare)} saknas i ARCANA_GRAPH_SEND_ALLOWLIST`,
    };
  }

  return {
    avsandare: text(k.avsandare),
    svaraTill: text(k.svaraTill) || text(k.avsandare),
    klinik: text(k.namn),
    aktiv: true,
    skal: '',
  };
}

module.exports = {
  avsandareForKlinik,
  arTillaten,
  tillatnaAvsandare,
  adressUr,
  KLINIKER: FACIT.kliniker,
};
