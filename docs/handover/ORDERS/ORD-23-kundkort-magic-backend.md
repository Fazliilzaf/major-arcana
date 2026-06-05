# ORD-23 — Kundkort "magic" backend (allergi-fält + journey-state + dossier-bundle)

**Skapad:** 2026-06-04
**Owner-spår:** Cursor (write — backend data-model + endpoints)
**Claude-spår:** UAT efter deploy
**Prio:** P1
**Status:** PENDING

---

## Bakgrund

ORD-21 + ORD-22 har gett mockup-paritet i layout + strikt semantik på segment. Owner vill nu göra **kundkortet "magiskt"** med:

- Allergier/kontraindikationer alltid synliga överst (safety-kritiskt)
- 9-stegs kundresa visualiserad i dossier (vilka steg är klara, vilka väntar, vilka är blockerade)
- Journal-status-grid: vilka journal-entries är ifyllda, av vem, vilka saknas
- Send-out audit: bevis i kundkortet att kunden fått mail/SMS/dokument
- One-call dossier-payload: ALLT som kundkortet behöver i ett API-anrop

Claude har redan landat **frontend display-only** (ORD-21 stepper, blockers, warnings) baserat på befintliga signaler. Detta ORD lägger **backend-datalagret** som behövs för att de visualiseringarna ska visa REAL data, inte heuristik.

---

## Scope (strikt)

### 1. Strukturerat allergi-fält på patient

I `src/ops/ccoPatientMasterStore.js` `buildPatientCardReadout()`:

Lägg fält:
```js
allergies: [
  { name: 'Lidocain', severity: 'severe', source: 'haelso', noteAt: '2026-05-12' },
  { name: 'Penicillin', severity: 'moderate', source: 'manual', noteAt: '2026-05-14' },
]
```

Datakälla:
- Hälsodeklaration-formulär (Meridiq G4): extrahera allergi-fält från senaste signed instance
- Fallback: parse `importantNote` med regex för "allergi:" / "allergier:"
- Manuell override via `PATCH /api/v1/cco-patient-master/patient/allergies`

### 2. Kundresa-state aggregator

Ny modul: `src/ops/ccoCustomerJourneyAggregator.js`

Funktion: `computeJourneyState(patient, assetSignals, bookingSignals)` returnerar:
```js
{
  steps: [
    { id: 'pre', state: 'done', completedAt: '...', completedBy: '...' },
    { id: 'konsult', state: 'done', completedAt: '...', completedBy: '...' },
    { id: 'offert', state: 'active', startedAt: '...', dueAt: '...' },
    { id: 'avtal', state: 'pending' },
    { id: 'foto', state: 'pending' },
    { id: 'frisk', state: 'pending' },
    { id: 'op', state: 'pending' },
    { id: 'uppfolj', state: 'pending' },
    { id: 'omd', state: 'pending' },
  ],
  currentStep: 'offert',
  blockedReason: null,
}
```

Logik per steg (per memory `project_hairtp_kundresa_korrigerad_2026_06`):
1. **Pre-info** — done om bokningsbekräftelse-mail skickat
2. **Konsult** — done om journal-entry typ "consultation" finns
3. **Offert** — done om `treatmentPlanStatus === 'sent'`
4. **Avtal** — done om `ccoTreatmentAgreementStore` har signed entry
5. **Foto-samtycke** — done om `ccoPhotoPublishConsent.signed`
6. **Friskförsäkran** — done om `ccoTreatmentAgreementBundle` fitness signed
7. **Operation** — done om `hasCompletedTreatment`
8. **Uppföljning** — done om follow-up-booking + journal-entry typ "follow_up"
9. **Omdöme** — done om `ccoPostOpReviewStore` har entry

Expose: `card.journey = computeJourneyState(...)` i `buildKunderReadout()`.

### 3. Journal-fill-audit

Ny store: `src/ops/ccoJournalFillAuditStore.js` (analog till `ccoJournalReadAudit`)

Track per journal-entry:
- `entryId`
- `patientId`
- `journalType` (tp / prp / bleph / follow-up / health_declaration / fitness_certificate)
- `filledBy` (staff userId)
- `filledAt` (ISO)
- `signedBy` (om annorlunda än filled)
- `signedAt`

Hook in i `ccoJournalStore.createEntry()` + `updateEntry()`.

Expose endpoint: `GET /api/v1/cco/journal/fill-audit?patientId=X` — returnerar lista per typ.

### 4. Dossier-bundle endpoint (one-call payload)

Ny route: `GET /api/v1/cco-patient-master/patient/dossier-bundle?patientId=X`

Returnerar **allt kundkortet behöver i ETT call**:
```js
{
  card: { ...buildPatientCardReadout() },
  allergies: [...],
  journey: { steps: [...], currentStep, blockedReason },
  journalStatus: {
    expected: [
      { type: 'health_declaration', status: 'filled', filledBy: 'Anna', filledAt: '...' },
      { type: 'fitness_certificate', status: 'missing', expectedBy: '...' },
      { type: 'tp_pre_op', status: 'partial', filledBy: 'Egzona', filledAt: '...' },
      { type: 'tp_post_op', status: 'pending' },
    ]
  },
  documents: {
    agreements: [...],
    offers: [...],
    consents: [...],
  },
  recentEvents: [
    { kind: 'mail_sent', at: '...', subject: '...', tracking: { opened: true, clicked: false } },
    { kind: 'sms_sent', at: '...', body: '...', delivered: true },
    { kind: 'doc_sent', at: '...', doc: 'Behandlingsplan', signed: false },
  ]
}
```

Endpoint ska respektera RBAC: `customers.read`. Patient-data redacted enligt befintliga regler.

### 5. Förläng `automationSignals` med journey-steg-IDs

I `src/ops/ccoKunderEnrichment.js` `buildAutomationSignals()`:
Lägg `journeyStepId` på varje signal så frontend kan klicka steg → hoppa till relevant signal/action.

---

## OUT OF SCOPE

- Frontend-render (Claude har redan landat blocker-banner + journey-stepper display-only)
- Webhooks från Microsoft Graph för mail-tracking (separat infrastruktur)
- Re-styling av kundkortets visuella struktur (sker i SPA-render)
- ccoCustomerJourneyStore befintlig — vi LÄSER från den, ändrar inte schema

---

## Acceptance Criteria

- [ ] `GET /api/v1/cco-patient-master/patient/dossier-bundle?patientId=X` returnerar payload med alla 5 sektioner
- [ ] Allergi-fält syns i frontend warning-banner när data finns
- [ ] Journey-stepper i frontend visar REAL state (inte heuristik) — alla 9 steg
- [ ] Journal-status-grid (när Claude bygger den) kan läsa fill-audit
- [ ] `npm test` PASS
- [ ] Nya unit-tester för `computeJourneyState` (9 steg, alla states)
- [ ] Nya unit-tester för `ccoJournalFillAuditStore`
- [ ] verify-script 13/13 oförändrat (ingen regression)

---

## Risker + Mitigation

| Risk | Mitigation |
|---|---|
| Allergi-parse från hälsodekl misstolkar fritext | Fallback till `importantNote`-parse + manuell override-endpoint |
| Journey-aggregator returnerar fel state när data saknas | Default-state `pending` är säker — bättre tom än fel |
| dossier-bundle blir för stor (>200KB) per patient | Lazy load: deep-sections (recentEvents, documents) som separata calls vid behov |
| Fill-audit double-loggar samma entry | Unique key: `patientId + entryId + signedAt` |

---

## När Cursor klar — Claude UAT

1. `curl /api/v1/cco-patient-master/patient/dossier-bundle?patientId=TEST` — payload-shape validation
2. Öppna prod dossier → klicka kund → verifiera:
   - Allergi-banner visas om data finns
   - 9-stegs stepper visar real states
3. `node scripts/verify-ord16-progress.js` 13/13 PASS
4. Bygg frontend journal-status-grid + doc-status-list + comm-audit (3 nya orders) ovanpå nya endpoint

---

_Skapad av Claude · 2026-06-04 · Backend för "magic kundkort"_
