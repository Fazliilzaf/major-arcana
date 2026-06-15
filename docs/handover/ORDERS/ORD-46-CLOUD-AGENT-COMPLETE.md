# ORD-46 — Cloud Agent (Hair TP dokument steg 3–9)

**Status:** ✅ **COMPLETE — live for Staff UAT**  
**Prod commit:** `af3c4b5c` (`main`)  
**Verifiering:** lokal `npm run verify:cloud-document-wiring` → 10/10 PASS · prod wiring → 9/9 PASS  
**Känd blocker (text):** `foto_samtycke` PARTIAL tills SharePoint/ORD-24 — wiring klar, PARTIAL-banner hanterar

---

## Syfte

Design + wiring för Hair TP kundresa steg 3–9 i CCO v9 — **ingen ny patienttext**. All copy läses från:

- `public/major-arcana-preview/data/hairtp-document-content-bundle.json`
- `public/major-arcana-preview/data/meridiq-step789-content.json`
- `migration/meridiq/*.json` (facit via build-script)

Styrning: `docs/strategy/CCO-STEG789-CONTENT-SOURCE-MATRIX.md`

---

## Commits (leverans)

| Fas | Scope                                                              | Commit     |
| --- | ------------------------------------------------------------------ | ---------- |
| 0–2 | Bundle preload, V11 dokumentpanel, auto-dokument, steg 7 per flöde | `5f114da2` |
| 3   | Steg 8 friskförsäkran från bundle, op-dag staff routing            | `61fe184b` |
| 4–6 | Steg 9 skål, persistent registry (kundkort), QA verify-script      | `af3c4b5c` |

---

## Fas-leverans (checklista)

### Fas 0 — Bundle audit & V11 panel

- [x] **C0.1** `CcoMeridiqContent.loadFullDocumentBundle()` + preload vid v9
- [x] **C0.2** Steg 7/9 merge från bundle (`findDocumentByRegistryId`)
- [x] **C0.3** `journeyStep` / `flowApplies` från catalog i dokumentrader
- [x] **C0.4** V11 fyra grupper: offers / healthForms / journals / autoDocs + FULL/PARTIAL/MISSING

### Fas 1–2 — Auto-dokument + steg 7

- [x] **C1.1** Auto-dokument preview (SMS/e-post) från bundle
- [x] **C2.1–C2.3** Steg 7 per flöde (`tp`, `prp_hair`, `prp_skin`, `microneedling`, `prf`, `profhilo`)
- [x] **C2.4** PARTIAL-banner steg 7 + steg 9 + dokumentpanel

### Fas 3 — Steg 8 + op-dag

- [x] **C3.1** `loadForSteg8()` — 13 frågor Meridiq 16413 från bundle
- [x] **C3.2** `journal_tp` → `new-tp-journal`
- [x] **C3.3** PRP-flöden → `journal_prp_multi` / `new-prp-journal`
- [x] **C3.4** Post-8 journaler filtrerade från panel, visas i tidslinje efter steg 8
- [x] **C3.5** Op-dag: ordination, före/efter-bild, friskförsäkran, journal

### Fas 4 — Steg 9 foto-samtycke (skål)

- [x] **C4.1** `loadForSteg9()` — scope + ackLabel från bundle
- [x] **C4.2** PARTIAL-banner; FULL visar `internalText`/`publishText` när de finns
- [x] **C4.3** Signering → `cco:photo-consent-signed` → journal + kamera-kort

### Fas 5 — Persistent registry (kundkort)

- [x] **C5.1** Sektion **Dokument · registry** med status
- [x] **C5.2** Filter filler: kund / personal / auto
- [x] **C5.3** Filter flöde: TP / PRP (utökbart)
- [x] **C5.4** Klick → `activateRegistryDocument(registryId)`
- [x] **C5.5** Blocker `!` för PARTIAL/MISSING (staff)

### Fas 6 — QA

- [x] **C6.1** `npm run build:hairtp-document-content` + bundle `v6` på prod
- [x] **C6.2** iPhone-scroll — se Staff UAT-checklista
- [x] **C6.3** Steg 7 via `loadForSteg7` (ej hårdkodad avtalstext i overlays)
- [x] **C6.4** Brand-isolation — Hair TP vs Curatiio via `flowApplies` / brand hooks

---

## Centrala filer

| Fil                                                            | Roll                                                  |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `public/major-arcana-preview/app/cco-hairtp-document-cloud.js` | Cloud API: activateRegistryDocument, op-dag, previews |
| `public/major-arcana-preview/app/cco-meridiq-content.js`       | loadForSteg7/8/9, HTML-builders                       |
| `public/major-arcana-preview/app/cco-v9-customers-parity.js`   | V11 dokumentpanel, op-dag sticky                      |
| `public/major-arcana-preview/app/cco-kundkort-referens.js`     | Registry-sektion + filter                             |
| `public/major-arcana-preview/app/patient-master-ui.js`         | `cco:cloud-staff-action`, foto-sign event             |
| `scripts/verify-cloud-document-wiring.js`                      | Lokal QA (10 checks)                                  |
| `scripts/audit-hairtp-document-bundle.js`                      | Fas 0 audit-rapport                                   |

Cache bust (modaler): `hairtp-cloud-fas456-v9` (prod kan visa content-hash på bundlade script-URL:er).

---

## Prod-verify (2026-06-15)

| Check                  | Resultat                                         |
| ---------------------- | ------------------------------------------------ |
| `/readyz`              | PASS                                             |
| `_diag/version` commit | `af3c4b5c`                                       |
| Bundle                 | `hairtp-document-content-v6`                     |
| `friskfoers_tp`        | 13 frågor FULL                                   |
| `foto_samtycke`        | PARTIAL (förväntat)                              |
| Cloud JS symbols       | openSteg9, op-day, registry, photo-consent event |

---

## Kvarvarande (ej Cloud-kod)

1. **ORD-24 / SharePoint** — full juridisk text för `foto_samtycke` → rebuild bundle + deploy
2. **Staff UAT-feedback** — samla i ORD-46-STAFF-UAT
3. **Backend document instances** — ORD-24 backend (separat spår)

---

## Relaterade dokument

- Staff UAT: [`ORD-46-CLOUD-AGENT-STAFF-UAT.md`](./ORD-46-CLOUD-AGENT-STAFF-UAT.md)
- Content matrix: `docs/strategy/CCO-STEG789-CONTENT-SOURCE-MATRIX.md`
- Build: `npm run build:hairtp-document-content`
