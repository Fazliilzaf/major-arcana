# ORD-125 · Portal-notisen blir en mall bakom den juridiska grinden

**Arbetsorder · 2026-08-26**
**Bas:** `main` (`0bec64d6`)
**Föregås av:** ORD-123 hål 1 · Fazli har svarat: **gör den till en mall**

---

## Först: ORD-123 är verifierad, inte bara rapporterad

**Hål 2.** Jag byggde en riktig scheduler-store med en mallregistry som
kastar, och körde jobben:

| Fall            | status     | lastError            | mailer | audit                       |
| --------------- | ---------- | -------------------- | ------ | --------------------------- |
| juridiskt stopp | **queued** | legal_review_pending | **0**  | `aftercare.job.legal_blocked` |
| äkta rendererfel | failed    | trasig mall …        | 0      | `aftercare.job.render_failed` |
| allt ok         | sent       | null                 | 1      | `aftercare.job.sent`        |

Precis som du skrev. Bra jobbat.

**Regressionstestet.** Jag körde din mutation själv i stället för att
tro på den: satte tillbaka `catch (_e) { return null }` i
`resolveSnapshot` → **18/19, fall 1 rött**. Återställde → **19/19**, och
`git diff` tom, alltså byte-identisk med det du pushade. Testet kan fela.
Det duger.

**En sak till som jag rättade själv (`0bec64d6`).** Din catch räknade
fortfarande upp `attempts` på den juridiska grenen. Uppmätt: tolv tick
med pending mall gav `attempts=12`, alltså förbi `MAX_SEND_ATTEMPTS`
(10). Jobbet återupplivades visserligen vid godkännande — men med noll
återförsök kvar, så ett enda sändfel efteråt hade blivit terminalt
direkt. Väntan är inte ett försök. Nu: `attempts=0` oavsett hur länge det
väntar, och äkta rendererfel räknar upp som förut.

**Hål 3 kunde jag inte stänga.** Jag försökte läsa
`GET /api/v1/cco-templates` från den inloggade webbläsaren — den svarar
`403 · Role "anonymous" saknar permission "templates.read"`, och även
`/api/v1/cco/staff/customers-shell` ger `401` för ett rakt `fetch`.
Sidans egna anrop bär en token jag varken har eller tänker leta rätt på.
**Det är fortfarande en prod-koll som Fazli får göra själv**, och den
måste göras innan `CCO_SEND_LIVE` rörs.

---

## Uppgiften

Portal-notisen (`ccoPortalReplyNotification.js`) ska skicka **ur en
mall** i stället för hårdkodad HTML, och därmed omfattas av grinden.

### 1 · Mallposten

Lägg en mall i registret, `type: 'notification'`, id förslagsvis
`portal_reply_notify`, med `sv`-revision. Ämne och kropp = dagens
hårdkodade text, ordagrant — **skriv inte om copyn**, den är redan i
bruk. Variabler enligt `ccoMessageRenderer`: kundens tilltalsnamn och
portal-länken.

`upsert` sätter `legalReviewStatus: 'pending'` som standard. Det är rätt:
notisen ska ligga still tills juridik godkänner. Ingen patient drabbas i
dag eftersom `CCO_PORTAL_NOTIFY_LIVE` inte är satt.

### 2 · Skicka med `templateRef`

`performSend` ska anropas med `templateRef` och `templateLang: 'sv'`.
Då — och bara då — går anropet genom `resolveSnapshot` och grinden.

### 3 · Fail closed — den här är viktig

`resolveSnapshot` **degraderar tyst vid 404** (saknad mall). Det är rätt
för bakåtkompatibiliteten, men fel här: om mallposten saknas skulle
notisen falla tillbaka på den hårdkodade texten och skickas ändå — och
då har vi inte flyttat något.

Portal-notisen ska därför ha en **egen explicit kontroll**: finns ingen
snapshot, skicka inte. Returnera `{ status: 'skipped', reason:
'template_unavailable' }`. Tyst degradering är inte tillåtet på den här
vägen.

### 4 · Rendera ur mallen

Kroppen ska byggas ur revisionens `subject`/`body` via
`ccoMessageRenderer` — inte ur den gamla strängen. Saknas en variabel ska
`TEMPLATE_MISSING_VARIABLE` stoppa utskicket, som i eftervårdsvägen. En
patient ska aldrig se `{{namn}}`.

När det är gjort: ta bort den hårdkodade HTML:en. Två källor för samma
mail är hur texter glider isär.

---

## Verifiering

Fyra fall, och räkna mailer-anropen — det är det som bevisar något:

```js
// 1. mall pending      → inget skickat, TEMPLATE_NOT_LEGALLY_APPROVED
// 2. mall saknas (404) → inget skickat, status 'skipped'  ← nytt beteende
// 3. mall godkänd      → skickat, kroppen kommer ur revisionen
// 4. variabel saknas   → inget skickat, TEMPLATE_MISSING_VARIABLE
```

**Mutationsbevis:** ta bort din nya 404-kontroll och kör fall 2 — det ska
bli rött (notisen skickas med den gamla texten). Rapportera vilket
påstående som föll.

## Gränser

- `CCO_SEND_LIVE` orörd (`false`). `CCO_PORTAL_NOTIFY_LIVE` sätts inte,
  varken i `render.yaml` eller i Render-panelen.
- Skriv inte om notisens text. Den flyttas, den ändras inte.
- `ccoComposeSend` rörs inte — fri text från en människa är rimlig.
- Godkänn inte mallen åt någon. `pending` är rätt utgångsläge.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`
