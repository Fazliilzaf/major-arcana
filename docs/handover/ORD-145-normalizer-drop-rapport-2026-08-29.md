# ORD-145 · Rapport — fält som normaliserarna kastar (mätt, per store)

**2026-08-29 · `src/ops/ccoNormalizerDropLoud.js` · hjälparen inkopplad i 7/8 stores**

## Svaret på frågan

> *Var `signatureProof` ensamt, eller ett av flera?*

**Inte ensamt.** `signatureProof` var det enda fält som *skadades* (det bars av
beviset och föll tyst ur whitelisten). Men mätningen hittade ytterligare fält som
kastas — och som en ren läsning missade:

- **`normalizeConsultationCase` kastar `actorUserId`, `actorName`, `detail`.**

Dessa tre är **redundanta** (routern skickar dem både på toppnivå *och* inuti
`events`; eventet bär dem, toppnivå-kopiorna kastas). Ingen data går förlorad,
men det är ett tyst bortfall som bara syntes när hjälparen kördes — inte när
whitelisten lästes.

## Mätt utfall, per store

| Store | Normaliserare | Inkopplad | Fält som kastas (mätt) |
| --- | --- | --- | --- |
| `ccoConsultationStore` | `normalizeConsultationCase` | ✓ | `actorUserId`, `actorName`, `detail` *(redundanta toppnivå-kopior)* |
| `ccoPatientMasterStore` | `normalizePatientRecord` | ✓ | `name` *(medvetet — legacy alias → displayName, i undantagslistan)* |
| `ccoPhotoAnnotationStore` | `normalizeAnnotation` | ✓ | `actor` *(medvetet — transient → createdBy/updatedBy, i undantagslistan)* |
| `ccoCommercialStore` | `normalizeCommercialCase` | ✓ | — (`signatureProof` nu i whitelisten) |
| `ccoTreatmentAgreementStore` | `normalizeAgreement` | ✓ | — (`signatureProof` nu i whitelisten) |
| `ccoJournalStore` | `normalizeJournalEntry` | ✓ | — (komplett whitelist) |
| `ccoBookingEngineStore` | `normalizeReservation`, `normalizeBookingRecord` | ✓ | — (kompletta whitelists) |
| `ccoAftercareSchedulerStore` | *(ingen record-normaliserare — bygger jobb inline)* | — | — |

Kört mot sviten: **109 tester gröna** (commercial, agreement, patient master,
photo annotation, booking engine, consultation, journal, aftercare). Fälten ovan
är de enda som hjälparen rapporterade.

## Mekanismen

- **En** hjälpare: `src/ops/ccoNormalizerDropLoud.js` (`reportDroppedKeys`).
- No-op i produktion (`NODE_ENV === 'production'`). I dev/test loggar den
  `[normalizer-drop] store.normalizer kastar fält: "x"`.
- Inkopplad i **7 av 8** stores (den åttonde, aftercare-schedulern, har ingen
  record-normaliserare att koppla in i — den bygger jobb inline).
- Undantagslistan `INTENTIONAL_DROPS` har skäl per rad: `name`, `actor`.
- Tester: `tests/ops/ccoNormalizerDropLoud.test.js` (no-op prod, känt fält ger
  utslag, undantag med skäl, mutationstest).

## Byte-identisk

`reportDroppedKeys` skriver **inget** — den observerar bara och returnerar de
bortfallna nycklarna. Inget fält har börjat bevaras av denna order; de två
`signatureProof`-rad i whitelisten kom från BankID-kopplingen (bevis-ordern),
inte härifrån. Sparad data före/efter är oförändrad.

## Fynd att avgöra (per ordern — laga inte i samma pass)

1. **`actorUserId`, `actorName`, `detail`** i `normalizeConsultationCase` — är
   redundanta toppnivå-kopior. Antingen städa routern (`ccoConsultations.js`
   `recordDocumentCheck`) så den slutar skicka dem på toppnivå, eller lägg dem i
   undantagslistan med skäl. Avgörs per fynd.
2. **`name`/`actor`** — fungerar som alias i dag; avgör om de ska finnas kvar
   eller tas bort ur anropande kod.

## Vad som inte är avgjort (per ordern)

- Om hjälparen ska köras i CI. Den larmar nu på tre fält (redundanta) — efter
  att de avgjorts (undantag eller städad router) är den tyst och redo att tändas.
