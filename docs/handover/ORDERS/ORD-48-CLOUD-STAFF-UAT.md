# ORD-48 — Cloud Staff UAT (bundle · FC gate · ready)

**Status:** **CLOSED** — owner UAT PASS 2026-06-16 (prod storvy)  
**Prod:** `https://arcana.hairtpclinic.com`  
**Prod commits:** `4d5935c0` (storvy parity) + `cc3dc8a4` (höger rail) · backend `4cabcbae`+  
**Spec:** [`ORD-48-steg7-bundle-ops-gates.md`](./ORD-48-steg7-bundle-ops-gates.md)  
**Förväntad tid:** 30–40 min  
**Automated pre-check:** `npm run verify:ord48-prod-sticks`

---

## Förutsättningar

1. Inloggad som staff/owner
2. Prod grön: `/readyz` + `verify:cloud-document-wiring-prod` + `cco:verify-fas-a-readiness`
3. Använd **demo=on** för steg 7/op-dag där URL anger det
4. Screenshot vid FAIL

---

## Pilot-URL:er (prod)

| Scenario                         | Kund           | URL                                                                                                                                             |
| -------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| U1 · bundle (steg 7, skip modal) | Axel Meijer    | `https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=54a658c8-7412-4f10-877e-9e607e03b74f` |
| U2 · bokning utan bundle         | Dino Placo     | `https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&patientId=4db24289-7f9e-431e-b7f3-bd9014d8c9f3`                             |
| U3/U4 · ops-dag FC               | Dino Placo     | `https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=4db24289-7f9e-431e-b7f3-bd9014d8c9f3`                 |
| U5 · ready composite             | Jonas Lundvall | `https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=a6a55cae-8c12-4d7d-83da-adbcdd368b00`                 |

Höger kundkort ska öppnas direkt (desktop `patientId` deeplink). Hårdladda vid cache-problem.

---

## U1 — Bundle sign (staff)

| #   | Steg                                    | Förväntat                             | PASS    |
| --- | --------------------------------------- | ------------------------------------- | ------- |
| U1a | Öppna Axel (URL ovan)                   | §4 synlig, steg 7-flöde tillgängligt  | ☐       |
| U1b | Signera bundle (demo-sign / accept API) | Persist i store, ej bara localStorage | ☐       |
| U1c | §4 status                               | "Signerad" / bookable signal          | ✅ U1.3 |
| U1d | Readout                                 | `bookable=true` i kundkort/rail       | ✅ U1.4 |

---

## U2 — Bokning blockeras utan bundle

| #   | Steg                             | Förväntat                                                | PASS |
| --- | -------------------------------- | -------------------------------------------------------- | ---- |
| U2a | Patient **utan** signerad bundle | Boka FUE/TP                                              | ☐    |
| U2b | API/UI svar                      | 409 `treatment_agreement_not_bookable` eller tydlig copy | ☐    |

---

## U3 — Ops-dag utan FC

| #   | Steg                                     | Förväntat                     | PASS |
| --- | ---------------------------------------- | ----------------------------- | ---- |
| U3a | Dino + `demoOpDay=1`, FC **ej** signerad | §5 Op-dag synlig              | ☐    |
| U3b | Försök starta journal / ops-skriv        | Blockerad — tydlig FC-copy    | ☐    |
| U3c | Boka behandling på ops-dag utan FC       | 409 (även om bundle signerad) | ☐    |

---

## U4 — Ops-dag med FC

| #   | Steg                              | Förväntat                                                   | PASS |
| --- | --------------------------------- | ----------------------------------------------------------- | ---- |
| U4a | Signera FC (demo eller befintlig) | §5 visar FC klar                                            | ☐    |
| U4b | Op-dag 5 knappar                  | FC · Journal · Ordination · Bild · Foto aktiva/enligt facit | ☐    |

---

## U5 — ready_for_treatment

| #   | Steg                             | Förväntat                                                                                | PASS    |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------- | ------- |
| U5a | Jonas — komplett vs ofullständig | Rail/automation visar korrekt delgate                                                    | ☐       |
| U5b | `ready_for_treatment`            | **Grön endast** när alla delgates OK (bundle + legal + FC på ops-dag + foto om relevant) | ✅ U5.3 |
| U5c | Kalender CTA                     | "Öppna kalender" endast när komposit OK — wired (`data-kk-ord48-open-calendar`)          | ✅ U5.4 |

---

## Automatiserad prod-check (före manuell UAT)

```bash
npm run verify:ord48-prod-sticks
npm run verify:cloud-document-wiring-prod
npm run cco:verify-fas-a-readiness
npm run cco:verify-bundle-sign-flow
node --test tests/ops/ccoTreatmentAgreementBundle.test.js tests/ops/ccoOperationDayGate.test.js tests/ops/ccoTreatmentBookingGate.test.js tests/ops/ccoLegacyConsentSendGuard.test.js
```

---

---

## Owner UAT resultat (2026-06-16 · prod storvy)

| Punkt | Beskrivning                               | PASS |
| ----- | ----------------------------------------- | ---- |
| U1.3  | §4 / bundle signerad readout (Axel)       | ✅   |
| U1.4  | Bookable / rail (Axel)                    | ✅   |
| U5.3  | `ready_for_treatment` komposit (Jonas)    | ✅   |
| U5.4  | Kalender-CTA · **Öppna kalender** (Jonas) | ✅   |

**Evidence:** Owner screenshots — Axel + Jonas storvy med **REDO FÖR BEHANDLING** + **Öppna kalender**.

## Godkännandekriterier

- [x] U1.3, U1.4, U5.3, U5.4 manuellt PASS (Axel + Jonas storvy)
- [x] Automated sticks PASS
- [x] Owner prod GO — ORD-48 CLOSED

---

_Hair TP · ORD-48 Cloud Staff UAT · 2026-06-16_
