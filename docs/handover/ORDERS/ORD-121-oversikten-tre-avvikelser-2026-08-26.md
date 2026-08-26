# ORD-121 · Kundöversikten — tre avvikelser mot facit

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Facit:** Fazlis skärmbild av kundvyns högerpanel

Produktmodellen stämmer. Tre detaljer i panelen gör det inte.

---

## Modellen är rätt — det ska sägas först

Mätt i produktion på `?view=customers` **utan** `patientId`:

```
grid            200px · 884px · 660px
.customers-rail 660 px
kortet          patient-master-card v9-aggregate-panel
#v13-rail       finns inte
```

Högerpanelen visar **ÖVERSIKT · Kundpopulation** med TOTALT 7 823,
AKTIVA 1 839, VIP 636, INTÄKT/VECKA-diagram och VECKANS INSIKTER.
Ingen kundvy. Precis som den ska.

Klick på kund ger lilla V13 (`#v13-rail`, 17 sektioner), klick på
"Öppna fullvy" ger stora. Kedjan **lista → liten → stor** fungerar.

Att det såg annorlunda ut på Fazlis skärm berodde på att URL:en bar
`patientId=03c7a38d-…` — en djuplänk från mina mätningar som låg kvar i
fliken. Mitt fel, inte produktens.

---

## Avvikelse 1 · SNITT LTV är tom

| Facit               | Produktion                  |
| ------------------- | --------------------------- |
| **24,8k** · +8 % Q2 | **—** · "Intäkt ej kopplad" |

Samma rot som `q-amount` i ORD-119: **ingen** av listans sextio kunder
har `lifetimeValue` eller `dealValue` satt. Fältet fylls bara från
Pipedrive-vunna affärer (`ccoPatientMasterStore.js:698-700`), och den
kopplingen ger noll i produktion.

**Utred innan du bygger.** Antingen ska LTV räknas ur den kommersiella
storen (offert accepterad + betald), eller så ska Pipedrive-kopplingen
lagas. Skriv vilket och varför — bygg inte ett tredje ställe där ett
belopp kan uppstå.

## Avvikelse 2 · Insiktsraderna saknar AI-märkningen

Facit märker varje rad med **★ AI**. Produktionen har **noll** träffar
på den märkningen — raderna står nakna:

```
16 kunder · Dagens besök saknar HD — Agneta Starfeldt, …
313 kunder · Inaktiva VIP — inte bokat på 60+ dagar
6 kunder · Friskförsäkran saknas — Andreas Lundahl, …
Besökstrend · Snitt upp +100% senaste 4 veckor
```

Lägg tillbaka märkningen. **Men bara på de rader som faktiskt är
härledda** — står det "16 kunder saknar HD" är det en räkning, inte ett
AI-omdöme, och då ska det inte påstås vara ett.

Är ingen av dagens fyra rader AI-genererad, säg det i leveransen i
stället för att sätta stjärnan på allihop. CCO kör `fallback` — det
finns ingen generativ AI bakom dem idag.

## Avvikelse 3 · Intäktsdiagrammet saknar summan

| Facit                        | Produktion        |
| ---------------------------- | ----------------- |
| **485 200 kr** i rubriken    | ingen summa       |
| Veckoetiketter `v.10 … v.22` | `v-4 · v-2 · v-1` |

Fem staplar renderas, men utan belopp. Samma orsak som avvikelse 1 —
intäkten är inte kopplad. **Ta den efter 1**, annars bygger du en rubrik
som visar noll.

---

## Gränser

- Rör inte kundkortet, `s-next`, tokens eller typografin.
- **Hitta inte på belopp.** Är intäkten inte kopplad ska rutan säga det,
  som den gör nu. Ett påhittat LTV är värre än ett tomt.
- Sätt inte ★ AI på något som inte är AI.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

I produktion, `?view=customers` utan `patientId`:

```js
const rail = document.querySelector('.customers-rail');
const t = rail.innerText.replace(/\s+/g, ' ');
({
  oversikt: t.includes('Kundpopulation'), //  true redan
  ltv: (t.match(/SNITT LTV\s*(\S+)/) || [])[1], //  ska bli ett belopp
  aiMarkning: (t.match(/★ AI/g) || []).length, //  antal märkta rader
  intaktSumma: /INTÄKT \/ VECKA\s*[\d\s]+kr/.test(t), //  true
  v13rail: !!document.querySelector('#v13-rail'), //  ska förbli false
});
```

Sista raden är regressionstestet: **högerpanelen får inte visa en
kundvy när ingen kund är vald.**

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`
