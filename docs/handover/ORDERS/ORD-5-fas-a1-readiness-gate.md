# ORD-5 — Fas A.1 Readiness Gate

**Notion:** Fas A.1 Readiness Gate · `ORD-5`  
**Scope:** READ-ONLY — aktivera v1.1→v1-signaler i automation + Kunder-readout. **Ingen** signering, `legal_review`, bundle, mail eller AI-writes.

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

## Prod

1. Deploy `compliance/pipedrive-pii-purge` → Frankfurt (`arcana.hairtpclinic.com`)
2. `ENABLE_AUTOMATION_RUNNER=true` (redan ORD-3)
3. STAFF-UAT: 20+ patienter i Kunder med `includeAutomation=1`
4. Notion ORD-5 → `done`

## Ej i scope (Fas A.2+)

- `legal_review`, GetAccept bundle, POST record-legal-review
