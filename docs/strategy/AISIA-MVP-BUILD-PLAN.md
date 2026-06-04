# Aisia Scalp Analysis — MVP Build Plan

**Fas:** FAS 1 (manuell import)  
**Owner mandate:** FAS 2/3/4 kräver ny confirmation

---

## Deliverables

| #   | Deliverable                     | Status                                        |
| --- | ------------------------------- | --------------------------------------------- |
| 1   | Aisia Feature Extraction Matrix | ✅ `AISIA-DS3-FEATURE-EXTRACTION-MATRIX.md`   |
| 2   | Data model                      | ✅ `docs/schema/cco-scalp-analysis.schema.md` |
| 3   | Stores                          | ✅ `src/ops/ccoScalpAnalysisStore.js`         |
| 4   | Manual import endpoint          | ✅ `src/routes/ccoScalpAnalysis.js`           |
| 5   | Patient asset creation          | ✅ Via import-report/import-images            |
| 6   | Patientkort-flik                | ✅ `scalpanalys` + `cco-scalp-analysis.js`    |
| 7   | Timeline events                 | ✅ journal-timeline integration               |
| 8   | Swedish terminology adapter     | ✅ `src/ops/aisiaTerminology.js`              |
| 9   | Clinician verification          | ✅ POST verify                                |
| 10  | Basic comparison view           | ✅ comparisons API + UI section               |
| 11  | Smoke tests                     | ✅ `scripts/smoke-test-scalp-analysis.js`     |
| 12  | Security checklist              | ✅ `AISIA-COMPLIANCE-SECURITY-CHECKLIST.md`   |

## Implementation order (executed)

1. FAS 0 docs (this batch)
2. `aisiaTerminology.js` + `ccoScalpAnalysisStore.js`
3. `ccoScalpAnalysis.js` routes + multer upload
4. server.js mount + timeline hooks + RBAC
5. `cco-scalp-analysis.js` UI module
6. patient-master-ui tab integration
7. Unit tests + smoke test
8. Validation: syntax, lint, unit, smoke:local

## Out of scope (explicit)

- Live Aisia camera control
- Export-folder watcher (FAS 2)
- PDF OCR / metric auto-extraction (future)
- Product recommendation engine
- CCO native scalp AI (FAS 4)
- Patient portal surface (staff MVP first)

## Acceptance criteria

- [ ] Operatör kan importera PDF + bilder till patient
- [ ] Session visas på flik Hår-/scalpanalys
- [ ] Behandlare kan verifiera
- [ ] Timeline visar scalp events
- [ ] Protocol status visar saknade donor-bilder
- [ ] Comparison baseline vs follow-up fungerar
- [ ] Alla validation scripts PASS

---

_Updated: 2026-05-30_
