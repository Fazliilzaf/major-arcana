# ORD-134 · Prislistan i systemet ligger under hemsidan

**Arbetsorder · 2026-08-27 · BRÅDSKANDE**
**Bas:** `main` (`dae86fb5`)
**Föregås av:** ORD-133 — offerten resolverar nu pris ur den här katalogen

---

## Varför det brådskar

Kopplingen `serviceId → pris` drogs i går (`54403053`). Offerten hämtar
alltså sitt pris ur `migration/meridiq-service-catalog.json` — och den
filen är märkt **`exportedAt: 2026-05-25`**, tre månader gammal.

Jag hämtade båda prislistorna från webben 2026-08-27 och jämförde 52
tjänster. **24 skiljer sig.**

Hair TP:s hemsida lovar dessutom *"bindande fastpris"*. En skriftlig
offert som underskrider den annonserade prislistan är svår att ta
tillbaka.

---

## 1 · Alla transplantationer ligger exakt 3 000 kr för lågt

Undantagslöst — FUE och DHI, hår och skägg, samtliga graftnivåer.

| Tjänst | apiId | Katalog | Hemsida | Diff |
| --- | --- | --- | --- | --- |
| FUE hår 1000 | 7092 | 39 000 | **42 000** | +3 000 |
| FUE hår 1500 | 7091 | 43 000 | **46 000** | +3 000 |
| FUE hår 2000 | 7090 | 47 000 | **50 000** | +3 000 |
| FUE hår 2500 | 7089 | 51 000 | **54 000** | +3 000 |
| FUE hår 3000 | 7088 | 55 000 | **58 000** | +3 000 |
| FUE hår 3500 | 7087 | 59 000 | **62 000** | +3 000 |
| FUE hår 4000 | 7086 | 63 000 | **66 000** | +3 000 |
| DHI hår 1000 | 7097 | 49 000 | **52 000** | +3 000 |
| DHI hår 1500 | 7096 | 53 000 | **56 000** | +3 000 |
| DHI hår 2000 | 7095 | 57 000 | **60 000** | +3 000 |
| DHI hår 2500 | 7094 | 61 000 | **64 000** | +3 000 |
| FUE skägg 1000–3000 | 7397–7401 | 39 000–55 000 | **42 000–58 000** | +3 000 |
| DHI skägg 1000–3000 | 7127–7389 | 49 000–65 000 | **52 000–68 000** | +3 000 |

Mönstret — exakt 3 000 kr på varenda rad — pekar på en prishöjning som
gjorts på hemsidan men aldrig nått Meridiq.

## 2 · Tre enskilda avvikelser

| Tjänst | apiId | Katalog | Hemsida | Diff |
| --- | --- | --- | --- | --- |
| Övre **och** nedre ögonlocksplastik | 7105 | 44 000 | **48 000** | +4 000 |
| Ortopedisk PRP, 3:e behandlingen | 7412 | 3 500 | **3 900** | +400 |
| Botox Läpplyft (Lip Flip) | 7385 | 1 800 | **1 400** | **−400** |

Lip Flip är den enda där katalogen är **högre** än hemsidan. Den
riskerar alltså att överdebitera.

## 3 · Tre tjänster finns på hemsidan men inte i katalogen

- **Rynkbehandling BTX, 5 områden** — 5 400 kr
- **Filler 1 ml** (område väljs vid konsultation) — 3 600 kr
- Hela namngivningen: katalogen säger **"Botox"**, hemsidan säger
  **"Rynkbehandling BTX"**. Samma behandling, två namn.

## 4 · Två som inte står på hemsidan — Fazli har svarat

**Båda säljs fortfarande.** Priserna är:

| Tjänst | apiId | Katalog | **Rätt pris (Fazli 2026-08-28)** | Diff |
| --- | --- | --- | --- | --- |
| FUE Hårtransplantation: 4500 grafts | 7106 | 67 000 | **69 000** | **+2 000** |
| DHI Hårtransplantation: 3000 grafts | 7093 | 65 000 | **68 000** | +3 000 |

### Fällan: mönstret är inte +3 000 överallt

FUE 4 500 avviker — den ska upp **2 000 kr**, inte 3 000. Ett skript som
lägger på 3 000 kr på alla transplantationer skulle sätta 70 000 och bli
fel igen, den här gången för högt.

**Rätta rad för rad mot listan i den här ordern. Räkna inte fram
priserna.**

Notera också att de två inte står på hemsidan trots att de säljs. Det är
ett separat problem — en tjänst som offereras men inte publiceras kan
inte stämmas av mot något. Ta upp med Fazli om de ska på prissidan.

## 5 · Det som stämmer — 28 av 52

PRP hår och hud, microneedling, fillers läppar och nasolabial, Profhilo,
Botox 1–3 områden, övre respektive nedre ögonlocksplastik var för sig,
ögonbrynstransplantation, tilläggsområden. Katalogen är alltså inte fel i
stort — det är transplantationerna plus tre rader.

---

## 6 · Det finns en tredje priskälla — och den ändrar frågan

Uppdaterat 2026-08-28. `migration/cliento-service-catalog.json` — 55
tjänster ur Cliento locations-API, exporterad **samma dag** som
Meridiq-filen (2026-05-25). Ingen av oss hade tittat i den.

### Fynd A · Meridiq låg efter redan i maj

| Ögonlocksplastik, övre & nedre | Pris |
| --- | --- |
| Cliento, `srvId 58000` "Ögonlocksplastik · Total" | **48 000** |
| Hemsidan i dag | **48 000** |
| Meridiq | 44 000 ← **fel** |

**Fazli har bekräftat 2026-08-28: rätt pris är 48 000 kr.**

Cliento och hemsidan var överens redan i maj. Exporten har troget
kopierat vad Meridiq sa — **felet sitter i Meridiq, inte i exporten.**
Det besvarar den fråga som blockerade hela ordern.

### Fynd B · Men Cliento är också fel, åt andra hållet

| Skägg-PRP | Pris |
| --- | --- |
| Cliento, `srvId 50559` "PRP · Skägg" | 2 500 ← **fel** |
| Meridiq | 4 300 |
| Hemsidan | **4 300** |

**Fazli har bekräftat 2026-08-28: rätt pris är 4 300 kr.** Cliento är
alltså fel och ska rättas där — 1 800 kr för lågt i det system kunden
bokar i.

### Vad det betyder

**Tre prislistor, tre svar, ingen stämmer överallt.** Frågan "export
eller Meridiq" var för smal.

Den riktiga frågan är vilken källa som ska vara sanning — och svaret bör
vara **hemsidan**, eftersom den är publicerad och utlovas som bindande
fastpris. De andra två ska följa efter, inte tvärtom.

Notera också: Cliento har **0 kr** på alla transplantationer, priset
sätts vid konsultationen. För just transplantationerna finns alltså bara
två källor — Meridiq och hemsidan.

Och det gör punkt 5 nedan viktigare, inte mindre viktig. Så länge priset
lever på tre ställen som ingen på kliniken kan uppdatera kommer de att
glida isär igen.

---

## Uppgiften

### 1 · Rätta mot hemsidan — den är sanningen

Hemsidan är publicerad och bindande. Katalogen rättas mot den, rad för
rad enligt listorna ovan.

Rapportera samtidigt vad Meridiq säger för varje rad ni rör, så att
avvikelsen mot Meridiq blir dokumenterad och kan rättas där.

**Räkna aldrig fram priserna** — se fällan i punkt 4.

### 2 · Sätt datum på exporten och visa den

`exportedAt` finns redan i filen men syns ingenstans. Tjänstespecens
API-svar ska bära den, så att en tre månader gammal prislista går att se
utan att öppna en JSON-fil.

### 3 · Bygg grinden som gör att det inte händer igen

Ett skript som hämtar båda prissidorna och jämför mot **båda**
katalogerna — Meridiq och Cliento:

- `https://www.hairtpclinic.com/priser`
- `https://www.curatiio.com/priser`
- `migration/meridiq-service-catalog.json`
- `migration/cliento-service-catalog.json`

Tre källor ska jämföras, inte två. Fynd A och B ovan hittades bara för
att den tredje fanns.

**Namnmatchningen är inte trivial:** katalogen säger "Botox: 1 område",
hemsidan säger "Rynkbehandling BTX, 1 område", Cliento säger
"Ögonlocksplastik · Total" där hemsidan säger "Övre & nedre". Bygg en
uttrycklig mappningstabell — gissa inte på namnlikhet, då blir larmet
brus och ingen tittar på det.

Cliento har 0 kr på transplantationer; det är avsiktligt och ska inte
larma.

Kör det schemalagt. Vid avvikelse: **larma, ändra ingenting.** En
prislista är ett affärsbeslut — kod får upptäcka glidningen, inte
avgöra vem som har rätt.

Lägg utfallet där någon ser det, inte bara i en loggfil.

### 4 · Skydda offerten under tiden

Så länge katalogen är osäker ska en offert inte gå ut med ett pris som
ingen bekräftat. Antingen pausas prisresolveringen, eller så märks
offerten tydligt som preliminär tills punkt 1 är klar. **Välj med Fazli**
— det är hans affär, inte en teknisk detalj.

---

### 5 · Kliniken ska kunna lägga till och ändra tjänster själv

**Fazlis krav 2026-08-28.** Och det är den djupaste fixen i hela ordern:
prislistan blev tre månader gammal för att ingen på kliniken kunde röra
den. Så länge en prisändring kräver en agent eller en JSON-fil kommer den
att glida igen.

Bygg en yta i CCO där personal med rätt behörighet kan:

- **lägga till en tjänst** — namn, kategori, klinik, pris, tid
- **ändra pris** på en befintlig
- **avaktivera** en tjänst (fältet `active` finns redan)

Krav på hur:

1. **Meridiq är fortfarande källan för de tjänster som kommer därifrån.**
   En lokal ändring får inte tyst skrivas över vid nästa import, och inte
   heller tyst skriva över Meridiq. Bestäm riktningen explicit och skriv
   ner den — det är den frågan som avgör om det här håller.
2. **Historik.** Ett pris som ändras ska bära vem, när och från vilket
   värde. En offert som redan gått ut ska behålla det pris den skrevs
   med — `länka, kopiera inte` gäller framåt, inte bakåt.
3. **Behörighet.** Prissättning är inte samma sak som att skriva journal.
   Egen behörighet i `ccoRbac.js`.
4. **Kontrollskriptet från punkt 3 gäller även här** — läggs en tjänst
   till lokalt utan att finnas på hemsidan ska det synas.
5. **Ingen prisändring får ske automatiskt.** Ytan är för människor.

Det här är eget arbete och behöver inte vänta på att katalogen rättas —
men rättningen ska göras först, annars byggs redigeringsytan ovanpå fel
data.

---

## Godkänt när

1. Det står svart på vitt om felet ligger i exporten eller i Meridiq.
2. Katalogen kommer från en ny export med färskt `exportedAt`, och
   diffen mot hemsidan är noll — eller så finns varje kvarvarande
   avvikelse förklarad och godkänd av Fazli.
3. Kontrollskriptet finns, körs schemalagt, och **larmar utan att
   skriva**. Mutationstesta det: ändra ett pris i katalogen och visa att
   larmet går.
4. De tre saknade tjänsterna finns, eller är avfärdade av Fazli.

## Rör inte

- Priser i Meridiq utan Fazlis ord. Det är hans prissättning.
- `CCO_SEND_LIVE` — `false`.
- De 28 rader som stämmer.
