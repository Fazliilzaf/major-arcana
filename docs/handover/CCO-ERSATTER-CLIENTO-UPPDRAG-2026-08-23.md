# CCO ersätter Cliento — uppdrag till kodanalys

> **Datum:** 2026-08-23 · **Beställare:** Fazli
> **Mål:** CCO ska ersätta Cliento helt. Bokning, kalender och navigering ska ske i CCO.
> Cliento ska pensioneras, inte samsas med.

Detta är inte en utredning om *huruvida* det ska göras. Beslutet är fattat.
Uppdraget är att svara på **vad som krävs, i vilken ordning, och vad det kostar.**

---

## Det som utlöste ordern

Fazli öppnade "Skapa bokning" i kalendern och kunde inte använda den. Panelen visade:

- rubriken **"Canonical patient · kontrollerat flöde"**
- ett rått UUID: `3a30e8ac-7ad1-4f7b-85fd-1e13df8e79e3`
- en knapp märkt **"Kör preflight"**
- ostylade webbläsar-`<select>` och `<input type="date">`
- ingen bild av hur dagen ser ut — datum väljs blint ur en lista

Hans ord: *"så här krångligt kan det inte vara att boka en kund … jag har ju inte
en aning om hur det ser ut just den dagen."*

Det är den skarpa kritiken, och den är riktig. Motorn är byggd. Gränssnittet är
utvecklarverktyg som råkat hamna framför en sköterska.

---

## Verifierat 2026-08-23 — bygg inte om det här, det fungerar

Allt nedan är mätt mot prod samma dag, inte utläst ur kod.

| Sak | Status |
|---|---|
| Bokningsmotorn (`ccoBookingEngineStore.js`) | Fungerar. 79/79 tester gröna |
| `reserve → confirm → cancel` mot prod | Verifierat, med städning |
| Niogrindars preflight | Fungerar |
| CCO-egna bokningar (`source: cco_booking_engine`) | Passerar **alla nio grindar**, `actionAllowed: true` |
| Konton | 4 sjuksköterskor + 2 ägare, alla med rätt `resourceId` |
| Patienter i CCO | 7 537 |
| Bokningar i CCO från Cliento | 53 316 |

**Slutsats:** backend är klar. Problemet ligger ovanför API-lagret.

---

## Verifierat — det som blockerar

### 1. Cliento-bokningar kan aldrig bli skrivbara som de ser ut nu

Två grindar fäller varenda en:

| Grind | Varför |
|---|---|
| 8 · `encounter_policy` | `encounterId` saknas. **0 av 53 316** har ett |
| 9 · `provider_write_contract` | `source: cliento`, och `providerWritable` kräver `cco` |

Att bara stämpla om `source` räcker alltså inte — grind 8 fäller dem ändå.

### 2. Det finns ingen skrivväg till Cliento

`src/infra/clientoApi.js:289` hårdkodar `method: 'GET'`. Sex metoder, alla läsande.
CCO kan inte skriva tillbaka till Cliento — vilket är oväsentligt om Cliento ska
pensioneras, men avgörande för varje plan som förutsätter parallelldrift.

### 3. Anteckningarna är inte flyttade — och omfattningen är omätt

Stickprov på 90 riktiga bokningar (17–30 aug):

| Fält | Med data |
|---|---|
| `notes` | 79 av 90 |
| `bookingNotes` | **0** |
| `internalNotes` | **0** |
| `treatmentNotes` | **0** |
| `customerMessage` | **0** |

ORD-100 flaggar `internalNotes: 0` som **oförklarat**. Tre möjliga orsaker med
helt olika allvarlighetsgrad: Cliento exporterar inte fältet, CSV-parsern mappar
det inte, eller anteckningarna fördes aldrig. **Ingen är utredd.**

Detta är den enda posten som kan dölja patientdata. Den måste redas ut före cutover.

---

## ⚠️ Läs detta först — designen är inte ogjord, den laddas inte

Kalenderns stilmall **`public/cco-kalender-shell.css`** — 935 rader, 104 klasser,
193 regler — refereras **inte av någon fil i repot**. `public/kalender.html`
laddar bara `/cco-mobile.css`.

Verifierat i prod 2026-08-23, i webbläsaren:

```
Laddade stilmallar på kalender.html:  inline · /cco-mobile.css · inline
harShell: false
Efter manuell injektion:              laddad: true, regler: 193
```

Filen finns och serveras. Den är föräldralös.

**Historiken visar exakt när det hände:**

| Commit | Datum | Händelse |
|---|---|---|
| `7dcf5811` — *wire calendar to live booking stores* | 2026-07-10 | `<link ... cco-kalender-shell.css>` **lades till** |
| `1445b984` — *restore canonical calendar V6 UI (#1038)* | 2026-07-17 | samma rad **togs bort** |

Commiten som skulle *återställa* V6-utseendet raderade stilmallen som ger V6
dess utseende. Kalendern har renderats utan sin egen CSS i fem veckor, och
ingenting har fångat det — ingen kontroll tittar på om stilmallar laddas.

**Konsekvens för fråga A nedan:** det Fazli såg — ostylade `<select>`, native
datumväljare, ingen grafisk profil — beror sannolikt till stor del på detta,
inte på att gränssnittet aldrig designats. `.cco-cal-create-input` har
`appearance: none`, rundade hörn och varumärkesfärg i CSS-filen som aldrig
laddas.

**Första åtgärd, före all analys:** återställ `<link>`-taggen, ladda om, och
titta. Det är en rad. Bedöm gränssnittet därefter — inte innan. Delar av
kritiken kommer sannolikt kvarstå (UUID i panelen, "Kör preflight" som
knapptext, ingen dagsvy vid bokning) — de sitter i markupen, inte i CSS:en.
Men utgångsläget för bedömningen ändras.

---

## Vad analysen ska svara på

### A. Bokningsgränssnittet — huvudfrågan

Hur ska "skapa bokning" se ut för en sköterska eller receptionist som inte vet
vad en preflight är?

Krav som framgått av kritiken:

1. **Dagen ska synas medan man bokar.** Man väljer tid i en kalender, inte ur en dropdown.
2. **Inga interna begrepp i gränssnittet.** Inga UUID, ingen "canonical", ingen "preflight".
3. **Grindarna ska köras — men osynligt.** Blockeras något ska det stå *varför*, på svenska, i klartext.
4. **Följa CCO:s grafiska profil.** Inte ostylade webbläsarkontroller.

Leverans: konkret förslag på flöde och ytor, inte en kritik av det befintliga.

### B. Vad krävs för att pensionera Cliento

- Vad måste byggas som i dag bara finns hos Cliento? (webbokning, bekräftelsemail,
  påminnelser, avbokningslänkar, resursscheman, öppettider, Z-rapporter)
- Vad av det finns redan i CCO men är inte inkopplat?
- Vilken är den kortaste vägen till att en patient kan boka på hairtpclinic.com
  och hamna i CCO?

### C. Migreringen

- Hur får de 53 316 bokningarna ett `encounterId`, eller hur ändras grind 8 så
  historik kan vara läsbar utan att vara skrivbar?
- Vad hände med anteckningsfälten? Utred de tre hypoteserna ovan.
- Vad är minsta datamängd som måste flyttas för att kliniken ska kunna sluta
  öppna Cliento?

### D. Ordning och risk

Vad ska göras först, vad kan vänta, och vad är oåterkalleligt.

---

## Regler för arbetet

Dessa gäller för att dagens misstag inte ska upprepas.

1. **Mät, gissa inte.** Varje påstående om prod ska ha ett kommando eller svar bakom sig.
2. **`visits` är bokningar. `slots` är lediga tider.** Att slå ihop dem har gett
   fel svar två gånger i dag, av två olika agenter. Räkna dem var för sig.
3. **Kolla vilken gren och vilken arbetskopia du är i** innan du säger att något
   saknas. Ocommitad kod är osynlig för alla utom dig.
4. **Ett påstående som ska överleva behöver en självkontroll** — ett skript eller
   test som säger till när det slutar stämma. Prosa åldras tyst.
5. **Öppna gränssnittet och titta** innan något kallas färdigt. Ett grönt API-svar
   är inte ett användbart verktyg. Det är hela anledningen till att den här
   ordern finns.
