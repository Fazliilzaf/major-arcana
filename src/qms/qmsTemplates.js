'use strict';

/**
 * Fördefinierade QMS-mallar för klinikverksamhet.
 *
 * Baserade på:
 * - IVO:s krav på systematiskt kvalitetsarbete (SOSFS 2011:9)
 * - Patientsäkerhetslagen (PSL 2010:659)
 * - GDPR-krav på dokumenterade processer
 * - Läkemedelsverkets krav (MDR om tillämpligt)
 * - Brandskydd + arbetsmiljö (AFS)
 */

const CHECKLIST_TEMPLATES = Object.freeze([
  {
    templateId: 'daily-hygiene',
    title: 'Daglig hygienkontroll',
    category: 'hygiene',
    frequency: 'daily',
    responsibleRole: 'STAFF',
    steps: [
      {
        title: 'Behandlingsrum desinficerat',
        description: 'Alla ytor avtorkade med ytdesinfektion',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Instrument steriliserade',
        description: 'Autoklavkörning genomförd och loggad',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Handhygien — dispensrar fyllda',
        description: 'Kontrollera handsprit och tvål',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Avfallshantering',
        description: 'Riskavfall i gul behållare, övrigt sorterat',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Skyddsutrustning tillgänglig',
        description: 'Handskar, munskydd, visir på plats',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Temperaturlogg kylskåp',
        description: 'Notera temperatur (2-8°C) för läkemedel',
        required: true,
        type: 'text',
      },
    ],
  },
  {
    templateId: 'weekly-equipment',
    title: 'Veckokontroll utrustning',
    category: 'equipment',
    frequency: 'weekly',
    responsibleRole: 'STAFF',
    steps: [
      {
        title: 'Mikroskop kalibrerat',
        description: 'Graft-counting mikroskop testat',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Implanteringspenor kontrollerade',
        description: 'DHI Choi-penor rena och funktionella',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'PRP-centrifug underhåll',
        description: 'Rengöring + rotationstest',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Dermapen nålar i lager',
        description: 'Minst 20 st i förråd',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Nödutrustning tillgänglig',
        description: 'Adrenalin, Epipen, blodtrycksmätare',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Defibrilator (HLR) testad',
        description: 'Batteri + elektrod-datum OK',
        required: false,
        type: 'checkbox',
      },
    ],
  },
  {
    templateId: 'monthly-medication',
    title: 'Månadskontroll läkemedel',
    category: 'medication',
    frequency: 'monthly',
    responsibleRole: 'OWNER',
    steps: [
      {
        title: 'Utgångsdatum kontrollerat',
        description: 'Alla läkemedel inom giltighetstid',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Lagersaldo stämmer',
        description: 'Fysiskt lager = system (Carbocain, Tribonat, etc.)',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Narkotikaprotokoll',
        description: 'Eventuell narkotikajournal stämmer',
        required: false,
        type: 'checkbox',
      },
      {
        title: 'Kylkedja obruten',
        description: 'Temperaturlogg senaste 30 dagar inom 2-8°C',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Beställningsbehov',
        description: 'Notera vad som behöver beställas',
        required: false,
        type: 'text',
      },
    ],
  },
  {
    templateId: 'quarterly-gdpr',
    title: 'Kvartalskontroll GDPR & dataskydd',
    category: 'gdpr',
    frequency: 'quarterly',
    responsibleRole: 'OWNER',
    steps: [
      {
        title: 'Åtkomstloggar granskade',
        description: 'Inga obehöriga åtkomster i audit log',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Personalens behörigheter aktuella',
        description: 'Avslutad personal borttagen',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Patientregister — GDPR-förfrågningar',
        description: 'Alla begärda utdrag/raderingar genomförda',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Backup verifierad',
        description: 'Journaldata-backup testad och återställbar',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'PUB-avtal aktuella',
        description: 'Alla leverantörer med PUB kontrollerade',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Art. 30 register uppdaterat',
        description: 'Behandlingsregister granskat',
        required: true,
        type: 'checkbox',
      },
    ],
  },
  {
    templateId: 'annual-fire-safety',
    title: 'Årlig brandskyddskontroll',
    category: 'safety',
    frequency: 'yearly',
    responsibleRole: 'OWNER',
    steps: [
      {
        title: 'Brandsläckare kontrollerad',
        description: 'Tryck OK, senaste service < 1 år',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Utrymningsplan uppdaterad',
        description: 'Plan synlig, vägar fria',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Brandvarnare testade',
        description: 'Alla larm signalerar vid test',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Personalutbildning genomförd',
        description: 'All personal utbildad i utrymning',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Nödbelysning fungerar',
        description: 'Testad vid strömavbrott',
        required: true,
        type: 'checkbox',
      },
    ],
  },
  {
    templateId: 'patient-safety-round',
    title: 'Patientsäkerhetsrond',
    category: 'patient_safety',
    frequency: 'monthly',
    responsibleRole: 'OWNER',
    steps: [
      {
        title: 'Inga öppna avvikelser > 30 dagar',
        description: 'Granska avvikelserapporter',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Samtycken signerade för pågående behandlingar',
        description: 'Stickprov 5 patienter',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Journaler signerade i tid',
        description: 'Inga osignerade > 7 dagar',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'ID-verifiering genomförd',
        description: 'Alla behandlade patienter ID-verifierade',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Komplikationsstatistik granskad',
        description: 'Inga trender utanför norm',
        required: true,
        type: 'checkbox',
      },
      {
        title: 'Patientklagomål hanterade',
        description: 'Alla klagomål besvarade < 48h',
        required: true,
        type: 'checkbox',
      },
    ],
  },
]);

const PROCESS_TEMPLATES = Object.freeze([
  {
    templateId: 'sop-consultation',
    title: 'Rutin: Konsultation',
    category: 'clinical',
    steps: [
      { title: 'Patient identifierad (ID + personnummer)', responsibleRole: 'STAFF' },
      { title: 'Hälsodeklaration genomgången och signerad', responsibleRole: 'STAFF' },
      { title: 'Behandlingsplan presenterad', responsibleRole: 'OWNER' },
      { title: 'Offert skickad + betänketid förklarad', responsibleRole: 'STAFF' },
      { title: 'Dokumentation i journal', responsibleRole: 'STAFF' },
    ],
  },
  {
    templateId: 'sop-transplant',
    title: 'Rutin: Hårtransplantation (FUE/DHI)',
    category: 'clinical',
    steps: [
      { title: 'Bekräfta signerat behandlingsavtal', responsibleRole: 'STAFF' },
      { title: 'Bekräfta signerad friskförsäkran (operationsdagen)', responsibleRole: 'STAFF' },
      { title: 'Verifiera legitimation + foton (före)', responsibleRole: 'STAFF' },
      { title: 'Pre-op kontroll (blodtryck, alkohol 48h, mediciner)', responsibleRole: 'STAFF' },
      { title: 'Markering av mottagarområde', responsibleRole: 'OWNER' },
      { title: 'Bedövning administrerad + dokumenterad', responsibleRole: 'OWNER' },
      { title: 'Ingrepp genomfört — graftantal loggat', responsibleRole: 'OWNER' },
      { title: 'Efterinstruktioner givna + medicinlista', responsibleRole: 'STAFF' },
      { title: 'Journal signerad samma dag', responsibleRole: 'OWNER' },
      { title: 'Uppföljning schemalagd (4 mån)', responsibleRole: 'STAFF' },
    ],
  },
  {
    templateId: 'sop-deviation-handling',
    title: 'Rutin: Avvikelsehantering',
    category: 'quality',
    steps: [
      { title: 'Avvikelse rapporterad i ledningssystem', responsibleRole: 'STAFF' },
      { title: 'Allvarlighetsgrad bedömd (low/medium/high/critical)', responsibleRole: 'OWNER' },
      { title: 'Omedelbar åtgärd vid behov', responsibleRole: 'OWNER' },
      { title: 'Rotorsaksanalys genomförd', responsibleRole: 'OWNER' },
      { title: 'CAPA upprättad med tidsplan', responsibleRole: 'OWNER' },
      { title: 'Åtgärd genomförd + verifierad', responsibleRole: 'OWNER' },
      { title: 'Avvikelse stängd + effekt utvärderad', responsibleRole: 'OWNER' },
    ],
  },
  {
    templateId: 'sop-gdpr-request',
    title: 'Rutin: GDPR-begäran (registerutdrag/radering)',
    category: 'gdpr',
    steps: [
      { title: 'Verifiera patientens identitet', responsibleRole: 'OWNER' },
      { title: 'Klassificera begäran (utdrag/radering/rättelse)', responsibleRole: 'OWNER' },
      { title: 'Samla data från alla system (Arcana + ev. backup)', responsibleRole: 'OWNER' },
      { title: 'Granska om undantag gäller (PDL 10 år)', responsibleRole: 'OWNER' },
      { title: 'Leverera/genomför inom 30 dagar', responsibleRole: 'OWNER' },
      { title: 'Logga i audit trail', responsibleRole: 'OWNER' },
    ],
  },
]);

const DOCUMENT_CATEGORIES = Object.freeze([
  'procedure',
  'policy',
  'instruction',
  'form',
  'protocol',
  'report',
  'agreement',
  'risk_assessment',
]);

const DEVIATION_CATEGORIES = Object.freeze([
  'patient_safety',
  'medication',
  'hygiene',
  'equipment',
  'process',
  'gdpr',
  'communication',
  'documentation',
  'other',
]);

module.exports = {
  CHECKLIST_TEMPLATES,
  PROCESS_TEMPLATES,
  DOCUMENT_CATEGORIES,
  DEVIATION_CATEGORIES,
};
