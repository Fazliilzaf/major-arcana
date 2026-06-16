# ORD-48 — Cloud Agent COMPLETE (Cursor · Fas 2)

**Status:** Automated PASS · manuell Staff UAT U1–U5 **väntar owner**  
**Agent:** Cursor (lokal)  
**Prod:** `https://arcana.hairtpclinic.com`  
**UAT-doc:** [`ORD-48-CLOUD-STAFF-UAT.md`](./ORD-48-CLOUD-STAFF-UAT.md)  
**Spec:** [`ORD-48-steg7-bundle-ops-gates.md`](./ORD-48-steg7-bundle-ops-gates.md)

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

| Script                     | Senaste körning (pre-D3 deploy) | Resultat                      |
| -------------------------- | ------------------------------- | ----------------------------- |
| `verify:ord48-prod-sticks` | 2026-05-20                      | **16/16 PASS**                |
| `verify:ord47-prod-sticks` | 2026-05-20                      | **9/9 PASS** (regression)     |
| `smoke-public.sh`          | 2026-05-20                      | **PASS** (HTTPS redirect fix) |
| Browser ORD-47 capture     | 2026-05-20                      | **3/3 PASS**                  |

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

| #   | Scenario                             | Status  |
| --- | ------------------------------------ | ------- |
| U1  | Bundle sign → §4 Signerad            | ☐ Owner |
| U2  | Boka utan bundle → 409               | ☐ Owner |
| U3  | Ops-dag utan FC → blockerad          | ☐ Owner |
| U4  | Ops-dag med FC → 5 knappar           | ☐ Owner |
| U5  | `ready_for_treatment` + kalender-CTA | ☐ Owner |

**Rapportera:** `U1 PASS, U2 FAIL, …` i Slack eller chat → Cursor fixar UI vid behov.

---

## L6 — CI / deploy-cloud-safe

| Item                             | Status                                |
| -------------------------------- | ------------------------------------- |
| `smoke-public.sh` HTTPS + `-sSL` | ✅ Fix live (`b92f1abd`)              |
| Senaste `deploy-cloud-safe`      | ⚠️ FAIL @ `9e69bda4` (före smoke-fix) |
| Nästa steg                       | Kör om workflow efter D3-deploy       |

```bash
gh workflow run deploy-cloud-safe.yml -f base_url=https://arcana.hairtpclinic.com
```

---

## L7 — PASS/FAIL sammanfattning

| Område                    | Resultat    | Anteckning                  |
| ------------------------- | ----------- | --------------------------- |
| Codex backend Fas A/C/D   | **PASS**    | Live `4cabcbae`+            |
| Cursor frontend Fas B/C/D | **PASS**    | Steg 7 API, §4/§5, deeplink |
| Prod verify sticks        | **PASS**    | 16/16                       |
| D3 kalender-CTA           | **PASS**    | Wired i kundkort            |
| Manuell UAT U1–U5         | **PENDING** | Owner                       |
| Owner prod GO             | **PENDING** | Efter UAT                   |

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
