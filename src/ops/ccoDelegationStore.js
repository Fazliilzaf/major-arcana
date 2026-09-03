'use strict';

/**
 * Delegeringar — vem får göra vad, utfärdat av vem, hur länge.
 *
 * VARFÖR DEN FINNS (2026-09-03):
 * Personalportalen visade en rubrik "Mina delegeringsdokument" som i själva
 * verket renderade den statiska dokumentkatalogen — samma lista för alla, med
 * en hårdkodad "Aktiv"-pill på varje rad, plus tre statiska demorader med
 * påhittade giltighetsdatum. En sköterska kunde tro att hon var täckt för ett
 * moment hon inte var täckt för. Det är den enda kulissen i portalen som kan
 * leda till en klinisk handling, inte bara till en felaktig siffra.
 *
 * En delegering är ett juridiskt dokument. Den har en namngiven mottagare, ett
 * namngivet moment, en utfärdande läkare och ett utfärdandedatum. Slutdatum är
 * frivilligt — klinikens egna delegeringar gäller tills vidare.
 * Allt annat är en mall.
 *
 * REGLER SOM KODEN HÅLLER:
 *   - giltighet räknas, den lagras aldrig. Ett fält som säger "aktiv" blir
 *     osant med tiden; en beräkning kan inte bli det.
 *   - en återkallad delegering kan aldrig bli giltig igen.
 *   - saknas slutdatum GÄLLER delegeringen tills vidare. Det är klinikens
 *     normalfall — pappren i SharePoint säger "gäller från och med", inget
 *     till. Återkallande är då enda sättet den upphör.
 *   - inga seed-poster. Filen är tom tills kliniken fyller den. Hellre en tom
 *     lista än en påhittad.
 */

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const STATUS = Object.freeze({
  GILTIG: 'giltig',
  UTGANGEN: 'utgangen',
  ATERKALLAD: 'aterkallad',
  // Utan slutdatum. GILTIGT läge, inte ett fel.
  //
  // Jag byggde först tvärtom: saknat slutdatum stämplades som ogiltigt, med
  // motiveringen att tvetydighet ska falla åt det säkra hållet. Sedan läste
  // jag klinikens riktiga delegeringar i SharePoint. De säger "Beslutet gäller
  // från och med 25-02-14" — bara från, inget till. Ett slutdatum saknas inte
  // av misstag; delegeringen gäller tills den återkallas.
  //
  // Ägarbeslut 2026-09-03. Det var alltså inte tvetydighet utan ett läge jag
  // inte kände till, och den gamla logiken hade visat varenda befintlig
  // delegering som ogiltig.
  TILLS_VIDARE: 'tills_vidare',
  // Utfärdad men börjar gälla senare. Egen status, för "har inte börjat" och
  // "har upphört" är två olika saker för den som ska veta om hen får utföra
  // momentet — och en sammanslagning skulle dölja ett felskrivet startdatum.
  EJ_BORJAT: 'ej_borjat',
});

/** De lägen där personen faktiskt får utföra uppgiften. */
const GILTIGA_LAGEN = Object.freeze([STATUS.GILTIG, STATUS.TILLS_VIDARE]);

/** Hur nära utgång något ska flaggas som "går ut snart". */
const SNART_DAGAR = 30;

/**
 * Delegering gäller ENBART transplantation.
 *
 * Ägarbeslut 2026-09-03: "vi behöver delegering enbart på transplantationer."
 * PRP, microneedling, estetik och Curatiios ingrepp omfattas alltså inte —
 * de har andra former av ansvar, och en delegering utfärdad för dem skulle
 * påstå något kliniken inte menar.
 *
 * Listan är en vitlista, inte en svartlista. Ett nytt område måste läggas till
 * medvetet; skrivfel och gissningar avvisas i stället för att släppas igenom.
 */
const TILLATNA_OMRADEN = Object.freeze(['transplantation']);

/**
 * Vad en delegering får gälla.
 *
 * KÄLLA — och den är mätt, inte gissad:
 * SharePoint, Ledning → 1. Kunddokument - KVALITETSSÄKRA → 99. Fazlis mapp →
 * "NY Ordination – Lokalbedövning vid hår-, skägg-, ögonbryns- och
 * ärrtransplantation.docx", ändrad 2026-05-18. Ordinerande läkare Arya Emami.
 * Ägaren bekräftade 2026-09-03 att det är den gällande versionen.
 *
 * Ordinationen säger själv (§6): "Administrering: Endast legitimerad
 * sjuksköterska med delegering."
 *
 * VARFÖR DET ÄR EN LÅST LISTA:
 * Den tidigare delegeringen i SharePoint ("Deligerning Amanda Sandberg.pdf",
 * 2025-02-14) namnger XYLOCAIN (lidokain). Ordinationen från maj 2026 säger
 * CARBOCAIN (mepivakain) plus Tribonat som buffert. Läkemedlet har alltså
 * bytts. En sköterska som går på det gamla papperet är delegerad för något
 * annat än det som faktiskt ges — och en fritextruta hade låtit exakt det
 * felet skrivas in i systemet igen.
 *
 * Xylocain saknas därför medvetet nedan. Försöker någon utfärda en delegering
 * för det avvisas den.
 *
 * Byts ordinationen ut ska den här listan uppdateras i samma veva — och
 * tests/ops/delegeringVisasAldrigSomGiltig.test.js håller antalet synligt så
 * att en ändring märks i granskningen.
 */
const DELEGERBARA_LAKEMEDEL = Object.freeze([
  Object.freeze({
    id: 'carbocain-adrenalin',
    namn: 'Carbocain® med Adrenalin (mepivakain + adrenalin)',
    styrka: '20 mg/ml + 5 μg/ml',
    atc: 'N01BB03',
    roll: 'anestetikum',
  }),
  Object.freeze({
    id: 'marcain-adrenalin',
    namn: 'Marcain® med Adrenalin (bupivakain + adrenalin)',
    styrka: '5 mg/ml + 5 μg/ml',
    atc: 'N01BB01',
    roll: 'anestetikum',
  }),
  Object.freeze({
    id: 'adrenalin',
    namn: 'Adrenalin (spädd i NaCl)',
    styrka: '1 mg/ml',
    atc: 'C01CA24',
    roll: 'blodningskontroll',
  }),
  Object.freeze({
    id: 'tribonat',
    namn: 'Tribonat (buffertlösning)',
    styrka: '1 ml per 10 ml bedövningslösning',
    atc: null,
    roll: 'buffert',
  }),
  Object.freeze({
    id: 'natriumklorid',
    namn: 'Natriumklorid (NaCl)',
    styrka: '9 mg/ml',
    atc: 'B05BB01',
    roll: 'spadning',
  }),
]);

const LAKEMEDEL_IDN = Object.freeze(DELEGERBARA_LAKEMEDEL.map((l) => l.id));

function slaUppLakemedel(id) {
  return DELEGERBARA_LAKEMEDEL.find((l) => l.id === normalizeText(id)) || null;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

async function readJson(filePath, fallbackValue) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallbackValue;
    throw error;
  }
}

async function writeJsonAtomic(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmpPath, filePath);
}

function emptyState() {
  const ts = nowIso();
  return { version: 1, createdAt: ts, updatedAt: ts, delegations: [] };
}

function parseDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Giltighet RÄKNAS ut, den läses inte från en lagrad flagga.
 *
 * Ordningen är medveten: återkallande slår allt, sedan startdatumet, sedan
 * slutdatumet. Saknas slutdatum gäller den tills vidare.
 */
function bedomStatus(delegation, nu = new Date()) {
  if (delegation.revokedAt) return STATUS.ATERKALLAD;

  // Startdatumet prövas FÖRE slutdatumet. En delegering som ännu inte börjat
  // gälla är inte giltig, oavsett om den har ett slutdatum eller gäller tills
  // vidare — och den ordningen är lätt att råka kasta om.
  const start = parseDate(delegation.issuedAt);
  if (start && start > nu) return STATUS.EJ_BORJAT;

  const slut = parseDate(delegation.validUntil);
  if (!slut) return STATUS.TILLS_VIDARE;

  return slut >= nu ? STATUS.GILTIG : STATUS.UTGANGEN;
}

function dagarKvar(delegation, nu = new Date()) {
  const slut = parseDate(delegation.validUntil);
  if (!slut) return null;
  return Math.floor((slut - nu) / 86400000);
}

/** Vyn en klient får se. Status och dagar kvar räknas vid varje läsning. */
function tillVy(delegation, nu = new Date()) {
  const status = bedomStatus(delegation, nu);
  const kvar = dagarKvar(delegation, nu);
  return {
    id: delegation.id,
    tenantId: delegation.tenantId,
    holderUserId: delegation.holderUserId,
    holderName: delegation.holderName || null,
    // Äldre poster saknar fältet. De skapades innan begränsningen fanns och
    // gällde redan då transplantation — men de påstår det inte själva, så de
    // märks som okänt i stället för att antas.
    treatmentArea: delegation.treatmentArea || null,
    medicationId: delegation.medicationId || null,
    medicationStrength: delegation.medicationStrength || null,
    medicationAtc: delegation.medicationAtc || null,
    task: delegation.task,
    issuedByUserId: delegation.issuedByUserId,
    issuedByName: delegation.issuedByName || null,
    issuedAt: delegation.issuedAt,
    validUntil: delegation.validUntil || null,
    revokedAt: delegation.revokedAt || null,
    revokedReason: delegation.revokedReason || null,
    status,
    isValid: GILTIGA_LAGEN.includes(status),
    daysLeft: kvar,
    // Gäller den tills vidare finns inget att gå ut — flaggan är då alltid false.
    expiresSoon: status === STATUS.GILTIG && kvar !== null && kvar <= SNART_DAGAR,
  };
}

async function createCcoDelegationStore({ filePath, auditLog = null } = {}) {
  if (!normalizeText(filePath)) {
    throw new Error('filePath krävs för ccoDelegationStore.');
  }

  let state = await readJson(filePath, emptyState());
  state = {
    ...emptyState(),
    ...(state && typeof state === 'object' ? state : {}),
    delegations: Array.isArray(state?.delegations) ? state.delegations : [],
  };

  async function save() {
    state.updatedAt = nowIso();
    await writeJsonAtomic(filePath, state);
  }

  async function logga(action, payload) {
    if (!auditLog?.append) return;
    try {
      await auditLog.append({ action, ...payload });
    } catch {
      // Revisionsloggen får aldrig fälla en delegering som annars är korrekt.
    }
  }

  /** Utfärda en delegering. Endast läkare/ägare — RBAC sitter i routern. */
  async function issueDelegation(input = {}) {
    const tenantId = normalizeText(input.tenantId);
    const holderUserId = normalizeText(input.holderUserId);
    const medicationId = normalizeText(input.medicationId);
    const issuedByUserId = normalizeText(input.issuedByUserId);
    const validUntil = normalizeText(input.validUntil);
    // Standardvärdet är transplantation eftersom det i dag är det enda
    // tillåtna området. Fältet finns ändå explicit, så att posten bär sitt
    // eget omfång och en framtida utvidgning inte omtolkar gamla rader.
    const treatmentArea = normalizeText(input.treatmentArea) || 'transplantation';

    if (!tenantId) throw badRequest('tenantId krävs.');
    if (!holderUserId) throw badRequest('holderUserId krävs — en delegering gäller en person.');
    if (!medicationId) {
      throw badRequest(
        `medicationId krävs. Tillåtna: ${LAKEMEDEL_IDN.join(', ')}. ` +
          'En delegering gäller ett namngivet läkemedel ur den gällande ordinationen.'
      );
    }
    const lakemedel = slaUppLakemedel(medicationId);
    if (!lakemedel) {
      throw badRequest(
        `"${medicationId}" finns inte i den gällande ordinationen. Tillåtna: ` +
          `${LAKEMEDEL_IDN.join(', ')}. Ordinationen av 2026-05-18 bytte från Xylocain ` +
          'till Carbocain — en delegering för ett utbytt läkemedel täcker inte det som ges.'
      );
    }
    if (!issuedByUserId) throw badRequest('issuedByUserId krävs — någon utfärdar den.');
    // validUntil är FRIVILLIGT. Klinikens delegeringar gäller tills vidare
    // (SharePoint, "Deligerning Amanda Sandberg.pdf": "Beslutet gäller från och
    // med 25-02-14", inget slutdatum). Anges ett datum måste det däremot vara
    // ett riktigt datum — ett skrivfel ska inte tyst bli "tills vidare".
    if (validUntil && !parseDate(validUntil)) {
      throw badRequest('validUntil är inget giltigt datum.');
    }
    if (!TILLATNA_OMRADEN.includes(treatmentArea)) {
      throw badRequest(
        `Delegering gäller enbart ${TILLATNA_OMRADEN.join(', ')} — "${treatmentArea}" är inte ` +
          'tillåtet. Ägarbeslut 2026-09-03. Att låta ett område till omfattas är ett kliniskt ' +
          'beslut, inte en kodändring.'
      );
    }

    // En läkare får inte delegera till sig själv — då är det ingen delegering.
    if (holderUserId === issuedByUserId) {
      throw badRequest('En delegering kan inte utfärdas till den som utfärdar den.');
    }

    const delegation = {
      id: crypto.randomUUID(),
      tenantId,
      holderUserId,
      holderName: normalizeText(input.holderName) || null,
      treatmentArea,
      medicationId: lakemedel.id,
      // Etiketten härleds ur katalogen i stället för att skrivas in. Då kan
      // texten aldrig glida ifrån ordinationen den bygger på.
      task: lakemedel.namn,
      medicationStrength: lakemedel.styrka,
      medicationAtc: lakemedel.atc,
      issuedByUserId,
      issuedByName: normalizeText(input.issuedByName) || null,
      issuedAt: normalizeText(input.issuedAt) || nowIso(),
      validUntil: validUntil || null,
      revokedAt: null,
      revokedReason: null,
      createdAt: nowIso(),
    };

    state.delegations.push(delegation);
    await save();
    await logga('delegation.issued', {
      delegationId: delegation.id,
      tenantId,
      holderUserId,
      issuedByUserId,
      medicationId: lakemedel.id,
      treatmentArea,
      validUntil,
    });
    return tillVy(delegation);
  }

  /**
   * Återkalla. Terminalt — en återkallad delegering går aldrig tillbaka.
   * Posten raderas inte: att den funnits är en händelse som inträffat.
   */
  async function revokeDelegation({ id, revokedByUserId, reason } = {}) {
    const delegationId = normalizeText(id);
    if (!delegationId) throw badRequest('id krävs.');

    const delegation = state.delegations.find((d) => d.id === delegationId);
    if (!delegation) return null;
    if (delegation.revokedAt) return tillVy(delegation);

    delegation.revokedAt = nowIso();
    delegation.revokedReason = normalizeText(reason) || null;
    delegation.revokedByUserId = normalizeText(revokedByUserId) || null;
    await save();
    await logga('delegation.revoked', {
      delegationId,
      tenantId: delegation.tenantId,
      holderUserId: delegation.holderUserId,
      revokedByUserId: delegation.revokedByUserId,
      reason: delegation.revokedReason,
    });
    return tillVy(delegation);
  }

  function filtrera({ tenantId = null, holderUserId = null, issuedByUserId = null } = {}) {
    return state.delegations.filter((d) => {
      if (tenantId && d.tenantId !== tenantId) return false;
      if (holderUserId && d.holderUserId !== holderUserId) return false;
      if (issuedByUserId && d.issuedByUserId !== issuedByUserId) return false;
      return true;
    });
  }

  /** Sköterskans vy: vad får jag göra. */
  function listForHolder({ tenantId, holderUserId, nu = new Date() } = {}) {
    return filtrera({ tenantId, holderUserId })
      .map((d) => tillVy(d, nu))
      .sort((a, b) => String(a.task).localeCompare(String(b.task), 'sv'));
  }

  /** Läkarens vy: vad har jag delegerat och till vem. */
  function listIssuedBy({ tenantId, issuedByUserId, nu = new Date() } = {}) {
    return filtrera({ tenantId, issuedByUserId })
      .map((d) => tillVy(d, nu))
      .sort((a, b) => String(b.issuedAt).localeCompare(String(a.issuedAt)));
  }

  /** Ägarens vy: hela kliniken, med det som går ut snart överst. */
  function listForTenant({ tenantId, nu = new Date() } = {}) {
    const alla = filtrera({ tenantId }).map((d) => tillVy(d, nu));
    const rang = (v) => (v.expiresSoon ? 0 : v.isValid ? 1 : 2);
    return alla.sort((a, b) => {
      const r = rang(a) - rang(b);
      if (r !== 0) return r;
      return (a.daysLeft ?? 1e9) - (b.daysLeft ?? 1e9);
    });
  }

  function summary({ tenantId, nu = new Date() } = {}) {
    const alla = filtrera({ tenantId }).map((d) => tillVy(d, nu));
    return {
      total: alla.length,
      valid: alla.filter((v) => v.isValid).length,
      expiresSoon: alla.filter((v) => v.expiresSoon).length,
      expired: alla.filter((v) => v.status === STATUS.UTGANGEN).length,
      revoked: alla.filter((v) => v.status === STATUS.ATERKALLAD).length,
      openEnded: alla.filter((v) => v.status === STATUS.TILLS_VIDARE).length,
      notStarted: alla.filter((v) => v.status === STATUS.EJ_BORJAT).length,
    };
  }

  return {
    issueDelegation,
    revokeDelegation,
    listForHolder,
    listIssuedBy,
    listForTenant,
    summary,
  };
}

module.exports = {
  createCcoDelegationStore,
  bedomStatus,
  tillVy,
  STATUS,
  GILTIGA_LAGEN,
  DELEGERBARA_LAKEMEDEL,
  LAKEMEDEL_IDN,
  slaUppLakemedel,
  SNART_DAGAR,
  TILLATNA_OMRADEN,
};
