# ORD-29 — Import hälsodeklarationer via halso@ mailbox-ingest

**Skapad:** 2026-06-04 (Claude spec · iCloud)  
**Assignee:** Cursor (write — backend)  
**Claude-spår:** Spec + historisk import (~1660 via `m365_halso`) + UAT efter deploy  
**Prio:** P0

| Fas                                            | Status                | Deploy                      |
| ---------------------------------------------- | --------------------- | --------------------------- |
| **Phase 1** — enrichment (Claude `m365_halso`) | **UAT PASS · CLOSED** | **Deploy nu**               |
| **Phase 2** — mailbox struktur-ingest          | Lokalt klar           | **Väntar Phase 1 UAT grön** |

---

## Phase 1 — Claude-spår (deploy nu)

**Mål:** `missingHealthDeclaration` rensas **enbart** när patient har faktiskt HD-dokument — inga falska “har HD”.

### Signallogik

| Signal                                                             | Räknas som HD | Användning                     |
| ------------------------------------------------------------------ | ------------- | ------------------------------ |
| Asset `category: form`                                             | Ja            | `hasHealthDeclarationDocument` |
| `m365_halso` + `category: other` (ej injektions-journal i filnamn) | Ja            | Claude-import ~1660            |
| `m365_halso` + `category: journal/agreement/consent`               | **Nej**       | Undvik false clear             |
| `hasHalso` (valfri `m365_halso`-asset)                             | —             | Segment-badge **halso@** only  |
| `patient.healthDeclaration` (Phase 2)                              | Ja            | Efter Phase 2-deploy           |

### Kod

- `src/ops/ccoKunderEnrichment.js` — `isHealthDeclarationAsset`, `patientHasHealthDeclarationAsset`
- `tests/ops/ccoKunderEnrichment.test.js` — positiv/negativ + injektions-journal

### Claude UAT (Phase 1)

- [x] Känd patient **med** `m365_halso` form/other: `missingHealthDeclaration: false`
- [x] Känd patient **utan** HD-asset: `missingHealthDeclaration: true` (ingen false clear)
- [x] Segment `halso@` ~1660 (badge ≠ HD-status)
- [x] Smart Nästa Steg blocker “Saknar hälsodeklaration” försvinner bara vid faktisk HD

**Prod verify 2026-06-16:** `npm run verify:ord29-prod-sticks` **14/14 PASS** (exit 0). Stickprov API: 4/5 `missingHealthDeclaration=false` (Michael, Fahed, Johan, Henrik); Omar ref-patient **WARN** — 404 i prod patient-master (referens-ID, ej blockerande).

---

## Phase 2 — Mailbox struktur-ingest (väntar UAT)

**Mål:** Löpande mejl → `patient.healthDeclaration` (answers, flags, allergier).

| Modul                                            | Roll                          |
| ------------------------------------------------ | ----------------------------- |
| `src/ops/ccoHalsoHealthDeclarationParser.js`     | Parser                        |
| `src/ops/ccoHalsoHealthDeclarationIngest.js`     | Match, upsert, dedup          |
| `src/ops/ccoMailIngestion/pipeline.js`           | Gren före non-patient-dismiss |
| `scripts/run-halso-health-declaration-ingest.js` | Prod-körning                  |

**Deploy Phase 2 + `npm run ingest:halso-hd` först efter Phase 1 UAT grön.**

---

_Cursor rapport 2026-06-05 · Phase 1 commit = enrichment only · Phase 2 commit = ingest pipeline (hold deploy)_
