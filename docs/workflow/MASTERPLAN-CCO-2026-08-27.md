# CCO · Masterplan

**Hair TP Clinic & Curatiio · 2026-08-27**
**Till Fazli.** Ett dokument som håller hela projektet: vad som är byggt,
vad som är öppet, vem som äger vad, och i vilken ordning det ska göras.

Allt som påstås om systemets tillstånd är mätt i repot eller i produktion
i dag. Där jag inte vet står det att jag inte vet. Ersätter
`PERSONALENS-DOKUMENTRESA-PLAN-2026-08-27.md` och
`AUTOMATISERING-PERSONAL-RESA.md`.

---

# DEL I · Vad CCO är

Fyra lager som hänger ihop, plus en grind som avgör om något får lämna
huset.

| Lager            | Vad det gör                                                                                                                       | Var                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **1 · Underlag** | Kundresans 13 steg. Sanningen räknas ur riktig data — signerad journal, betald deposition, genomförda besök. Aldrig ur ett kryss. | katalogen + aggregatorn    |
| **2 · Omdöme**   | **20 regler** läser resan och pekar ut nästa sak. Varje signal bär `dryRun: true` — motorn föreslår, den utför aldrig.            | `ccoAutomationRegistry.js` |
| **3 · Handling** | Eftervårdsjobb och fakturasignaler schemaläggs på tid. Första stället något kan lämna huset.                                      | scheduler                  |
| **4 · Grind**    | Ingen mall skickas utan `legalReviewStatus: approved`. Fail-closed.                                                               | `snapshotForSend`          |

**Kärnan:** systemet är byggt och rullar — men det **visar**, det skickar
inget.

---

# DEL II · Nuläget, mätt

## Dokumentkatalogen

_Uppdaterad 2026-08-28 efter ORD-133 och ORD-134._

|                        |                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| Dokumenttyper          | **56** (39 → 45 via ORD-126 → 56 via ORD-133)                                                 |
| Curatiio-journaler     | 6, med `clinics: ['hairtp','curatiio']`                                                       |
| Curatiio-beskrivningar | 7, med `data-registry-id` i filerna                                                           |
| Offerter               | 10 — fyra nya för botox, filler, ögonlock, ortopedi                                           |
| Når de Curatiio?       | ja — `ccoDocumentTypeRegistry.js:66` läser plural före singular                               |
| `prp_skin`             | båda klinikerna, **och det är rätt** — PRP hud är väg B på Hair TP och finns även på Curatiio |
| `serviceIds`           | fältet finns på **alla 56** rader — men **tomt överallt**, väntar på arbetsbladet             |

## Priserna

Tjänstespecifikationen är en **store**, inte dokument nummer 57:
`ccoTjanstespecifikationStore.js` läser 82 tjänster med `serviceId`, namn,
pris och tid. Offerten resolverar priset ur den vid servering — den
kopierar det inte.

**26 priser låg fel** mot hemsidan och är rättade (ORD-134). Varje
transplantation låg 3 000 kr för lågt utom FUE 4 500 som låg 2 000 —
mönstret gick inte att räkna fram. `priceCorrection`-noten säger att det
är en **lokal override**: Meridiq-källan är fortfarande fel och ska
rättas där.

**Grinden** `scripts/check-price-divergence.js` jämför tre källor —
hemsidan, Meridiq, Cliento — larmar och skriver aldrig. Mutationstestad
i båda riktningarna. Larmar just nu på två tjänster som är publicerade
men saknar Meridiq-id.

**Namnen:** `id` behåller `botox`, `name` säger "Rynkbehandling BTX" som
hemsidan, `botulinum_info` behåller substansnamnet. Sex kunddokument har
kvar "Botox" i brödtexten — väntar på marknadsansvarig.

**Siffran att ta med sig:** kunden fyller i lika många dokument som
personalen. En plan som bara beskriver personalens halva beskriver halva
systemet.

## Vyerna

Tre generationer bakom sticky localStorage-flaggor: V11-railen, V12-
workspace, V13. V13 är förval för all personal. Lilla vyn är nu **460 px
kort i 480 px spalt** (ORD-132), stora vyn 1280 px.

## Patientregistret

Prod, tenant `hair-tp-clinic`: **7 864 patienter**. `needs_review` 578 →
**137** efter städningen. 117 dokumentstubbar upplösta. Tre listor
levererade till personalen (27 · 28 · 13 rader).

**Ett öppet fynd:** fyra sammanslagningar parar poster med **olika
personnummer**. Två är otvetydigt olika personer — Adam Alfredsson (född
2002 respektive 1998) och Marcus Lennartsson (1996 respektive 1988) —
och båda bär hälsodeklaration. De ska delas isär.

## Brytarläget

Läst ur `render.yaml`. Slår du på en flagga i Render-panelen utan att
ändra blueprinten går den tillbaka vid nästa deploy.

| Flagga                            | Värde     |
| --------------------------------- | --------- |
| `ENABLE_AUTOMATION_RUNNER`        | **true**  |
| `CCO_SEND_LIVE`                   | **false** |
| `ARCANA_GRAPH_SHAREPOINT_ENABLED` | **false** |
| `CCO_PORTAL_NOTIFY_LIVE`          | ej satt   |

---

# DEL III · Principerna

Fyra regler som allt annat böjer sig för.

**1 · Katalogen är enda källan.** Ny dokumenttyp = ny rad. Aldrig
hårdkodad i en vy. Då följer den automatiskt med till kundkortet,
signalerna och portalen.

**2 · Bevis, inte kryss.** Ett dokument är klart när det finns signerad
journal, sparad mall eller uppladdad fil. Ett manuellt kryss är en
gissning som ser ut som ett faktum.

**3 · Systemet föreslår, människan skickar.** `dryRun: true` på varje
signal, fail-closed mallgrind, `CCO_SEND_LIVE` av.

**4 · Länka, kopiera inte.** Ett pris som klistras in i en journal är
rätt den dagen det skrivs och fel därefter — och en journal redigerar man
inte i efterhand.

---

# DEL IV · Resan, steg för steg

| Steg                 | Vem               | Dokument                            | Automation                                   |
| -------------------- | ----------------- | ----------------------------------- | -------------------------------------------- |
| 3 Hälsodeklaration   | **kund** (länk)   | hälsodeklaration                    | auto-skickad före besök                      |
| 4 Konsultation       | läkare            | konsultationsmall + behandlingsplan | auto-surfad vid check-in                     |
| 5 Offert             | läkare/säljare    | `offert_<behandling>`               | pris **länkas** ur tjänstekatalogen          |
| 6–7 Avtal + samtycke | **kund** (e-sign) | samtycke_bokning_2d / ångerrätt     | betänketid 2 d / 14 d                        |
| 8 Friskförsäkran     | ssk, op-dagen     | friskförsäkran                      | **undantag nedan**                           |
| 9 Foto-samtycke      | **kund**          | foto_samtycke                       | auto-prompt vid första foto — **alla vägar** |
| 10 Behandling        | läkare/ssk        | `journal_<typ>`                     | **utföraren** förifylld, utbytbar            |
| 11 Förskott          | ekonomi           | deposition                          | 20 % ur accepterad offert — signal           |
| 12 Uppföljning       | ssk               | `journal_<typ>_follow`              | kadens **4 · 8 · 12**                        |
| 13 Slutresultat      | läkare            | journal + publiceringssamtycke      | 12-mån-signal                                |

**Steg 8 · undantaget.** "Skippas icke-kirurgiskt" är för trubbigt.
Ögonlocksplastik utförs på Curatiio — den icke-kirurgiska kliniken — men
behandlingen **är** kirurgi. Varianten heter `minorSurgery`, inte
`nonSurgical`. Friskförsäkran ska ligga kvar.

**Steg 10 · vem.** Inte "inloggad användare" — den som öppnar kundkortet
kan vara receptionisten. Bokningen bär `practitionerId`
(`ccoBookingEngineStore.js:1155`), alltså den som faktiskt utför. Det är
förvalet, och det ska gå att byta.

---

# DEL V · De fyra byggstegen, i beroendeordning

### 1 · Rätt dokument dyker upp av sig självt

`serviceIds` per katalograd. `flowApplies` är grova vägar och räcker inte
för personalens faktiska fråga: _vad ska jag fylla i för den här
bokningen?_ Kopplingen ska gå på **tjänsten** — 55 stycken — inte på
behandlingstypen.

Första uppgiften är inte kod. 55 tjänster × dokument är klinisk kunskap.
Arbetsbladet `underlag-per-tjanst-ARBETSBLAD.csv` väntar på den timmen.

### 2 · Rätt person äger det

`assignedTo` på dokumentinstansen, förvalt ur bokningens
`practitionerId`, överskrivbart. `actor` finns redan men sätts **efteråt**
— `actor` är historik, `assignedTo` är arbete.

### 3 · Operationsdagen som egen yta

Fyra dokument, samma dag, under tidspress. Det enda tillfället som
förtjänar en egen vy i stället för fyra rader på ett kort. Gäller nu
Curatiio också.

### 4 · Eftervården börjar som utkast

Jobbet skapar journalutkastet i stället för ett tomt blad. Byggs sist —
första stället något kan lämna huset.

---

# DEL VI · Vad som aldrig automatiseras

- **Godkännande av en mall.** `pending` är rätt förval. Kod som sätter
  godkänt är en bugg.
- **Läkarens ordination.** Individuellt godkännande före varje operation,
  i båda klinikerna.
- **Beslutet att ett dokument är klart.** Bevis, inte kryss.
- **Radering av patientdata.** Journalföringsplikt, minst tio år.
- **Utskick** så länge `CCO_SEND_LIVE` är `false`.

---

# DEL VII · Släppgrinden

Tre lås, i ordning, innan något lämnar huset:

1. **Mallen är juridiskt godkänd.** `snapshotForSend` kastar
   `TEMPLATE_NOT_LEGALLY_APPROVED`; `resolveSnapshot` propagerar den.
   Fail-closed.
2. **Ett stoppat jobb väntar utan att förbrukas.** Väntan är inte ett
   försök — `attempts` räknas inte upp på den juridiska grenen.
3. **`CCO_SEND_LIVE`** slås på, av dig, efter din egen prod-koll av
   mallarnas status.

---

# DEL VIII · Öppna ordrar

| Order       | Vad                                                | Läge                                                                                            |
| ----------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **ORD-126** | Estetik-journalerna i katalogen                    | **klar** — verifierad, 18/18 tester                                                             |
| **ORD-127** | `6_man_check` → `8_man_check`                      | **1 träff kvar**                                                                                |
| **ORD-128** | Läkarens ordination som grind                      | **inte byggd** — begreppet finns inte i koden                                                   |
| **ORD-129** | Ögonlocksplastik = `minorSurgery`                  | **orörd**                                                                                       |
| **ORD-130** | Död yta i kundkortsspalten                         | klar, pushad                                                                                    |
| **ORD-131** | Tre listor till personalen                         | klar — men se sammanslagningsfyndet                                                             |
| **ORD-132** | Kortet 460 px                                      | **klar, pushad**                                                                                |
| **ORD-133** | Curatiio-beskrivningar, tjänstespec, fyra offerter | **klar, verifierad**                                                                            |
| **ORD-134** | Prislistan låg under hemsidan                      | **26 priser rättade, grinden skarp** — kvar: 2 apiId, 6 kunddokument, snapshotens auto-hämtning |

**Utöver ordrarna:**

- Arbetsbladet är inte ifyllt. Det blockerar steg 1, och därmed allt.
- De två felaktiga sammanslagningarna ska delas isär.
- Personnummergrinden vid sammanslagning ska bli en stående kontroll:
  bär båda sidor personnummer och de skiljer sig — rulla tillbaka.
- Din prod-koll av mallarnas legal-status innan `CCO_SEND_LIVE`.

---

# DEL IX · Arbetsdelning

**Det här dokumentet äger personalens fyllnadsresa** — Del V och Del VI.

Fyra spår ligger bredvid och får inte dubbleras hit:

| Spår                      | Innehåll                          | Not                                                                           |
| ------------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| **Kundens dokumentresa**  | portalen, e-sign                  | 18 av 45 dokument — halva systemet                                            |
| **Ekonomin 20/80**        | deposition, slutfaktura, Fortnox  | redan skriven i `cco-flodet-interaktivt.html` §D — hänvisa dit, skriv inte om |
| **SharePoint / e-recept** | ordination → recept → publicering | **efter** ORD-128:s grind, aldrig som förutsättning för den                   |
| **Släppgrinden**          | Del VII ovan                      | överenskommen sekvens                                                         |

Spår 2 och 3 rör pengar ut och recept. De granskas innan något slås på.

---

# DEL X · Ordningen

1. **Arbetsbladet.** Din timme. Utan den står allt annat stilla.
2. **Dela isär de två felmatchade patienterna**, och gör
   personnummergrinden stående.
3. **ORD-127** — en rad, och en motsägelse så länge den står kvar.
4. **`serviceIds`** i katalogen, matat ur arbetsbladet.
5. **`assignedTo`** + utföraren som förval.
6. **ORD-129**, innan Curatiios behandlingar klassificeras.
7. **ORD-128** — grinden. Störst, och medicinskt reglerad: ta den med den
   som är medicinskt ansvarig innan den slås på.
8. **Operationsdagsvyn**, sedan **eftervårdsutkasten**.
9. Först därefter: `CCO_SEND_LIVE`.
