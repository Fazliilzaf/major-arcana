# Underlag till Nordbro

**Från:** Fazli Krasniqi, Hair TP Clinic AB / Curatiio
**Datum:** 2026-08-30
**Gäller:** två frågor som blockerar driftsättningen av klinikens
dokumenthantering

---

Vi har byggt ett system som ska skicka offert, behandlingsavtal och
patientinformation till kund. Underlagen finns för samtliga behandlingar
utom elva, och systemet är byggt så att ingenting kan skickas förrän det
är juridiskt godkänt.

Två saker står i vägen. Båda är juridiska bedömningar, inte tekniska.

---

## Fråga 1 · Räcker en portalöppning som "tillhandahållits Kunden"?

### Vad avtalet säger

Behandlingsavtalet innehåller denna mening, som kunden signerar:

> _"Genom signering bekräftar patienten att bilaga 1 mottagits och att
> villkoren accepteras."_

Bilaga 1 är patientinformation och tjänstespecifikation.

Signeringssidan säger dessutom:

> _"Betänketiden är 2 kalenderdagar från att du mottagit
> tjänstespecifikation, patientinformation och offertunderlag."_

### Vad systemet faktiskt kan belägga

Tre nivåer av bevis, i stigande styrka:

| Bevis                            | Finns i systemet | Vad det visar                     |
| -------------------------------- | ---------------- | --------------------------------- |
| Utskicksdatum                    | ja               | att vi skickade                   |
| **Öppningsdatum i kundportalen** | **ja**           | **att kunden öppnade underlaget** |
| Signatur på mottagandet          | nej              | —                                 |

Vi har fram till nu räknat betänketiden **från utskicksdatum**. Det innebar
att fristen kunde löpa ut innan kunden öppnat något — skickas en offert
fredag kväll och öppnas måndag var båda dagarna redan förbrukade.

Vi har rättat detta. Betänketiden räknas nu **från den dag kunden öppnade
underlaget i portalen**, och kan inte börja löpa dessförinnan. Har kunden
inte öppnat är signering blockerad.

### Vad vi behöver veta

**a)** Är en loggad öppning i kundportalen tillräcklig grund för
formuleringen _"som tillhandahållits Kunden"_ och för att starta
betänketiden?

**b)** Om nej — vad krävs? En aktiv bekräftelse från kunden ("jag har läst
och mottagit"), eller något starkare?

**c)** Ska formuleringen i avtalet ändras så att den motsvarar vad vi
faktiskt kan belägga, i stället för tvärtom?

Vi vill hellre ändra texten än ha en text vi inte kan styrka.

---

## Fråga 2 · Elva behandlingar saknar tjänstespecifikation

### Vad som finns

Femton tjänstespecifikationer, daterade mars 2026, täcker våra
behandlingar — botox, fillers, Profhilo, ögonlocksplastik, ortopediska
injektioner, PRP och PRF i olika former, samt hårtransplantation.

De är framtagna, aktuella och används.

### Vad som saknas

Elva behandlingar som vi säljer har **ingen** tjänstespecifikation:

| Behandling                             | Pris      |
| -------------------------------------- | --------- |
| DHI Skäggtransplantation: 1 000 grafts | 52 000 kr |
| DHI Skäggtransplantation: 1 500 grafts | 56 000 kr |
| DHI Skäggtransplantation: 2 000 grafts | 60 000 kr |
| DHI Skäggtransplantation: 2 500 grafts | 64 000 kr |
| DHI Skäggtransplantation: 3 000 grafts | 68 000 kr |
| FUE Skäggtransplantation: 1 000 grafts | 42 000 kr |
| FUE Skäggtransplantation: 1 500 grafts | 46 000 kr |
| FUE Skäggtransplantation: 2 000 grafts | 50 000 kr |
| FUE Skäggtransplantation: 2 500 grafts | 54 000 kr |
| FUE Skäggtransplantation: 3 000 grafts | 58 000 kr |
| DHI Ögonbrynstransplantation           | 25 000 kr |

Samtliga hos Hair TP Clinic.

### Varför de inte kan använda hårtransplantationens

Tekniken är densamma — DHI respektive FUE, follikelutvinning och
placering. Men tjänstespecifikationen är ett bindande dokument som
beskriver **den behandling kunden köper**, och den beskrivningen skiljer
sig:

- **Annat mottagarområde** — ansikte respektive ögonbryn, inte hårbotten
- **Andra riktningskrav** — skäggstrån och ögonbrynshår växer i andra
  vinklar än hår på skalpen
- **Annan eftervård** — rakning, ansiktshygien, solskydd
- **Andra förväntningar på resultat** — täthet och växtmönster skiljer sig
- **Ögonbryn särskilt** — närhet till ögat, andra risker

Ett dokument som säger "hårtransplantation" när kunden köpt
skäggtransplantation är enligt vår bedömning en avvikelse. Vi vill inte
använda hårtransplantationens specifikation som täckmantel för elva andra
behandlingar.

### Vad vi behöver

**a)** Kan Nordbro ta fram tjänstespecifikationer för dessa elva? Vi ser
det som två eller tre dokument snarare än elva — skägg DHI, skägg FUE,
ögonbryn — där antal grafts är en variabel, inte ett eget dokument.

**b)** Om ni behöver ett underlag att utgå från: den befintliga
specifikationen _Tjänstespecifikation — hårtransplantation, TP 2026_ är
strukturen vi vill följa.

**c)** Vad är rimlig tidsram? Behandlingarna säljs i dag, och systemet
blockerar dem så snart dokumentkravet aktiveras.

---

## Vad som händer under tiden

Systemet är byggt att **neka**, inte att chansa. Så länge en behandling
saknar tjänstespecifikation går det inte att skicka ett behandlingsavtal
som påstår att bilagan bifogats.

Det betyder att de elva behandlingarna inte kan hanteras digitalt förrän
dokumenten finns. Det är avsiktligt, och vi vill hellre ha det så än
tvärtom.

Ingenting skickas till patient förrän varje mall är godkänd. Den grinden
är byggd och testad.

---

**Kontakt:** Fazli Krasniqi · info@fazli.se · Hair TP Clinic AB,
Vasaplatsen 2, 411 34 Göteborg
