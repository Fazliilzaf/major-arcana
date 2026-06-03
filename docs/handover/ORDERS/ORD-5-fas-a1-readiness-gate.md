# ORD-5 — Fas A.1 Readiness Gate

**Status:** **done** · Fas A.1 **LIVE** (2026-05-20)  
**Notion:** Fas A.1 Readiness Gate · `ORD-5`  
**Scope:** READ-ONLY — aktivera v1.1→v1-signaler i automation + Kunder-readout. **Ingen** signering, `legal_review`, bundle, mail eller AI-writes.

|        |                                                                          |
| ------ | ------------------------------------------------------------------------ |
| Commit | `3aa4602c`                                                               |
| Deploy | `dep-d8gao4k2m8qs73e2noeg` live · `srv-d8b3i3tckfvc73clgeng` (Frankfurt) |
| Prod   | https://arcana.hairtpclinic.com                                          |
| Branch | `compliance/pipedrive-pii-purge`                                         |

## Levererat

| Område                      | Ändring                                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Registry                    | `v1Enabled: true` för `missing_treatment_plan`, `missing_operation_day_insurance`, `missing_photo_consent`               |
| Runner                      | Evaluate enligt UX-spec (plan-status, `todayVisit`+FF, foto+samtycke, `readyForTreatment`-komposit)                      |
| `ccoKunderFasAReadiness.js` | Laddar consultation/journal/photo-consent; `applyFasAReadoutFields`                                                      |
| Kunder readout              | `treatmentPlanStatus`, `photoConsent`, `fitnessSigned`, `hasJournalPhoto`, `readyForTreatment` (+ `readyForVisit` alias) |
| Routes                      | `ccoStaff` + `ccoAutomationRoutes` laddar Fas A före `evaluatePatientSignals`                                            |
| Gate                        | `npm run cco:verify-fas-a-readiness`                                                                                     |

## Gates (lokal)

```bash
npm run cco:verify-smart-next-step-dry-run
npm run cco:verify-kunder-real-data
npm run cco:verify-mobile-kunder-real-data
npm run cco:real-cco-gate
npm run cco:verify-fas-a-readiness
```

## Prod (klart)

- [x] Deploy → Frankfurt
- [x] `ENABLE_AUTOMATION_RUNNER=true`
- [x] Post-deploy curl + `cco:verify-automation-prod` PASS
- [x] Fas A-fält + v1.1-signaler i `customers-shell?includeAutomation=1`
- [ ] Notion ORD-5 → `done` (manuellt om ej MCP)

## Ej i scope (Fas A.2+)

- `legal_review`, GetAccept bundle, POST record-legal-review
