# ORD-162 · render.yaml är kopplad, och ingen visste det

**Arbetsorder · 2026-09-01**
**Bas:** `main` (`e1c7a305`)
**Föregås av:** ORD-156 (env-bevakningen), ORD-156 §5 — den öppna frågan den här ordern besvarar
**Grind:** ingen ändring i `render.yaml` innan §1 är mätt
**Prioritet:** P1 — en fil vi trott är död styr produktionsmiljön automatiskt

---

## Rättelsen

ORD-156 §5 lämnade frågan öppen: ska `render.yaml` kopplas på som Blueprint
eller tas bort? Premissen var att den **inte** är kopplad och därför inte styr
något. Jag har upprepat det flera gånger i dag.

Det är fel. Mätt mot Renders API 2026-09-01:

```
GET /v1/blueprints

CCO-Next
  repo      https://github.com/Fazliilzaf/major-arcana
  branch    main
  path      render.yaml
  autoSync  true
  status    in_sync
  lastSync  2026-08-30T11:28:50Z
```

Blueprinten heter `CCO-Next`, inte `arcana` — därför hittade ingen den när man
letade efter tjänstens namn. Den pekar på det här repot, på `main`, på
`render.yaml`, och den **synkar automatiskt**.

`render.yaml` deklarerar 122 env-nycklar.

---

## Vad det betyder

En ändring i `render.yaml` på `main` är inte dokumentation. Det är en
produktionsändring som sker utan att någon trycker på deploy.

Det ändrar hur flera saker vi byggt i dag ska förstås:

**ORD-155** flyttade öppningsvärden till kod-defaults för att en glömd nyckel
aldrig ska öppna något. Om Blueprinten samtidigt skriver nycklar till Render kan
de två vara oense, och Renders värde vinner över kod-defaulten.

**ORD-156** byggde en kontroll som jämför Render mot Blueprinten och larmar vid
avvikelse. Den kontrollen antog att Blueprinten är ett facit någon underhåller
för hand. Den är i själva verket en aktiv källa.

**Env-tömningen 2026-08-30.** Blueprintens `lastSync` är samma dygn som prod-
miljön stod tom. Jag påstår inte att den orsakade det — det vet jag inte, och
Renders Events-logg är den enda som kan svara. Men frågan går inte längre att
avfärda med "Blueprinten är inte kopplad".

---

## Uppgiften

### 1 · Mät vad den faktiskt styr — GJORT 2026-09-01

Två av tre frågor är besvarade. Den tredje går inte att besvara via API:t.

**Hanterar Blueprinten prod-tjänsten? Ja.**

```
GET /v1/blueprints/exs-d6vdjapaae7s7386fum0

resources: [{ id: "srv-d8b3i3tckfvc73clgeng", name: "arcana", type: "web_service" }]
```

Inte antaget ur filens `name: arcana` — läst ur Renders egen resurslista.

**Skriver en sync över dashboarden? Den rensar i alla fall inte.**

```
blueprint med deklarerat värde      95
Render                             124 nycklar
i Render men utan värde i filen     29   ← överlevde senaste synken
deklarerat värde ≠ Renders värde     0
```

De 29 (27 `sync: false` plus två till) fanns kvar efter synken 2026-08-30. En
sync tar alltså inte bort nycklar som saknas i filen.

Att noll värden skiljer sig betyder inte att sync låter dashboarden vara — det
betyder att de är överens just nu. Ändrar någon ett av de 95 i dashboarden är
frågan obesvarad tills nästa sync. **Det är den risken beslutet handlar om.**

**Vad hände 2026-08-30? Går inte att läsa via API:t.**

```
GET /v1/services/srv-…/events   →  bara build_started/ended, deploy_started/ended
```

Env-ändringar finns inte i händelseströmmen. De syns bara i dashboardens
Events-flik, och den kräver inloggning. Kvar för ägaren.

Det som _går_ att säga: de två synkarna den 30:e kom från commit `8169584a` och
`5418231f`, och båda **lade till** `META_*`-nycklar. Ingen av dem tog bort
något. Sammanträffandet i datum har alltså ingen mekanism bakom sig i det jag
kunnat mäta.

---

### 1b · Ursprunglig formulering (kvar som spårbarhet)

Innan något ändras: ta reda på vilka tjänster Blueprinten hanterar, och vad en
sync gör med env-värden.

```
GET /v1/blueprints/exs-d6vdjapaae7s7386fum0
GET /v1/services/srv-d8b3i3tckfvc73clgeng
```

Frågorna som ska besvaras med svar, inte med resonemang:

- Är prod-tjänsten (`srv-d8b3i3tckfvc73clgeng`, namn `arcana`) en av dem
  Blueprinten hanterar? Blueprinten deklarerar `name: arcana` — men det bevisar
  bara vad filen säger, inte vad Render kopplat.
- Skriver en sync över env-värden som satts i dashboarden, eller lämnar den dem?
  `sync: false`-nycklarna är skyddade per definition; de 95 med värde är det inte.
- Vad hände vid `lastSync` 2026-08-30 11:28? Renders Events-logg för tjänsten.

**Ändra ingenting förrän de tre är besvarade.** En Blueprint som synkar
automatiskt är inte en fil man experimenterar med.

### 2 · Bestäm vad filen ska vara

Två hållbara lägen. Det nuvarande — kopplad men obemärkt — är inget av dem.

**A. Sanningskällan.** `render.yaml` styr miljön, dashboarden rörs inte för hand,
och avvikelser rättas i filen. Då ska ORD-156:s kontroll vändas: den ska larma
när Render skiljer sig från Blueprinten, inte tvärtom.

**B. Frikopplad.** Blueprinten tas bort i Render, `render.yaml` blir
dokumentation, och dashboarden är sanningen. Då ska filen bära en rad som säger
det — annars återupptäcker någon den om ett halvår och kopplar på den igen.

Valet är ägarens. Skriv det i filens huvud, inte i ett commitmeddelande.

### 3 · Gör kopplingen synlig

Oavsett val: att en Blueprint med `autoSync: true` fanns utan att någon visste
är det egentliga felet. Två personer och två agenter har i dag resonerat kring
`render.yaml` utifrån motsatsen.

Lägg kopplingens läge i `scripts/verify-render-env-count.js` — den kör redan mot
Renders API och rapporterar till en människa. En rad räcker:

```
Blueprint   CCO-Next · autoSync true · in_sync · senast 2026-08-30
```

Och ett larm när `autoSync` är på men Blueprinten inte är `in_sync`: då ligger
en osynkad produktionsändring och väntar.

---

## Fällan

**Röta inte i `render.yaml` för att se vad som händer.** Den synkar automatiskt.
Ett experiment är en produktionsändring.

**Anta inte att `name: arcana` i filen betyder att tjänsten hanteras av
Blueprinten.** Filen säger vad den vill styra. Render säger vad den styr. Det är
skillnaden som gjorde att ingen hittade kopplingen — man sökte på fel namn.

**Dra inga slutsatser om env-tömningen utan Events-loggen.** Sammanträffandet i
datum är ett skäl att titta, inte ett svar.

---

## Godkänt när

1. De tre frågorna i §1 är besvarade med API-svar eller Events-logg, inte med
   resonemang.
2. Ägaren har valt A eller B, och valet står i `render.yaml`.
3. `verify-render-env-count.js` rapporterar Blueprintens läge vid varje körning.
4. Ett larm när `autoSync` är på och status inte är `in_sync`.
5. Om A valdes: ORD-156:s kontroll är vänd åt rätt håll.
6. Om B valdes: Blueprinten är borttagen i Render, och det är verifierat mot
   `/v1/blueprints` — inte antaget för att någon klickade.

---

## Vad jag inte avgjort

**Om `CMO-mvp`-blueprinten har samma problem.** Den finns, autoSync är på, och
den pekar på ett annat repo. Jag har inte tittat på den. Är mönstret detsamma
där är det en egen order — men det är värt att veta innan någon blir förvånad
en andra gång.
