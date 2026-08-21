'use strict';

/**
 * Översättning mellan klinikens väggklocka och UTC.
 *
 * ── Varför den finns ────────────────────────────────────────────────────────
 *
 * Bokningsmotorn byggde tidpunkter så här:
 *
 *     const startsAt = `${dateOnly}T${timeLabel}:00.000Z`;
 *
 * Ett `Z` på slutet betyder UTC. En regel som säger `10:00` blev alltså
 * 10:00 UTC — vilket är **12:00 svensk sommartid** och 11:00 på vintern.
 *
 * Kalendern visar Stockholmstid. Personalen skrev 10:00 i schemat och såg
 * 12:00 i kalendern. Samma fel fanns i lunchblocket: 12:00–13:00 hamnade på
 * 14:00–15:00 och täckte alltså inte lunchen.
 *
 * Det värsta var inte förskjutningen utan att den **rörde sig**: samma regel
 * betydde 12:00 i juli och 11:00 i januari, utan att någon ändrat något.
 *
 * ── Hur omvandlingen går till ───────────────────────────────────────────────
 *
 * Node har ingen inbyggd "tolka den här väggklockan i den här tidszonen".
 * Vi gör det i två steg: gissa att tiden är UTC, mät hur långt fel gissningen
 * hamnade i Stockholm, och dra bort felet.
 *
 * Andra passet behövs vid sommartidsskiftena. Ligger gissningen på ena sidan
 * av skiftet och det korrigerade svaret på den andra, är offseten vi mätte
 * fel med en timme. Vi mäter om på det korrigerade svaret och använder den.
 */

const KLINIK_TIDSZON = 'Europe/Stockholm';

const formatterare = new Intl.DateTimeFormat('en-US', {
  timeZone: KLINIK_TIDSZON,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Hur många minuter Stockholm ligger före UTC vid ett givet ögonblick. */
function offsetMinuter(ogonblick) {
  const delar = {};
  for (const del of formatterare.formatToParts(ogonblick)) {
    if (del.type !== 'literal') delar[del.type] = del.value;
  }
  const somOmUtc = Date.UTC(
    Number(delar.year),
    Number(delar.month) - 1,
    Number(delar.day),
    // Vissa körningar ger '24' för midnatt med hour12:false.
    Number(delar.hour) % 24,
    Number(delar.minute),
    Number(delar.second)
  );
  return (somOmUtc - ogonblick.getTime()) / 60000;
}

/**
 * `'2026-08-24'` + `'10:00'` → ISO-strängen för 10:00 svensk tid.
 *
 * Returnerar null vid ogiltig indata i stället för ett Invalid Date som
 * fortplantar sig tyst genom slot-byggandet.
 */
function klinikTidTillUtc(datum, klockslag) {
  if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null;
  if (typeof klockslag !== 'string' || !/^\d{2}:\d{2}$/.test(klockslag)) return null;
  const gissning = new Date(`${datum}T${klockslag}:00.000Z`);
  if (!Number.isFinite(gissning.getTime())) return null;
  const forsta = new Date(gissning.getTime() - offsetMinuter(gissning) * 60000);
  const andra = new Date(gissning.getTime() - offsetMinuter(forsta) * 60000);
  return andra.toISOString();
}

/** ISO-tid → klinikens väggklocka. `{ datum: '2026-08-24', klockslag: '10:00' }` */
function utcTillKlinikTid(iso) {
  const ogonblick = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(ogonblick.getTime())) return null;
  const delar = {};
  for (const del of formatterare.formatToParts(ogonblick)) {
    if (del.type !== 'literal') delar[del.type] = del.value;
  }
  if (!delar.year || !delar.month || !delar.day) return null;
  const timme = String(Number(delar.hour) % 24).padStart(2, '0');
  return {
    datum: `${delar.year}-${delar.month}-${delar.day}`,
    klockslag: `${timme}:${delar.minute}`,
  };
}

module.exports = {
  KLINIK_TIDSZON,
  klinikTidTillUtc,
  utcTillKlinikTid,
  offsetMinuter,
};
