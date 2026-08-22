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

**Varning:** Wendelas rad på Cliento Schema-sidan är inaktuell — den säger
mån–fre 09–18 och saknar rotationen. Hennes rotation ovan är härledd ur
kalendern (hon arbetade måndag både v36 och v40, fyra veckor isär). Fazli ska
rätta Cliento. Övriga tres Schema-rader stämmer mot kalendern.

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

Alla läser eller bokar. **Ingen skriver** regler, resurser, tjänster eller block.

`confirmBooking` anropar `isSlotTaken` och inget annat — noll referenser till
`availabilityRules`, `calendarBlocks` eller `listAvailability`. Ingen kontroll
mot schemat vid bokning.

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
