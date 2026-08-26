# ORD-116 · Signalanropet faller med 503

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-115 (`f531a3a`), flaggan i `render.yaml` (`4e471a95`)

Fullvyn är klar — se sist i dokumentet. Det här handlar om något annat
som blev synligt när signalmotorn slogs på.

---

## Vad jag mätte

Flaggan är på. Kontrollerat i Render: **191 env-nycklar nu mot 190
tidigare**, och `ENABLE_AUTOMATION_RUNNER` finns bland dem.
Servern startade om **11:42:30**, efter din deploy 11:39. Blueprint-syncen
tog alltså.

Ändå står "Smart nästa steg: 0" på en kund som är på **steg 3 av 9** med
taggen **"HD saknas"** — precis det regel 1 ska träffa på.

Orsaken är att anropet som bär signalerna inte kommer fram:

| Anrop                                   | Utfall           |
| --------------------------------------- | ---------------- |
| `customers-shell?…&phase=list`          | **200** · 5 av 5 |
| `customers-shell?…&includeAutomation=1` | **503** · 3 av 6 |

Klientens cache bekräftar det:

```
customers-shell:enriched::::0:auto
  data:      undefined
  updatedAt: 0
  error:     "Kunddatan tog för lång tid att läsa. Försök igen."
```

Listan renderas ändå, eftersom `phase=list` går igenom. Det är därför
felet inte syns för användaren — den enda konsekvensen är att signalerna
aldrig kommer fram, vilket ser ut precis som när motorn var avstängd.

---

## Vad jag tror händer

`evaluatePatientSignals` körs **per patient**, och listan hämtar
**60 patienter per laddning**. Varje utvärdering går via
`getTreatmentAgreementStore`, `getTemplateVersionApprovalStore` och
dokumentinstanserna (`ccoStaff.js:317-340`).

Så länge motorn var avstängd returnerade routen bara
`automationMeta: { enabled: false }` och kostade ingenting. Nu gör den
verkligt arbete gånger 60, och anropet hinner inte klart.

**Det här är inte ett argument för att stänga av flaggan igen.** Motorn
ska vara på. Det är arbetet per anrop som är fel dimensionerat.

---

## Uppgift

**Mät först.** Kör routen med tidtagning per led och skriv i leveransen
vad som faktiskt tar tiden — storeladdningen, dokumentinstanserna eller
själva regelutvärderingen. Gissa inte, och optimera inte det som är
snabbt.

**Gör den sedan billig.** Tre vägar, välj efter vad mätningen visar:

1. **Ladda stores en gång per anrop, inte per patient.** Singletonerna
   finns redan (`agreementStoreSingleton`, rad 13–14) men
   dokumentinstanserna hämtas i en `Map` per anrop — kontrollera att
   inget läses om i loopen.
2. **Utvärdera bara det som syns.** Listan visar 60 rader men användaren
   ser en skärm i taget. Signalerna behövs på den valda kunden och som
   räknare i listan — inte nödvändigtvis fullt utvärderade för alla 60.
3. **Cacha per patient + version.** Signalerna ändras när kundens
   tillstånd ändras, inte varje gång listan laddas.

**Gränser:**

- **Stäng inte av `ENABLE_AUTOMATION_RUNNER` som lösning.** Den ska stå
  kvar på `true` i `render.yaml`.
- Ta inte bort `includeAutomation=1` från klienten.
- Rör inte `dryRun` — motorn ska fortsätta vara läsbar-bara tills Fazli
  säger annat.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

I produktion, inte i harness:

1. Ladda kundregistret **tio gånger**. Noll `503` på
   `includeAutomation=1`. Det är kravet — inte "oftast grönt", eftersom
   det redan är grönt ungefär hälften av gångerna.
2. Öppna `03c7a38d-…` och kontrollera att `#s-next` visar **minst en
   rad**, och att den översta handlar om hälsodeklarationen:

```js
({
  rader: document.querySelectorAll('#s-next .next-row').length, // ≥ 1
  signaler: [...document.querySelectorAll('[data-kk-sig]')].map((b) =>
    b.getAttribute('data-kk-sig')
  ), // ska innehålla customer.missing_health_declaration
});
```

Idag: `0` och `[]`.

3. Rapportera svarstiden för `includeAutomation=1` före och efter.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

---

## ORD-115 är godkänd

Mätt i produktion efter din deploy:

| Mått               | Värde     | Mål              |
| ------------------ | --------- | ---------------- |
| Kolumnlista        | `3176px`  | en kolumn ✓      |
| `railGridColumn`   | `1`       | 1 ✓              |
| `.workspace` bredd | 1 280     | 1 280 ✓          |
| main ÷ rail        | 2,49      | 2,49 ✓           |
| Tomt vänster/höger | 948 / 948 | **skillnad 0** ✓ |

Och tillbaka: attributet nollställs, rutnätet återgår till
`200px 2584.02px 360px`, `gridColumn` till `3`, taket till `424px`, lilla
vyn får sina 17 sektioner och öppna-knappen tillbaka, listan syns igen.

Med ögat står arbetsytan mitt i ytan nu. Snyggt löst — särskilt att du
såg flex-marginalen, som inte stod i ordern.

## En observation till, inte en anklagelse

Vid en av sju laddningar renderade kortet som
`patient-master-card v11-rail` trots att `data-v13-view="on"` stod på
`<html>`. Nästa laddning gav V13 igen. Jag har sett det **en gång** och
kan inte säga att det är nytt — V13 har lagts på i åtta ordrar och
racet kan vara äldre.

**Bygg inget på det här.** Men om du ser samma sak när du verifierar
ORD-116, säg till, så gör vi en egen order av det.
