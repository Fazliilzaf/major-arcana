# Dokumentresan i CCO — hur den ska automatiseras

**Till Fazli · 2026-08-27**
**Ersätter** `PERSONALENS-DOKUMENTRESA-PLAN-2026-08-27.md` och
`AUTOMATISERING-PERSONAL-RESA.md`. Rolltabellen och brytarlistan kommer
från den andra; nuläget, blockerarna och gränserna från den första.

Allt som påstås om kodens tillstånd är mätt i repot i dag. Där jag inte
vet står det att jag inte vet.

---

## 1 · Målet, i en mening

Personalen ska aldrig leta. Systemet säger _här, nu, fyll det här_ — och
skickar ingenting förrän en människa säger till.

---

## 2 · Var vi står efter ORD-126

|                      | Läge                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Katalogen            | **45 rader** (var 39)                                                                                     |
| Fördelning `filler`  | **patient 18 · personal 18 · system 9**                                                                   |
| Sex nya estetikrader | finns, bär `clinics: ['hairtp','curatiio']`                                                               |
| Når de Curatiio?     | **ja** — `ccoDocumentTypeRegistry.js:66` läser `clinics` före `clinic`                                    |
| PRF-hud              | täckt av `journal_prp_multi` + `offert_prf`                                                               |
| `prp_skin`           | **båda klinikerna, och det är rätt** — PRP hud är väg B på Hair TP-sidan och finns även på Curatiio-sidan |
| Tester               | 18/18 gröna på readiness, aggregator, registry                                                            |

**Siffran att ta med sig:** kunden fyller i lika många dokument som
personalen. Varje plan som bara beskriver personalens halva beskriver
halva systemet.

---

## 3 · Principerna

**Katalogen är enda källan.** Ny dokumenttyp = ny rad. Aldrig hårdkodad i
en vy. Då följer den automatiskt med till kundkortet, signalerna och
portalen.

**Ett dokument är klart när det finns bevis — inte när någon kryssat.**
Signerad journal, sparad mall, uppladdad fil. Ett manuellt kryss är en
gissning som ser ut som ett faktum.

**Systemet föreslår, människan skickar.** Varje signal bär
`dryRun: true`. Mallgrinden är fail-closed.

---

## 4 · Resan, steg för steg

| Steg                 | Vem               | Dokument                            | Automation                                   |
| -------------------- | ----------------- | ----------------------------------- | -------------------------------------------- |
| 3 Hälsodeklaration   | **kund** (länk)   | hälsodeklaration                    | auto-skickad före besök                      |
| 4 Konsultation       | läkare            | konsultationsmall + behandlingsplan | auto-surfad vid check-in                     |
| 5 Offert             | läkare/säljare    | `offert_<behandling>`               | pris **länkas** ur tjänstekatalogen          |
| 6–7 Avtal + samtycke | **kund** (e-sign) | samtycke_bokning_2d / ångerrätt     | betänketid 2 d / 14 d                        |
| 8 Friskförsäkran     | ssk, op-dagen     | friskförsäkran                      | **se undantaget nedan**                      |
| 9 Foto-samtycke      | **kund**          | foto_samtycke                       | auto-prompt vid första foto — **alla vägar** |
| 10 Behandling        | läkare/ssk        | `journal_<typ>`                     | **utföraren** förifylld, utbytbar            |
| 11 Förskott          | ekonomi           | deposition                          | 20 % ur accepterad offert — signal           |
| 12 Uppföljning       | ssk               | `journal_<typ>_follow`              | kadens **4 · 8 · 12**                        |
| 13 Slutresultat      | läkare            | journal + publiceringssamtycke      | 12-mån-signal                                |

### Två rättelser mot den tidigare tabellen

**Steg 8 — "skippas icke-kirurgiskt" är för trubbigt.**
Ögonlocksplastik utförs på Curatiio, som är den icke-kirurgiska kliniken,
men behandlingen **är** kirurgi. Friskförsäkran ska ligga kvar.
Varianten heter `minorSurgery`, inte `nonSurgical`. ORD-126 gav bleph
rätt katalograd, men klassificeringen i `cco-kundkort-kkx.js` är
fortfarande orörd — se ORD-129.

**Steg 10 — "behandlare auto-fylls (inloggad)" är fel person.**
Din regel: dokumentet hänger på tjänsten, **den som utför tjänsten**
fyller i, och det ska gå att välja någon annan. Inloggad användare är
inget av det — den som öppnar kundkortet kan vara receptionisten.
Bokningen bär redan `practitionerId` (`ccoBookingEngineStore.js:1155`),
alltså rätt person, känd före besöket. Det är den som ska vara förval.

---

## 5 · De fyra stegen, i den ordning de gör nästa möjlig

### Steg 1 · Rätt dokument dyker upp av sig självt

**Saknas:** `serviceIds` per katalograd — **noll förekomster** i dag.

`flowApplies` är grova vägar (`['tp']`, `['botox']`). Det räcker för att
skilja transplantation från botox, men inte för att svara på personalens
faktiska fråga: _vad ska jag fylla i för den här bokningen?_ Det är också
därför "PRP-journal" i dag inte kan skilja PRP hår från PRP hud.

Bokningen bär redan `serviceId`. Katalograden behöver kunna peka
tillbaka — **på tjänsten**, inte på behandlingstypen. 55 tjänster, inte
en handfull typer.

**Första uppgiften är inte kod.** Kopplingen 55 tjänster × dokument är
klinisk kunskap. Arbetsbladet `underlag-per-tjanst-ARBETSBLAD.csv` väntar
på den timmen.

### Steg 2 · Rätt person äger det

`practitionerId` finns på bokningen men kopplas aldrig till dokumentet.
`assignedTo` finns inte på dokumentinstansen — bara `actor`, som sätts
**efteråt**. `actor` är historik, `assignedTo` är arbete. Utan det senare
kan systemet inte säga "det här är ditt i dag", och inte flytta något
till en kollega.

### Steg 3 · Operationsdagen som egen yta

Fyra dokument, samma dag, under tidspress. Det enda tillfället i resan
som förtjänar en egen vy i stället för fyra rader på ett kort. Gäller nu
Curatiio också, tack vare bleph-raden.

### Steg 4 · Eftervården börjar som utkast, inte som tomt blad

Jobben schemaläggs redan vid signerad behandlingsjournal. Nästa steg är
att jobbet **skapar journalutkastet**. Byggs sist — det är första stället
något kan lämna huset.

---

## 6 · Vad som aldrig ska automatiseras

- **Godkännande av en mall.** `pending` är rätt förval. Kod som sätter
  godkänt är en bugg, hur bekvämt det än vore.
- **Läkarens ordination.** Individuellt godkännande före varje operation,
  i båda klinikerna. Se ORD-128 — begreppet finns inte i koden i dag.
- **Beslutet att ett dokument är klart.** Bevis, inte kryss.
- **Utskick**, så länge `CCO_SEND_LIVE` är `false`.

---

## 7 · Släppgrinden — ordningen, explicit

Innan något lämnar huset ska tre lås ha öppnats, i den här ordningen:

1. **Mallen är juridiskt godkänd.** `snapshotForSend` kastar
   `TEMPLATE_NOT_LEGALLY_APPROVED`, och `resolveSnapshot` propagerar den.
   Fail-closed: saknas mallen skickas ingenting.
2. **Ett stoppat jobb väntar utan att förbrukas.** Väntan är inte ett
   försök — `attempts` räknas inte upp på den juridiska grenen, så jobbet
   har kvar sina återförsök när mallen godkänns.
3. **`CCO_SEND_LIVE`** slås på — av dig, efter din egen prod-koll av
   mallarnas status.

## 8 · Brytarläget i dag

Läst ur `render.yaml`. Slår du på en flagga i Render-panelen utan att
ändra blueprinten går den tillbaka vid nästa deploy.

| Flagga                            | Värde     |
| --------------------------------- | --------- |
| `ENABLE_AUTOMATION_RUNNER`        | **true**  |
| `CCO_SEND_LIVE`                   | **false** |
| `ARCANA_GRAPH_SHAREPOINT_ENABLED` | **false** |
| `CCO_PORTAL_NOTIFY_LIVE`          | ej satt   |

Systemet visar allt, skickar inget.

---

## 9 · Vad som blockerar just nu

| Order                                           | Läge i dag                           | Blockerar                            |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------ |
| **Arbetsbladet**                                | inte ifyllt                          | Steg 1 — och därmed allt             |
| **ORD-127** · `6_man_check` → `8_man_check`     | **1 träff kvar**                     | Steg 4 — eftervården ber om fel mall |
| **ORD-129** · ögonlocksplastik = `minorSurgery` | `TREATMENT_TYPE_VARIANT_HINTS` orörd | Steg 3 — friskförsäkran kan tappas   |
| **ORD-128** · läkarens ordination som grind     | finns inte i koden                   | Steg 3                               |

---

## 10 · Arbetsdelning

**Det här dokumentet äger personalens fyllnadsresa** — ordningen i
avsnitt 5, och gränserna i avsnitt 6.

**Fyra spår ligger bredvid**, och de får inte dubbleras hit:

1. **Kundens dokumentresa** — portalen och e-sign-kedjan. Halva
   katalogen (18 av 45). Samma mekanik, andra sidan bordet.
2. **Ekonomin 20/80 + Fortnox** — redan beskriven i
   `cco-flodet-interaktivt.html` sektion D, med kodreferenser. Hänvisa
   dit, skriv inte om den; två versioner glider isär.
3. **SharePoint / e-recept** — eget spår **efter** ORD-128:s grind.
   Godkännandet får aldrig bli beroende av en integration som är
   avstängd.
4. **Släppgrinden** — avsnitt 7 ovan är den överenskomna sekvensen.

Spår 2 och 3 rör pengar ut och recept. De granskas innan något slås på.
