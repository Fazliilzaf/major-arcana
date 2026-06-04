# P0 Photo Review — Fas 2 Plan (ej implementerad)

_Datum: 2026-05-30_

## Status

**AKTIV (pilot)** — Fas 2 single-asset write i dev/staging. **Blockerad på primary prod hosts.**

- **Fas 1 read-only UI:** godkänd ✓
- **Fas 2 write:** aktiveras med `ENABLE_PHOTO_REVIEW_WRITE=true` (ej prod)
- **Pilot:** 5 patienter, max 20 beslut — se `data/p0-photo-review-fas2-pilot-patients.json`
- **Medium/low-import (849):** STOPP
- **Full prod-import:** STOPP

---

## Mål

En operatör ska kunna fatta **ett beslut i taget** per asset med full audit — utan mass-approval.

## Scope (Fas 2)

| Funktion             | Beskrivning                                                      |
| -------------------- | ---------------------------------------------------------------- |
| Single-asset approve | NEEDS_REVIEW → VERIFIED → VISIBLE_ON_PATIENT_CARD                |
| Single-asset reject  | NEEDS_REVIEW → REJECTED                                          |
| Reassign category    | photo_before / photo_during / photo_after (stannar NEEDS_REVIEW) |
| Mark duplicate       | NEEDS_REVIEW → REJECTED (duplicate reason)                       |
| Audit                | Varje beslut loggas i CCO audit trail                            |

## Utanför scope (Fas 2)

- Mass-approval / bulk actions
- Medium/low-import (849 mappings)
- Full prod-import
- Drive-länkar som slutlösning
- Automatisk VISIBLE utan manuellt beslut

---

## API (redan skissad, ej aktiverad)

Aktiveras endast när `ENABLE_PHOTO_REVIEW_WRITE=true`:

```
POST /api/v1/cco/photo-review/assets/:assetId/decide
  body: { decision: "approve"|"reject"|"mark_duplicate", category?, reason? }

POST /api/v1/cco/photo-review/assets/:assetId/reassign
  body: { category: "photo_before"|"photo_during"|"photo_after", reason? }
```

Read-only endpoints (Fas 1) påverkas inte.

---

## UI (Fas 2)

När GO ges:

1. Visa tydlig badge **Fas 2 — beslut aktivt** (ersätter read-only banner)
2. Per bild: Godkänn / Avvisa / Byt kategori (befintliga knappar, redan skissade i tidigare iteration)
3. Bekräftelsedialog före approve/reject
4. Efter beslut: uppdatera endast aktuell patientvy (ingen mass-lista)
5. Ingen checkbox / select-all / batch toolbar

---

## Acceptanskriterier (Fas 2)

- [ ] Ett approve gör exakt en asset VISIBLE
- [ ] Reject lämnar inga spök-VISIBLE
- [ ] Reassign ändrar inte status
- [ ] Audit-rad per beslut (actor, assetId, patientId, decision)
- [ ] 409 om asset inte är i photo-review-kön
- [ ] Feature flag av = inga POST-routes monterade
- [ ] Regression: Fas 1 read-only fortsatt fungerar med flag av

---

## Rollout

1. ~~Fas 1 godkänd~~ ✓ (read-only UI + prod asset verify)
2. **Väntar:** explicit GO från produktägare för Fas 2 implementation/aktivering
3. Pilot: 5–10 patienter, operatör + QA (staging)
4. Aktivering: `ENABLE_PHOTO_REVIEW_WRITE=true` endast efter GO + pilot OK
5. Prod med flag + monitorering efter staging-pilot
6. Medium/low-import förblir STOPP tills separat beslut
7. Full prod-import förblir STOPP

## Vad som INTE ska göras före GO

- Sätta `ENABLE_PHOTO_REVIEW_WRITE=true` i prod/staging
- Lägga till approve/reject/reassign-knappar i UI
- Mass-approval eller bulk-endpoints
- Medium/low-import eller ny cutover-batch

---

## Filer (referens)

- `src/routes/ccoPhotoReview.js` — read-only GET + conditional POST mount
- `src/routes/ccoPhotoReviewWrite.js` — decide/reassign logic
- `src/config.js` — `enablePhotoReviewWrite`
- `tests/routes/ccoPhotoReview.test.js` — Fas 1 + Fas 2 tests
