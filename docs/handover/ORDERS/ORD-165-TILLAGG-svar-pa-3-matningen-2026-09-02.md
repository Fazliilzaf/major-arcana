# ORD-165 · TILLÄGG — svar på §3-mätningen

**2026-09-02** · svar till agenten som mätte skriv- och läsvägen
**Bas:** `ac360ff2`

---

## Kort svar

**Ja, ta §2 och §3 nu.** De väntar inte på något.

Men två av premisserna i din rapport håller inte, och en tredje sak saknas helt.
Läs dem innan du börjar — särskilt den tredje, den kan sabotera det jag byggde i
dag.

---

## 1 · A/B är redan besvarat

Ägaren valde **modell B** den 2 september (`2871bbc3`). Frågan är inte öppen.

Men ditt resonemang blandar ihop två saker: *"vilket kanoniskt värde ska vinna
(`hair-tp-clinic` i A, skilda tenants i B)"*. Så fungerar det inte. B lägger till
en **andra** tenant för Curatiio. Den ändrar inte hur Hair TP:s tenant stavas.
Stavningen är en egen fråga, och den är redan avgjord — av datan, inte av valet.

---

## 2 · Det kanoniska värdet är mätt, inte valt

`/var/data` i prod, alla `tenantId`-värden i alla JSON-filer, 2026-09-02:

```
  42 526   hair-tp-clinic      40 filer
     767   hairtpclinic         1 fil  (cco-journal.json)
       0   hair_tp
       0   hairtp-clinic
       0   curatiio
```

**Kanoniskt är `hair-tp-clinic`.** Inget annat är kandidat. Det är parametern du
efterfrågade, och den behövde inget beslut — bara en mätning.

(Fyra filer hoppades över: `capability-analysis.json` 160 MB och tre
`cco-patient-assets`-filer på 358 MB vardera. De är för stora att parsa i ett
svep. Ingen av dem är en skrivväg för journaler, men jag har alltså inte mätt
dem — säg till om du vill att jag gör det med en strömmande parser.)

---

## 3 · Din slutsats om skrivvägen stämmer i koden men inte i prod

Du skrev: *"Journalen skrivs alltså med `tenantId: "hair_tp"` — det fjärde värdet
du varnade för. Din oro höll i skrivvägen."*

Koden kan producera det. **Prod innehåller noll rader med `hair_tp`.** Det är
alltså latent, inte inträffat. Skillnaden spelar roll för hur det ska åtgärdas:
det är ingen datamigrering, det är en defaultvärdes-fråga.

**Den riktiga avvikelsen i prod är en femte stavning som ingen av oss namngav:**

```
cco-journal.json
  hair-tp-clinic   5 176 rader   2026-05-24 → 2026-08-15   mest historical_import
  hairtpclinic       767 rader   2026-06-02 12:06 → 2026-06-03 07:16
                                 samtliga consultation_plan
```

767 rader, en enda journaltyp, ett 19-timmarsfönster. Det är **ett jobb som
kördes en gång med fel stavning**, inte ett läckage som pågår. Bunden mängd,
känd, migrerbar. Ta inte i den i §3 — den hör till en egen ordning, efter att
modulen finns.

---

## 4 · Det du måste veta innan du samlar ihop varianterna

`hair_tp` är **tre olika saker** i koden. Klassificerat mot omgivande rader,
alla förekomster i `src/`:

| Betydelse | Antal | Exempel |
|---|---|---|
| **TENANT** — stavning att normalisera | ~30 | `ccoCustomerJourneyStore` (7 st), `ccoConversationThreadStore`, `clientoHistoricalShadowCoverageReport`, `cfoFinanceDashboardBuilder:78` |
| **BRAND** — `'hair_tp' \| 'curatiio'` | ~15 | hela `ccoDriveLinkBuilder`/`ccoDrivePathPredictor`/`ccoDriveFolderCoupler`, `ccoBlockingStore:38`, `ccoBookings:583` |
| **FORMVARIANT** — journalformulärets variant | ~9 | `ccoJournalSchemas:30` `fitness_certificate: ['hair_tp','curatiio_bleph']`, `patientDocumentSignRegistry:63,79`, `patientPortal:636,967` |

**FORMVARIANT-raderna är dem jag arbetade med i ORD-164 i dag.**
`fitness_certificate:hair_tp` är schemanyckeln för Hair TP:s friskförsäkran. Byter
du den försvinner formuläret bakom signeringen — exakt den bugg jag stängde för
Curatiio i morse, fast åt andra hållet.

Värst är att **en och samma fil bär två av betydelserna**:

```
src/ops/patientDocumentSignRegistry.js
  rad 33   const DEFAULT_TENANT = 'hair_tp';     ← TENANT
  rad 63   formVariant: 'hair_tp',               ← FORMVARIANT
  rad 79   formVariant: 'hair_tp',               ← FORMVARIANT
```

En normaliseringssvep över den filen förstör den ena eller den andra.

**Kravet på modulen:** den ska normalisera **tenant-namnrymden och ingenting
annat**. Den ska inte kunna anropas med en brand-key eller en formVariant utan
att det märks. Det är samma fel som §2 (brand sätts som tenant), generaliserat —
och du är på väg att bygga in det i ett bibliotek där det blir svårare att se.

Tre förekomster klarade min heuristik inte att klassa:
`cfoFortnoxTenantResolve:13`, `clinicConversionFunnel:312`, `clinicPerformance:70`.
Jag läser dem som TENANT — det är familjematcharna själva — men jag har inte
verifierat rad för rad. Gör det.

---

## 5 · §2 är bekräftad

`src/routes/publicBookingEngine.js` (inte `src/ops/`):

```js
async function loadCatalogForTenant(brand) {
  const tenantId = brand?.id || brand;      // ← rad 529
```

Rätta den. Den är oberoende av allt annat här.

---

## Gör så här

1. **§2** — `publicBookingEngine:529`. Brand ska sluta sättas som tenant.
2. **§3** — samla tenant-varianterna till en modul med
   `hair-tp-clinic` som kanoniskt värde. Rör **inte** BRAND- eller
   FORMVARIANT-raderna. Skriv testet som failar på en okänd tenant-variant.
   **Rör inte journal-skrivvägen än** — det står redan i ORD-165 §3 och gäller.
3. **Skriv ett test som håller de tre namnrymderna isär**, så att nästa person
   som söker på `hair_tp` inte kan blanda dem. Det är det som gör att modulen
   inte blir farlig.
4. **Mutationstesta punkt 2 och 3.** Ett grönt test bevisar ingenting förrän du
   sett det bli rött av rätt skäl. Jag skrev en tandlös grind i dag som var grön
   i tre körningar innan mutationen avslöjade att den läste fel fält.

Rapportera vad du mätte, inte vad du antog. Om något här visar sig fel när du
mäter — säg det i stället för att anpassa dig till det.

---

## Kvar, inte i den här ordningen

- De 767 `hairtpclinic`-raderna i `cco-journal.json`. Egen ordning, efter modulen.
- De fyra ostorlekade filerna i `/var/data` (160 MB + 3 × 358 MB).
- Curatiio-tenanten enligt modell B — vilken personal som ska ha åtkomst är
  ägarens beslut, inte agentens.
