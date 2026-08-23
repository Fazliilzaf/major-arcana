# V11 + V12 → en vy · uppdrag

> **Datum:** 2026-08-23 · **Beställare:** Fazli
> **Allt nedan är mätt mot prod eller läst i kod samma dag.** Inga antaganden.

> ## ⚠️ LÄS DET HÄR FÖRST — delar av dokumentet är överspelade
>
> Skrivet innan kalenderarbetet var klart. Sedan dess har följande hänt, och
> texten nedan är **inte** uppdaterad efter det:
>
> | Påstående i dokumentet | Läget nu |
> |---|---|
> | §1 · V12 monteras aldrig (rotorsaken) | **Åtgärdad.** `fix/v12-dossier-mount` (`f2369113`) mergad till main. |
> | §1 · "Ingenting av det syns" | **Fel.** Foto → ✎ Rita fungerade hela tiden i V11 — verifierat i prod på patient `50b39b3c`. Vi hade bara öppnat patienter utan bilder. |
> | §2 · "Bilder saknas i canon" | **Fel.** Den heter "Foto-dokumentation · alla besök". |
> | Väntar på att kalendern blir klar | Kalendern är klar. `feat/cliento-srvid-brand` väntar på merge. |
>
> §3–§9 (två fotosektioner, egen offertsektion, sektionsordning, zonvokabulär,
> graftantalet, döda vägar) står kvar oförändrade och är fortfarande giltiga.
>
> **Det verkliga kvarvarande hålet är §8:** graftantalet produceras ingenstans.
> Kedjan foto → rita → annotering → behandlingsplan är hel ända fram till talet,
> och där tar den slut.

## Sammanfattning

Nästan ingenting behöver byggas. Elva av elva sektioner i CONTENT-CANON finns
redan i `cco-v12-canon.js`. Rit-editorn, annoteringslagret, behandlingsplanen
och offertkopplingen är byggda och skeppade till prod.

---

## 1. Rotorsaken — gör detta först

`public/major-arcana-preview/app/patient-master-ui.js`, `openBlueprintFullDossier`
rad 1377–1382:

```js
const deep = root?.querySelector('[data-v9-dossier-deep]');
const body = deep?.querySelector('[data-v9-deep-body]');
if (!deep || !body) return;                       // ← returnerar alltid
const slideOver = usesV12Workspace() ? renderV12WorkspaceDetailShell(...) : ...
```

**Mätt i prod 2026-08-23:**

```
data-v12-workspace         "on"      (flaggan är på)
__ARCANA_V12_WORKSPACE_ENABLED__  true
[data-v9-dossier-deep]     0 element   ← finns inte i vyn
[data-v9-canon]            0 element
[class*="v11"]             6 element   ← V11 renderar i stället
```

V12 monteras i **V9:s** dossier-behållare. Vyn renderar V11, som aldrig skapar
den noden. Och `renderV12WorkspaceDetailShell` rad 7047–7053 sväljer allt:

```js
try { canonInner = window.CcoV12Canon.render(ctx) || ''; }
catch (_canonError) { canonInner = ''; }          // tyst
```

**Canon fungerar.** Anropad direkt i webbläsaren returnerade den 15 347 tecken
giltig HTML med markören `data-v12-canon="1"`. Renderaren är inte problemet.

**Åtgärd:** låt V12 rendera i den behållare som faktiskt finns, i stället för
att vänta på V9:s. Och logga när canon failar — den tysta fallbacken har dolt
det här i månader.

---

## 2. Sektionskartläggning — allt finns

| CONTENT-CANON | I `cco-v12-canon.js` |
|---|---|
| Aktivt besök · Kritiska varningar · Hälsa · Kundresa · Journal | byggda |
| **Bilder** | byggd, men heter **"Foto-dokumentation · alla besök"** (rad 2078) |
| Bokningar · Dokument · Kommunikation · Ekonomi · Insikter | byggda |

Fototiles genereras rad 2010–2041 med faserna FÖRE / ÖVER / EFTER / FILM och
`data-v12-photo-edit`, `data-asset-id`, `data-photo-zone`.

**Att göra:** ena namnen mellan facit och kod. Inget nybygge.

---

## 3. Bilder och Foto ska vara två sektioner

Beställarens beslut:

- **Bilder** — råa journalfoton
- **Foto** — de bilder som ritats på i Bilder

Datamodellen klarar det redan. `ccoPhotoAnnotationStore` är skild från
fotolagret och pekar tillbaka via `assetId`:

```
annotationId · assetId · patientId · customerId · encounterId · zone · note · createdBy · createdAt
```

---

## 4. Behandlingsplan/Offert ska vara egen sektion

I canon är offerten bara en **dokumentkategori** (rad 1445–1467,
`cat === 'offer' || cat === 'quote' → 'Offert'`). V11 har den som egen sektion
("Offertor").

`ccoAutomationRegistry.js` steg 5 avgör frågan:

> `customer.missing_treatment_plan` · *"Efter konsult (steg 5) — offert = behandlingsplan."*
> `risk: 'blocker'` · `humanApprovalRequired: true`

Ett blockerande steg som kräver mänskligt godkännande är inte en filrad.
**Egen sektion, namngiven "Behandlingsplan / Offert".**

---

## 5. Sektionsordning

Följer registrets stegnummer, så gränssnittet står i den ordning arbetet sker:

```
Journal (2) · Bilder · Foto (9) · Behandlingsplan/Offert (5) · Bokningar · Dokument
```

---

## 6. Foto-granskning — den befintliga arbetsytan

Verifierad 2026-08-23. Ett fullt byggt och **monterat** arbetsflöde:

| Fil | Rader |
|---|---|
| `public/major-arcana-preview/cco-photo-review-v3.html` | 1 721 |
| `public/cco-photo-review.js` | 831 |
| `src/routes/ccoPhotoReview.js` | 702 |
| `src/routes/ccoPhotoReviewWrite.js` | 356 |

Monterad i `server.js` rad 8907. Bilder listas per kund och encounter, personal
godkänner eller avvisar per fas och zon, med tangentbordsgenvägar
(`key === '1'` = Före, `key === '3'` = Efter).

- **Faser:** `before` · `during` · `after`
- **Zoner:** `hairline` · `skalp` · `sidor` · `front` · `donor` · `crown`
- **Källa:** bilder importerade från Google Drive — 4 Drive-referenser i routen
- **Uppladdning:** **finns inte.** 0 träffar på `FileReader` och `type="file"`

Detta är den verkliga arbetsytan för foton i dag. Den som söker en panel att
ladda upp bilder i kommer inte hitta den här — men allt annat finns.

---

## 7. Zonvokabuläret skiljer sig mellan FYRA lager

| Lager | Zoner |
|---|---|
| Foto-granskning (monterad, i drift) | `hairline` · `skalp` · `sidor` · `front` · `donor` · `crown` |
| Kundportalen (`cco-patient-offer-portal-v3.html`) | `hairline` · `mid_scalp` · `crown` |
| Backend (`ccoOfferFromPlan`, annoterings- och canvas-lagren) | `hairline` · `crown` |
| Rit-editorn (aug) | ingen egen lista — zonen ärvs från fotot |

Bara `hairline` finns i alla. `crown` i tre. `mid_scalp` bara i portalen,
`skalp`/`sidor`/`front`/`donor` bara i granskningen.

**Att göra:** ena listan. Foto-granskningens sex är den mest fullständiga och
den enda som är i faktisk drift — utgå från den, inte från portalens tre.

---

## 8. Graftantalet produceras ingenstans

Kedjan är hel ända fram till antalet:

```
foto → rita → POST /cco-photo-annotations { zone, strokes, previewDataUrl }
            → POST /cco-treatment-plans   { selectedImages[{zone,url}],
                                            offerIntent: ready_for_offer_draft }
```

Men **ingen yta frågar hur många hårsäckar**. Portalens `800 / 1200 / 500` är
hårdkodade demovärden. `ccoTreatmentPlanCanvasStore` har fälten
`areaSpecs` och `totalGraftEstimate` och väntar på data som ingen skickar.

En panel som producerade dem fanns i `major-arcana-pr96`
(`patientkort-preview.html`, 2026-05-31, aldrig mergad) med
`estimatedGrafts` per zon. Beställaren bekräftar att det **inte** är den panel
som eftersöks.

**Att göra:** avgör var antalet ska matas in. Antingen i editorn per markerat
område, eller som ett fält i Behandlingsplan/Offert-sektionen.

---

## 9. Två döda vägar att städa

- `ccoAutomationRegistry.js` steg 5 pekar på
  `?view=customers&workspace=1&patientId=`. **`workspace=1` läses ingenstans.**
- `index.html` begär `app.bundle.0bee8a1fb5.min.js` → **404** i prod.

---

## Vad som redan letats igenom — upprepa inte

En panel med bilduppladdning, zonmarkering och graftantal eftersöktes i nio
sökningar över sex platser: de tre projektrepona, iCloud-arkivet (1 417 HTML),
skrivbordet, Hämtade filer, `~/dsh-workspace`, och hela git-historiken inklusive
raderade filer på alla grenar. Sökt på zonnamn, canvas, SVG-zoner, uppladdning,
graft, offert, samt PNG/SVG/JPG med relevanta namn.

Tre kandidater hittades och avfärdades av beställaren:

| Datum | Fil | Varför inte |
|---|---|---|
| 2026-05-31 | `patientkort-preview.html` (PR96) | fel panel |
| 2026-06-13 → 08-14 | `cco-kundkort-referens.js` rad 3784 | fel panel |
| 2026-08-20 | `patient-master-ui.js` rad 1661 | fel panel |

De två sistnämnda är **identiska** — samma markup och knappar, bara olika
klassprefix (`gk-` respektive `v12-pe-`).

Panelen kan ha funnits enbart som artefakt i ett samtal och aldrig sparats till
disk. **Leta inte igen utan ny information från beställaren.**

---

## Arbetsregler

1. Mät mot prod, gissa inte. Varje påstående ska ha ett kommando bakom sig.
2. `visits` är bokningar, `slots` är lediga tider. Att slå ihop dem har gett fel
   svar två gånger, av två olika agenter.
3. Kontrollera gren och arbetskopia innan något sägs saknas. Ocommitad kod är
   osynlig för alla utom dig.
4. Öppna gränssnittet och titta innan något kallas färdigt. Ett grönt API-svar
   är inte ett användbart verktyg — det är hela anledningen till att den här
   ordern finns.
5. Namnsökningar ger falska negativ. "Bilder" hette "Foto-dokumentation";
   `Grafts.svg` var en ikon; `*zon*` matchade "eg**zon**a". Bekräfta i koden.
