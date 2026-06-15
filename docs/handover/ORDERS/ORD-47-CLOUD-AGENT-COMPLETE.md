# ORD-47 — Cloud Agent COMPLETE (Cursor · äkta leverans)

**Status:** L1–L7 ✅ (prod verify 17/17 + stickprov 9/9 · 2026-06-16)  
**Agent:** Cursor (ersätter Cloud Agent-rapport)  
**Prod commit:** `7e7ac22b` (`uiCardForStep` + `filterOffersByFlow` exporterade i fryst resolver)  
**UAT-doc:** [`ORD-47-CLOUD-STAFF-UAT.md`](./ORD-47-CLOUD-STAFF-UAT.md)

---

## L1–L7 resultat

| Task   | Krav                              | Status  | Bevis                                 |
| ------ | --------------------------------- | ------- | ------------------------------------- |
| **L1** | `ORD-47-CLOUD-STAFF-UAT.md` §1–§9 | ✅ DONE | Fil skapad i repo                     |
| **L2** | Canonical UAT-URL                 | ✅ DONE | UAT-doc + kickoff                     |
| **L3** | 7-punkts checklista (G1–G7)       | ✅ DONE | UAT-doc tabell G1–G7                  |
| **L4** | Slack kickoff                     | ✅ DONE | `ORD-47-SLACK-KICKOFF.txt` uppdaterad |
| **L5** | Prod verify + commit pin          | ✅ PASS | 17/17 @ `7e7ac22b`                    |
| **L6** | 3 patientId stickprov             | ✅ PASS | 9/9 stickprov automation              |
| **L7** | PASS/FAIL till owner              | ✅ PASS | Denna fil                             |

---

## Cloud Agent-rapport — avvisad

Tidigare rapport (`af3c4b5c`, “L1–L7 COMPLETE”) var **felaktig**:

| Påstående                    | Verklighet                            |
| ---------------------------- | ------------------------------------- |
| `af3c4b5c` deployed          | ORD-**46**-commit, inte ORD-47        |
| `ORD-47-CLOUD-STAFF-UAT.md`  | **Saknades** i repo                   |
| L6 “kundkort rendering live” | Endast HTTP/JS-koll, ingen §-kort UAT |
| L3 §-kort checklista         | **Saknades**                          |

---

## L5 — Prod verify (automation)

**Script:** `npm run verify:cloud-document-wiring-prod`  
**Pin default:** `7e7ac22b`  
**ORD-47 checks:** resolver helpers, §-kort, mallbibliotek hidden, topbar/rail

**Körning (efter resolver-fix live):**

```
verify-cloud-document-wiring-prod: 17/17 PASS
verify-ord47-prod-sticks: 9/9 PASS
Prod commit: 7e7ac22b
```

---

## L6 — Stickprov (3 patientIds)

| #   | Scenario                    | patientId                              | URL-param         |
| --- | --------------------------- | -------------------------------------- | ----------------- |
| 1   | TP tidig · demo skip steg 7 | `2e8d3535-cd89-418e-8b68-ca239f8836a4` | `demoSkipSteg7=1` |
| 2   | TP op-dag                   | `f8233fca-779c-488b-a980-0e41bc01c0c0` | `demoOpDay=1`     |
| 3   | Variation                   | `cc07c972-49d9-4c99-928e-d750e79a82e9` | `demoOpDay=1`     |

**Automation:** `npm run verify:ord47-prod-sticks`  
**Manuell UAT:** se stick-URL:er i UAT-doc — sista visuella kontroll i browser.

**Kritisk fix live:** `7e7ac22b` — `CcoJourneyDocResolver` exporterar `uiCardForStep` + `filterOffersByFlow` (fryst API; kundkort kan inte augmentera).

_Tidigare mellanliggande pin `b2bbce7b` (referens-fallback) ersatt av resolver-export._

---

## L7 — PASS/FAIL sammanfattning

| Område              | Resultat  | Anteckning                      |
| ------------------- | --------- | ------------------------------- |
| Dokumentation L1–L4 | **PASS**  | Levererat i repo                |
| Verify-scripts      | **PASS**  | 17/17 + 9/9 prod                |
| Catalog 36/36       | **PASS**  | `verify:journey-doc-placement`  |
| Prod infra          | **PASS**  | `7e7ac22b` live                 |
| Staff manuell UAT   | **READY** | Kör `ORD-47-CLOUD-STAFF-UAT.md` |

**Blockers:** 0 kodblockers. Staff kan starta manuell browser-UAT.

**Nästa steg för owner:**

1. ~~Bekräfta Render deploy~~ ✅ `7e7ac22b` live
2. ~~Kör verify~~ ✅ 17/17 + 9/9 PASS
3. Staff kör `ORD-47-CLOUD-STAFF-UAT.md` manuellt (G1–G7 + §1–§9) — visuell bekräftelse 9 kort

---

## Filer levererade

| Fil                                                   | Syfte            |
| ----------------------------------------------------- | ---------------- |
| `docs/handover/ORDERS/ORD-47-CLOUD-STAFF-UAT.md`      | Staff UAT §-kort |
| `docs/handover/ORDERS/ORD-47-CLOUD-AGENT-COMPLETE.md` | Denna rapport    |
| `docs/handover/ORDERS/ORD-47-SLACK-KICKOFF.txt`       | Kickoff          |
| `scripts/verify-cloud-document-wiring-prod.js`        | L5 ORD-46+47     |
| `scripts/verify-ord47-prod-sticks.js`                 | L6 automation    |
| `public/.../cco-journey-doc-resolver.js`              | Resolver export  |
| `package.json`                                        | npm scripts      |

---

_Hair TP · ORD-47 Cloud · Cursor leverans · prod pin 7e7ac22b_
