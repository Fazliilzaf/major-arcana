# Aisia/Kamera — Kliniskt pilotspår (index)

**Spårstatus:** FAS 1 MVP byggd + isolerad (`592ffda5`) · **Separat pilotspår — full fart dokumentation**  
**CCO prod:** `ENABLE_AISIA_SCALP_ANALYSIS=false` — **rör inte prod**  
**Aktivering:** Owner säger **`APPLY AISIA TO CCO`**  
**FAS 2+:** Owner säger **`START AISIA FAS 2`**

---

## Snabbstart

| Roll               | Börja här                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **All personal**   | [Snabbreferens (1 sida)](./AISIA-STAFF-QUICK-REFERENCE-2026-05-30.md)                                                           |
| **Kamerabehörig**  | [Rumstest](./AISIA-ROOM-TEST-FLOW-2026-05-30.md) + [Checklistor](./AISIA-CAPTURE-CHECKLISTS-2026-05-30.md)                      |
| **Behandlare**     | [Konsultation](./AISIA-CONSULTATION-CAPTURE-GUIDE-2026-05-30.md) · [Uppföljning](./AISIA-FOLLOW-UP-CAPTURE-GUIDE-2026-05-30.md) |
| **Pilotledare**    | [Testplan](./AISIA-CLINICAL-PILOT-TEST-PLAN-2026-05-30.md) · [Sessionslogg](./AISIA-PILOT-SESSION-LOG-TEMPLATE-2026-05-30.md)   |
| **IT (vid APPLY)** | [APPLY QA](./AISIA-APPLY-TO-CCO-QA-2026-05-30.md) · [Handoff](./AISIA-MVP-HANDOFF-2026-05-30.md)                                |

---

## Vad som gäller nu

| Tillåtet                           | Förbjudet                     |
| ---------------------------------- | ----------------------------- |
| Klinisk pilotförberedelse          | Aktivera modul i prod         |
| Personalrutiner + checklistor      | FAS 2 / exportfolder / API    |
| Rumstest (Aisia DS-3)              | `aisiausa.umersoft.com:8864`  |
| Capture i konsultation/uppföljning | USB/SDK/kamera i CCO          |
| QA-plan för APPLY                  | Egen klinisk AI               |
|                                    | Extern AI på patientdata      |
|                                    | Blanda med migration / Claude |

---

## Dokumentpaket

### Klinik & rum (Fas A — nu)

| Dokument                                                                                             | Innehåll                                          |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`AISIA-STAFF-QUICK-REFERENCE-2026-05-30.md`](./AISIA-STAFF-QUICK-REFERENCE-2026-05-30.md)           | 1-sida cheat sheet                                |
| [`AISIA-STAFF-ROUTINES-2026-05-30.md`](./AISIA-STAFF-ROUTINES-2026-05-30.md)                         | Roller, daglig rutin, filhantering                |
| [`AISIA-ROOM-TEST-FLOW-2026-05-30.md`](./AISIA-ROOM-TEST-FLOW-2026-05-30.md)                         | Generellt testflöde i rummet                      |
| [`AISIA-CAPTURE-CHECKLISTS-2026-05-30.md`](./AISIA-CAPTURE-CHECKLISTS-2026-05-30.md)                 | Baseline / donor / recipient / follow-up / pre-op |
| [`AISIA-CONSULTATION-CAPTURE-GUIDE-2026-05-30.md`](./AISIA-CONSULTATION-CAPTURE-GUIDE-2026-05-30.md) | Kamera i konsultation                             |
| [`AISIA-FOLLOW-UP-CAPTURE-GUIDE-2026-05-30.md`](./AISIA-FOLLOW-UP-CAPTURE-GUIDE-2026-05-30.md)       | Kamera i uppföljning                              |
| [`AISIA-CLINICAL-PILOT-TEST-PLAN-2026-05-30.md`](./AISIA-CLINICAL-PILOT-TEST-PLAN-2026-05-30.md)     | Övergripande testplan                             |
| [`AISIA-PILOT-SESSION-LOG-TEMPLATE-2026-05-30.md`](./AISIA-PILOT-SESSION-LOG-TEMPLATE-2026-05-30.md) | Logg per session (klinik only)                    |

### Teknik & CCO (efter APPLY)

| Dokument                                                                                                 | Innehåll           |
| -------------------------------------------------------------------------------------------------------- | ------------------ |
| [`AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md`](./AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md)                       | Manuell CCO-import |
| [`AISIA-APPLY-TO-CCO-QA-2026-05-30.md`](./AISIA-APPLY-TO-CCO-QA-2026-05-30.md)                           | QA vid flag on     |
| [`AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md`](./AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md) | Integration PASS   |

### Spec & handoff

| Dokument                                                               | Innehåll                        |
| ---------------------------------------------------------------------- | ------------------------------- |
| [`AISIA-CAPTURE-PROTOCOL.md`](./AISIA-CAPTURE-PROTOCOL.md)             | Zoner, förstoring, pre-op gates |
| [`AISIA-FOLLOW-UP-WORKFLOW.md`](./AISIA-FOLLOW-UP-WORKFLOW.md)         | CCO follow-up workflow (teknik) |
| [`AISIA-SWEDISH-TERMINOLOGY.md`](./AISIA-SWEDISH-TERMINOLOGY.md)       | Metrics/zoner SV                |
| [`AISIA-MVP-HANDOFF-2026-05-30.md`](./AISIA-MVP-HANDOFF-2026-05-30.md) | Flag, endpoints, commits        |

---

## Pilotfaser

```
Fas A  Rumstest (Aisia only)     →  CCO flag OFF     →  NU (klinik)
Fas B  CCO torkkörning            →  efter APPLY      →  staging
Fas C  Begränsad klinikpilot      →  efter APPLY      →  utvalda patienter
Fas D  Owner utvärdering          →  paus / FAS 2 GO
```

**Fas A mål:** ≥3 genomförda rumstest med sessionslogg innan APPLY diskuteras.

**Fas A mall:** [`AISIA-FAS-A-ROOM-TEST-RESULTS-2026-05-30.md`](./AISIA-FAS-A-ROOM-TEST-RESULTS-2026-05-30.md) — tom testmatris + sign-off (ifylls på klinik, ej i GitHub).

---

## Owner-kommandon

| Kommando                 | Effekt                                                |
| ------------------------ | ----------------------------------------------------- |
| **`APPLY AISIA TO CCO`** | `ENABLE_AISIA_SCALP_ANALYSIS=true` · FAS 1 i målmiljö |
| **`START AISIA FAS 2`**  | Exportfolder/API/kamera — separat beslut              |

---

## Agent-separation

| Tråd                    | Scope                           |
| ----------------------- | ------------------------------- |
| **Cursor Aisia/Kamera** | Detta pilotspår                 |
| **Cursor migration**    | Journal/dataimport, assets      |
| **Claude**              | CCO UI, kalender, kommunikation |

---

_Uppdaterad: 2026-05-30 · source: pilotpaket (expanderat)_
