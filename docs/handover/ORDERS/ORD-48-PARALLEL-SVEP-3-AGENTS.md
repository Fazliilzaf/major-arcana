# ORD-48 — Parallellt svep · Cursor + Codex + Cloud Agent

**Datum:** 2026-05-20  
**Spec:** [`ORD-48-steg7-bundle-ops-gates.md`](./ORD-48-steg7-bundle-ops-gates.md)  
**Förutsätter:** ORD-47 V1 ✅ Owner GO 2026-05-20  
**Mål:** Steg 7 bundle **write** + FC ops-gate + `ready_for_treatment` → kalender

**Owner GO:** Fazli — ORD-48 start 2026-05-20. Merge + deploy efter agent-sammanfattningar.

---

## Regler (läs först)

1. **Ingen förhandsrapport** — dubbelkolla tyst i repot, **implementera direkt**, leverera **sammanfattning sist** (scope, filer, verify, kvarvarande).
2. **Filägarskap** — rör inte filer som tillhör annan agent utan koordination.
3. **Additivt** — utöka befintlig bundle/gate-kod; duplicera inte parallella flöden.
4. **G1/G2 default** — demo-sign + persist; FC blockerar minimal ops-start-lista (se ORD-48 spec).
5. Efter merge + deploy: **Cloud Agent** kör prod verify + Staff UAT U1–U5.

---

## Merge-ordning

```
1. Codex  → Fas A (bundle write) + Fas C backend (FC gate) + Fas D backend
2. Cursor → Fas B (steg 7 UI → API) + Fas C/D UI wiring
3. Cloud  → verify + ORD-48-CLOUD-STAFF-UAT.md + COMPLETE-rapport
```

Codex **A före** Cursor **B** om API-kontrakt ändras. Cursor kan stubba mot befintliga routes medan A mergas.

---

## Leveransformat (varje agent — **efter** jobbet)

```markdown
## ORD-48 [Agent] — sammanfattning

- Scope implementerat: …
- Filer ändrade: …
- Verify: (kommandon + PASS/FAIL)
- Manuell stickprov: …
- Kvar / blocker: …
- Rekommenderad merge-ordning: …
```

**Skicka inte** "ska jag börja?" eller inventerings-tabell som enda output.

---

# 🤖 CODEX — Backend Fas A + C + D

**Äger:**

- `src/ops/ccoTreatmentAgreementStore.js`
- `src/ops/ccoTreatmentAgreementBundle.js`
- `src/routes/ccoTreatmentAgreement.js`
- `src/ops/ccoOperationDayGate.js` _(ny om behövs)_
- `src/ops/ccoAutomationRunner.js` _(verify/utöka)_
- `src/routes/ccoJournal.js` / encounter-start _(FC block)_
- `src/ops/ccoTreatmentBookingGate.js` / `src/routes/ccoBookingEngine.js`
- `tests/ops/ccoTreatmentAgreement*.test.js`
- `tests/ops/ccoAutomationRunnerFasA.test.js`

**Todo:**

- [ ] **X1** A1–A4 — atomisk bundle-sign, reject legacy consent, readiness signal, API readout
- [ ] **X2** C1–C2 — FC 409 på ops-åtgärder; `fitnessSigned` i readout
- [ ] **X3** C4 — bekräfta ingen T-48 FC pre-op mail
- [ ] **X4** D1–D2 — `ready_for_treatment` komposit + booking 409
- [ ] **X5** Alla verify enligt ORD-48 spec PASS

---

# 🤖 CURSOR (lokal) — Frontend Fas B + C/D UI

**Äger:**

- `public/major-arcana-preview/app/cco-avtal-samtycke-bundle.js`
- `public/major-arcana-preview/app/cco-kundkort-referens.js` _(§4 wiring only)_
- `public/major-arcana-preview/app/patient-master-ui.js`
- `public/major-arcana-preview/app/cco-hairtp-document-cloud.js` _(op-dag knappar)_
- `public/major-arcana-preview/index.html` _(cache bust vid behov)_

**Todo:**

- [x] **C1** B1–B4 — ersätt localStorage demo; legal gate; §4 status; ett bundle-modal
- [x] **C2** C3 — §5 + op-dag disabled + tooltip vid FC block
- [x] **C3** D3 — rail / §4 bundle-status + agreementReadout wiring
- [ ] **C4** Ingen regression: `verify:cloud-document-wiring-prod` (efter deploy)

---

# ☁️ CLOUD AGENT — Prod verify + UAT

**Efter deploy.** Skapa:

- `docs/handover/ORDERS/ORD-48-CLOUD-STAFF-UAT.md`
- `docs/handover/ORDERS/ORD-48-CLOUD-AGENT-COMPLETE.md`

**Todo:**

- [ ] **L1** Kör verify-scripts (bundle, fas-a-readiness, kundresa 9-step, cloud wiring)
- [ ] **L2** Staff UAT U1–U5 enligt ORD-48 spec
- [ ] **L3** Pilot-URL:er med `demoOpDay=1` för FC-gate stickprov
- [ ] **L4** Sammanfattning PASS/FAIL — ingen falsk COMPLETE

---

## Definition of done (svep)

- [ ] Codex sammanfattning + verify PASS
- [ ] Cursor sammanfattning + wiring verify PASS
- [ ] Merge A → B → C/D → deploy
- [ ] Cloud UAT + COMPLETE
- [ ] Owner prod deploy GO

---

_Hair TP · ORD-48 · Parallellt svep · Owner GO 2026-05-20_
