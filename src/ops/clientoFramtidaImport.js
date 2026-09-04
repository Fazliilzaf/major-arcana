'use strict';

const { utcTillKlinikTid } = require('./klinikTid');

/**
 * ORD-185 — de framtida Cliento-tiderna in i motorn, som block.
 *
 * VARFÖR DET MÅSTE GÖRAS. Clientos API kan bara läsa (`clientoApi.js` har
 * enbart GET). CCO kan aldrig skriva in en bokning i Cliento. Så länge båda
 * systemen delar ut tider vet Cliento ingenting om det CCO bokar — samma stol,
 * samma sköterska, två kunder. Motorn måste alltså känna till de tider som
 * redan är tagna innan den får ta emot en enda ny bokning.
 *
 * Mätt 2026-09-03: 381 framtida icke-avbokade bokningar, den sista 2027-05-15.
 *
 * SOM BLOCK, INTE SOM BOKNINGAR. Fram till cutovern är Cliento fortfarande den
 * riktiga journalen för de här tiderna. Importerade man dem som bokningar
 * skulle CCO påstå sig äga en tid den inte äger, och två system hade två
 * halvsanningar om samma besök. Ett block säger bara "den här tiden är
 * upptagen" — sant, och allt som behövs.
 *
 * Blocket kan dessutom strukturellt inte trigga bokningsflöden, ärenden eller
 * mail. Inte "är avstängt" utan "finns inte som väg". Med ORD-184:s
 * utskicksspärr blir det dubbelt skydd mot att 381 patienter får mail om tider
 * de bokade för månader sedan.
 *
 * IDEMPOTENT PÅ CLIENTOS BOKNINGS-ID. Importen måste kunna köras om — den ska
 * köras igen på morgonen för cutovern, för allt som bokats i Cliento sedan
 * förra körningen. En andra körning får inte ge dubbla block.
 */

const BLOCK_PREFIX = 'cliento-import';

function normText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Blockets id härleds ur Clientos id — därav idempotensen. */
function blockIdFor(clientoBookingId) {
  return `${BLOCK_PREFIX}-${normText(clientoBookingId)}`;
}

/**
 * Bygger ett kalenderblock ur en Cliento-post.
 *
 * @returns {{block: object}|{skip: string}}
 */
function byggBlock(bokning, mappning, { nu = Date.now() } = {}) {
  const id = normText(bokning?.bookingId);
  if (!id) return { skip: 'saknar bookingId' };

  const start = Date.parse(bokning?.startsAt || '');
  const slut = Date.parse(bokning?.endsAt || '');
  if (!Number.isFinite(start)) return { skip: 'saknar starttid' };
  if (start <= nu) return { skip: 'tiden har passerat' };
  if (!Number.isFinite(slut) || slut <= start) return { skip: 'saknar giltig sluttid' };

  const status = normText(bokning?.status).toLowerCase();
  if (status === 'cancelled') return { skip: 'avbokad' };
  if (normText(bokning?.source).includes('uat')) return { skip: 'uat-testdata' };

  const kalender = normText(bokning?.staffName);
  // ORD-195: hette `personkalendrar` förut. Tre av raderna är inte personer —
  // Transplantation och de två konsultationskolumnerna. Se _om_namnet i facit.
  const resurs = mappning?.kalendrar?.[kalender];
  const klinikbred = Boolean(mappning?.klinikbred?.[kalender]);
  if (!resurs && !klinikbred) {
    return { skip: `omappad kalender: ${kalender || '(tom)'}` };
  }

  // Klinikens väggklocka, inte UTC. Ett block på 14:00–20:00 UTC är
  // 16:00–22:00 svensk sommartid och hade blockerat fel sex timmar.
  const fran = utcTillKlinikTid(new Date(start).toISOString());
  const till = utcTillKlinikTid(new Date(slut).toISOString());
  if (!fran?.datum || !fran?.klockslag || !till?.klockslag) {
    return { skip: 'kunde inte omvandla till kliniktid' };
  }

  // Ett besök över midnatt skulle behöva två block. Det finns inga i datat
  // (längsta posten är 360 minuter), men att tyst klippa det vore att hitta på
  // en sluttid. Hellre rapporterat.
  if (till.datum !== fran.datum) return { skip: 'sträcker sig över midnatt' };

  const veckodag = new Date(`${fran.datum}T12:00:00.000Z`).getUTCDay();

  return {
    block: {
      blockId: blockIdFor(id),
      label: `Cliento: ${normText(bokning?.serviceLabel) || 'bokad tid'}`,
      blockType: 'cliento_import',
      // Tom lista = alla resurser. Se klinikbred-noteringen i facitfilen.
      resourceIds: resurs ? [resurs] : [],
      weekdays: [veckodag],
      startTime: fran.klockslag,
      endTime: till.klockslag,
      dateFrom: fran.datum,
      dateTo: fran.datum,
      active: true,
    },
  };
}

/**
 * Kör importen.
 *
 * TORRKÖRNING SOM STANDARD. `commit: true` krävs för att skriva. En import som
 * skriver av misstag är svår att ångra — 381 block utspridda i kalendern.
 */
async function importeraFramtidaClientoTider({
  bokningar = [],
  mappning,
  bookingEngineStore,
  commit = false,
  nu = Date.now(),
} = {}) {
  if (!mappning) throw new Error('mappning krävs.');
  if (commit && !bookingEngineStore?.upsertCalendarBlock) {
    throw new Error('bookingEngineStore med upsertCalendarBlock krävs för commit.');
  }

  const skapade = [];
  const hoppade = [];
  const skalRakning = new Map();

  for (const bokning of bokningar) {
    const resultat = byggBlock(bokning, mappning, { nu });
    if (resultat.skip) {
      hoppade.push({
        bookingId: normText(bokning?.bookingId),
        kalender: normText(bokning?.staffName),
        startsAt: normText(bokning?.startsAt),
        kund: normText(bokning?.customerName),
        skal: resultat.skip,
      });
      const nyckel = resultat.skip.split(':')[0];
      skalRakning.set(nyckel, (skalRakning.get(nyckel) || 0) + 1);
      continue;
    }
    if (commit) await bookingEngineStore.upsertCalendarBlock(resultat.block);
    skapade.push(resultat.block);
  }

  return {
    commit,
    skapade: skapade.length,
    hoppade: hoppade.length,
    block: skapade,
    hoppadeposter: hoppade,
    skalRakning: Object.fromEntries(skalRakning),
  };
}

module.exports = {
  BLOCK_PREFIX,
  blockIdFor,
  byggBlock,
  importeraFramtidaClientoTider,
};
