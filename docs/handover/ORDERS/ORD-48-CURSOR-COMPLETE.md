# ORD-48 — Cursor sammanfattning (Fas B + C/D UI)

**Datum:** 2026-05-20  
**Agent:** Cursor (lokal)  
**Status:** Core implementerad — väntar merge + deploy + Cloud UAT

---

## Scope implementerat

### Fas A (backend, delad med Codex-scope)

- `buildSignedBundleAgreementUpdate()` — atomisk bundle-sign (avtal + consent + bookable)
- Staff `POST /accept` kräver `consent_ack` och sätter samma fält som `accept-public`
- `ccoOperationDayGate.js` — FC-block på ops-dag för TP/PRP-journal (write + sign)
- `ccoTreatmentBookingGate` — FC-block vid behandlingsbokning på ops-dag; `readyForTreatment` i gate-svar
- Journal-router + booking-engine/bookings får `bookingStore` för todayVisit

### Fas B (steg 7 UI → API)

- `cco-avtal-samtycke-bundle.js` — signering via `/cco-treatment-agreement/accept` (ej bara journal/localStorage)
- `patient-master-ui.js` — `consent_ack: true` på staff accept; `agreementReadout` till kundkort; reload efter sign

### Fas C3 (op-dag UI)

- `cco-hairtp-document-cloud.js` — Op-dag-knappar disabled + tooltip utan FC (steg 8 alltid OK)

### Fas D3 / §4

- `cco-kundkort-referens.js` — §4 Juridik visar bundle-status från `agreementReadout`

---

## Filer ändrade

| Fil                                         | Ändring                                  |
| ------------------------------------------- | ---------------------------------------- |
| `src/ops/ccoTreatmentAgreementBundle.js`    | `buildSignedBundleAgreementUpdate`       |
| `src/routes/ccoTreatmentAgreement.js`       | Atomisk accept + accept-public refactor  |
| `src/ops/ccoOperationDayGate.js`            | **Ny** ops-dags gate                     |
| `src/routes/ccoJournal.js`                  | FC-gate på entry write/sign              |
| `src/ops/ccoTreatmentBookingGate.js`        | Ops-dag FC + readiness                   |
| `src/routes/ccoBookings.js`                 | `bookingStore` till gate                 |
| `src/routes/ccoBookingEngine.js`            | `bookingStore` till gate                 |
| `server.js`                                 | `bookingStore` → journal router          |
| `public/.../cco-avtal-samtycke-bundle.js`   | API-persist, skip auto om redan bookable |
| `public/.../patient-master-ui.js`           | consent_ack, agreementReadout i kundkort |
| `public/.../cco-hairtp-document-cloud.js`   | Op-dag disabled state                    |
| `public/.../cco-kundkort-referens.js`       | §4 bundle-rad                            |
| `tests/ops/ccoOperationDayGate.test.js`     | **Ny**                                   |
| `tests/ops/ccoTreatmentBookingGate.test.js` | Uppdaterad fixture                       |

---

## Verify

```bash
node --test tests/ops/ccoTreatmentAgreementBundle.test.js
node --test tests/ops/ccoOperationDayGate.test.js
node --test tests/ops/ccoTreatmentBookingGate.test.js
npm run cco:verify-fas-a-readiness        # PASS
npm run cco:verify-bundle-sign-flow         # PASS
```

---

## Manuell stickprov (efter deploy)

1. Kund med skickat avtal → steg 7-modal → signera → reload → §4 "Signerad · bokningsbar"
2. Försök boka FUE utan bundle → 409
3. `demoOpDay=1` utan FC → Op-dag-knappar disabled (utom Friskförsäkran)
4. Efter FC-sign → journal-knappar OK
5. Staff accept-knapp med `consent_ack` → bookable i API

---

## Kvar / nästa

- [ ] Cloud Agent: prod verify + `ORD-48-CLOUD-STAFF-UAT.md`
- [ ] Owner prod deploy GO
- [ ] Codex-parallell: ev. ytterligare A2 route-guard för separata consent-send (cco-komm-panel)
- [ ] Kalender-CTA "Öppna kalender" när `ready_for_treatment` (D3 polish)

---

_Hair TP · ORD-48 · Cursor core · 2026-05-20_
