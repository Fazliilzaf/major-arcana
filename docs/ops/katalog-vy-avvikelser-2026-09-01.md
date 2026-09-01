# Katalogen och vyn — tio avvikelser, och 157 som inte är det

**Mätt 2026-09-01** · `src/ops/hairtp-document-types.catalog.json` mot
`public/major-arcana-preview/cco-dokument-v1.html`

ORD-161 gjorde inventariet komplett: 62 mot 62, drift-test på plats. Kvar är
frågan om de tre filerna säger samma sak om de dokument de alla känner till.

Den här noten är inte en order. De tio nedan väntar på svar från kliniken eller
på att någon öppnar en fil — inget av det gör en agent bättre än en människa.

---

## Vad som INTE är en avvikelse

En rå fältjämförelse ger 157 träffar. Nästan alla är brus:

```
act      60 av 60   fältet finns inte i katalogen alls
flags    42         samma sak
cat      55         två olika ordförråd, med flit
```

`cat` är den intressanta av dem:

```
                    vyn                     katalogen
offert_tp           signeringsunderlag      commit
journal_estetik_*   journalmall             treatment
curatiio_*_info     info                    intake
```

Vyn beskriver **vad personal gör med dokumentet**. Katalogen beskriver **var i
flödet det hör hemma**. Två frågor, två svar, båda riktiga. Att harmonisera dem
vore att slå ihop två begrepp som förtjänar var sitt.

Räkna alltså inte 157 som skuld. Det är sju plus tre.

---

## Sju om språk — frågan går till kliniken

Katalogen säger `sv+en`, vyn säger `sv`:

```
curatiio_botox_info        curatiio_ortoped_info
curatiio_filler_info       curatiio_prf_hud_info
curatiio_ogonlock_info     curatiio_profhilo_info
curatiio_prp_hud_mn_info
```

Ingen av de sju har någon fil i vyn (`file` är tom), så det går inte att avgöra
genom att läsa. Frågan är inte teknisk: **finns Curatiios patientinformation på
engelska?**

Finns den, är vyn efter. Finns den inte, lovar katalogen något som inte
existerar — och en engelsktalande patient får en svensk text.

---

## Tre om flöden — kräver att någon öppnar filerna

```
forberedelse_curatiio     katalogen: 8 flöden      vyn: ["op"]
eftervard_curatiio        katalogen: 8 flöden      vyn: ["op"]
curatiio_prp_hud_mn_info  katalogen: prp_skin,     vyn: ["prp_skin"]
                                     microneedling
```

Vyn är troligen rätt på de två första — filnamnen är ögonlocksspecifika. Men
"troligen" räcker inte här: `flowApplies` avgör vilka patienter dokumentet dyker
upp för. Breddar man det får patienter som inte ska ha texten den ändå, och
smalnar man av det försvinner den för någon som behöver den.

Läs de tre filerna och avgör vilka behandlingar de faktiskt beskriver. Rätta
sedan i den fil som har fel — inte i inventariet, som bara speglar katalogen.

---

## Vad som redan är skyddat

`tests/ops/documentInventoryDrift.test.js` (ORD-161) failar när ett dokument-id
finns i en fil men saknas i en annan, åt båda håll.

Den mäter att **raderna finns**, inte att de **stämmer överens**. De tio ovan är
precis den luckan. Att bygga ett test för dem innan svaren finns vore att låsa
fast dagens värden som facit.
