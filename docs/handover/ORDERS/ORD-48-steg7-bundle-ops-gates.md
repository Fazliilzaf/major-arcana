# ORD-48 — Steg 7 bundle (write) + ops-dags gates

**Prioritet:** P0 (nästa epok efter ORD-47 V1)  
**Status:** **in progress** — Cursor ORD-48 core 2026-05-20  
**Skapad:** 2026-06-16  
**Förutsätter:** ORD-47 V1 GO ✅ (owner 2026-05-20)  
**Facit:** [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](../../strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md) · [`KUNDKORT-DOKUMENT-PLACERING-FACIT.md`](../../strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md)  
**Kalender UI (Fas D):** [`MOCKUPS/CCO-Kalender-Mockup-v6-UTGANGSLAGE.html`](../MOCKUPS/CCO-Kalender-Mockup-v6-UTGANGSLAGE.html) — ready-pills, höger panel, veckovy  
**Parallellt svep:** [`ORD-48-PARALLEL-SVEP-3-AGENTS.md`](./ORD-48-PARALLEL-SVEP-3-AGENTS.md)

---

## Owner GO (2026-05-20)

| Beslut                  | Värde                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| **ORD-47 V1**           | Godkänd — §-kort + catalog + wiring räcker för V1                                                  |
| **ORD-48 start**        | GO — påbörja Fas A–D                                                                               |
| **G1** (sign-provider)  | Default: **demo-sign + persist i store** (samma som steg 8/9 idag) tills GetAccept/BankID beslutas |
| **G2** (FC block scope) | Default: **minimal lista** — blockera encounter/journal-start på ops-dag utan FC                   |
| **Arbetsläge**          | **Jobba först — ingen förhandsrapport.** Leverera sammanfattning + verify när fas/svep är klart    |

---

## Syfte

ORD-47 gav **placering och preview** (§-kort, Mallbibliotek, demo-modaler).  
ORD-48 gör **steg 7 och steg 8 bokningsmässigt sanna**: en bundle-signering som persisterar i store, och gates som **stoppar** ops/bokning — inte bara visar signaler.

**Out of scope här:** ORD-49 (steg 2 mail), ORD-24 (foto-text), ORD-50 (Fortnox), ORD-51 (§-kort body V2).

---

## Nuläge (vad som redan finns)

| Del                            | Status     | Var                                                                                 |
| ------------------------------ | ---------- | ----------------------------------------------------------------------------------- |
| Mall-version `legal_review`    | ✅ ORD-6   | `ccoTemplateVersionApprovalStore`, `send-for-sign` gate                             |
| Bundle store/logik             | ⚠️ PARTIAL | `ccoTreatmentAgreementBundle.js`, `accept-public` sätter `consent` + `bundleStatus` |
| Steg 7 UI (demo)               | ⚠️ PARTIAL | `cco-avtal-samtycke-bundle.js` — localStorage demo, ej prod write                   |
| Automation signaler            | ✅ dry-run | `missing_agreement_consent_bundle`, `missing_operation_day_insurance`               |
| Booking gate (avtal)           | ✅         | `ccoTreatmentBookingGate.js` — `bookable` krävs för FUE/TP-bokning                  |
| FC ops-blocker (write)         | ❌         | Signal finns; **ingen** runner/API blockerar encounter-start                        |
| `ready_for_treatment` komposit | ⚠️         | Readout finns (ORD-5); kalender/ops respekterar ej fullt                            |

---

## Målbild

```
Steg 6 passed (cooling_off_passed)
    → Staff: legal review (mall-version) → send bundle
    → Patient: EN signering (avtal + behandlingssamtycke)
    → agreement.bookable = true

Ops-dag (steg 8)
    → FC måste signeras innan ops-start / journal-blockerande åtgärder
    → Gate synlig i §5 + rail + automation (active)

ready_for_treatment
    = cooling OK + bundle signed + legal OK + (på ops-dag: FC) + (foto om bild)
```

---

## Leverans — 4 faser

### Fas A — Bundle write-path (backend)

**Äger:** Backend/Codex  
**Filer:**

- `src/ops/ccoTreatmentAgreementStore.js`
- `src/ops/ccoTreatmentAgreementBundle.js`
- `src/routes/ccoTreatmentAgreement.js`
- `tests/ops/ccoTreatmentAgreementBundle.test.js`
- `tests/ops/ccoTreatmentAgreementStore.test.js`

| #   | Task                                                                                                                           | Acceptance                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A1  | **Atomisk bundle-sign** — `accept` / `accept-public` sätter agreement + consent i **ett** steg; inget separat samtycke-utskick | Efter sign: `bundleStatus=signed`, `consent.signed=true`, `bookable=true` |
| A2  | **Förbjud separata consent-flöden** vid Hair TP — reject/409 om legacy `meridiqConsent` skickas utan bundle                    | Test + route guard                                                        |
| A3  | **`missing_agreement_consent_bundle`** speglar `bundleStatus` + `templateApproval` (ej bara `missingAgreement`)                | `npm run cco:verify-fas-a-readiness` PASS                                 |
| A4  | API readout: `GET patient-agreement` returnerar `bundleStatus`, `consent`, `legalReview`, `bookable` konsekvent                | Staff UI kan binda §4 utan demo                                           |

**Verify:**

```bash
node --test tests/ops/ccoTreatmentAgreementBundle.test.js
node --test tests/ops/ccoTreatmentAgreementStore.test.js
npm run cco:verify-fas-a-readiness
```

---

### Fas B — Steg 7 UI → riktig API (frontend)

**Äger:** Cursor  
**Filer:**

- `public/major-arcana-preview/app/cco-avtal-samtycke-bundle.js`
- `public/major-arcana-preview/app/cco-kundkort-referens.js` (§4 Juridik — endast wiring, ej catalog)
- `public/major-arcana-preview/app/patient-master-ui.js` (ev. befintliga avtal-knappar)

| #   | Task                                                                                             | Acceptance                                                        |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| B1  | Ersätt demo `localStorage` signering med `POST …/accept` eller staff `accept-public` flow        | Signerat tillstånd kvar efter reload                              |
| B2  | **Legal review gate** i modal — blockera "Skicka/signera" tills mall-version godkänd (ORD-6 API) | Gate-scrim som idag, men kopplad till `template-version-approval` |
| B3  | §4 Juridik-kort visar bundle-status: `Väntar review` / `Skickad` / `Signerad`                    | Rail + §4 synkar                                                  |
| B4  | Offert-klick steg 7 öppnar **samma** bundle-modal (ej separata overlays)                         | Ett modal-ID, ett flöde per aktiv offert                          |

**Verify:**

- Manuell: kund med offert → legal gate → sign → `bookable` i API
- `npm run verify:cloud-document-wiring-prod` (ingen regression)

---

### Fas C — FC ops-dag gate (write)

**Äger:** Backend + Cursor (UI hint)  
**Filer:**

- `src/ops/ccoAutomationRunner.js` (ev. redan OK — verify)
- `src/ops/ccoKunderFasAReadiness.js` / `ccoKunderEnrichment.js`
- Ny eller utökad: `src/ops/ccoOperationDayGate.js` (föreslagen)
- `src/routes/ccoJournal.js` eller encounter-start route (var ops faktiskt startar)
- `public/major-arcana-preview/app/cco-hairtp-document-cloud.js` (op-dag knappar)

| #   | Task                                                                                                                                        | Acceptance                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| C1  | **`todayVisit=true` + `fitnessSigned=false`** → API 409 på valda ops-åtgärder (journal sign? encounter complete? — definiera minimal lista) | Test med fixture                                    |
| C2  | Op-dag **Friskförsäkran**-sign sätter `fitnessSigned=true` i readout                                                                        | Signal `missing_operation_day_insurance` → inactive |
| C3  | §5 Operation + op-dag 5 knappar: disabled state + tooltip när gate blocked                                                                  | Staff ser varför                                    |
| C4  | **Ingen T-48 reminder** — bekräfta att scheduler/registry inte skickar FC pre-op mail                                                       | Grep + test                                         |

**Verify:**

```bash
npm run cco:verify-kundresa-canonical-9-step
node --test tests/ops/ccoAutomationRunnerFasA.test.js
```

Manuell UAT: `demoOpDay=1` + patient utan FC → blocker; efter FC-sign → Op-dag knappar OK.

---

### Fas D — `ready_for_treatment` → kalender

**Äger:** Backend + Cursor  
**Filer:**

- `src/ops/ccoTreatmentBookingGate.js` (utöka om behövs)
- `src/routes/ccoBookingEngine.js`
- `public/major-arcana-preview/app/cco-kundkort-referens.js` (Boka nästa / kalender CTA)

| #   | Task                                                                                                      | Acceptance                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| D1  | `ready_for_treatment` i readout = komposit enligt kundresa-facit (alla delgates)                          | Unit test fixture                                                                                      |
| D2  | **Boka behandling** (FUE/TP) blockeras tills `ready_for_treatment` eller minst `bookable` + FC om ops-dag | 409 med tydlig `reason`                                                                                |
| D3  | Rail / Smart nästa steg: "Öppna kalender" endast när komposit OK                                          | UX enligt [kalender mockup v6](../MOCKUPS/CCO-Kalender-Mockup-v6-UTGANGSLAGE.html) (ready-pills + CTA) |

**Visuellt facit (Fas D):** [`CCO-Kalender-Mockup-v6-UTGANGSLAGE.html`](../MOCKUPS/CCO-Kalender-Mockup-v6-UTGANGSLAGE.html) — `.ready-row` / `.ready-pill` ska spegla `ready_for_treatment`-delgates från kundkort.

---

## BLOCKED — owner-beslut (lösta med default)

| ID     | Beslut                                    | Default (GO 2026-05-20)                             |
| ------ | ----------------------------------------- | --------------------------------------------------- |
| **G1** | GetAccept vs BankID vs demo-sign för prod | **Demo-sign + persist i store**                     |
| **G2** | Exakt vilka API:er FC ska blockera        | **Minimal lista** — ops-dag encounter/journal-start |

Owner kan ändra G1/G2 senare utan att stoppa svepet.

## Testplan (Cloud / Staff UAT)

| #   | Scenario                                         | Förväntat                              |
| --- | ------------------------------------------------ | -------------------------------------- |
| U1  | Efter betänketid → bundle sign (staff)           | `bookable=true`, §4 "Signerad"         |
| U2  | Försök boka FUE utan bundle                      | 409 `treatment_agreement_not_bookable` |
| U3  | Ops-dag utan FC → starta journal                 | Blockerad med tydlig copy              |
| U4  | Ops-dag med FC signerad                          | Op-dag 5 knappar OK                    |
| U5  | `ready_for_treatment` synlig endast när komplett | Rail + automation                      |

Dokumentera i [`ORD-48-CLOUD-STAFF-UAT.md`](./ORD-48-CLOUD-STAFF-UAT.md).

---

## Parallellt arbete (förslag)

```
Vecka 1:  Fas A (backend bundle) ──┐
         Fas B (UI wiring)      ──┼── merge → deploy
Vecka 2:  Fas C (FC gate)        ──┤
         Fas D (kalender)       ──┘
```

**Merge-ordning:** A → B → C → D (B kan stubba mot A:s API med feature flag).

---

## Definition of done

- [ ] Bundle sign persisterar; ingen separat consent-send för Hair TP
- [ ] §4 + steg 7-modal kopplade till riktig store (ej demo-only)
- [ ] FC blockerar minst en ops-åtgärd på operationsdagen
- [ ] Behandlingsbokning respekterar `bookable` + readiness
- [ ] Verify-scripts PASS + Staff UAT U1–U5
- [ ] Owner GO för prod deploy (efter agent-sammanfattning + verify)

---

## Relaterade ORD

| ORD    | Innehåll                                                     |
| ------ | ------------------------------------------------------------ |
| ORD-6  | Mall-version legal_review (klar — bygg vidare, ej duplicera) |
| ORD-47 | §-kort placering (klar)                                      |
| ORD-49 | Steg 2 bokningsbekräftelse + HD-länk i samma mail            |
| ORD-51 | Full §3/§4/§8/§9 kort-innehåll                               |

---

_Hair TP · ORD-48 · Steg 7 bundle + ops gates · 2026-06-16_
