# ORD-117 · Signalerna når bara de sextio översta

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-116 (`69339cc`)

503:orna är borta och motorn levererar. Ett led kvar.

---

## ORD-116 är godkänd

Rotorsaken du hittade är rätt och siffrorna hänger ihop: av 20 847 ms låg
20 818 i `conversation`. Att `buildThreadsForCustomer` läste om
mailbox-shards per kund med ett LRU-tak på två är precis den sortens fel
som inte syns i en profil på en enda kund. Bra grävt.

Mätt i produktion efter din deploy:

| Anrop                 | Före      | Efter            |
| --------------------- | --------- | ---------------- |
| `includeAutomation=1` | 503 · 3/6 | **200 · 5 av 5** |

Och motorn svarar:

```
automation: { enabled: true, dryRun: true, version: "2.0.0-b-sprint" }
patients: 60 st — alla 60 har signaler, alla 60 har aktiva
```

---

## Felet som är kvar

**Signalerna når bara kunder som råkar ligga i den laddade listsidan.**

Två kunder, samma kod, samma sekund:

| Kund         | I listans 60 första | `#s-next`                          |
| ------------ | ------------------- | ---------------------------------- |
| `82e48577-…` | **ja**              | **3 rader** med fungerande knappar |
| `03c7a38d-…` | **nej**             | **0 rader**                        |

För `82e48577` renderas `document.requiredFor.avtal`,
`…undantag_betanketid` och `…undantag_angerratt` med
GRANSKA & ÅTGÄRDA-knappar. För `03c7a38d` står rutan tom.

Din mätning stämmer alltså — kunden **har** 31 signaler i API:t. De når
bara aldrig kortet.

### Orsaken

`app.bundle.js:92418`:

```js
if (!shell) {
  return reapplyLiveJournalReadout(card, journalEntries);
}
```

Sammanslagningen som kopierar `automationSignals` till detaljkortet
(`enrichKeys`, rad 92422–92460) körs **bara om patienten hittas i
shell-listan**. Detaljvyn hämtas från `cco-patient-master/patient`, och
den vägen bär inga signaler — `automationSignals` sätts på exakt ett
ställe i hela `src/`: `ccoStaff.js:364`, i listrouten.

### Varför det spelar roll

Registret har **7 548 kunder**. Listan laddar **60**.

Alla dessa hamnar utanför:

- deep-länkar från mejl, portal eller kalender
- sökträffar bortom första sidan
- varje kund som personalen scrollar fram till

De får en tom ruta som ser ut som _"inget att göra här"_ — vilket är
värre än ingen ruta alls, eftersom personalen kommer att lita på den.

---

## Uppgift

Gör så att detaljvyn får sina egna signaler, oberoende av listan.

**Mät först vad det kostar.** Efter din ORD-116-fix vet vi att
`conversation`-ledet var det dyra. En enskild patient borde vara billig,
men verifiera det innan du bygger — samma disciplin som förra gången.

Två vägar, välj efter mätningen:

1. **Lägg signalerna på patient-routen.** `cco-patient-master/patient`
   utvärderar den enda patienten och returnerar `automationSignals` +
   `automationTop`. Enklast, en patient åt gången, ingen listberoende.
2. **Låt klienten fråga separat.** `/cco/automation/evaluate?patientId=`
   finns redan (`ccoAutomationRoutes.js`) och gör exakt det här. Anropa
   den när patienten inte hittas i shell-listan.

Väg 2 är mindre kod men ett extra anrop per kundöppning. Väg 1 är
tätare men rör en route som allt annat hänger på. **Skriv i leveransen
vilken du valde och varför.**

**Rör inte** listans väg — den fungerar nu och du fixade just den.

## Gränser

- `ENABLE_AUTOMATION_RUNNER` orörd. `dryRun` orörd.
- Ingen ny flagga. Signalerna ska bara finnas.
- Detaljvyn får inte bli långsammare än den är idag. Rapportera
  svarstiden före och efter.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

I produktion, på **`03c7a38d-…`** — alltså kunden som _inte_ ligger i de
sextio översta:

```js
({
  rader: document.querySelectorAll('#s-next .next-row').length, // ska bli ≥ 1
  signaler: [...document.querySelectorAll('[data-kk-sig]')].map((b) =>
    b.getAttribute('data-kk-sig')
  ),
});
```

Idag: `0` och `[]`. Kontrollera samtidigt att `82e48577-…` fortfarande
ger sina tre rader — det är regressionstestet.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

---

## En rättelse av mig

ORD-116 sa att den översta raden skulle handla om hälsodeklarationen.
**Det var fel av mig.** `sortSignals` rangordnar efter `RISK_ORDER`, där
`legal_blocker` och `legal` går före `blocker`. Dokumentsignalerna är
alltså korrekt högre upp, och rutan visar bara tre rader
(`buildSmartNextSteps(card, 3)`).

`customer.missing_health_declaration` **är** aktiv på båda kunderna — den
ligger bara under strecket. Räkna inte det som ett fel.

## Observationen om `v11-rail`

Du såg den inte på femton anrop. Jag har inte sett den igen heller under
dagens mätningar. Vi lämnar den — dyker den upp hos någon av oss gör vi
en egen order.
