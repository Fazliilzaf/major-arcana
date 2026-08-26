# ORD-118 · Samma kund, tre olika svar

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-117 (`c9331b5`)

Huvudsaken i ORD-117 sitter. Men fixen tog med sig något.

---

## Det du skulle laga är lagat

`03c7a38d-…` — kunden **utanför** listans sextio:

| Före      | Efter                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| `0` rader | **3 rader** med fungerande GRANSKA & ÅTGÄRDA                                  |
| `[]`      | `document.requiredFor.avtal` · `…undantag_betanketid` · `…undantag_angerratt` |

Verifierat på en annan dator än den jag mätte på tidigare, så det är inte
en cache-artefakt. Väg B var rätt val — och skälet du gav, att inte röra
patient-routen, håller.

---

## Men regressionstestet föll

`82e48577-…` — kunden **inuti** listans sextio, den du inte skulle röra:

| Tillfälle         | Kortet           | `#s-next`                                           |
| ----------------- | ---------------- | --------------------------------------------------- |
| Före ORD-117      | `v13-view-shell` | **3 rader** · `document.requiredFor.avtal` + 2 till |
| Efter, laddning A | **`v11-rail`**   | 3 signalknappar (`document.*`)                      |
| Efter, laddning B | `v13-view-shell` | **1 rad** · `customer.missing_health_declaration`   |
| Efter, laddning C | `v13-view-shell` | **1 rad** · `customer.missing_health_declaration`   |

Samma kund. Samma dag. Tre olika svar.

Och signalerna **finns** — jag läste listans payload direkt tidigare:

```
82e48577 · aktiva:
  customer.missing_health_declaration
  customer.missing_journal
  customer.missing_treatment_plan
  document.requiredFor.konsultation
  document.requiredFor.behandling
  automationTop: document.requiredFor.avtal
```

Sex aktiva signaler i datan, en rad i rutan.

---

## Varför det är värre än det låter

Rutan heter "Smart nästa steg" och personalen kommer att lita på den.
En panel som säger tre saker vid ett tillfälle och en annan sak vid nästa
är sämre än en tom panel, för då vet man åtminstone att man inte vet.

Det här är samma princip som gjorde att vi tog bort Kör-knappen på
makron: **en yta som ser ut att veta något måste veta det varje gång.**

---

## Uppgift

**Ta reda på vilka två källor som konkurrerar.** Min gissning — och det
är en gissning, instrumentera i stället för att lita på den — är att
`ensureDetailAutomationSignals` och listans `enrichKeys`-sammanslagning
båda skriver `card.automationSignals`, och att vem som hinner först
avgör vad som ritas. Möjligen blandas klientens `resolvePanelSignals`
(`cco-kundkort-kkx.js`) in som en tredje källa.

**Gör sedan resultatet deterministiskt.** Kraven, i ordning:

1. **Samma kund ska ge samma rader** — oavsett laddning, oavsett om
   kunden ligger i listan eller inte.
2. **Ingen källa får skriva över en rikare uppsättning med en fattigare.**
   Kommer listans signaler efter detaljanropet ska rutan ritas om, inte
   lämnas som den var.
3. Om båda källorna behövs: slå ihop och deduplicera på `ruleId`, sortera
   med `sortSignals` som idag.

**Skriv i leveransen vilken källa du gjorde till sanning och varför.**

## Andra sak: `v11-rail`-racet är verkligt

Du såg det inte på femton anrop, och jag hade sett det en gång. Nu har
jag sett det igen — **på en annan dator**, med `data-v13-view="on"` satt
och kortet renderat som `patient-master-card v11-rail`. Nästa laddning
gav V13.

Två oberoende observationer räcker. Det är inte längre en anekdot.

**Men lös det inte i den här ordern.** Ta signaldeterminismen först;
loggar du något om renderarvalet på vägen, skriv ner det så gör vi en
egen order.

## Gränser

- `ENABLE_AUTOMATION_RUNNER` orörd. `dryRun` orörd.
- Ta inte bort `ensureDetailAutomationSignals` — den löste rätt problem.
- Ingen ny flagga.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

I produktion. **Ladda samma kund fem gånger i rad** och skriv ner alla
fem utfallen — inte bara det sista:

```js
({
  kort: document.querySelector('.patient-master-card')?.className,
  rader: document.querySelectorAll('#s-next .next-row').length,
  signaler: [...document.querySelectorAll('[data-kk-sig]')].map((b) =>
    b.getAttribute('data-kk-sig')
  ),
});
```

Kör det på **båda** kunderna:

- `82e48577-…` (i listan) — fem identiska utfall, och minst tre rader
- `03c7a38d-…` (utanför listan) — fem identiska utfall, tre rader

"Oftast lika" är inte godkänt. Det är precis det vi har nu.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

Du rapporterade **7 268 pass / 2 fail** och att de två är CFO-tester från
parallella commits, verifierat med stash-prov. Bra att du kollade i
stället för att skylla på dem — men **säg till Fazli om de ligger kvar
röda på main efter nästa körning.** Ett rött main är ingens fel och
allas problem.
