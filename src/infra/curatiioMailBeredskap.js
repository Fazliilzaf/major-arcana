'use strict';

/**
 * ORD-204 — beredskapskontroll för att flytta curatiio.com till Microsoft 365.
 *
 * VARFÖR MODULEN FINNS. ORD-203 lämnade `aktiv: false` i facit med en lista på
 * vad som måste göras först. En lista i en JSON-fil är en förhoppning: den vet
 * inte om stegen faktiskt är gjorda. Den här modulen mäter dem.
 *
 * UPPMÄTT 2026-09-04 (dagens läge, källa till fixturerna i testerna):
 *
 *   curatiio.com  MX     10 mailcluster.loopia.se, 20 mail2.loopia.se
 *                 SPF    v=spf1 include:amazonses.com -all
 *                 DKIM   saknas
 *                 DMARC  saknas
 *                 TXT    MS=ms23140776   (verifieringstoken finns redan)
 *
 *   hairtpclinic.com MX  hairtpclinic-com.mail.protection.outlook.com
 *                    SPF v=spf1 include:spf.protection.outlook.com
 *                        include:spf.loopia.se include:_spf.google.com -all
 *
 * Posten för curatiio.com ligger alltså hos Loopia, inte hos Microsoft. Och
 * SPF säger `-all` med enbart Amazon SES — skickar Microsoft som @curatiio.com
 * i dag blir det hårt SPF-fel. Brevet hamnar i skräpposten eller avvisas.
 *
 * DEN VIKTIGASTE REGELN I FILEN: en kontroll som inte kunde köras räknas
 * ALDRIG som godkänd. Två av sex steg går bara att mäta där appens
 * Graph-nycklar finns. Kör man lokalt blir de `omatt`, och då är svaret på
 * "är vi klara?" nej — inte "ja, fyra av fyra mätbara gick bra". Ett skript
 * som säger OK för att det hoppade över ett steg är värre än inget skript.
 */

/** @typedef {'pass'|'fail'|'omatt'} Status */

const OUTLOOK_MX = 'mail.protection.outlook.com';
const OUTLOOK_SPF = 'spf.protection.outlook.com';

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function lista(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Pekar MX på Exchange Online?
 *
 * Kräver att ALLA poster gör det. En kvarglömd Loopia-post med högre
 * prioritet är inte "nästan klart" — det är en väg in som kringgår
 * Microsoft, och post som kommer in där syns aldrig i CCO.
 */
function bedomMx(poster) {
  const varden = lista(poster)
    .map((p) => text(typeof p === 'string' ? p : p && p.exchange).toLowerCase())
    .filter(Boolean);
  if (!varden.length) return { status: 'fail', skal: 'inga MX-poster' };
  const kvar = varden.filter((v) => !v.includes(OUTLOOK_MX));
  if (kvar.length) {
    return { status: 'fail', skal: `pekar inte på Microsoft: ${kvar.join(', ')}` };
  }
  return { status: 'pass', skal: '' };
}

/**
 * Tillåter SPF att Microsoft skickar i domänens namn?
 *
 * Måste kollas SEPARAT från MX. Det går utmärkt att flytta MX och glömma SPF,
 * och då går breven ut men landar i skräpposten — vilket är svårare att
 * upptäcka än att de inte går ut alls.
 */
function bedomSpf(txtPoster) {
  const rader = lista(txtPoster).map((p) => (Array.isArray(p) ? p.join('') : text(p)));
  const spf = rader.find((r) => /^v=spf1\b/i.test(text(r)));
  if (!spf) return { status: 'fail', skal: 'ingen SPF-post' };
  if (!spf.toLowerCase().includes(OUTLOOK_SPF)) {
    return { status: 'fail', skal: `SPF saknar ${OUTLOOK_SPF}: "${spf}"` };
  }
  return { status: 'pass', skal: '' };
}

/**
 * SPF för en domän som bara TAR EMOT — ett alias, inte en avsändare.
 *
 * ORD-204 §2. curatiio.se skickar ingenting; adresserna ska bli alias på
 * .com-lådan. Att kräva `include:spf.protection.outlook.com` där hade varit
 * fel krav: domänen behöver inte kunna skicka.
 *
 * Men SPF får inte lämnas orörd heller. Står `include:spf.loopia.se` kvar
 * efter flytten pekar den på en värd som inte längre hanterar domänen — en
 * kvarglömd fullmakt. För en ren mottagardomän är `v=spf1 -all` starkast:
 * ingen får skicka i domänens namn, vilket stoppar spoofing på en adress ni
 * ändå aldrig skickar från.
 *
 * Två godkända svar alltså: hård nekan, eller Microsoft inkluderad (om ni
 * vill kunna skicka därifrån senare). Allt annat är kvarglömt.
 *
 * REGELN VAR FÖR TVÄRSÄKER I FÖRSTA VERSIONEN, och rättelsen är värd att
 * skriva ut. Den underkände varje SPF som nämnde `loopia` — premissen var att
 * Loopia inte längre hanterar domänen efter flytten. Den premissen gäller
 * POSTEN. Den gäller inte WEBBEN: curatiio.se ligger på en WordPress-
 * installation hos Loopia, och `wordpress@curatiio.se` skickar formulärsvar
 * och lösenordsåterställningar den vägen. `include:spf.loopia.se` är där
 * ingen kvarglömd fullmakt utan en aktiv avsändare.
 *
 * SKILLNADEN GÅR INTE ATT SE I DNS. "Aktiv avsändare" och "kvarglömd post"
 * ser exakt likadana ut i en SPF-sträng — det är ett faktum om vad som körs
 * på domänen, inte om vad som står i zonen. Därför gissar funktionen inte:
 * en include som ska få stå kvar måste vara DEKLARERAD i facit, med skäl.
 * En odeklarerad include mot den gamla värden är fortfarande fail.
 *
 * Det gör tystnaden dyr på rätt sätt: den som vill behålla en include måste
 * skriva ner varför, och den som glömmer en får rött.
 *
 * @param {Array} txtPoster
 * @param {string} gammalVard
 * @param {string[]} tillatnaSandare  Deklarerade i config/mail-domaner.json.
 */
function bedomSpfAlias(txtPoster, gammalVard = 'loopia', tillatnaSandare = []) {
  const rader = lista(txtPoster).map((p) => (Array.isArray(p) ? p.join('') : text(p)));
  const spf = rader.find((r) => /^v=spf1\b/i.test(text(r)));
  if (!spf) return { status: 'fail', skal: 'ingen SPF-post' };

  const lag = spf.toLowerCase();
  const tillatna = lista(tillatnaSandare)
    .map((s) => text(s).toLowerCase())
    .filter(Boolean);

  // Mekanismvis, inte som en söksträng över hela raden. En delsträngsökning
  // hade låtit en deklarerad `spf.loopia.se` vitmåla en ODEKLARERAD
  // `mail.loopia.se` i samma post — båda innehåller ju "loopia".
  const includes = (lag.match(/include:[^\s]+/g) || []).map((m) => m.slice('include:'.length));
  const kvarglomda = includes.filter(
    (v) => v.includes(text(gammalVard).toLowerCase()) && !tillatna.includes(v)
  );
  if (kvarglomda.length) {
    return {
      status: 'fail',
      skal: `SPF pekar fortfarande på ${gammalVard} efter flytten, odeklarerat: ${kvarglomda.join(', ')} — i "${spf}"`,
    };
  }
  if (lag.includes(OUTLOOK_SPF)) return { status: 'pass', skal: '' };
  if (/^v=spf1\s+-all\s*$/i.test(spf.trim())) return { status: 'pass', skal: '' };

  return {
    status: 'varning',
    skal: `varken hård nekan eller Microsoft: "${spf}"`,
  };
}

/**
 * DKIM signerar breven med domänens egen nyckel.
 *
 * Inte lika hårt blockerande som SPF — Microsoft signerar annars med
 * tenantens onmicrosoft.com-domän, och DMARC kan gå igenom på SPF-linjering
 * ändå. Hair TP kör så i dag. Därför `varning` i stället för `fail`: det ska
 * synas, men det ska inte stoppa en flytt som annars är klar.
 */
function bedomDkim(selektorer) {
  const namn = lista(selektorer).map((s) => text(s).toLowerCase());
  const traffar = namn.filter((s) => s.includes('onmicrosoft.com'));
  if (traffar.length >= 2) return { status: 'pass', skal: '' };
  return {
    status: 'varning',
    skal: traffar.length
      ? `bara ${traffar.length} av 2 DKIM-selektorer pekar på Microsoft`
      : 'DKIM saknas (Microsoft signerar då med onmicrosoft.com — fungerar, men svagare)',
  };
}

function bedomDmarc(txtPoster) {
  const rader = lista(txtPoster).map((p) => (Array.isArray(p) ? p.join('') : text(p)));
  const d = rader.find((r) => /^v=DMARC1\b/i.test(text(r)));
  if (!d) return { status: 'varning', skal: 'DMARC saknas' };
  return { status: 'pass', skal: '' };
}

/**
 * Väger ihop kontrollerna till ett svar på "kan vi sätta aktiv: true?".
 *
 * @param {Array<{id:string, namn:string, status:Status|'varning', skal?:string}>} kontroller
 */
function bedomBeredskap(kontroller) {
  const k = lista(kontroller);
  if (!k.length) {
    return {
      klar: false,
      skal: ['inga kontroller kördes'],
      pass: 0,
      fail: 0,
      omatt: 0,
      varning: 0,
    };
  }

  const rakna = (s) => k.filter((x) => x.status === s).length;
  const skal = [];

  for (const x of k) {
    if (x.status === 'fail') skal.push(`${x.id} ${x.namn}: ${x.skal || 'underkänd'}`);
    // ETT OMÄTT STEG ÄR INTE ETT GODKÄNT STEG. Det här är hela poängen med
    // funktionen. Skriptet körs oftast lokalt, där två av sex kontroller inte
    // kan göras — och just då är frestelsen som störst att säga "allt jag
    // kunde mäta gick bra".
    if (x.status === 'omatt') skal.push(`${x.id} ${x.namn}: KUNDE INTE MÄTAS — ${x.skal || ''}`);
  }

  return {
    klar: skal.length === 0,
    skal,
    pass: rakna('pass'),
    fail: rakna('fail'),
    omatt: rakna('omatt'),
    varning: rakna('varning'),
  };
}

module.exports = {
  bedomMx,
  bedomSpf,
  bedomSpfAlias,
  bedomDkim,
  bedomDmarc,
  bedomBeredskap,
  OUTLOOK_MX,
  OUTLOOK_SPF,
};
