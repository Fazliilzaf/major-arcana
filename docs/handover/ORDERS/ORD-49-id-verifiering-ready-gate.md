# ORD-49 — ID-verifiering: synlig ready-pill + ev. behandlingsgate

**Prioritet:** P1 (efter ORD-48 manuell UAT · parallellt med Codex idle)  
**Status:** **Ready to start**  
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

| Del                                        | Status    | Var                                                                       |
| ------------------------------------------ | --------- | ------------------------------------------------------------------------- |
| ID-modul/API                               | ✅        | `src/ops/patientIdentityVerification.js`, `src/routes/patientIdentity.js` |
| Kundportal                                 | ✅        | `public/patient-portal.html` (stub/manual; BankID om nyckel)              |
| Dokument-bundle                            | ✅ FULL   | PR #116 · `patientIdentityVerification.js` som källa                      |
| Ready composite builder                    | ⚠️ delvis | `ccoReadyForTreatmentBuilder.js` — checklista inkl. `id_verified`         |
| ORD-48 ready-row UI                        | ❌ ej ID  | `resolveOrd48ReadyState` — HD · bundle · FC · foto, **ingen ID-pill**     |
| `computeReadyForTreatment` (Fas A readout) | ❌ ej ID  | `ccoKunderFasAReadiness.js` — bundle · cooling · ops · foto · HD          |

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
```

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

| #   | Task                                                                                         | Acceptance                                          |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Owner beslut: soft (pill only) vs hard (block kalender/ops)                                  | Dokumenterat i denna order                          |
| 2   | Om hard: utöka `computeReadyForTreatment` **eller** aligna med `ccoReadyForTreatmentBuilder` | En sanning — inte två divergerande listor           |
| 3   | Tester                                                                                       | `tests/ops/` för gate + befintlig identity coverage |
| 4   | Prod verify                                                                                  | Sticks PASS efter deploy                            |

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
# Ny (Fas 1):
# npm run verify:ord49-id-ready-wiring
```

---

## PASS-kriterier

- [ ] ID-pill synlig i referens-kundkort med korrekt status (minst 2 pilotkunder)
- [ ] Ej förväxlad med dokument-bundle PARTIAL/FULL
- [ ] ORD-48 manuell UAT U1–U5 rapporterad (parallellt spår)
- [ ] Om hard gate: owner GO + booking/kalender test PASS

---

## Relaterat

- [`ORD-48-CLOUD-AGENT-COMPLETE.md`](./ORD-48-CLOUD-AGENT-COMPLETE.md) — ORD-48 spår
- [`ORD-48-steg7-bundle-ops-gates.md`](./ORD-48-steg7-bundle-ops-gates.md) — ursprunglig ORD-49 placeholder (steg 2 mail) **ej denna order**
- PR #116 · commit `6fd798f5` — bundle-klassning stängd

---

_Hair TP · ORD-49 · 2026-06-16_
