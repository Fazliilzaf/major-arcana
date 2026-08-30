# ORD-151 · Betänketiden räknas från fel dag

**Arbetsorder · 2026-08-30**
**Bas:** `main` (`1ce9ab60`)
**Föregås av:** ORD-150 §4b (fyndet), ORD-42 (öppningsspårningen, juni 2026)
**Grind:** `CCO_SEND_LIVE` orörd · inga mallar godkänns av kod

---

## Fyndet

Signeringssidan säger till kunden:

```
ccoOfferEsign.js:260
"…betänketid är X kalenderdagar från att du mottagit
 tjänstespecifikation, patientinformation och offertunderlag."
```

Systemet räknar från något annat:

```
ccoCommercial.js:1159
coolingOffEndsAt = addDaysIso(sentAt, coolingOffDays)
                              ^^^^^^
                              när VI skickade
```

**Texten lovar mottagande. Koden räknar utskick.** Det är två olika dagar,
och skillnaden går alltid åt fel håll — betänketiden startar innan kunden
sett något.

Skickas offerten på fredag kväll och öppnas på måndag är två av två dagar
redan förbrukade. Kunden kan signera samma stund hon först läser
underlaget, medan avtalet påstår att hon haft betänketid.

Det är inte ett fel i uträkningen. Det är att utgångspunkten är fiktiv.

---

## Läs det här först — spårningen finns redan

ORD-42 byggde öppningsspårning i juni 2026. Bygg den inte igen.

```
ccoCommercialStore.js:622    quoteOpenedAt     första öppningen
             :1035           quoteOpenCount    antal öppningar
             :1101           offer_opened      tidslinjehändelse, med källa
```

Fälten finns, fylls, och visas redan i kundkortets historik. **Det som
saknas är kopplingen till betänketiden** — samma mönster som `cancelJob`
i ORD-140: mekanismen byggd, utlösaren aldrig kopplad.

---

## Uppgiften

### 1 · Räkna från öppningen, inte utskicket

`quoteOpenedAt` är den bästa tillgängliga upplysningen om att kunden fått
underlaget. Använd den.

```
coolingOffStartsAt = quoteOpenedAt    om den finns
                   = ?                om den inte finns   ← punkt 2
```

Rör inte `quoteSentAt`. Den ska ligga kvar — den är sann om utskicket, och
skillnaden mellan de två datumen är i sig information.

### 2 · Vad gäller när offerten aldrig öppnats

Det är orderns svåra punkt, och den ska inte lösas med ett förval i
tysthet.

En offert som inte öppnats har **ingen betänketid som börjat löpa**. Då
finns tre möjliga hållningar:

```
a)  betänketiden börjar inte     →  signering blockeras tills den öppnats
b)  faller tillbaka på utskick   →  dagens beteende, men nu medvetet valt
c)  eget läge: "ej påbörjad"     →  ytan säger det, ingen tyst siffra
```

**Jag lutar åt a.** Kan kunden nå signeringssidan har hon per definition
öppnat något — och har hon inte det finns ingen signering att skydda. Men
avgör själv och motivera. Säg emot om du ser något jag missat.

Vad du än väljer: **inget tyst fallback.** Ett datum som ser ut att vara
mottagandet men är utskicket är precis buggen vi lagar.

### 3 · Legacy-poster ska inte skrivas om

```
ccoHairTpCoolingOffPolicy.js:7
"existing records may still carry older multi-day coolingOffEndsAt —
 never rewritten on signed/archived cases without owner GO"
```

Den regeln gäller. Signerade och arkiverade ärenden behåller sin lagrade
`coolingOffEndsAt`. Ändra bara framåt.

### 4 · Ytan ska visa vilken dag som gäller

Kunden ser i dag ett slutdatum utan att veta vad det räknas från. Visa
utgångspunkten, inte bara slutet:

```
"Betänketiden löper från den dag du öppnade underlaget: 2026-08-28.
 Du kan signera från och med 2026-08-30."
```

Det är inte kosmetika. Det är skillnaden mellan ett påstående kunden kan
kontrollera och ett hon måste ta på tro.

---

## Godkänt när

1. `coolingOffEndsAt` räknas från `quoteOpenedAt` för nya ärenden. Ett test
   som visar att utskicksdatum och öppningsdatum ger olika slutdatum.
2. Fallet "aldrig öppnad" har ett **valt** beteende, motiverat i rapporten.
   Ett test. Ingen tyst fallback till `quoteSentAt`.
3. **Signerade och arkiverade ärenden är byte-identiska** före och efter.
   Ett test som räknar och jämför.
4. Ytan visar vilken dag betänketiden startar. Ett test på texten.
5. Ingen andra öppningsspårning byggd. Sök på `quoteOpenedAt` och visa att
   den enda källan är den från ORD-42.
6. Mutationstesta: byt tillbaka till `quoteSentAt` och visa att testet i
   punkt 1 blir rött.
7. `CCO_SEND_LIVE` orörd.

## Vad jag inte avgjort

**Om öppning räcker som bevis på mottagande.** En öppning i portalen är
starkare än ett utskick men svagare än en signatur. Räcker det juridiskt
för formuleringen "som tillhandahållits Kunden"? Det är en fråga för
Nordbro, inte för kod.

Bygg på `quoteOpenedAt` — det är obestridligt bättre än `quoteSentAt` —
men skriv i rapporten att frågan är ställd och obesvarad.

**Distansavtalslagens 14 dagar.** Den operativa betänketiden är 2 dagar och
är något annat än ångerrätten. Den här ordern rör bara de 2. Rör inte de
14, de bor i de juridiska PDF:erna.

**Vad som händer om kunden öppnar offerten flera gånger.**
`quoteOpenCount` finns. Jag utgår från att första öppningen gäller — men
säg till om du ser skäl att räkna från någon annan.
