# ORD-123 · Juridiska grinden håller — men tre vägar går utanför den

**Arbetsorder · 2026-08-26**
**Bas:** `main`
**Gäller:** `26d9788d` (propagera `TEMPLATE_NOT_LEGALLY_APPROVED`)

Fixen är riktig. Jag har bevisat den, inte läst mig till den. Men den
täcker bara utskick som **anger en mall**, och tre vägar gör inte det.

---

## Grinden är bevisad

Jag instansierade `ccoSendActionStore` med en riktig mailer-spion och
körde fyra fall skarpt (`dryRunOverride: false`):

| Fall                                | Utfall                                     | Mailer-anrop |
| ----------------------------------- | ------------------------------------------ | ------------ |
| **pending-mall + `templateRef`**    | **STOPPAT** · `TEMPLATE_NOT_LEGALLY_APPROVED` · 403 | **0**  |
| saknad mall + `templateRef`         | skickat                                    | 1            |
| godkänd mall + `templateRef`        | skickat                                    | 2            |
| **pending-mall UTAN `templateRef`** | **skickat**                                | 3            |

Rad ett är fixen: noll mailer-anrop. Rad två är den bakåtkompatibla
degraderingen du behöll — rätt, en saknad mall är inte samma sak som en
underkänd. Rad fyra är hålet.

Kedjan är hel hela vägen ut: `snapshotForSend`
(`ccoTemplateRegistry.js:353`) sätter `err.code` och `err.statusCode =
403` → `resolveSnapshot` (`ccoSendActionStore.js:164`) propagerar →
`performSend` kastar innan `record` skapas och innan mailern nås →
routen svarar `err.statusCode || 500`, alltså **403 med orsaken i
klartext**, inte 500. Och registry-wrappern i `server.js:6820-6822` är
riktigt kopplad — ingen död hook den här gången.

---

## Hål 1 · Grinden gäller bara sändningar med `templateRef`

`ccoSendActionStore.js:148-149`:

```js
const ref = normalizeText(templateRef);
if (!ref) return null; // ← registryt anropas aldrig
```

Två skarpa vägar skickar utan `templateRef`:

**`ccoPortalReplyNotification.js:84`** — automatiskt patientmail när
kliniken svarat i portalen. Fast text i koden, ingen mall, ingen
juridisk granskning av någon. Och den har en **egen** live-flagga:
`CCO_PORTAL_NOTIFY_LIVE` sätter `dryRunOverride: false` och går därmed
förbi `CCO_SEND_LIVE`.

Flaggan står inte i `render.yaml` — den är alltså av i produktion i dag.
Men det är ett andra utskicksspår med en egen strömbrytare, och den
juridiska grinden ser det inte.

**`ccoComposeSend.js:164`** — Svarstudions "skicka mail", hårdkodad
`dryRunOverride: false`. Här är det rimligt: en människa har skrivit
texten och tryckt skicka. Fritext kan inte förhandsgranskas juridiskt.
Jag flaggar den för fullständighetens skull, inte som fel.

**Beslut, inte bygge:** ska portal-notisen bli en riktig mall som går
genom grinden, eller ska den fortsätta vara hårdkodad? Det är Fazlis
fråga. Bygg inget innan han svarat.

## Hål 2 · Ett juridiskt stoppat eftervårdsjobb dör för gott

`ccoAftercareSchedulerStore.js:365-393`. Renderingen anropar
`templateRegistry.snapshot`, som `server.js:5843` mappar till
`snapshotForSend` — alltså kastar grinden **redan där**, före
`performSend`. Bra att den fångas. Men catchen:

```js
job.attempts += 1;
job.status = 'failed'; // ← terminal direkt, ingen MAX_SEND_ATTEMPTS
audit('aftercare.job.render_failed', …);
```

Tre följder:

1. Jobbet blir **terminalt efter ett försök**. Skickvägens catch
   (`:432-441`) respekterar `MAX_SEND_ATTEMPTS`; rendervägen gör det inte.
2. Godkänner juridik mallen efteråt **återupplivas jobbet inte**. Kön är
   redan död. Ingen märker det förrän någon frågar varför patienten
   aldrig fick sin eftervård.
3. Det loggas som `render_failed`. Ett juridiskt stopp ser i
   revisionsloggen ut som ett rendererfel.

Det här är **äldre än `26d9788d`** — rendervägen anropade
`snapshotForSend` redan innan. Fixen ändrade det inte, den avslöjade det.

**Åtgärd:** skilj de två felen åt i rendercatchen. Är
`err.code === 'TEMPLATE_NOT_LEGALLY_APPROVED'` → låt jobbet stå kvar som
`queued` med `lastError = 'legal_review_pending'` och audit
`aftercare.job.legal_blocked`. Riktiga rendererfel behåller `failed`.
Ett jobb som väntar på juridik är inte trasigt, det väntar.

## Hål 3 · Alla mallar är `pending` — grinden stänger allt

I den lokala `data/cco-templates.json`: **fem mallar, fem `pending`,
noll `approved`.**

Det är lokal data, inte produktion — jag påstår ingenting om Renders
disk. Men mekaniken är entydig: `upsert` sätter `pending` som
standard (`:253`), och **varje ny revision av en godkänd mall återställs
till `pending`** (`:283-284`). En redigering avväpnar alltså mallen tyst.

Slår du på `CCO_SEND_LIVE` med allt i `pending` går **ingenting**
mallbaserat ut — bara 403:or. Det är rätt riktning på felet, men det ska
vara ett medvetet läge, inte en överraskning.

**Åtgärd:** kontrollera det verkliga läget innan `CCO_SEND_LIVE` rörs.
`GET /api/v1/cco-templates` med `stats()` ger `byLegalReviewStatus`.
Och visa statusen i mallistan — den som redigerar en mall ska se att
hen just stängde av den.

---

## Uppgift · regressionstestet

Ja, lägg det. Din validering (`ccoComposeSend` 11/11) rörde inte den
ändrade raden — `ccoComposeSend` skickar utan `templateRef` och kan inte
nå grinden. Testet ska ligga i `tests/ops/ccoSendActionStore.test.js`,
bredvid det befintliga `performSend resolves template snapshot`.

Fyra fall, samma fyra som mina:

```js
// 1. pending-mall + templateRef → kastar, och mailern rörs INTE
await assert.rejects(
  () => store.performSend({ …, dryRunOverride: false, templateRef: 'tpl-1' }),
  (e) => e.code === 'TEMPLATE_NOT_LEGALLY_APPROVED' && e.statusCode === 403
);
assert.equal(mailerCalls.length, 0); // ← den här raden är hela poängen

// 2. 404 (saknad mall) → degraderar tyst, skickas
// 3. approved-mall → skickas med snapshot.legalApproved === true
// 4. INGEN templateRef → skickas (dokumenterar hål 1 som känt)
```

**Fall 1 måste räkna mailer-anropen.** Ett test som bara kollar att
`performSend` kastar bevisar inte att inget mail gick ut — kastet sker
efter att `record` byggts i en tidigare version av koden, och nästa
refaktor kan flytta tillbaka det dit.

**Mutationsbevis:** återställ `catch (e) { return null }` i
`resolveSnapshot`, kör testet, se fall 1 bli rött. Rapportera vilket
påstående som föll. Är testet grönt med den gamla koden bevisar det
ingenting och ska skrivas om.

## Gränser

- `CCO_SEND_LIVE` förblir `"false"`. Rör den inte.
- `CCO_PORTAL_NOTIFY_LIVE` sätts inte, varken i `render.yaml` eller i
  Render-panelen.
- Bygg inte om portal-notisen till mall innan Fazli sagt vilket han vill.
- Hål 2 får åtgärdas direkt — det är en ren felklassificering.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`
