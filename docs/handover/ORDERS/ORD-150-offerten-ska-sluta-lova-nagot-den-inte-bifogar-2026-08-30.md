# ORD-150 · Offerten ska sluta lova något den inte bifogar

**Arbetsorder · 2026-08-30**
**Bas:** `main` (`aac66ccc`)
**Föregås av:** ORD-143 §2 (fyndet), ORD-149 (momsen, nyss klar), ORD-133 (dokument pekar på tjänsten)
**Grind:** ORD-131 — ingenting raderas · `CCO_SEND_LIVE` orörd

---

## Varför den här och inte något annat

```
sendable: 0
```

Ingen mall i CCO är juridiskt godkänd. Ingenting kan nå en patient. Det är
inte ett tekniskt fel — det är att ingen människa kan skriva under på att
mallarna stämmer.

Och det kan de inte, för offerten säger detta, i bindande text:

> *"… tjänstespecifikation ('Behandlingen') som tillhandahållits Kunden."*

```
Offerter som gör påståendet                    8 av 10
Offerter som bifogar eller länkar en version   0 av 20
Katalograder för tjänstespecifikation          0
```

**Att godkänna den mallen vore att godkänna ett påstående som inte är
sant.** Därför står `sendable` på noll, och därför ligger den här ordern
före allt annat i CCO.

Vägen till att CCO verkställs är: **den här ordern → juridiskt godkännande
→ `CCO_SEND_LIVE`.** Ingenting annat ligger på den vägen.

---

## Läs det här först — två saker finns redan

### Underlagen finns, och de är färska

Femton tjänstespecifikationer i SharePoint, **mars 2026** — nyare än
nästan allt annat i systemet:

```
PDF Tjänstespecifikationer - Curatiio/   10 st   2026-03-11
  Botox® · Fillers · Profhilo® · PRF hud · PRP hud ·
  Microneedling+PRP hud · Ögonlocksplastik ·
  Ortopedi: hyaluronsyra · HA+PRP/PRF · PRP/PRF

PDF Tjänstespecifikationer - HTPC/        5 st   2026-03-10/11
  Microneedling+PRP hud · PRF hud · PRP hår · PRP hud · (+1)
```

Ingenting ska skrivas. De ska hämtas och kopplas.

### Versionshanteringen finns

```
ccoTemplateRegistry.js:342   snapshotForSend
                             currentRevision(record)
                             record.currentVersion
```

Registret bär redan revisioner och en aktuell version. **Bygg inte en
andra versionsmodell.** §2b ska använda den som finns.

---

## Uppgiften

### 1 · Specifikationen blir en referens till tjänsten

Följ ORD-133:s struktur: en rad i katalogen som dokumenten **pekar på** —
inte fritext i tjugo mallar.

Femton specifikationer, 84 tjänster. Det går inte jämnt ut, och det är
avsiktligt: en specifikation täcker flera tjänster (alla botox-varianter
delar en). Mappningen ska vara **explicit**, aldrig namnmatchning.

Det är samma regel som `cco-service-inheritance.json` — och samma skäl:
ORD-142 klassade Curatiios enda eftervårdsdokument som "nej" på filnamnet
och tappade det i två dygn.

### 2 · Offerten bär vilken version kunden fick

Använd registrets `currentVersion`. Ändras specen i mars 2027 ska det gå
att se vad som gällde den dag kunden signerade.

En version som bara pekar på "den senaste" är ingen version.

### 3 · Grinden — och det här är orderns viktigaste punkt

**En offert som gör påståendet får inte kunna skickas utan en kopplad
version.**

```
påstående i texten + kopplad version   →  får skickas
påstående i texten + ingen koppling    →  BLOCKERAS
inget påstående                        →  får skickas
```

Fail-closed. Saknas kopplingen ska det kasta, inte tyst utelämna bilagan.

Vi har fyra fail-open-fällor i repot sedan tidigare — `adapt()`,
`JOURNAL_STATUSES`, readiness-grinden, `isPendingType`. Den här får inte
bli den femte. En offert som skickas utan bilagan men med påståendet är
värre än en offert som inte går iväg.

### 4 · `prp-hair` och `prp-skin`

De två saknar omnämnandet helt. De ska ha samma text som de andra åtta —
**och** en kopplad specifikation. Båda finns i HTPC-sviten.

Lägg inte till texten först och kopplingen sen. Då har vi tio lögner
istället för åtta.

### 5 · Tjänster utan specifikation

Femton specifikationer täcker inte 84 tjänster. Vad händer med en tjänst
som ingen spec pekar på?

**Inte tyst ingenting.** Rapportera vilka tjänster som saknar
specifikation, som en lista per id. Fazli avgör om de behöver en eller om
påståendet ska bort ur just deras offert.

Bygg inte en gissning. Räkna och rapportera.

---

## Godkänt när

1. Mappningen tjänst → specifikation är **explicit**, aldrig namnmatchad.
   Visa tabellen.
2. Offerten bär versionen, hämtad ur `ccoTemplateRegistry`. **Ingen andra
   versionsmodell.** Sök och visa.
3. **Påstående utan koppling blockerar utskicket.** Ett test. Och
   mutationstesta: gör grinden fail-open och visa att testet blir rött.
4. `prp-hair` och `prp-skin` har både text och koppling. Ett test per.
5. Lista per id över tjänster utan specifikation. Ingen tystnad.
6. Alla 15 specifikationerna är katalograder med `clinics` i plural.
7. `legalReviewStatus: 'pending'` på varje ny rad. **Ingen mall godkänns
   av kod.**
8. `CCO_SEND_LIVE` orörd.

## Vad jag inte avgjort

**Om påståendet ska stå kvar i texten.** Alternativet till att bifoga är
att stryka meningen. Jag väljer att bifoga — advokaten skrev sjustegsordningen
för att specifikationen *ska* nå kunden, inte för att den ska tas bort ur
avtalet. Men det är Fazlis och Nordbros beslut, inte kodens. Säg emot om
du ser något jag missat.

**Vilka tjänster som ska ha en egen spec.** Se punkt 5 — räkna först,
fråga sedan.

**Godkännandet självt.** När det här är klart kan en människa läsa
offerten och se att den stämmer. Det är då `legalReviewStatus` kan bli
`approved` — av en människa, i gränssnittet, aldrig av en agent.
