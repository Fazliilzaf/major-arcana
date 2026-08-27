# ORD-128 · Läkarens ordination är en grind som inte finns

**Arbetsorder · 2026-08-27**
**Bas:** `main` (`9589d47a`)
**Till:** DeepSeek
**Beslut:** Fazli 2026-08-27:

> Det är den **individuella ordinationen som läkaren måste godkänna**
> innan varje patient ska göra en operation — i Hair TP **eller**
> Curatiio.

Det är en medicinsk grind per patient, inte ett dokument bland andra.
Läs den meningen igen innan du börjar koda.

---

## Vad som finns i dag — uppmätt

### Katalogen har två ordinationsrader, båda bara Hair TP

| id                       | namn                                 | clinic | flowApplies | requiredFor  |
| ------------------------ | ------------------------------------ | ------ | ----------- | ------------ |
| `ordination_tp` (24)     | Ordinationsmall · Hårtransplantation | hairtp | `['tp']`    | `['pre_op']` |
| `ordination_recept` (39) | Ordination (recept)                  | hairtp | `['tp']`    | `['pre_op']` |

Båda har `filler: "staff"`, `legallySensitive: true`,
`journeyStepAction: 8`, `secondarySection: "op_dag_knapp_3"`.

**Curatiio har ingen ordinationsrad alls.** Curatiio-sidan nämner
`steg8-ordination` för botox, men det finns ingen katalogtyp bakom.
Fazli säger att grinden gäller båda klinikerna. Halva kravet saknas
alltså i datan.

### Signalen finns men leder ingenstans

`ccoDocumentReadiness.js:145` bygger id:t som
`document.requiredFor.${step}` — så `pre_op` **genererar** en signal.

Men `public/major-arcana-preview/app/cco-kunder-smart-next-step.js`
mappar bara åtta requiredFor-id:n till handlingar: `konsultation`,
`konsult`, `offert`, `avtal`, `behandling`, `op_dag`, `info_samtycke`,
`foto_publik`.

**`pre_op` är inte en av dem.** Signalen tänds och faller igenom utan
åtgärdsknapp.

### Det finns inget läkargodkännande någonstans i koden

Sökt i hela `src/` och `public/` efter `prescriber`, `läkarsignering`,
`doctorApprov`, `signeraOrdination`, `ordinationSign` — **noll träffar**.

Det finns alltså inget begrepp för _vem_ som godkänner, ingen tidsstämpel
för _när_, och ingen kontroll av _att_ det skett. Workflow-sidan skriver
ut det själv:

> "Placeholder — avvaktar SharePoint/e-recept. Ingen Signera-knapp,
> endast Spara utkast."

`src/ops/ordinationReceptSharePointPublish.js` finns och kan publicera,
hämta och statuskolla — men den är fail-soft när SharePoint inte är
konfigurerat, och den vet ingenting om godkännande.

**Sammanfattat:** en patient kan i dag nå operationsdagen utan att någon
läkare har godkänt något, och systemet säger inte ifrån.

---

## Uppgiften

### 1 · Ordinationen ska finnas för båda klinikerna

Lägg katalograder så att grinden gäller Curatiio också. Vilka
behandlingar som kräver ordination är **Fazlis och läkarens beslut, inte
ditt** — fråga innan du väljer. Skriv förslaget i text först.

### 2 · Godkännandet ska vara ett eget tillstånd, inte ett kryss

Ordinationsinstansen behöver bära minst:

- vem som godkände (läkarens identitet, inte "staff")
- när
- vad som godkändes — knutet till den versionen av ordinationen, så att
  en ändring efter godkännandet ogiltigförklarar det

**Kod får aldrig sätta godkänt.** Samma regel som mallgrinden i ORD-123:
`pending` är rätt förval och godkännande är ett mänskligt beslut. Om du
skriver en rad som sätter godkänt automatiskt är ordern underkänd.

### 3 · Grinden ska blockera, inte bara påminna

`requiredFor: ['pre_op']` finns redan. Det som saknas är att någonting
faktiskt stannar när kravet inte är uppfyllt. Minst:

- en kritisk varning på kundkortet — inte ett förslag
- en handling i Smart nästa steg, alltså en mappning för
  `document.requiredFor.pre_op` i `cco-kunder-smart-next-step.js`
- att operationsdagens knappar inte presenterar sig som klara

### 4 · RBAC

`src/security/ccoRbac.js` nämner ordination redan. Godkännandet ska ligga
bakom en egen behörighet som bara läkare har. Personal som fyller i är
inte samma sak som läkare som godkänner.

---

## Godkänt när

1. En patient utan godkänd ordination kan inte visas som klar för
   operation — bevisat med ett test, och mutationstestat: ta bort grinden
   och visa att testet blir rött.
2. Godkännandet bär identitet, tidsstämpel och versionsbindning.
3. Ingen kodväg sätter godkänt.
4. `document.requiredFor.pre_op` har en handling i Smart nästa steg.
5. Curatiio-frågan i punkt 1 är besvarad av Fazli, inte antagen av dig.

## Det jag inte kan avgöra åt er

Om ordinationen måste **kontrasigneras** av en andra läkare, och om
e-recept ställer formella krav på signatur som SharePoint-publiceringen
inte uppfyller. Det är medicinskt reglerat. Bygg grinden, men låt Fazli
ta det med den som är medicinskt ansvarig innan den slås på skarpt.

## Rör inte

- `CCO_SEND_LIVE` — `"false"`.
- SharePoint-flaggan. Grinden ska fungera även när e-recept är avstängt;
  publiceringen är ett senare steg, inte en förutsättning.
