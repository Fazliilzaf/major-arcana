# ORD-105 · Två otestade skydd i CCO

**Arbetsorder till DeepSeek · 2026-08-25**
**Bas:** `main` · **Två uppgifter, oberoende av varandra.**

Båda handlar om samma sak: kod som skyddar mot något illa, utan test som
bevisar att skyddet finns. Det är exakt det mönster som gav
standardrums-buggen tidigare idag — rätt logik, oskyddad, upptäckt av en
slump.

---

## Uppgift 1 — Testa preflight-varningen om upptaget rum

### Vad som finns

`src/routes/ccoBookingEngine.js` rad ~906 varnar när personalen uttryckligen
väljer ett rum som redan är upptaget:

```js
const taken = bookingEngineStore.isRoomTaken
  ? bookingEngineStore.isRoomTaken(
      roomId,
      selectedSlot.startsAt,
      selectedSlot.endsAt,
      {
        excludeConversationId: context.conversationId,
      }
    )
  : false;
```

Varningen blockerar inte — människan får boka ändå. Det är rätt beslut.

### Problemet

**Noll tester rör den.** Sökning på `roomBusy`, `room_busy` och
`upptaget vid vald` i `tests/` ger inga träffar.

Och konstruktionen är tyst känslig. Ternären faller till `false` om
`isRoomTaken` saknas — vid namnbyte, om storen inte skickas in, eller om ett
test mockar storen utan metoden. Då försvinner varningen utan att något går
rött, och personalen dubbelbokar ett behandlingsrum utan att veta om det.

Jag kontrollerade att metoden faktiskt exporteras idag (`typeof
store.isRoomTaken === 'function'`), så varningen _kan_ utlösas. Det är
skyddet mot framtiden som saknas.

### Vad som ska göras

Ett route-test som:

1. Reserverar en tid i rum X.
2. Kör preflight för en annan tid som överlappar, med `roomId: X` explicit.
3. Kontrollerar att `warnings` innehåller strängen om upptaget rum.
4. Kontrollerar att `actionAllowed` fortfarande är `true` — varningen får
   inte börja blockera.

Plus ett test där rummet är ledigt och `warnings` är tom.

### Mutationstest — obligatoriskt

Byt `bookingEngineStore.isRoomTaken` mot `undefined` i routen. Testet ska bli
rött. Blir det inte rött testar det ingenting, och då är hela uppgiften
ogjord.

---

## Uppgift 2 — De tre röda testerna i cross-tenant-dedupen

### Vad som är rött

`tests/ops/clientoBookingStoreCrossTenantDedup.test.js`, 3 av 5:

- `mergeCrossTenantDuplicateBookings dry-run reports without writing`
- `... commit merges into canonical tenant and removes the other copy`
- `... excludes one-sided, mismatched and unlinked-review bookings`

Felet är samma i alla tre:

```
+ 'blocked_data_invariant'
- 'dry_run_ready'
```

Alltså: invariant-grinden i `clientoBookingStore.js` rad ~504 slår till.
`invariantFailures` är inte tom, och rapporten blockeras.

### Min hypotes — verifiera den, ta den inte för given

Testerna gick sönder troligen av **min egen ändring tidigare idag**
(`270b9914`, cross-tenant-upsert). Före den var `hair_tp` och
`hair-tp-clinic` två skilda namnrymder. Efter den behandlas de som samma
tenant via `tenantCandidates()`.

Jag byggde en minimal reproduktion och fick:

```
mergeCrossTenantDuplicateBookings: två olika tenant-id krävs.
```

Verktygets hela premiss är att det finns två tenants att slå ihop. Den
premissen gäller inte längre på skrivsidan.

Notera att min reproduktion gav ett _annat_ fel än testerna
(`blocked_data_invariant`), så testerna bygger upp sitt läge på ett sätt jag
inte återskapade. Ta reda på hur innan du drar slutsatser.

### Vad som ska avgöras

Det här är inte "laga ett trasigt test". Det är en fråga om vad verktyget är
till för nu:

**Antingen** är merge-verktyget fortfarande relevant för historisk data som
redan ligger dubblerad i storen — och då ska testerna skrivas om så de
speglar den nya tenant-modellen.

**Eller** är det obsolet, eftersom upserten inte längre skapar
cross-tenant-dubbletter — och då ska verktyget och dess tester tas bort, inte
lappas.

Ta reda på vilket. Skriv ner svaret i commit-meddelandet.

### Gräns

**Rör inte städskriptet mot produktionsdata.** Det finns fortfarande 530
dubblettpar där uppgifter står mot varandra (`Show → Booked` i 266 fall).
De väntar på Fazlis beslut, inte på kod. En körning som slår ihop dem fel
raderar besöksutfall.

---

## Vad du INTE ska bygga nu

**Personal-yta för `defaultRoomId`.** Auto-tilldelningen räcker och är
genomtestad. Standardrummet var dessutom det enda som gav en riktig bugg i
hela rumsbygget, just för att det går förbi krockkontrollen på ett sätt
auto-vägen inte gör. Bygg inte en yta som gör det lättare att sätta fältet.

**Behandlingsplan-mail.** Planen når redan kunden via offerten —
`ccoOfferFromPlan` läser `fields.graftsTotal` och `fields.zones[].grafts` och
bygger in dem i offertdokumentet. Om ett separat mail ska finnas är en
produktfråga som Fazli inte svarat på. Två utskick med samma graftantal kan
säga olika saker när planen ändras efter att offerten gått.

---

## Gränser som gäller som förut

- Ingen CMO-kod.
- Inga hemligheter i repo.
- Inga påhittade nummer eller adresser i test.
- En gren, svenska commit-meddelanden som förklarar _varför_.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

**Kända röda innan du börjar:** de 3 i cross-tenant-dedupen (uppgift 2),
`V12 visar befintliga visit-segments`, och två CTA-tester. `availabilityRules`
lagades i morse och ska vara grön. Blir det fler röda än så är de dina.
