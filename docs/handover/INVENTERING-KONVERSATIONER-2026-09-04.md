# Inventering · Konversationer i CCO

**Mätt 2026-09-04.** Du frågade om jag gjort en inventering. Det hade jag inte —
jag hade gjort en svepning över sju ämnen, och Konversationer fick den
uppmärksamhet som rymdes. Det räckte för att hitta de stora hålen men inte för
att svara på "vad behöver fixas".

Det här är inventeringen: varje anrop, varje åtgärd, varje panel, spårad till
sin ändpunkt.

## En rättelse på min egen mätning först

Första körningen sa att **fyra** endpoints saknades. Tre av dem var falska
negativ: jag sökte bara i `src/routes/` medan **29 rutter bor direkt i
`server.js`**. Mätningen var rätt utförd på fel omfång — samma familj som
Loopias kapade brevlådelista.

Rätt omfång: 1 477 rutter. **En** endpoint saknas på riktigt.

---

## Del 1 · Huvudvyn

`konversationer.html` (6 342 rader) laddar tre skript:
`cco-komm-panel.js`, `konversationer-bottom-actions.js` (4 011 rader),
`konversationer-mailbox-valjare.js`.

De anropar tillsammans **22 endpoints. 21 finns. 1 saknas.**

| Problem                                     | Var                     | Följd                                                                                                    |
| ------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `/api/v1/cco-comm/templates` **finns inte** | `cco-komm-panel.js:242` | Mallistan blir alltid tom. Felet sväljs på `:247`, så inget syns — panelen ser bara ut att sakna mallar. |

Allt annat i huvudvyn — worklist, meddelanden, bilagor, dossier, utkast,
compose, kontaktsök, stream, portalmätvärden — är levande.

---

## Del 2 · Åtgärdsraden

15 åtgärder (`runCcoAction`, `konversationer-bottom-actions.js:3853`). Tre kör
mot API direkt, tio öppnar en panel, två är navigering.

**Direkt mot API — fungerar:**

- Klar / Återöppna → `POST /cco/runtime/conversation/:key/action`
- Nytt mail → `/cco/runtime/contact-lookup` + `compose-new-mail`
- Portalmätvärden → `/cco/runtime/portal-metrics` + `portal-readiness`

**Panelerna — här ligger hålen.** Tio paneler, 16 500 rader HTML tillsammans:

| Panel            | Rader | Läge                                                        |
| ---------------- | ----- | ----------------------------------------------------------- |
| Notiser          | 1 932 | **Levande** — `/cco-notifications/feed`, `/mark-read`       |
| Smart anteckning | 1 967 | **Levande** — `/cco-ai/extract`, `/cco-journal-quick/entry` |
| Senare           | 2 214 | **Levande** — `/cco/runtime/conversation/:key/action`       |
| Skickat          | 1 941 | **TRASIG** — se nedan                                       |
| Makron           | 2 218 | **Kuliss i praktiken** — se nedan                           |
| No-show AI       | 1 115 | **Kuliss** — noll `fetch(`                                  |
| Ny bokning       | 994   | **Kuliss** — noll `fetch(`                                  |
| Patient-hub      | 1 596 | **Kuliss** — noll `fetch(`                                  |
| Signaturer       | 1 883 | **Kuliss** — noll `fetch(`                                  |
| Svarstudio v2    | 613   | **Kuliss** — noll `fetch(`                                  |

### Skickat — en saknad prefix

`cco-skickat-v3.html:1731` anropar:

```js
const res = await fetch(`/cco-comm/drafts${params}`);
```

**Utan `/api/v1`.** Rutten finns, men på `/api/v1/cco-comm/drafts`. Anropet
404:ar varje gång. De andra panelerna använder omslag som lägger på prefixet;
den här gör det inte.

Det är den billigaste fixen i hela inventeringen — en sträng.

### Makron — utför ingenting

Routen finns (`ccoMacros.js:135`), men storen säger själv
(`ccoMacroStore.js:189`): _"den utför INGA åtgärder — den registrerar bara
körningen"_, och `:196`: _"Frontend har därför inaktiverat Kör-knappen"_.

2 218 rader panel för en knapp som är avstängd med flit.

---

## Del 3 · Backend-hål bakom knappar som syns

| Funktion                       | Läge               | Bevis                                                                                                                                                         |
| ------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tilldela**                   | Ingen backend alls | `ccoConversation.js:2445` säger det själv: _"frontend har 'Tilldela'-knappar … men det finns INGEN backend som lagrar vem en konversation är tilldelad till"_ |
| **Arkivera**                   | Finns inte         | `/action` accepterar bara `handled\|reply_later\|reopen` (`:2481`)                                                                                            |
| **Vidarebefordra**             | Oklart             | Motorstöd finns (`executionService.js:2999`), men ingen route eller vy sätter `mode: 'forward'`                                                               |
| **`/conversation/:key/reply`** | Föräldralös        | Enda anroparen är en `.bak`-fil                                                                                                                               |
| **`/conversation/:key/notes`** | Föräldralös        | Enda anroparen är samma `.bak`-fil                                                                                                                            |

---

## Del 4 · Personalportalens konversationsvy

Egen vy, eget fel. `staff-portal.html` anropar consumer-endpointen **utan
`mailboxIds`**. Fallbacken ger 5 adresser, taket är 2 → **422 varje gång**.
`apiFetch` returnerar `null` på icke-2xx, så vyn visar alltid "Konversationslistan
är inte tillgänglig just nu".

---

## Vad som behöver fixas — sorterat efter kostnad

**Minuter:**

1. `/api/v1`-prefixet i `cco-skickat-v3.html:1731`. En sträng.
2. `mailboxIds` i personalportalens anrop. En parameter.

**Timmar:**

3. Bygg `/api/v1/cco-comm/templates`, eller peka om panelen till
   `/cco/runtime/mail-templates` som redan finns.
4. Lägg `archive` till `/action` — samma mönster som `handled`.

**Dagar:**

5. **Tilldela** — ny datamodell: vem äger en konversation, historik, audit.
   Knapparna finns redan.
6. **Makron** — låta storen utföra sina åtgärder i stället för att bara logga.
   Beror på 4 och 5 (arkivera och tilldela är två av makrostegen).
7. **De fem kulisspanelerna** — 7 200 rader HTML utan data. Var och en är ett
   eget bygge; ingen är påbörjad bakom fasaden.

**Kräver mätning innan de kan planeras:**

8. Vidarebefordran — går den att nå?
9. De två föräldralösa endpoints — ska de kopplas in eller tas bort?

---

## Vad jag skulle göra

Punkt 1 och 2 i kväll — två strängar, två vyer som slutar ljuga.

Sedan 3 och 4, som gör mallar och arkivering användbara.

**Punkt 5 är den som avgör om Konversationer duger i drift.** Utan tilldelning
vet ingen vem som svarar på vad, och det är den enda funktionen på listan där
frånvaron kostar något varje dag ni använder systemet.

Kulisspanelerna skulle jag lämna sist. De ser ut som mest arbete kvar men är
minst brådskande — ingen av dem behövs för att läsa och besvara kundpost.
