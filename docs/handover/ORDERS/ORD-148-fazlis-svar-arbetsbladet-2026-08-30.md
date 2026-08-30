# ORD-148 · Fazlis svar — arbetsbladet och fyra beslut

**Arbetsorder · 2026-08-30**
**Bas:** `main` (`820a079c`)
**Föregås av:** ORD-135 §2 (arbetsbladet), ORD-137 (Profhilo), ORD-140 (avbokning), ORD-141 (för- och eftervård)

Arbetsbladet har legat med 537 obesvarade rutor sedan ORD-135. Fazli
besvarade dem 2026-08-30, i sju grupper. Nedan är svaren och vad de
betyder i katalogen.

---

## Så här mättes bladet

```
$ python3 — klassificera varje rad i underlag-per-tjanst-ARBETSBLAD.csv

grupp                rader  rutor
Transplantation         26    305
PRP                     15     75
Injektioner             12     62
Ögonlocksplastik         4     20
Ortopediska              7     38
Konsultationer           5     22
Uppföljningar            3     15
TOTALT                  72    537
```

**Rätta mina tidigare siffror.** Jag sa i chatten 25/300 för
transplantation och 19/95 för PRP. Det var en grovsortering där
ortopedisk PRF räknades två gånger. Tabellen ovan är den som gäller.

---

## Besluten, grupp för grupp

### 1 · Transplantation — 26 rader, 305 rutor

**JA på alla kolumner.**

DHI, FUE, skägg, ärr — samma dokumentkrav oavsett antal grafts. Priset
skiljer, kraven gör det inte.

### 2 · PRP — 15 rader, 75 rutor

**JA på alla fem kolumner.**

```
konsultationsmall       JA
journal_prp_multi       JA
behandlingsplan_staff   JA
anteckningar_kort       JA
id_verifiering          JA
```

Fazli sa först "enbart konsultationsmall och journal prp". PRP-raderna
har fem kolumner med frågetecken, inte två, och på följdfrågan blev de
tre sista **JA**.

Det är värt att notera varför frågan behövde ställas: "enbart de två"
lät som ett avgränsande svar, men gällde bara journalvalet. Hade vi
tolkat det som ett nej på de tre andra hade PRP-behandlingar saknat
id-verifiering.

### 3 · Injektioner — 12 rader, 62 rutor

**JA på alla** — men journalkolumnerna är **ömsesidigt uteslutande**.

```
Botox: 1 område        → journal_estetik_botox
Fillers: Läppar 1 ml   → journal_estetik_filler
Profhilo: 1 behandling → journal_estetik_profhilo
```

En botoxrad ska bära `botox`, inte alla tre. Sätter du JA i alla
journalkolumner får kundkortet tre journaler på en behandling.

### 4 · Ögonlocksplastik — 4 rader, 20 rutor

**JA på alla**, `journal_estetik_op`.

Kirurgi, samma nivå som transplantationerna. Se även ORD-129
(`minorSurgery`) som fortfarande är öppen.

### 5 · Ortopediska — 7 rader, 38 rutor

**JA på alla — och båda journalkolumnerna.**

```
journal_estetik_ortopedi   behandlingen
journal_prp_multi          serien — flera tillfällen i samma journal
```

Fazli, ordagrant: *"vi kan ta multi att man kanske kan addera i samma
journal"*, och på följdfrågan **båda**.

Det är den enda gruppen där två journalkolumner samexisterar med avsikt.
Skriv det i katalogen så nästa läsare inte tror att det är ett misstag.

### 6 · Konsultationer — 5 rader, 22 rutor

**JA på alla**, med journal **matchad efter specialitet**.

```
Ögonlocksplastik · Konsultation          → journal_estetik_op
Ortopediska injektionsbehandlingar · K.  → journal_estetik_ortopedi
Möte på kliniken · Fysisk konsultation   → specialiteten avgör
Digitalt videosamtal · Onlinekonsultation
Estetiska injektioner · Konsultation
```

**En konsultation öppnar alltså en journal.** Det är bekräftat, inte
antaget — jag frågade uttryckligen och Fazli svarade ja.

De tre raderna utan egen specialitet i namnet behöver en regel. Föreslå
en, bygg den inte i tysthet.

### 7 · Uppföljningar — 3 rader, 15 rutor

**JA på alla.**

```
8952 Uppföljning: Botox     → journal_estetik_botox
8953 Uppföljning: Filler    → journal_estetik_filler
8954 Uppföljning: Profilho  → journal_estetik_profhilo   ← NY
```

**Det stänger ORD-137:s sista öppna fråga.** Profhilo-uppföljningen har
saknat journal sedan 2026-08-28. Ta bort den ur `_judgments`.

Notera stavfelet i katalogen: raden heter `Profilho`, inte `Profhilo`.
Rör inte id:t — men flagga texten.

### `id_verifiering`

**JA överallt** där den har ett frågetecken. Inga undantag.

---

## Vad hela bladet säger

Alla 537 rutor är **JA**.

Det låter som att frågan var meningslös. Det var den inte — den gav två
saker:

1. **Bekräftelse att generatorn satte `?` på rätt ställen.** En
   transplantationsrad har inget frågetecken i `journal_estetik_botox`.
   Kolumnerna var redan filtrerade per behandlingstyp; det bladet
   egentligen frågade var *"stämmer filtreringen?"* — och svaret är ja.

2. **Journalmatchningen**, som inte är ja/nej utan ett val mellan
   uteslutande alternativ. Det är där det verkliga arbetet ligger.

Bygg alltså inte "sätt JA överallt" som en engångsskript-körning utan att
lösa punkt 2. Journalkolumnerna är det svåra.

---

## Tre beslut utanför bladet

### För- och eftervård — kanonfilen är vald *(ORD-141 rad 1)*

```
Hair TP    [SE] Guide-För&Eftervård-TP.pdf     8 sidor, för + eftervård
Curatiio   "Patientinformation"                egen fil, egen rad
```

Curatiio delar **inte** TP:s guide. `clinics: ['curatiio']`, egen
katalograd. Förberedelse och eftervård är fortfarande två rader, inte en
— även när de ligger i samma PDF.

`TP. Postoperativa instruktioner.pdf` är inte längre kandidat till kanon.
Låt den ligga.

### Avbokad tid stänger inte uppföljningen *(ORD-140)*

Fazli: uppföljningen **ligger kvar**. Systemet stänger ingenting av sig
självt.

Men personalen ska få en **fråga**: *"den här tiden avbokades — ska
framtida tider avbokas också?"* Ett val i gränssnittet, inte ett
automatiskt beslut.

Skälet: systemet vet inte om behandlingen hunnit bli av. Det gör
personalen.

Det ändrar förvalet i ORD-140 §3. Bygg frågan, inte automatiken.

### Reservationen håller 7 dagar *(ORD-146, levererat `820a079c`)*

Med här för fullständighetens skull — den är redan byggd.

---

## Godkänt när

1. **Alla 537 rutor ifyllda. Noll `?` kvar.** Sök och visa det.
2. Ingen rad bär mer än en journalkolumn — **utom de ortopediska**, som
   bär två med avsikt och en kommentar som säger varför.
3. `8954` pekar på `journal_estetik_profhilo` och är ute ur `_judgments`.
4. Kanonfilerna finns som katalograder: TP-guiden och Curatiios
   Patientinformation, var för sig, med `clinics` i plural.
5. Avbokning **stänger inte** uppföljningen. Ett test som visar att den
   ligger kvar, och en yta som ställer frågan.
6. Konsultationsraderna utan specialitet i namnet har en dokumenterad
   regel, föreslagen och godkänd — inte gissad.
7. `CCO_SEND_LIVE` orörd. `pending` kvar som förval.

## Curatiios kanonfil — rättelse till ORD-142

Fazli, 2026-08-30: Curatiios för- och eftervårdsdokument heter
**"Information inför ögonlocksplastik (Dermatochalasis)"**.

Den filen stod redan i vår egen förteckning — felklassad:

```
SP-KUNDDOKUMENT-KVALITETSSAKRA-FORTECKNING-2026-08-29.md:111
| Nuvarande - Information vid ögonlocksplastik (Dermatochalasis).pdf
| Ögonlocksplastik/Nuvarande material - kika även här/
| nej — patientinfo        ← fel klassning
```

Den bedömdes på filnamnet, inte på innehållet. Därför stod Curatiio som
"saknar eftervård helt" i två dygn.

**Rätta rad 111. Och gå igenom övriga `nej`-rader med samma fråga** —
klassningen gjordes på namn, så fler kan vara felsorterade.

**Blanda inte ihop den med "Patientinformation & Tjänstespecifikation"**,
som är det juridiska underlaget i ORD-143. Annat dokument, annan rad,
annan mottagare.

## Hair TP:s filer finns redan i repot

```
public/patientinformation-hartransplantation-dhi-prp-minimal.html
public/patientinformation-ogonlocksplastik-curatiio.html
```

Båda på `origin/main`, båda utan `data-registry-id`. Ingen extraktion ur
SharePoint behövs för dem — bara märkning. Curatiios PDF behöver hämtas.

## Vad jag inte avgjort

**Ögonlocksplastik som `minorSurgery`.** ORD-129 är fortfarande öppen och
gränsar till grupp 4. Rör den inte här.

**Stavfelet `Profilho`.** Det är kundvänd text i katalogen. Byt inte id.
Fråga innan du rättar texten — den kan finnas i Cliento också.
