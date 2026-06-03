# CCO Kundresa — Fazli plan mapping (2026-06-03)

**Status:** Planlåst · **väntar på Fazlis kundrese-plan** · ingen implementation  
**Kunder P1.2:** STÄNGD (prod `2b4b1529`, gates PASS)  
**Nästa kod:** Endast efter Fazli säger **GO** mot denna mapping

---

## Planhierarki (låst)

| Prioritet | Källa                                                                                                | Roll                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **1**     | **Fazlis kommande kundrese-plan**                                                                    | **Execution source of truth** när kundresan startar                                                            |
| **2**     | [`CCO-SYSTEM-SCOPE.md`](./CCO-SYSTEM-SCOPE.md)                                                       | **Kravbas**                                                                                                    |
| **3**     | [Gemensam plan v2](https://app.notion.com/p/374060ccc15b8194883ce75d56fd621c)                        | **Automation OS-strategi** (L1–L3) — hur automation byggs vid GO; **inte** kundresa-order · **inte** LLM-build |
| **4**     | Kunder P1.2 (stängd ~97/98%)                                                                         | **Arbetsyta** för smarta signaler ovanpå                                                                       |
| **5**     | [Kundresa: konsultation → avtal/samtycke](https://app.notion.com/p/374060ccc15b81639403c52b2ce6bcd6) | **Teknisk nulägeskarta**                                                                                       |
| **6**     | Localhost sheets / mockups                                                                           | UI/design-referens                                                                                             |

**Kanonisk kundresa (9 steg, Fazli 2026-06-03):** [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](./CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md) — betänketid **2 dagar** · registry `missing_health_declaration` (steg 3)  
**Automation readiness (ingen kod):** [`CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md`](./CCO-AUTOMATION-REGISTRY-READINESS-2026-06-03.md)  
**Smart Next Step UX v2:** [`CCO-SMART-NEXT-STEP-UX-SPEC-V2-9-STEG-2026-06-03.md`](./CCO-SMART-NEXT-STEP-UX-SPEC-V2-9-STEG-2026-06-03.md)

**Regel:** Gemensam plan v2 får beskriva _automationnivåer_ (L1 regelmotor · L2 smart inferens · L3 LLM-copilot) men **ersätter inte** Fazlis 9-stegs kundresa.

---

## Vänteläge (tills Fazlis plan finns)

**Starta INTE:**

- Mer Kunder-bygge (P1.2 stängd)
- Kundresa-implementation
- Automation OS som byggspår (Registry/Runner)
- Signering-build (GetAccept/BankID write)
- `legal_review` i avtalsflöde
- Samtycke-UI från staff/Kunder
- Aisia bridge
- Photo Review autoapprove
- Mailimport / Drive-import (ny)
- `server.js`-monolit-risk

**Gates som gäller vid framtida Kunder-ändringar:**  
`cco:verify-kunder-real-data` · `cco:verify-mobile-kunder-real-data` · `cco:real-cco-gate`

---

## Arbetsflöde när Fazlis plan kommer

1. **Läs** Fazlis kundrese-plan (ersätter § “Fazlis plan” nedan).
2. **Mappa** varje plansteg mot kod (tabellmall § Mapping).
3. **Gap-lista** per steg: `DONE` · `PARTIAL` · `MISSING` · `BLOCKED_DECISION` · `OWNER_GO`.
4. **Föreslå** exakt byggordning (med exit-kriterier per fas).
5. **Bygg inget** förrän Fazli säger **GO** (per fas eller per steg).

Uppdatera detta dokument med plan-UUID/version och datum när planen inkommer.

---

## Fazlis plan (platshållare)

```
[ VÄNTAR — inklistra eller länka Fazlis kundrese-plan här ]

Steg-ID | Beskrivning | Owner | GO-kriterium
--------|-------------|-------|---------------
```

---

## Mapping — tekniskt nuläge (2026-06-03)

_Baserat på prioritet 2–3 + repo `major-arcana` @ `2b4b1529`. Uppdateras när Fazlis plan inkommer rad för rad._

### Resa i ett stycke (Fazli 9 steg — **ersätter** fel 10-stegs Notion-ordning)

Se full spec: [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](./CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md)

```
[1] Bokning konsult ✅
→ [2] Bokningsbekräftelse (pre-info + tjänstespec + Meridiq HD) 🟡
→ [3] Hälsodeklaration ✅ portal
→ [4] Konsultation + journal 🟡
→ [5] Offert = behandlingsplan 🟡
→ [6] Betänketid 2d ✅ (`ccoHairTpCoolingOffPolicy`)
→ [7] Avtal + behandlingssamtycke bundle ❌ (legal_review + sign)
→ [8] Friskförsäkran operationsdagen 🟡 (INTE T-48h)
→ [9] Foto-samtycke vid bild (hårlinje/krona) 🟡
```

**Ogiltigt i gamla kartor:** pre-info som eget steg · T-48 friskförsäkran · separat samtycke-utskick · generellt foto/publicerings-samtycke.

### Domän → kod → status

| Domän                     | Primär kod / API                                                              | Status                                | Gap / notering                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Booking engine**        | `ccoBookingEngineStore`, `publicBookingEngine`, `ccoTreatmentBookingGate`     | **PARTIAL**                           | Webb LIVE; Cliento legacy parallellt; staff **Boka** disabled i Kunder                                  |
| **Cliento legacy**        | `clientoBookingStore`, patient `cliento_only`                                 | **PARTIAL**                           | Avveckling pågår; dubbel sanning tills engine är enda väg                                               |
| **Meridiq / forms**       | Patientportal, halso@, Meridiq Q-IDs, `health_declaration:*` schemas          | **DONE** (kund) / **PARTIAL** (staff) | Portal LIVE; **staff formulär-action** i Kunder disabled (“Kräver formulärmotor”)                       |
| **Journal / encounter**   | `ccoJournalStore`, `CcoJournalFeed`, encounter från booking                   | **PARTIAL**                           | Mount LIVE i Kunder; **Aisia → journal auto-import** MISSING; encounter-gap flaggas                     |
| **Offerter**              | Offer stores / commercial (scope §6)                                          | **PARTIAL**                           | Flöde i scope ✅; staff “Skapa offert” disabled; ofta manuell skapning                                  |
| **Treatment agreement**   | `ccoTreatmentAgreementStore`, `ccoTreatmentAgreement` routes, `accept-public` | **PARTIAL**                           | Cooling off + gate; **digital sign write / provider** MISSING; **`legal_review` i store** MISSING       |
| **Samtycken (Meridiq C)** | `meridiqConsentCatalogRuntime`, `consent-catalog.json`                        | **PARTIAL**                           | Runtime + tester; **staff send/UI från Kunder** MISSING; flera mallar MISSING i registry (CONSENT-flow) |
| **GetAccept / BankID**    | `getaccept_import` assets; `patientIdentityVerification`                      | **BLOCKED_DECISION**                  | GetAccept **import only**; BankID-grund finns; **ny signering** = OWNER_GO (provider)                   |
| **legal_review**          | `ccoRbac` `templates.legal_review`; templates routes                          | **MISSING** (avtal)                   | Finns för **templates**, ej kopplat till **`ccoTreatmentAgreementStore`**                               |
| **Photo consent**         | `ccoPhotoPublishConsent.js`, `ccoPhotoConsentStore`                           | **PARTIAL**                           | Store finns; **wizard/UI i dossier** MISSING                                                            |
| **Patient portal**        | Token-formulär, signering hälsodekl/friskförsäkran                            | **DONE**                              | Kundväg steg 3–4 OK                                                                                     |
| **Kunder actions**        | `cco-kunder-actions.js`, `cco-kunder-real.js`, P1.2 polish `2b4b1529`         | **DONE** (yta)                        | ~97% desktop / ~98% mobil; matrix real/partial/disabled; **ingen write** på boka/merge/GDPR             |
| **Journey 12 steg**       | `ccoCustomerJourneyStore`                                                     | **PARTIAL**                           | Steg definierade; **ej derived** från booking/journal/avtal; ingen auto-advance                         |
| **Automation OS (L1)**    | Plan: `ccoAutomationRegistry` / `ccoAutomationRunner`                         | **MISSING**                           | Strategi i v2; **ej byggspår** tills Fazli GO                                                           |
| **L2 inferens**           | service-classify, merge scoring, foto-fas                                     | **MISSING**                           | v2-referens endast                                                                                      |
| **L3 LLM copilot**        | Plan: `ccoCopilotRuntime`                                                     | **OWNER_GO**                          | Pausad; ingen extern AI på journal utan GO                                                              |

### CCO 12-steg vs verklighet (journey store)

| CCO-steg                         | Ungefär extern      | Auto-sync idag                                 |
| -------------------------------- | ------------------- | ---------------------------------------------- |
| `lead_first_contact`             | Pipedrive           | **Nej** — enrich only                          |
| `consultation_booked`            | Webb / Cliento      | **Delvis** — bokning i engine, journey manuell |
| `consultation_done`              | Hälsodekl + konsult | **Nej**                                        |
| `treatment_offered`              | Offert              | **Nej**                                        |
| `agreement_signed`               | Avtal + samtycke    | **Nej** — steg 8 blocker                       |
| `pre_treatment_documents`        | Friskförsäkran m.m. | **Delvis** — data finns, journey ej            |
| `treatment_booked` → `completed` | Behandling          | Gate `bookable` finns; full kedja ej           |

---

## Gap-lista (sammanfattning)

| ID  | Beskrivning                                    | Status               | Spår                         |
| --- | ---------------------------------------------- | -------------------- | ---------------------------- |
| G1  | Digital signering (GetAccept/BankID **write**) | **BLOCKED_DECISION** | Kundresa **steg 7** (bundle) |
| G2  | `legal_review` i `ccoTreatmentAgreementStore`  | **MISSING**          | Kundresa **steg 7**          |
| G3  | Nordbro PDF version bunden till rätt mall      | **PARTIAL**          | Compliance                   |
| G4  | Staff samtycke-send (Meridiq catalog → UI)     | **MISSING**          | Kundresa Fas B               |
| G5  | Foto-samtycke UI                               | **MISSING**          | Kundresa Fas B               |
| G6  | Journey derived + event subscribers            | **MISSING**          | Kundresa Fas C / v2 P1.4     |
| G7  | Cliento → enda booking-sanning                 | **PARTIAL**          | Avveckling                   |
| G8  | Staff offert-route från Kunder                 | **MISSING**          | Kundresa / Kunder P1         |
| G9  | Automation Registry + dry-run (read-only)      | **MISSING**          | v2 — **ej start** utan GO    |
| G10 | Aisia → journal import                         | **OWNER_GO**         | Pausad per regler            |
| G11 | L3 LLM på patientdata                          | **OWNER_GO**         | Förbjudet utan explicit GO   |

---

## Föreslagen byggordning (utkast — väntar Fazlis plan)

_Ordningen nedan är **förslag från nuläge + Notion kundresa/v2**; **ersätts** när Fazlis plan är inkommen._

| Fas    | Fokus                                                    | Exit                                                            | Kräver GO                 |
| ------ | -------------------------------------------------------- | --------------------------------------------------------------- | ------------------------- |
| **0**  | Fazli plan + beslut sign-provider                        | Plan i § Fazlis plan fylld                                      | Fazli                     |
| **A**  | `legal_review` + signering + PDF                         | `bookable` endast efter legal + sign                            | **GO: Fas A**             |
| **B**  | Samtycken + foto-samtycke UI                             | Per patient: vilken mall saknas                                 | **GO: Fas B**             |
| **C**  | Journey derived + timeline i dossier                     | Journey = fakta utan manuell CRM                                | **GO: Fas C**             |
| **D**  | Kunder actions (boka, formulär, offert) när routes finns | real/partial/disabled med route                                 | **GO: Kunder P1**         |
| **E1** | Automation L1 read-only (Registry/dry-run)               | Smart nästa steg, **inga writes**                               | **GO: Automation**        |
| **E2** | Reminders med POST-approve                               | **Ej** T-48 FF · **ej** samtycke vid offert · enligt 9-steg doc | **GO: E2** (omdefinieras) |
| **P2** | Aisia / L3 copilot                                       | Bakom flag, HITL                                                | **GO: P2**                |

**Konflikt löst i docs:** Kundresa = **9 steg** (kanonisk doc). Registry-regler mappas till steg 3–9. **Fas A = steg 7** (bundle + legal_review). **Steg 8** = ops-dags friskförsäkran, inte T-48. Registry dry-run **parallellt** endast efter Fazli GO — inga reminders/AI.

---

## OWNER_GO-checklista (öppen)

- [ ] **GO: Fazlis kundrese-plan** publicerad och prioriterad över v2-byggordning
- [ ] **GO: sign-provider** — BankID vs GetAccept vs hybrid
- [ ] **GO: Fas A** — `legal_review` + sign write
- [ ] **GO: Fas B** — samtycke + foto UI
- [ ] **GO: Fas C** — journey derived
- [ ] **GO: Automation E1** — Registry dry-run (read-only)
- [ ] **GO: Aisia / L3** — pausad tills explicit

---

## Referenser (låsta lager 2–4)

| Dokument                     | Sökväg / länk                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------ |
| Kravbas                      | `docs/strategy/CCO-SYSTEM-SCOPE.md`                                                  |
| Nulägeskarta                 | [Notion kundresa](https://app.notion.com/p/374060ccc15b81639403c52b2ce6bcd6)         |
| Automation strategi          | [Notion Gemensam plan v2](https://app.notion.com/p/374060ccc15b8194883ce75d56fd621c) |
| **Kanonisk 9-steg**          | `docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`                            |
| Samtycke/avtal kedja         | `docs/strategy/CONSENT-AGREEMENT-AFTERCARE-FLOW.md` (**T-48 avsnitt ogiltiga**)      |
| Meridiq 24 steg              | `docs/strategy/MERIDIQ-JOURNEY-BLUEPRINT.md` (**T-48 avsnitt ogiltiga**)             |
| Kunder readiness             | `docs/strategy/CCO-KUNDER-SEGMENT-READINESS-2026-06-03.md`                           |
| Mobil readiness              | `docs/strategy/CCO-MOBIL-KUNDER-READINESS-2026-06-03.md`                             |
| Automation arkitektur (repo) | `docs/strategy/CCO-AUTOMATION-OS-ARCHITECTURE-2026-06-03.md`                         |
| Inventory (lokal)            | `data/reports/cco-automation-os-inventory.json` (gitignored)                         |

---

## Beslut efter P1.2-stängning

När Fazlis plan är mappad och gates fortfarande gröna för Kunder:

**Välj ett spår (Fazli):**

1. **Fortsätta Kunder P1/P2** (actions med riktiga routes), eller
2. **Gå in i kundresan** (Fas A → B → C enligt plan)

**Cursor bygger inget** förrän val + **GO** per fas.

---

_Hair TP Clinic · 2026-06-03 · Plan mapping · väntar Fazlis execution plan_
