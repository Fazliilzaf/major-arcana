# ORD-48 — Cloud Agent COMPLETE (Cursor · Fas 2)

**Status:** Automated PASS · manuell Staff UAT U1–U5 **väntar owner**  
**Agent:** Cursor (lokal)  
**Prod commit:** `6fd798f5` (bundle-klassning #116 + ORD-48 D3)  
**UAT-doc:** [`ORD-48-CLOUD-STAFF-UAT.md`](./ORD-48-CLOUD-STAFF-UAT.md)  
**Spec:** [`ORD-48-steg7-bundle-ops-gates.md`](./ORD-48-steg7-bundle-ops-gates.md)  
**Nästa order (ID UI):** [`ORD-49-id-verifiering-ready-gate.md`](./ORD-49-id-verifiering-ready-gate.md)

---

## L1 — Dokumentation

| Task                                     | Status | Bevis                                            |
| ---------------------------------------- | ------ | ------------------------------------------------ |
| `ORD-48-CLOUD-STAFF-UAT.md` U1–U5        | ✅     | Pilot-URL:er + checklista                        |
| `ORD-48-PARALLEL-SVEP-3-AGENTS.md` Fas 2 | ✅     | Agent-fördelning                                 |
| D3 kalender-CTA wired (mockup v6)        | ✅     | `kk-ord48-ready` + `data-kk-ord48-open-calendar` |

---

## L2 — Automatiserad prod-verify

Kör efter deploy:

```bash
npm run verify:ord48-prod-sticks
npm run verify:cloud-document-wiring-prod
npm run cco:verify-fas-a-readiness
npm run cco:verify-bundle-sign-flow
BASE_URL=https://arcana.hairtpclinic.com bash scripts/smoke-public.sh
```

| Script                          | Senaste körning | Resultat                                    |
| ------------------------------- | --------------- | ------------------------------------------- |
| `verify:ord48-prod-sticks`      | `6fd798f5` prod | **16/16 PASS**                              |
| `verify:ord47-prod-sticks`      | `6fd798f5` prod | **9/9 PASS**                                |
| `build:hairtp-document-content` | lokal           | **OK** (v7 · staff PARTIAL 0)               |
| `verify:journey-doc-placement`  | lokal           | **PASS**                                    |
| Browser ORD-48 capture          | strict v2       | **0/3** tills deeplink-fix deployas — se L5 |

---

## L3 — Browser capture (ORD-48)

```bash
node scripts/capture-ord48-browser-uat.js
```

Output: `data/reports/ord48-browser-uat/` — U1 Axel, U3 Dino op-dag, U5 Jonas.

Krav: `ARCANA_OWNER_EMAIL` + `ARCANA_OWNER_PASSWORD` i `.env`.

---

## L4 — D3 kalender-CTA (implementerat)

| Del                | Beteende                                                             |
| ------------------ | -------------------------------------------------------------------- |
| **Ready row**      | Pills: Hälsodekl · Samtycke · Avtal · Friskförs (+ Foto om relevant) |
| **Reason**         | Grön/red copy enligt `ready_for_treatment`                           |
| **Öppna kalender** | Aktiv endast när komposit OK → `?view=calendar&v9=on&patientId=`     |
| **Boka nästa**     | Samma gate — disabled tills ready                                    |

Facit: [`CCO-Kalender-Mockup-v6-UTGANGSLAGE.html`](../MOCKUPS/CCO-Kalender-Mockup-v6-UTGANGSLAGE.html) (`.ready-row` / ready-pills)

---

## L5 — Manuell Staff UAT (owner)

| #   | Scenario                             | Status     | Anteckning                                       |
| --- | ------------------------------------ | ---------- | ------------------------------------------------ |
| U1  | Bundle sign → §4 Signerad            | ☐ Owner    | Visuell: referens-kundkort + §-kort (ej legacy)  |
| U2  | Boka utan bundle → 409               | ✅ Backend | Gate/test/sticks PASS; UI-tråd valfri dubbelkoll |
| U3  | Ops-dag utan FC → blockerad          | ✅ PASS    | Dino op-dag + FC-gate                            |
| U4  | Ops-dag med FC → 5 knappar           | ☐ Partial  | Op-dag OK; FC signerad ej visuellt genomkört     |
| U5  | `ready_for_treatment` + kalender-CTA | ☐ Owner    | Jonas deeplink — bekräfta höger rail             |

**Rapportera:** `U1 PASS, U5 FAIL, …` här i chat → Cursor fixar UI/deeplink vid behov.

**Ej ORD-48:** ID-pill / hard ID-gate → [`ORD-49-id-verifiering-ready-gate.md`](./ORD-49-id-verifiering-ready-gate.md).

---

## L6 — CI / deploy-cloud-safe

| Item                             | Status                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `smoke-public.sh` HTTPS + `-sSL` | ✅                                                                                                   |
| `deploy-cloud-safe`              | ✅ **GRÖN** — [run 27602428791](https://github.com/Fazliilzaf/major-arcana/actions/runs/27602428791) |

---

## L7 — PASS/FAIL sammanfattning

| Område                    | Resultat    | Anteckning                                           |
| ------------------------- | ----------- | ---------------------------------------------------- |
| Codex backend Fas A/C/D   | **PASS**    | Owner prod verify 2026-05-20 · idle tills UAT/ORD-49 |
| Cursor frontend Fas B/C/D | **PASS**    | Steg 7 API, §4/§5, deeplink                          |
| Prod verify sticks        | **PASS**    | 16/16                                                |
| D3 kalender-CTA           | **PASS**    | Wired i kundkort                                     |
| Manuell UAT U1–U5         | **PENDING** | U2/U3 backend+auto OK · U1/U4/U5 visuellt kvar       |
| Bundle-klassning (#116)   | **CLOSED**  | `6fd798f5` live · ID = FULL i bundle, ej lucka       |
| ORD-49 ID ready-pill      | **READY**   | Separat spår — ej blandat med ORD-48 closeout        |
| Owner prod GO             | **PENDING** | Efter U1/U5 visuell PASS                             |

**Blockers:** 0 kodblockers för att starta manuell UAT.

---

## Filer levererade (Fas 2)

| Fil                                                     | Syfte                    |
| ------------------------------------------------------- | ------------------------ |
| `docs/handover/ORDERS/ORD-48-CLOUD-STAFF-UAT.md`        | Staff UAT                |
| `docs/handover/ORDERS/ORD-48-CLOUD-AGENT-COMPLETE.md`   | Denna rapport            |
| `docs/handover/ORDERS/ORD-48-PARALLEL-SVEP-3-AGENTS.md` | Agent-fördelning         |
| `scripts/verify-ord48-prod-sticks.js`                   | Prod wiring              |
| `scripts/capture-ord48-browser-uat.js`                  | Browser UAT capture      |
| `public/.../cco-kundkort-referens.js`                   | Ready row + kalender CTA |
| `public/.../cco-kundkort-referens.css`                  | Mockup v6 styling        |

---

_Hair TP · ORD-48 Cloud · Cursor Fas 2 · 2026-05-20_
