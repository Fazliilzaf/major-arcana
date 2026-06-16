# ORD-49 — ID-verifiering: synlig ready-pill + ev. behandlingsgate

**Prioritet:** P1 (efter ORD-48 manuell UAT · parallellt med Codex idle)  
**Status:** **Fas 2 Done** (owner GO 2026-06-16 · tester PASS)  
**Skapad:** 2026-06-16  
**Prod vid skrivning:** `6fd798f5`  
**Förutsätter:** ORD-48 backend ✅ · bundle-klassning PR #116 ✅

---

## Syfte

**Dokument-bundle FULL ≠ behandlingsgate.**

ORD-48 visar ready-pills för Hälsodekl · Samtycke · Avtal · Friskförs (+ ev. Foto).  
`id_verifiering` är **FULL** i `hairtp-document-content-bundle` (BankID/kundportal/process — inte död `ccoIdVerificationStore.js`).

Denna order kopplar **verklig ID-process** till det staff ser och ev. till hard gate före behandling/kalender.

**Out of scope:** ändra bundle-metadata igen · ORD-48 U1–U5 (fortsätter separat) · skarp BankID-RP utan `BANKID_API_KEY`.

---

## Nuläge (facit)

| Del                                        | Status     | Var                                                                       |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------- |
| ID-modul/API                               | ✅         | `src/ops/patientIdentityVerification.js`, `src/routes/patientIdentity.js` |
| Kundportal                                 | ✅         | `public/patient-portal.html` (stub/manual; BankID om nyckel)              |
| Dokument-bundle                            | ✅ FULL    | PR #116 · `patientIdentityVerification.js` som källa                      |
| Ready composite builder                    | ⚠️ delvis  | `ccoReadyForTreatmentBuilder.js` — checklista inkl. `id_verified`         |
| ORD-48 ready-row UI                        | ✅ ID-pill | `resolveOrd48ReadyState` — HD · bundle · FC · foto · **ID-pill**          |
| `computeReadyForTreatment` (Fas A readout) | ✅ Fas 2   | `ccoKunderFasAReadiness.js` — kräver `identityVerified` när hard gate på  |

**BankID-nyans:** riktig BankID kräver `BANKID_API_KEY`. Utan den: process/stub/manual/EU wallet/Freja/KYC-vägar enligt modul — inte produktions-RP.

---

## Målbild

```
Staff öppnar kundkort
  → Synlig pill: "ID verifierat" (ok / saknas / pågår)
  → Klick → kundportal / staff-flöde (upload · selfie · in-person · wallet · BankID)

Ev. hard gate (owner-beslut):
  → id_verified krävs för kalender-CTA / ready_for_treatment (utöver ORD-48-delgates)
  → Separat från dokument-Mallbibliotek PARTIAL/FULL
  → **Owner GO 2026-06-16:** hard gate default **på** (`CCO_ID_VERIFICATION_HARD_GATE` ≠ `false`)
```

### Env: `CCO_ID_VERIFICATION_HARD_GATE`

| Värde                                  | Beteende                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| _(saknas)_ / `true` / annat än `false` | Hard gate **på** — `identityVerified === true` krävs i `computeReadyForTreatment` och behandlingsbokning |
| `false`                                | Soft gate — ID-pill synlig men blockerar inte ready/bokning                                              |

Helper: `isIdVerificationHardGateEnabled()` i `src/ops/ccoKunderFasAReadiness.js`.

---

## Leverans

### Fas 1 — Synlighet (Cursor · P1)

| #   | Task                                                            | Acceptance                                                    |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | ID-pill i `kk-ord48-ready` (eller adjacent)                     | Status från API/readout, inte hårdkodad                       |
| 2   | Wire readout från `patientIdentityVerification` / customer flag | Pill matchar backend                                          |
| 3   | Tooltip/copy                                                    | Manual · selfie · BankID stub tydligt                         |
| 4   | Verify-script pin                                               | `verify:ord49-id-ready-wiring` eller utökning av ord48-sticks |

**Filer (primärt):** `public/major-arcana-preview/app/cco-kundkort-referens.js`, `patient-master-ui.js`, ev. readout i `ccoKunderFasAReadiness.js`.

### Fas 2 — Gate (Codex + Cursor · efter owner GO)

**Owner GO:** 2026-06-16 · hard gate default på.

| #   | Task                                                         | Acceptance                                                |
| --- | ------------------------------------------------------------ | --------------------------------------------------------- |
| 1   | Owner beslut: soft (pill only) vs hard (block kalender/ops)  | **Hard gate GO** — env `CCO_ID_VERIFICATION_HARD_GATE`    |
| 2   | Utöka `computeReadyForTreatment` + `ccoTreatmentBookingGate` | En sanning — `identityVerified` i Fas A readout           |
| 3   | UI blockers                                                  | `ID-verifiering` i `resolveOrd48ReadyState` blockers      |
| 4   | Tester                                                       | `tests/ops/ccoKunderFasAReadiness.test.js` + booking gate |
| 5   | Prod verify                                                  | `verify:ord49-id-ready-wiring` + ord48-sticks PASS        |

**Filer (primärt):** `src/ops/ccoKunderFasAReadiness.js`, `src/ops/ccoReadyForTreatmentBuilder.js`, `src/ops/ccoTreatmentBookingGate.js` (endast om booking ska kräva ID).

---

## Agent-fördelning

| Agent      | Äger                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| **Owner**  | Soft vs hard gate · BankID prod-nyckel · UAT ID-pill på 2–3 pilotkunder                               |
| **Cursor** | `public/**`, ready-pill UI, verify/capture, denna order + ORD-48 UAT UI-fix                           |
| **Codex**  | Readout/API aggregation, gate-logik, `tests/ops/**` — **start efter Fas 1 scope eller owner hard-GO** |

---

## Verify (före close)

```bash
npm run verify:ord48-prod-sticks          # regression ORD-48
npm run build:hairtp-document-content       # id_verifiering fortfarande FULL
npm run verify:journey-doc-placement
npm run verify:ord49-id-ready-wiring      # Fas 2 hard gate wiring
node --test tests/ops/ccoKunderFasAReadiness.test.js tests/ops/ccoTreatmentBookingGate.test.js
```

---

## PASS-kriterier

- [x] ID-pill synlig i referens-kundkort med korrekt status (minst 2 pilotkunder)
- [x] Ej förväxlad med dokument-bundle PARTIAL/FULL
- [ ] ORD-48 manuell UAT U1–U5 rapporterad (parallellt spår)
- [x] Hard gate: owner GO + `computeReadyForTreatment` + booking gate + tester

---

## Relaterat

- [`ORD-48-CLOUD-AGENT-COMPLETE.md`](./ORD-48-CLOUD-AGENT-COMPLETE.md) — ORD-48 spår
- [`ORD-48-steg7-bundle-ops-gates.md`](./ORD-48-steg7-bundle-ops-gates.md) — ursprunglig ORD-49 placeholder (steg 2 mail) **ej denna order**
- PR #116 · commit `6fd798f5` — bundle-klassning stängd

---

_Hair TP · ORD-49 · 2026-06-16_
