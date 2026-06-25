#!/usr/bin/env node
/**
 * BOOKOFF sektion D — genererar owner-workshop registry-mapping (JSON + MD).
 * Parallellt scope: Curatiio + utökade Hair TP-samtycken. Blockerar INTE Hair TP cutover.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const CONSENT_PATH = path.join(ROOT, 'migration/meridiq/consent-catalog.json');
const CATALOG_PATH = path.join(ROOT, 'src/ops/hairtp-document-types.catalog.json');
const BUNDLE_PATH = path.join(
  ROOT,
  'public/major-arcana-preview/data/hairtp-document-content-bundle.json'
);
const OUT_JSON = path.join(
  ROOT,
  'docs/implementation/patient-documents-live/patient-document-d-section-registry.json'
);
const OUT_MD = path.join(
  ROOT,
  'docs/implementation/patient-documents-live/D-SECTION-OWNER-WORKSHOP-REGISTRY-MAPPING-2026-06-25.md'
);
const OUT_DIFF = path.join(
  ROOT,
  'docs/implementation/patient-documents-live/diffs/D-SECTION-REGISTRY-MAPPING-2026-06-25.json'
);

/** Canonical workshop groups — BOOKOFF sektion D rader. */
const WORKSHOP_GROUPS = [
  {
    id: 'd_hyalase_swe',
    bookoffLabel: 'Hyalase SWE',
    brand: 'Hair TP Clinic',
    meridiqApiIds: [152991],
    bundleRegistryId: null,
    bundleNote: 'bundle v7 — registryId null (buildConsentDoc utan id)',
    recommended: {
      action: 'NEW_REGISTRY',
      proposedRegistryId: 'hyalase_info',
      mapToExistingRegistryId: null,
      journeyStep: '3-4',
      uiPlacement: '§2 Hälsa · medicinskt tillägg',
      cutoverPhase: 'post_hair_tp_optional',
    },
    hairTpCutoverBlocking: false,
    ownerQuestion:
      'Ska Hyalase få egen rad i 36-katalogen (`hyalase_info`) eller ligga kvar som bundle-tillägg utan live-route?',
    ownerOptions: [
      'A — Ny registryId `hyalase_info` i katalog + final-demo steg 3–4 (rekommenderat om behandling erbjuds)',
      'B — Behåll bundle-only tills Curatiio/estetik-cutover',
      'C — Mappa till befintlig `microneedling_info` (ej rekommenderat — annat scope)',
    ],
    ownerDecision: 'APPROVED',
    ownerSelectedOption: 'B',
    ownerSignedAt: '2026-06-25',
    ccoLiveRequired: false,
    implementationGate: 'post_hair_tp_optional',
    recommendedOption: 'B',
    recommendedRationale:
      'Hyalase erbjuds sällan som separat Hair TP-spår — bundle räcker tills estetik-cutover.',
  },
  {
    id: 'd_botulinum_swe_eng',
    bookoffLabel: 'Botulinumtoxin SWE/ENG',
    brand: 'Hair TP Clinic (+ Curatiio-kontext)',
    meridiqApiIds: [152988, 152981],
    bundleRegistryId: 'botulinum_info',
    bundleNote: 'Finns i bundle men EJ i hairtp-document-types.catalog (36)',
    recommended: {
      action: 'PROMOTE_BUNDLE_ID',
      proposedRegistryId: 'botulinum_info',
      mapToExistingRegistryId: null,
      journeyStep: '3-4',
      uiPlacement: '§2 Hälsa · steg 3–4 (supplementary)',
      cutoverPhase: 'post_hair_tp_optional',
    },
    hairTpCutoverBlocking: false,
    ownerQuestion:
      'Ska `botulinum_info` promoted till 36-katalogen? Gäller vid Hair TP-estetik — Curatiio-flöde kräver brand-gate.',
    ownerOptions: [
      'A — Promote `botulinum_info` → rad #37 i katalog + D/L/V (IMPLEMENTATION A16)',
      'B — Bundle-only tills Curatiio-cutover med separat brand-filter',
      'C — Ny Curatiio-specifik registryId (brand-isolation)',
    ],
    ownerDecision: 'APPROVED',
    ownerSelectedOption: 'B',
    ownerSignedAt: '2026-06-25',
    ccoLiveRequired: false,
    implementationGate: 'post_hair_tp_optional',
    recommendedOption: 'B',
    recommendedRationale:
      'Behåll `botulinum_info` i bundle v7 — promote till katalog först vid aktiv Hair TP-estetik eller Curatiio brand-gate.',
  },
  {
    id: 'd_fillers_swe',
    bookoffLabel: 'Fillers SWE (+ ENG)',
    brand: 'Curatiio',
    meridiqApiIds: [152990, 152984],
    agreementApiIds: [170950],
    bundleRegistryId: null,
    recommended: {
      action: 'NEW_REGISTRY_CURATII',
      proposedRegistryId: 'fillers_info',
      agreementRegistryId: 'offert_fillers',
      mapToExistingRegistryId: null,
      journeyStep: '3-7',
      uiPlacement: 'Curatiio §2 Hälsa + §4 Juridik',
      cutoverPhase: 'curatiio_only',
    },
    hairTpCutoverBlocking: false,
    ownerQuestion:
      'Fillers — eget Curatiio-flöde med info + avtal (170950 tom letterText → Nordbro)?',
    ownerOptions: [
      'A — Ny info `fillers_info` + avtal `offert_fillers` (Curatiio cutover)',
      'B — Endast Meridiq-modal tills legal review klar',
      'C — Ej erbjud — arkivera consent i CCO',
    ],
    ownerDecision: 'APPROVED',
    ownerSelectedOption: 'B',
    ownerSignedAt: '2026-06-25',
    ccoLiveRequired: false,
    implementationGate: 'curatiio_only_after_legal',
    recommendedOption: 'B',
    recommendedRationale:
      'Curatiio-only — avtal 170950 saknar letterText; Meridiq-modal tills Nordbro-PDF importerad.',
  },
  {
    id: 'd_peeling_ipl_plasma',
    bookoffLabel: 'Kemisk peeling / IPL / Plasma Pen',
    brand: 'Hair TP Clinic',
    meridiqApiIds: [152992, 152982, 152993, 152999, 153000, 153001],
    bundleRegistryId: null,
    recommended: {
      action: 'DEFER_OR_GROUP',
      proposedRegistryId: 'esthetic_consent_library',
      mapToExistingRegistryId: null,
      journeyStep: '3-4',
      uiPlacement: 'Dolt bibliotek — aktiveras per behandling',
      cutoverPhase: 'post_hair_tp_optional',
    },
    hairTpCutoverBlocking: false,
    ownerQuestion:
      'Erbjuds peeling/IPL/Plasma Pen på Hair TP idag? Om ja: en registry per behandling eller gemensamt bibliotek?',
    ownerOptions: [
      'A — Ej aktivt på Hair TP → DEFER (behåll Meridiq-arkiv, ingen CCO-live)',
      'B — Per behandling: `peeling_info`, `ipl_info`, `plasma_pen_info`',
      'C — En samlad `esthetic_consent_library` med under-typer',
    ],
    ownerDecision: 'APPROVED',
    ownerSelectedOption: 'A',
    ownerSignedAt: '2026-06-25',
    ccoLiveRequired: false,
    implementationGate: 'defer_meridiq_archive',
    recommendedOption: 'A',
    recommendedRationale:
      'Peeling/IPL/Plasma Pen ej aktivt erbjudande på Hair TP idag — DEFER, behåll Meridiq-arkiv.',
  },
  {
    id: 'd_ortoped_prp_prf',
    bookoffLabel: 'Ortopedisk PRP/PRF (+ HA)',
    brand: 'Curatiio',
    meridiqApiIds: [153039, 153040],
    agreementApiIds: [170941, 170942, 170943],
    bundleRegistryId: null,
    recommended: {
      action: 'NEW_REGISTRY_CURATII',
      proposedRegistryId: 'ortoped_prp_info',
      agreementRegistryId: 'offert_ortoped_prp',
      mapToExistingRegistryId: null,
      journeyStep: '3-7',
      uiPlacement: 'Curatiio ortopedi-flöde',
      cutoverPhase: 'curatiio_only',
    },
    hairTpCutoverBlocking: false,
    ownerQuestion: 'Ortopediska samtycken har tom letterText — Nordbro/Insatt-PDF krävs före live.',
    ownerOptions: [
      'A — Curatiio cutover: info + avtal-rader efter legal import',
      'B — Paus tills Nordbro-PDF importerad (19/39 consents saknar letterText)',
      'C — Behåll endast Meridiq read-only',
    ],
    ownerDecision: 'APPROVED',
    ownerSelectedOption: 'B',
    ownerSignedAt: '2026-06-25',
    ccoLiveRequired: false,
    implementationGate: 'curatiio_only_after_nordbro_pdf',
    recommendedOption: 'B',
    recommendedRationale:
      'Ortopediska avtal + info saknar letterText — paus tills Nordbro/Insatt-PDF (19/39 tomma).',
  },
  {
    id: 'd_curatiio_avtal_botox_fillers_bleph',
    bookoffLabel: 'Behandlingsavtal Botox / Fillers / Ögonlock',
    brand: 'Curatiio',
    meridiqApiIds: [],
    agreementApiIds: [170949, 170950, 170954],
    bundleRegistryId: null,
    recommended: {
      action: 'NEW_REGISTRY_CURATII',
      proposedRegistryId: 'offert_curatiio_estetik',
      mapToExistingRegistryId: null,
      journeyStep: '5-7',
      uiPlacement: 'Curatiio §3 Behandling + §4 Juridik',
      cutoverPhase: 'curatiio_only',
    },
    hairTpCutoverBlocking: false,
    ownerQuestion:
      'Separata avtal per behandling (Botox 170949, Fillers 170950, Ögonlock 170954) eller en Curatiio-estetik-offert?',
    ownerOptions: [
      'A — Tre registryId: `offert_botox`, `offert_fillers`, `offert_bleph`',
      'B — En `offert_curatiio_estetik` med behandlingsväljare',
      'C — Legal review först — ingen registry förrän PDF facit finns',
    ],
    ownerDecision: 'APPROVED',
    ownerSelectedOption: 'C',
    ownerSignedAt: '2026-06-25',
    ccoLiveRequired: false,
    implementationGate: 'curatiio_only_after_legal',
    recommendedOption: 'C',
    recommendedRationale:
      'Legal review först — separata avtal per behandling när PDF-facit finns (Botox/Fillers/Ögonlock).',
  },
];

const WORKSHOP_AGENDA_REL =
  'docs/implementation/patient-documents-live/D-SECTION-OWNER-WORKSHOP-AGENDA-2026-06-25.md';
const WORKSHOP_RECORD_REL =
  'docs/implementation/patient-documents-live/D-SECTION-OWNER-WORKSHOP-RECORD-2026-06-25.md';
const OWNER_DECISION_REL =
  'docs/implementation/patient-documents-live/D-SECTION-OWNER-DECISION-2026-06-25.md';

/** Consents already wired to 36-katalogen (referens — ej sektion D). */
const IN_36_CONSENT_MAP = {
  170917: 'offert_tp',
  170945: 'offert_prp_hair',
  170944: 'offert_prp_skin',
  170946: 'offert_microneedling',
  170947: 'offert_prf',
  170948: 'offert_profilo',
  154369: 'samtycke_bokning_2d',
  170955: 'samtycke_angerratt',
  152994: 'prp_hair_info_sve',
  152987: 'prp_hair_info_eng',
  152998: 'microneedling_info',
  152997: 'microneedling_info',
};

const BUNDLE_SUPPLEMENTARY = {
  botulinum_info: [152988, 152981],
};

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function consentById(catalog, id) {
  return catalog.consents.find((c) => c.apiId === id) || null;
}

function enrichConsent(c) {
  if (!c) return null;
  const hasLetterText = String(c.letterText || '').trim().length > 50;
  return {
    apiId: c.apiId,
    title: c.title,
    brand: c.brand,
    version: c.version,
    hasLetterText,
    letterTextChars: String(c.letterText || '').trim().length,
    in36RegistryId: IN_36_CONSENT_MAP[c.apiId] || null,
  };
}

function buildGroup(group, consentCatalog) {
  const allIds = [...(group.meridiqApiIds || []), ...(group.agreementApiIds || [])];
  const consents = allIds
    .map((id) => enrichConsent(consentById(consentCatalog, id)))
    .filter(Boolean);
  const missingIds = allIds.filter((id) => !consentById(consentCatalog, id));
  return {
    ...group,
    consents,
    missingMeridiqIds: missingIds,
    contentReady: consents.every((c) => c.hasLetterText || c.in36RegistryId),
    legalReviewRequired: consents.some((c) => !c.hasLetterText),
  };
}

function buildUnmappedInventory(consentCatalog, catalog36) {
  const registrySet = new Set(catalog36.types.map((t) => t.id));
  const coveredIds = new Set([
    ...Object.keys(IN_36_CONSENT_MAP).map(Number),
    ...WORKSHOP_GROUPS.flatMap((g) => [...(g.meridiqApiIds || []), ...(g.agreementApiIds || [])]),
    ...Object.values(BUNDLE_SUPPLEMENTARY).flat(),
  ]);

  const unmapped = [];
  for (const c of consentCatalog.consents) {
    if (coveredIds.has(c.apiId)) continue;
    if (IN_36_CONSENT_MAP[c.apiId]) continue;
    unmapped.push({
      ...enrichConsent(c),
      suggestedAction: c.brand === 'Curatiio' ? 'CURATII_CUTOVER' : 'REVIEW_FOR_D_SECTION',
    });
  }

  const curatiioAgreementVariants = [170951, 170952, 170953];
  for (const id of curatiioAgreementVariants) {
    const c = consentById(consentCatalog, id);
    if (!c) continue;
    unmapped.push({
      ...enrichConsent(c),
      suggestedAction: 'CURATII_SKIN_VARIANT',
      note: 'Hair TP-titel med Curatiio-suffix — brand review',
    });
  }

  const profhiloInfo = [153002, 153003];
  for (const id of profhiloInfo) {
    const c = consentById(consentCatalog, id);
    if (!c) continue;
    unmapped.push({
      ...enrichConsent(c),
      suggestedAction: 'MAP_TO_EXISTING',
      mapToExistingRegistryId: 'offert_profilo',
      note: 'Patientinfo-samtycke — avtal redan offert_profilo (170948)',
    });
  }

  const fatDissolving = [152995, 152996];
  for (const id of fatDissolving) {
    const c = consentById(consentCatalog, id);
    if (!c) continue;
    unmapped.push({
      ...enrichConsent(c),
      suggestedAction: 'DEFER',
      note: 'Fettuplösande — ej i 36-katalog; aktivera vid behandlingsbeslut',
    });
  }

  return unmapped.sort((a, b) => a.apiId - b.apiId);
}

function buildMarkdown(summary, groups) {
  const lines = [
    '# Sektion D — Owner-workshop · registry-mapping',
    '',
    `**Genererad:** ${summary.generatedAt}`,
    '**Scope:** Meridiq-samtycken utanför 36-katalogen · [`BOOKOFF-CHECKLIST.md`](./BOOKOFF-CHECKLIST.md) sektion D',
    '**Blockerar Hair TP cutover:** **NEJ** — alla 6 grupper är `hairTpCutoverBlocking: false`',
    '',
    '## TL;DR för owner',
    '',
    '| # | Grupp | Rekommendation | Owner-beslut |',
    '|---|-------|----------------|--------------|',
  ];

  groups.forEach((g, i) => {
    const sel =
      g.ownerDecision === 'APPROVED' && g.ownerSelectedOption
        ? ` **${g.ownerSelectedOption}**`
        : g.recommendedOption
          ? ` _(rekomm: ${g.recommendedOption})_`
          : '';
    lines.push(
      `| ${i + 1} | ${g.bookoffLabel} | ${g.recommended.action} → \`${g.recommended.proposedRegistryId || '—'}\` | **${g.ownerDecision}**${sel} |`
    );
  });

  lines.push(
    '',
    '## Hair TP cutover — vad kan vänta?',
    '',
    'Följande krävs **inte** för Hair TP steg 3–9 cutover (36/36 D·L·V klart):',
    '',
    '- Hyalase / Botox som supplementary bundle',
    '- Curatiio-avtal (Botox, Fillers, Ögonlock, Ortopedi)',
    '- Peeling / IPL / Plasma Pen (såvida inte aktivt erbjudande på Hair TP)',
    '',
    '**Blockerar Curatiio-cutover:** tom `letterText` på 19 av 39 Meridiq-avtal — Nordbro/Insatt-PDF import.',
    '',
    '---',
    '',
    '## Workshop-frågor per grupp',
    ''
  );

  for (const g of groups) {
    lines.push(`### ${g.bookoffLabel}`, '');
    lines.push(`- **Brand:** ${g.brand}`);
    lines.push(
      `- **Meridiq:** ${(g.meridiqApiIds || []).concat(g.agreementApiIds || []).join(', ') || '—'}`
    );
    if (g.bundleRegistryId) lines.push(`- **Bundle idag:** \`${g.bundleRegistryId}\``);
    lines.push(`- **Rekommenderad action:** \`${g.recommended.action}\``);
    if (g.recommended.proposedRegistryId) {
      lines.push(`- **Föreslagen registryId:** \`${g.recommended.proposedRegistryId}\``);
    }
    lines.push(`- **Fråga:** ${g.ownerQuestion}`);
    lines.push('- **Alternativ:**');
    for (const opt of g.ownerOptions) lines.push(`  - ${opt}`);
    if (g.recommendedOption) {
      lines.push(
        `- **Rekommenderat val (pre-workshop):** **${g.recommendedOption}** — ${g.recommendedRationale}`
      );
    }
    if (g.ownerDecision === 'APPROVED') {
      lines.push(
        `- **Owner-beslut:** \`APPROVED\` · val **${g.ownerSelectedOption}** · ${g.ownerSignedAt} · CCO-live: ${g.ccoLiveRequired ? 'JA' : 'NEJ'} · gate: \`${g.implementationGate}\``
      );
    } else {
      lines.push(`- **Owner-beslut:** \`${g.ownerDecision}\` _(fyll i efter workshop)_`);
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '## Maskinläsbar facit',
    '',
    `- JSON: \`patient-document-d-section-registry.json\``,
    `- Agenda: \`${WORKSHOP_AGENDA_REL}\``,
    `- Sign-off: \`${WORKSHOP_RECORD_REL}\``,
    `- Owner-beslut: \`${OWNER_DECISION_REL}\``,
    `- Verify: \`npm run verify:patient-doc-d-section-registry\``,
    `- Rådata: \`diffs/D-SECTION-REGISTRY-MAPPING-2026-06-25.json\``,
    '',
    '## Källor',
    '',
    '- `migration/meridiq/consent-catalog.json` (39 samtycken)',
    '- `src/ops/hairtp-document-types.catalog.json` (36 typer)',
    '- `public/major-arcana-preview/data/hairtp-document-content-bundle.json`',
    '- `docs/strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md` § bundle v7 vs katalog',
    '',
    '*source: new (owner-workshop registry-mapping)*'
  );

  return `${lines.join('\n')}\n`;
}

function main() {
  const consentCatalog = readJson(CONSENT_PATH);
  const catalog36 = readJson(CATALOG_PATH);
  const bundle = readJson(BUNDLE_PATH);

  const groups = WORKSHOP_GROUPS.map((g) => buildGroup(g, consentCatalog));
  const unmappedInventory = buildUnmappedInventory(consentCatalog, catalog36);

  const summary = {
    generatedAt: new Date().toISOString(),
    script: 'build:patient-doc-d-section-registry',
    scope: 'BOOKOFF sektion D — utökade Meridiq-samtycken',
    nonBlockingForHairTpCutover: true,
    workshopStatus: groups.every((g) => g.ownerDecision === 'APPROVED')
      ? 'SIGNED_OFF'
      : 'AGENDA_READY',
    workshopAgenda: WORKSHOP_AGENDA_REL,
    workshopRecord: WORKSHOP_RECORD_REL,
    ownerDecisionDoc: OWNER_DECISION_REL,
    recommendedOptionsDocumented: groups.filter((g) => g.recommendedOption).length,
    approvedOwnerDecisions: groups.filter((g) => g.ownerDecision === 'APPROVED').length,
    consentCatalogCount: consentCatalog.count,
    catalog36Count: catalog36.types.length,
    workshopGroupCount: groups.length,
    pendingOwnerDecisions: groups.filter((g) => g.ownerDecision === 'PENDING').length,
    hairTpBlockingGroups: groups.filter((g) => g.hairTpCutoverBlocking).length,
    groupsWithLetterText: groups.filter((g) => g.contentReady).length,
    groupsNeedingLegalReview: groups.filter((g) => g.legalReviewRequired).length,
    in36ConsentMappings: IN_36_CONSENT_MAP,
    bundleSupplementary: BUNDLE_SUPPLEMENTARY,
    bundleVersion: bundle.version,
  };

  const registry = {
    version: 1,
    updatedAt: new Date().toISOString().slice(0, 10),
    ...summary,
    groups,
    unmappedInventory,
  };

  fs.mkdirSync(path.dirname(OUT_DIFF), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUT_DIFF, `${JSON.stringify(registry, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OUT_MD, buildMarkdown(summary, groups), 'utf8');

  console.log('✓ Sektion D registry-mapping');
  console.log(`  grupper: ${groups.length} · pending owner: ${summary.pendingOwnerDecisions}`);
  console.log(`  Hair TP-blockerande: ${summary.hairTpBlockingGroups}`);
  console.log(`  → ${OUT_JSON}`);
  console.log(`  → ${OUT_MD}`);
}

main();
