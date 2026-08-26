# ORD-122 · Vägvarianten hoppar över foto-samtycket

**Arbetsorder · 2026-08-26**
**Bas:** `main`
**Gäller:** `384509c7` (Block 2.3) och grönt ljus för 2.1/2.2

Rättelserna du skrev är korrekta, alla tre. Tack för att du tog dem utan
att bli ombedd. Men 2.3 bär ett beslut som inte var ditt att fatta.

---

## Felet i STEP_VARIANTS

`cco-kundkort-kkx.js`, från din commit:

```js
nonSurgical: {
  8: { skip: true, note: 'Icke-kirurgisk — ingen operationsdag' },
  9: { skip: true, note: 'Icke-kirurgisk — inget foto-samtycke' },
},
```

**Steg 8 är rätt.** Friskförsäkran gäller enbart operationsdagen —
`cco-workflow-v13.md` §6 punkt 2 säger det ordagrant. Ingen op-dag,
ingen friskförsäkran.

**Steg 9 är fel.** Foto-samtycket gäller alla vägar. Workflow-dokumentet
§4, rad 176–180:

| Behandling         | Uppföljning/resultat  |
| ------------------ | --------------------- |
| PRP hår            | **foto-samtycke**     |
| PRP hud            | **foto-samtycke**     |
| Hårtransplantation | `steg9-foto-samtycke` |
| Ögonbryn/skägg     | `steg9-foto-samtycke` |
| Curatiio estetik   | **bildsamtycke**      |

Alla fem raderna kräver samtycke för bilder. Och §6 punkt 4 säger
**"journal + bilder varje besök — undantagslöst"**. Tas bilder, ska
samtycket finnas.

### Varför det spelar roll

Före/efter-bilder tas på PRP-kunder också — hela `s-foto`-sektionen och
bildbanken bygger på det. Med varianten som den står nu försvinner
samtyckessteget ur kundresan för dem, samtidigt som bilderna fortsätter
sparas.

Ett samtycke som inte efterfrågas är inte ett samtycke. Det här är
GDPR-yta, och beslutet fattades av en agent i en commit-text, inte av
Fazli.

### Åtgärd

Ta bort `9: { skip: true }` ur `nonSurgical`. Behåll `8`.

Behöver texten skilja sig mellan kirurgiskt och icke-kirurgiskt — facit
säger "bildsamtycke" för Curatiio och "foto-samtycke" för Hair TP — så
använd `stepOverrides` för **titeln**, inte `skip`.

---

## Grönt ljus för 2.1/2.2, efter rättelsen

Mekanismen du byggde i 2.3 är rätt konstruerad: `STEP_VARIANTS`,
`skipSteps`, `pathVariant`, `stepOverrides`, med `hairTP` som kanon och
varianter bredvid. Additivt, inte destruktivt. Bygg vidare på den.

**Steg 10–13:**

| Steg | Namn                                | Sanning                                            |
| ---- | ----------------------------------- | -------------------------------------------------- |
| 10   | Behandling utförd                   | signerad behandlingsjournal                        |
| 11   | Förskott betalt                     | `depositAmount` registrerad som betald             |
| 12   | Uppföljning 4/8/12                  | genomförda uppföljningsbesök mot `followupCadence` |
| 13   | Slutresultat & publiceringssamtycke | 12-månadersjournal + `photoConsentPublishing`      |

Varianterna gäller här också. Väg A/B (PRP som egen behandling) har
ingen op-dag, men **har** uppföljning — kadensen är
`2w_after_each_session` + `1m_after_final`, inte 4/8/12. Steg 12 måste
läsa behandlingens egen kadens, inte anta transplantationens.

**Gränser:**

- Rör inte stegen 1–9. De är verifierade.
- `j-step` visar fortfarande fyra rader + expanderaren — steglistan i
  lilla vyn ska inte växa till tretton rader.
- Inga påhittade tillstånd. Saknas datan är steget `todo`, inte `done`.

---

## Om commit-texten

Du vill rätta `d26f4221` ("Block 1-2"). **Skriv inte om historiken på
`main`** — den är pushad och tre agenter arbetar mot den.

Lägg rättelsen i `docs/workflow/cco-workflow-v13-implementering-FINAL.md`
i stället, där statusen ändå ska läsas. En rad räcker:

> `d26f4221` säger "Block 1-2". Endast Block 1 landade där. Block 2.3
> kom i `384509c7`; 2.1/2.2 i ORD-122.

Ett felaktigt commit-meddelande som är rättat i dokumentet är ofarligt.
En omskriven historik med tre agenter på samma gren är det inte.

---

## Verifiering

```js
// väg A/B-kund, efter rättelsen
({
  steg9Skippat: false, //  foto-samtycket ska finnas kvar
  steg8Skippat: true, //  friskförsäkran ska fortsatt hoppas över
});
```

Och kör om `tests/public/ccoKundkortKkxJourney.test.js` — den testar
varianterna och ska fånga ändringen.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`
