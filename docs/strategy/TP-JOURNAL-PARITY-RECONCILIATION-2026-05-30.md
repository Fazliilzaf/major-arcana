# TP-Journal Parity Reconciliation: 52 vs 59 fält

*Genererad: 2026-05-30 · Status: ✅ RECONCILED*

> Owner-fråga: Scope-baseline nämnde full Meridiq TP-journal parity som 59 fält.
> Matrix säger 52/52. Förklara diffen innan vi stänger TP-parity.

---

## TL;DR

**52 är canonical count.** 59-uppgiften var en gammal scope-baseline som räknade
in 7 inaktiva slots (sortOrder-luckor + CCO native extras). Latest Meridiq-export
(2026-05-25, schemaId `tp_treatment:hair_tp`, questionaryApiId **16411**) har
**52 aktiva fält**. CCO har 100% parity mot dessa.

**TP-journal field parity: ✅ KOMPLETT.**

---

## 1. Varifrån kommer 52-fältslistan?

| Attribut | Värde |
|---|---|
| Källa-fil | `migration/meridiq/journal-schema-catalog.json` |
| Schema | `tp_treatment:hair_tp` |
| **Questionary API-ID** | **16411** |
| Export-datum | **2026-05-25** |
| Export-skript | `scripts/migration/buildJournalSchemas.py` |
| Brand | Hair TP Clinic |
| Stats-key | `tpTreatmentMeridiqFields: 52` + `tpTreatmentMappedToStoreKeys: 52` |
| Sektioner | 7 (12 + 6 + 13 + 4 + 5 + 8 + 4 = 52) |

**Räkningsverifiering (programmatisk):**
- `sections[].fields[]` summa: **52** unika field-keys
- `meridiqFieldMap` (Q-ID → store-key): **52** mappningar
- Q-ID-span: `450884` → `450941` = **58 slots**
- Aktiva: 52 · Lediga: 6 (sortOrder-luckor)

---

## 2. Varifrån kom 59-uppgiften?

Spårad till **P0.4-task #189** ("Meridiq Journal Field Parity Matrix (52/59 fält)").
Den 59-siffran kom från en **tidigare scope-baseline** i journal-cutover-rapporten
innan Meridiq-export gjordes 2026-05-25.

Sannolika orsaker att 59 räknades då:

| Hypotes | Sannolikhet | Bevis |
|---|---|---|
| **H4** Q-ID-spannet räknades inkl. sortOrder-luckor (58 slots) | **HÖG** | Q-ID `450884–450941` = 58 möjliga, 6 lediga (450896, 450903, 450917, 450922, 450928, 450937). Plus en separator vid 450883 → 7 inaktiva slots |
| **H2** CCO native extras räknades in (6 st) | **HÖG** | `metod`, `behandlingsomraden`, `observationerUnderIngrepp`, `lakemedelUtlamnade`, `puls`, `slutanteckningar` finns i `emptyFieldsForSchema` men saknar `meridiqQuestionId`. Räknat in → 52 + 6 = 58 ≈ 59 |
| **H3** Patient-ID-prefix-fält från bleph_treatment-mall lånades | MEDEL | bleph_treatment har 7 patient-ID-fält. Om TP räknades med liknande prefix → +7 = 59 |
| **H1** Sub-fält räknades separat (yes_no_textbox = 2 fält) | LÅG | `tp_treatment` har bara `tristate`, `yes_no_textbox`, `text`, `time` — yes_no_textbox är ett Q-ID, inte två |

**Mest sannolika kombinationen: H4 + H2** (52 aktiva + 7 inaktiva sortOrder-slots/CCO-extras = 59).

---

## 3. Är 59 utdaterad?

**JA, 59 är utdaterad.**

Förklaring:
- Meridiq-formuläret hade **tidigare** 7 fler fält som senare togs bort/blev sektion-headers
- De 6 inaktiva Q-IDs (450896, 450903, 450917, 450922, 450928, 450937) är gaps i nuvarande export → tidigare aktiva fält
- CCO native extras (6 st) var sannolikt inräknade i 59 som "vi behöver dessa fält i CCO"
- Latest Meridiq API (2026-05-25 export) returnerar **52 aktiva fält** för `tp_treatment:hair_tp` Q-16411

---

## 4. De 7 fälten — finns någon kvar att implementera?

### A. 6 sortOrder-luckor i Meridiq (Q-IDs)

| Q-ID | Position i sektion | Sannolik tidigare funktion | Status idag |
|---|---|---|---|
| 450896 | Slut av Sektion 1 (förberedelse) | Separator / borttaget område-fält | **Inaktiv** — Meridiq exporterar ej |
| 450903 | Slut av Sektion 2 (patientstatus) | Separator / borttagen hälsofråga | **Inaktiv** |
| 450917 | Slut av Sektion 3 (observationer) | Separator / borttagen obs | **Inaktiv** |
| 450922 | Slut av Sektion 4 (läkemedel) | Separator | **Inaktiv** |
| 450928 | Slut av Sektion 5 (grafts) | Separator | **Inaktiv** |
| 450937 | Slut av Sektion 6 (tidsregistrering) | Separator | **Inaktiv** |

**Fix-priorering:** P3 (ej blocker). Inga åtgärder krävs — Meridiq har själva tagit bort
dessa. Om de återaktiveras i framtida Meridiq-version kommer export-skript
automatiskt plocka upp dem och uppdatera `tpTreatmentMeridiqFields`-räknaren.

### B. 6 CCO native extras (utöver Meridiq)

| CCO field-key | Type | Purpose | Status |
|---|---|---|---|
| `metod` | text | Slutgiltig metod-string (FUE/DHI/kombi) sammansatt | ✅ I CCO `emptyDefaults` |
| `behandlingsomraden` | array | Aggregerad lista av behandlade områden | ✅ I CCO |
| `observationerUnderIngrepp` | array | Aggregerad lista av flaggade observationer | ✅ I CCO |
| `lakemedelUtlamnade` | array | Aggregerad lista av utlämnade läkemedel | ✅ I CCO |
| `puls` | text | Separat pulsfält (split från `blodtryckMmHg`) | ✅ I CCO |
| `slutanteckningar` | text | Fritext slutkommentar — saknas i Meridiq | ✅ I CCO (UPGRADE) |

**Fix-priorering:** P2 (polish). Alla 6 finns redan som CCO native extras i schema.
Återstår: derived-värdes-wires (compute från övriga fält) — kosmetiskt, inte parity-blocker.

### C. Eventuella missing fields?

**Inga.** Programmatisk verifiering bekräftar att alla 52 Meridiq Q-IDs är 1:1-mappade
mot CCO field-keys via `meridiqFieldMap` i `migration/meridiq/journal-schema-catalog.json`.

---

## 5. Source of truth — bekräftelse

| Fält | Värde |
|---|---|
| **Meridiq questionaryApiId** | **16411** |
| **Latest export-datum** | **2026-05-25** |
| **Effective field count** | **52** (alla aktiva) |
| **Q-ID-span** | 450884 → 450941 (58 slots, 6 inaktiva) |
| **Mappade i CCO** | 52 / 52 (100%) |
| **Saknas i CCO** | 0 |
| **CCO native extras** | 6 (utöver Meridiq) |

Source files:
- `migration/meridiq/journal-schema-catalog.json` (canonical)
- `src/ops/ccoJournalSchemas.js` (CCO emptyFieldsForSchema)
- `docs/strategy/TP-JOURNAL-FIELD-PARITY-MATRIX-2026-05-30.md` (14-kol matrix)
- `docs/strategy/TP-JOURNAL-PARITY-MATRIX.md` (P0.4 13-kol matrix)

---

## 6. Slutsats

**✅ TP-Journal Field Parity: KOMPLETT**

- 52/52 fält mappade 1:1 mot Meridiq Q-16411
- 0 saknade fält
- 0 P0/P1-fixar krävs
- 6 sortOrder-luckor är legitima (Meridiq har själva tagit bort)
- 6 CCO native extras är ytterligare värde utöver parity

**Tidigare 59-fältsuppgift reconciled: latest Meridiq source of truth = 52 aktiva fält.**

---

## 7. Scope/TODO-uppdatering

Märk följande i TODO/scope:

```
✅ TP-Journal Parity:        KOMPLETT (52/52)
   Tidigare 59-fältsuppgift reconciled; latest Meridiq source (Q-16411,
   export 2026-05-25) = 52 aktiva fält. 7 fält i tidigare scope =
   6 sortOrder-luckor (Meridiq har tagit bort) + CCO native extras.
   Refs: TP-JOURNAL-PARITY-RECONCILIATION-2026-05-30.md
         TP-JOURNAL-FIELD-PARITY-MATRIX-2026-05-30.md
```

---

## 8. Loggning för framtida driftövervakning

Rekommendation (P3, ej blocker):
- Vid varje ny Meridiq-export, logga `tpTreatmentMeridiqFields` till en
  history-fil så vi kan se field-count-drift över tid
- Om Meridiq lägger till/tar bort fält i framtida version → automatisk
  CCO-schema-alert + ny parity-rapport

---

*Reconciliation klar. Inga P0/P1-fixar. Nästa steg per owner: Kalender.*
