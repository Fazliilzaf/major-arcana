# ORD-120 · Kritiska varningar säger noll på en blockerad kund

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-119 (`3b70c6c`)

De sex komponenterna sitter. Men en sektion som fungerade i förmiddags
gör det inte längre.

---

## ORD-119 är godkänd

Mätt i produktion på `82e48577-…`:

| Krav            | Utfall                                                |
| --------------- | ----------------------------------------------------- |
| `sticky-btn`    | **5** · exakt facits etiketter, inklusive guldknappen |
| `j-step`        | **4** + `j-expand` = "Visa alla 9 steg →"             |
| `q-status`      | ✓ renderar `PLANNED`                                  |
| `j-status`      | ✓ "Väntar" per rad                                    |
| `notes-divider` | ✓                                                     |
| Primitiverna    | `.sec-label` 9.5px / 800 / 1.33px — **orörda**        |

Kundresan är det som gör mest skillnad med ögat:

```
✓ Bokning konsultation        KLAR
2 Bokningsbekräftelse-mail    VÄNTAR
3 Hälsodeklaration            PÅGÅR
4 Konsultation                VÄNTAR
  Visa alla 9 steg →
```

**Och du hade rätt mot ordern.** Facit har fyra `j-step`-rader — en
`done`, en `active`, två `todo` — plus expanderaren. Min
verifieringskommentar sa nio. Det var jag som räknade stegen i datan i
stället för raderna i facit. Bra att du följde facit och skrev ut varför.

### Två punkter kunde jag inte verifiera

`photo-foot` och `q-amount` uteblev på båda kunderna. Jag sökte igenom
hela listans sextio: **ingen** har `hasJournalPhoto: true` och **ingen**
har `lifetimeValue` eller `dealValue` satt. Datagrindarna ser rätt ut men
är oprövade — jag markerar dem **obekräftade**, inte godkända.

`warn-more` trodde jag först var samma sak. Det är det inte — se nedan.

---

## Regressionen

`03c7a38d-…`, mätt nyss:

| Vad          | Värde                                        |
| ------------ | -------------------------------------------- |
| Tagg i hero  | **HD saknas**                                |
| Kundresa     | steg 3 · **Hälsodeklaration PÅGÅR**          |
| `s-next`     | **3 rader**, tre aktiva blockerande signaler |
| **`s-warn`** | **"Inga kritiska varningar" · 0**            |

Samma kund visade **två rader** i förmiddags — "Hälsodeklaration
saknas" och "Journal saknas", båda med `Visa`-knapp. Jag har det på
skärmbild från ORD-115-granskningen.

Kunden är alltså bevisligen blockerad, alla andra ytor säger det, och
rutan som heter **Kritiska varningar** säger noll.

### Och det är inte databrist

Jag läste listans payload för `82e48577-…` direkt:

```
totalt 36 signaler · 19 aktiva
  blocker        15
  legal_blocker   4
```

Nitton aktiva blockerare. Rutan visar noll rader, och `warn-more` —
som ska dyka upp vid fler än två — syns inte heller.

Det går alltså inte att förklara med att datan saknas. Datan finns på
kortet, i samma fält som `s-next` läser för att rita sina tre rader.

### Vad jag tror hände

ORD-118 gjorde serverns utvärdering till sanning och degraderade
`resolvePanelSignals` till fallback. `buildCriticalWarnings` läser
sannolikt fortfarande den vägen — den var kkx-logiklagrets, och när
lagret slutade producera slutade varningarna komma.

**Det är en gissning. Instrumentera.** Men mönstret stämmer: `s-warn`
tappade innehållet i samma veva som `s-next` blev deterministisk, och
båda hänger på samma synteslager.

---

## Uppgift

**Mata `s-warn` från samma källa som `s-next`.** Signalerna finns redan
på kortet — `document.requiredFor.*` och `customer.missing_*` med
`risk`-fältet satt. En varning är inget annat än en signal med
`risk: 'blocker'` eller `'legal_blocker'`.

Kraven:

1. **En blockerad kund ska visa minst en rad.** `82e48577-…` har
   **nitton** aktiva blockerare, `03c7a38d-…` har tre. Ingen av dem ska
   ge en tom ruta.
2. **Samma sanning som `s-next`.** Två rutor som läser samma signaler
   får inte säga emot varandra. Det var hela poängen med ORD-118.
3. **Etiketterna från facit:** `Skicka` för hälsodeklaration, `Begär`
   för foto — det du byggde i ORD-119 punkt 6. Det är den koden som ska
   få data att arbeta med.
4. `warn-more` när det är fler än två.

**Rör inte `s-next`.** Den är verifierad 5×5 och ska förbli det.

---

## En sak till, som inte är ORD-119:s fel

Journalraderna på `82e48577-…` ser ut så här:

```html
<span class="j-name">okänt datum · Journal · Journal · journal</span>
```

Tre identiska rader, ordet "Journal" tre gånger, och `.j-mark` tom.
Facit visar `! · Konsultations-journal · 27 sep · Saknas`.

`j-name` byggs uppenbarligen av flera fält som alla faller tillbaka på
samma standardvärde. Det är äldre än din ORD-119-leverans — du lade bara
`j-status` bredvid — men det syns, och Fazli kommer att se det.

**Ta det i samma gren om det är enkelt.** Är det inte det, säg till så
blir det en egen order.

## Gränser

- `ENABLE_AUTOMATION_RUNNER` orörd. `dryRun` orörd. `CCO_SEND_LIVE`
  förblir `false`.
- Rör inte tokens, typografi, `.shell` eller `s-next`.
- Inga påhittade varningar — saknas blockerare ska rutan vara tom, och
  då ska den också vara tom.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

I produktion, på `03c7a38d-…`:

```js
const rail = document.querySelector('#v13-rail');
({
  warnRader: rail.querySelectorAll('#s-warn .warn-row').length, //  ≥ 1
  warnKnappar: [...rail.querySelectorAll('#s-warn .action')].map((b) =>
    b.textContent.trim()
  ), //  Skicka / Begär
  nextRader: rail.querySelectorAll('#s-next .next-row').length, //  fortfarande 3
});
```

Idag: `0`, `[]`, `3`.

Kör det **fem gånger** — samma disciplin som ORD-118. Rutan får inte
växla mellan tom och fylld.

Kontrollera samtidigt att `82e48577-…` fortfarande ger sina fem
sticky-knappar och fyra `j-step`.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

Du rapporterade 7 300 pass / 0 fail. Rapportera det verkliga talet igen.
