# Sköterskornas schema — underlag, ingen lösning

Detta är ett faktaunderlag, inte ett förslag. Läs koden själv och återkom med
din analys och ditt förslag. Om något nedan inte stämmer mot koden, säg det —
allt är verifierat mot `origin/main` 2026-08-22, men verifiera gärna om.

## Målet

Fyra sköterskor ska bli bokningsbara för konsultation. De arbetar rullande
fyraveckorsschema.

Därefter ska personalen själv kunna sköta sitt schema: ändra arbetstider, lägga
in sina egna luncher (de har inga fasta lunchtider — de varierar per person och
dag), byta dagar med varandra, och lägga in semester.

## Nuläget i prod

Alla 20 sköterskeregler står `active: false` med `managedBy: 'staff'`.
Sköterskorna erbjuder noll tider för allt.

Reglerna täcker fyra tjänster per person: `consultation-physical`, `prp-hair`,
`prp-skin`, `microneedling`, `followup-transplant`. Alla dessa tjänster är
`active: true` i katalogen — det är reglerna som är avstängda, inte tjänsterna.

## Öppettider

|              | Vardag | Lördag |
| ------------ | ------ | ------ |
| Konsultation | 10–18  | 10–16  |
| Behandling   | 08–20  | 08–17  |

Konsultation är 45 minuter, fysisk och online.

## Rotationen

Utläst ur Cliento-kalendrarna, inte ur Cliento Schema-sidan.

```
A  mån–fre 08–17     B  tis–lör 08–17
C  tis–fre 11–20     D  ons–lör 10–18

           v1   v2   v3   v4
Veronica   B    C    D    A
Clara      A    D    C    B
Louise     C    B    A    D
Wendela    D    A    B    C

v34 = cykelvecka 4
cykelvecka = (((isoVecka - 35) % 4 + 4) % 4) + 1
```

Wendelas rotation är härledd ur kalendern, inte ur Schema-sidan: hennes rad där
sade mån–fre 09–18 utan rotation, medan kalendern visar att hon arbetade måndag
både v36 och v40 — fyra veckor isär. **Fazli rättade Cliento 2026-08-22**, så
Schema-sidan stämmer nu för alla fyra.

## Vad motorn kan i dag

`src/ops/ccoBookingEngineStore.js`

**Cykelstöd finns.** Rad 1005–1021 normaliserar `cycleWeeks` och `cycleWeek`.
Rad 1447–1457: `getCycleWeekForDate` och kontrollen om en regel gäller ett givet
datum. Fälten är alltså implementerade men inga regler använder dem.

**`managedBy: 'staff'` skyddar mot överskrivning.** Rad 887 och 896 — sammanslagningen
vid uppstart hoppar över regler som personalen äger. Utan det skulle
`defaultState()` skriva tillbaka sina värden vid varje omstart.

**Rutnätet klipps inte mot öppettiderna.** `startTimes` går rakt igenom till
`buildAvailabilitySlot`. Läkarnas regler hamnar innanför öppettiden bara för att
de _genereras ur_ `KONSULTATION_OPPET` (rad 159–201). En regel med fel klockslag
ger bokningsbara tider utanför öppet.

**Lunchen är ett enda globalt block.** `block-lunch-all`, `resourceIds: []`
(tomt = alla), `weekdays: [1,2,3,4,5]`, 12:00–13:00. Ingen lunch på lördagar.

## Vad som inte finns

`src/routes/ccoBookingEngine.js` har 13 endpoints:

```
preflight · create/confirm · legacy-catalog · runtime-catalog · consent-catalog
catalog · availability · case-summary · reservations · reservations/renew
confirm · cancel · rebook
```

Alla läser eller bokar. Ingen av dem skriver regler, resurser eller tjänster.

**Rättelse 2026-08-22: block ÄR skrivbara.** En tidigare version av det här
dokumentet påstod motsatsen. Felet uppstod för att bara
`src/routes/ccoBookingEngine.js` genomsöktes. Routen ligger i en annan fil:

```
src/routes/ccoBookings.js:1861   GET  /cco-bookings/calendar-blocks
src/routes/ccoBookings.js:1881   POST /cco-bookings/calendar-blocks
                                 requireStaffRole(context)
                                 bookingEngineStore.upsertCalendarBlock(req.body)
```

Luncher, ledighet och andra blockeringar går alltså redan att skriva via API,
staff-scopat. Bygg inte om det.

En begränsning finns kvar: `normalizeCalendarBlock` är byggd för återkommande
veckoblock — `dateFrom`/`dateTo` plus `weekdays`. Att stänga en enskild tisdag
kräver ett block som råkar täcka just den veckan. Det fungerar, men är klumpigt.

`confirmBooking` anropar `isSlotTaken` och inget annat — noll referenser till
`availabilityRules`, `calendarBlocks` eller `listAvailability`. Ingen kontroll
mot schemat vid bokning.

## Två saker som upptäcktes efter första versionen

**`getCycleWeekForDate` räknar inte ISO-veckor.** Den räknar
`floor((datum − cycleStart) / 7 dygn) mod cycleWeeks` (rad 1446–1453). Formeln
`(((isoVecka − 35) % 4 + 4) % 4) + 1` ovan ger samma svar **bara** om
`cycleStart` sätts till måndagen i ISO-vecka 35. Annars glider veckogränserna
från kalenderveckorna. Kalibrera och lås med ett test mot de två kända
datapunkterna — Wendela arbetade måndag v36 och v40 — innan något annat byggs.

**Det finns ingen koppling mellan inloggad personal och `resourceId`.**
Resurserna har `id`, `label`, `active`, `publicBookable` — inget användarkonto.
`role: 'Sjuksköterska'` är en etikett på resursen, inte en länk. Utan den länken
går "personalen sköter sitt eget schema" inte att avgränsa till _sitt eget_.

## Frågan till dig

Hur skulle du bygga det här? Vi har medvetet inte lagt en plan — läs koden och
säg vad du ser, inklusive sådant vi missat eller har fel om.

Några saker vi är osäkra på och gärna vill ha din bedömning av:

- Ska rotationen ligga som regler per cykelvecka, eller som något annat?
- Var hör personalens luncher och dagbyten hemma — block, regler, eller en ny
  modell?
- Vad händer med redan bokade patienter när någon ändrar sitt schema i
  efterhand? Det är det vanligaste fallet enligt kliniken.
- Vad bör göras i vilken ordning, och varför?

## Skalet, om det är relevant

Det finns en inställningssida i arkivet med menyraderna "Öppettider" och
"Personal & roller". Den ligger **inte** i repot.

`~/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0/major-arcana-pr96/public/installningar.html`

68 kB, 24 `fetch` mot `cco-policies`, `cco-users`, `cco-mailboxes`, `cco-brands`.
Öppettider-blocket är ren markup utan `id` och utan sparning. "Personal & roller"
är bara en menyrad utan panel.

Ta den eller låt bli — det är din bedömning.

## Obs innan du börjar

Arbetskopian på Fazlis Mac låg kvar på commit `01bcd439` för
`ccoBookingEngineStore.js` och dess test — versionen precis före #1493. Den
saknade `managedBy`, `cycleWeeks` och 211 testrader. Filerna var byte-identiska
med den commiten, så inget eget arbete fanns i dem, och de är återställda till
`origin/main` 2026-08-22. Testerna går igenom: 31 av 31.

Nämns här för att den som läser äldre anteckningar inte ska tro att cykelstödet
saknas. Det finns.
