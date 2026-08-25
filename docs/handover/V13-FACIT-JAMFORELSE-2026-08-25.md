# V13-facit jämfört med V12-canon — analys inför ORD-106

**Leverans Uppgift 1 · 2026-08-25 · read-only, ingen kod rörd**
**Källor:** `docs/facit/v13/V13-WORKSPACE-CONTENT-2026-08-24.html`,
`docs/facit/v13/V13-HOGERSPALT-2026-08-24.html`,
`public/major-arcana-preview/app/cco-v12-canon.js` (2502 rader),
`public/major-arcana-preview/app/cco-v11-rail-adapters.js` (2040 rader).

---

## 0 · Rättelse: adapterantalet

Ordern sa 26 `build*`-funktioner, den andra agenten sa 56. Båda är fel.
Uppmätt direkt i filen:

- **25 `build*`-funktioner deklareras** i `cco-v11-rail-adapters.js`
  (rad 85–1962, se tabellen nedan)
- **Alla 25 exporteras** i `global.CcoV11RailAdapters` (rad 1991, 26 nycklar
  inkl. `v11RailEmpty`)

Den skillnad som befarades — "hälften av funktionerna oexporterade och
därmed oåtkomliga för en ny renderare" — **finns inte**. 100 % är
exporterade. Det som syntes som 26 i webbläsaren var exportobjektets 26
nycklar, och 25 av dem är build-funktioner.

---

## 1 · Huvudkolumnen: elva sektioner

V13-ordning (facit). "Canon" = `cco-v12-canon.js`.

| #   | V13-id                                                                  | Rubrik                                  | I canon idag? | Canon-status                                                                      | Adapter (V11)                                                                | Anmärkning                                                           |
| --- | ----------------------------------------------------------------------- | --------------------------------------- | ------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| —   | `s-hero`                                                                | Hero (namn, stats, smartsammanfattning) | Delvis        | Har `header()` (rad 2027) med namn+id, men inte hero-sektionen med stats/signaler | `buildProfileFromBcard`, `buildStatsFromExtras`, `buildSmartInfoFromSignals` | Facits hero är fylligare: tre kort-rader, stats-strip                |
| ◐   | `s-visit` (+`s-visit-shell`, `s-visit-sub-lbl`, `s-visit-collapse-btn`) | Aktivt besök                            | Ja            | `secHead('◐','Aktivt besök')` rad 250, `<section id="s-visit">` rad 253           | `buildActiveVisitFromBundle`                                                 | Undersektionerna i facit (shell/sub-lbl/collapse-btn) saknas i canon |
| A   | `s-warn`                                                                | Kritiska varningar                      | Ja            | rad 361–370, `<section id="s-warn">`                                              | `buildCriticalWarnings`                                                      | Nära facit                                                           |
| B   | `s-resa`                                                                | Kundresa                                | Ja            | `secHead('Kundresa')` rad 566                                                     | `buildJourneyFromState`                                                      | Canon saknar facits 9-stegs-struktur med step-title                  |
| C   | `s-journal`                                                             | Journal                                 | Ja            | `secHead('Journal')` rad 1850                                                     | `buildJournalsFromEntries`                                                   | Facit: "Inga journalanteckningar ännu" + anteckningsform             |
| D   | `s-foto`                                                                | Foto-dokumentation                      | Ja            | `secHead('Foto-dokumentation')` rad 876                                           | `buildPhotosFromDriveFiles`                                                  | Nära facit                                                           |
| E   | `s-plan`                                                                | Behandlingsplan / Offert                | Ja            | `secHead('Behandlingsplan / Offert')` rad 1793                                    | `buildOffersFromPayload` (+`buildOfferRowFromCommercialCase`)                | Nära facit                                                           |
| F   | `s-dok`                                                                 | Dokument                                | Ja            | `secHead('Dokument')` rad 1412                                                    | `buildFilesFromDriveFiles`, `buildAutoDocsFromPayload`                       | Facit har dokument under s-dok, auto-docs som del av sektionen       |
| G   | `s-komm`                                                                | Kommunikation                           | Ja            | rad 1559 + 1612 (två anrop)                                                       | `buildCommunicationFromState`                                                | Nära facit                                                           |
| H   | `s-eko`                                                                 | Ekonomi                                 | Ja            | `secHead('Ekonomi')` rad 1695                                                     | `buildEconomyFromCard`, `buildEconomyInvoices`                               | Nära facit                                                           |
| I   | `s-uppf`                                                                | Uppföljning                             | **Nej**       | Saknas helt i canon                                                               | `buildRecentEvents` (rad 614) + occasionTimeline                             | Facit: Efterkontroll / Resultatbild / Utvärdering som recall-rader   |
| J   | `s-hist`                                                                | Historik                                | **Nej**       | Saknas — canon har "Bokningar" (rad 1284) som inte finns i V13-facit              | `buildHistoryFromExtras`                                                     | Facit: "tidigare resor · 1 besök"                                    |

**Sexton rader som canon renderar men som INTE finns i V13-facit:**
`Hälsa` (rad 397), `Bokningar` (1284), `Insikter och nästa bästa åtgärd`
(1754), `Auto-dokument` (1935), `Anteckningar` (1971), plus dubbel
Kommunikation. Fem egna sektioner att antingen flytta eller ta ställning
till. `Hälsa` (hälso-deklaration) är i V13 ett steg i kundresan; `Insikter`
och smarta nästa steg är högerspalt i V13; `Auto-dokument` och
`Anteckningar` ingår i s-dok/s-journal.

**JUMP-navet (rad 1996–2007) är redan portat:** alla elva sektioner med
rätt id och bokstav (◐ A B C D E F G H I J). Strukturen är alltså
registrerad i canon — det är _innehållet_ som inte följer facit.

---

## 2 · Högerspalten: fem extra sektioner

Ingen av de fem fanns i `app/*.js` när facit lades in. Adapterkoll:

| V13-id          | Rubrik (facit)                                 | Adapter-källa                          | Status                                                                   |
| --------------- | ---------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `s-next`        | Smart nästa steg (topp 2, primär+sekundär CTA) | `buildSmartNextSteps` (rad 770)        | **Finns** — används redan av V11-railen sedan facit-knapparna (PR #1517) |
| `s-insights`    | Insikter · topp 2 (pattern-gap-signaler)       | `buildInsightsFromSignals` (rad 1962)  | **Finns**                                                                |
| `s-book`        | Nästa bokning                                  | `buildBookingsFromExtras` (rad 1049)   | **Finns**                                                                |
| `s-doc-latest`  | Senaste besök · dokumentation (3 thumbnails)   | `buildPhotosFromDriveFiles` (rad 1449) | **Finns** — samma adapter som s-foto, annan vy (senaste 3)               |
| `s-visits-hist` | Besök · tillfällen (kompakt lista)             | `buildHistoryFromExtras` (rad 1097)    | **Finns** — samma adapter som s-hist, kompakt lista                      |

Slutsats: högerspalten är ren adapter-återanvändning. Ingen ny datainsamling
krävs, bara nya renderingsvyer över befintliga `build*`-resultat.

---

## 3 · Sammanfattning av bygget (Uppgift 2, siffror)

- **11 av 11** huvudkolumnsektioner har en befintlig adapter.
- **2 av 11** saknas helt i canon-rendering (`s-uppf`, `s-hist`) —
  ny renderare krävs.
- **5 av 11** behöver anpassas från V12-legacy-layout mot facit
  (resa, journal, dok, plan + hero som ska byggas ut).
- **4 av 11** ligger redan nära facit (warn, foto, komm, eko).
- **5 av 5** högerspaltsektioner är adapter-återanvändning.
- `cco-v13-flag.js` finns inte — skapas i Uppgift 2, mönster från
  `cco-v12-workspace-flag.js` (finns, verifierad).

Storleksbedömning: ett medelstort bygge — dominerat av _rendering_, inte
data. Ingen ny datainsamling, inga nya adaptrar, ingen CMO-kod.

---

## 4 · Pensioneringsförslag (genomförs inte utan besked)

När V13 är i drift och godkänd:

1. **V12** (canon + workspace + light-shell): pensioneras helt.
   `default OFF, opt-in`, aldrig slagit på i prod — inget att bevara.
   Flag-filen, canon och workspace-adaptern kan tas bort i samma PR som
   V13 går default ON.
2. **V11** (railen): behålls som fallback en övergångsperiod (en release-
   cykel), sedan samma öde som V12. Railens adaptrar lever kvar —
   V13 använder dem.
3. Sektionerna som bara finns i V12-canon (`Hälsa`, `Bokningar`,
   `Insikter`, `Auto-dokument`, `Anteckningar`): innehållet är redan
   representerat i V13-strukturen (resa-steg, högerspalt, s-dok,
   s-journal). Inget att flytta — bara att stänga.

---

## 5 · Leveransstatus Uppgift 1

Klar. Ingen kod rörd. Beredd för Fazlis godkännande → Uppgift 2.

---

## 6 · Beslutslista: sektioner i canon som saknas i facit

Dessa sex renderas av `cco-v12-canon.js` men finns inte i V13-facit.
**Beslut krävs av Fazli innan Uppgift 2** — några kan vara medvetna
tillägg som personalen använder dagligen och som lades till efter facit
(HTML:en är från 2026-08-24). Att tyst ta bort dem vore fel väg.

| Sektion                                  | Canon-rad | V13-motsvarighet                                  | Fråga                                                              |
| ---------------------------------------- | --------- | ------------------------------------------------- | ------------------------------------------------------------------ |
| `Hälsa` ('04')                           | 397       | Hälsodeklaration är ett steg i kundresan (s-resa) | Behövs en egen toppnivåsektion utöver resa-steget?                 |
| `Bokningar`                              | 1284      | s-book i högerspalten                             | Flytta till högerspalt, eller behålla i huvudkolumnen?             |
| `Insikter och nästa bästa åtgärd` ('12') | 1754      | s-insights + s-next i högerspalten                | Flytta per facit, eller behåll kombinerad sektion i huvudkolumnen? |
| `Auto-dokument`                          | 1935      | Del av s-dok                                      | Fällas in i s-dok, eller egen sektion?                             |
| `Anteckningar`                           | 1971      | Del av s-journal                                  | Fällas in i s-journal, eller egen sektion?                         |

**Rättelse om "dubbel Kommunikation":** canon har två `secHead('G', …)`
-anrop (rad 1559 och 1612), men de är två grenar av samma sektion —
tomt-tillståndet och det fyllda. Det renderas inte dubbelt samtidigt.
Ingen åtgärd krävs, men grenarna bör samlas i V13-renderaren.

**Förslag:** samla svaren i en mening per rad ovan (flytta/fälla in/
behålla) så är Uppgift 2 fullständigt bestämd.

---

## 7 · Fazlis beslut · 2026-08-25

Besvarat samma dag som analysen skrevs. Detta är bindande för Uppgift 2.

| Sektion                             | Beslut                                                        | Skäl                                                                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hälsa**                           | **Behåll** som egen toppnivåsektion                           | Hälsodeklarationen är säkerhetskritisk — den måste vara signerad före behandling — och är det första personalen letar efter. Att gräva fram den som ett steg inne i kundresan sparar ingenting. |
| **Bokningar**                       | **Flytta** till högerspalten (`s-book`)                       | Högerspalten är alltid synlig oavsett var i huvudkolumnen man befinner sig. Bokningen kommer närmare, inte längre bort, och huvudkolumnen får facits rena struktur.                             |
| **Insikter och nästa bästa åtgärd** | **Flytta** till högerspalten, delad i `s-insights` + `s-next` | Samma skäl. Facit delar den i två, och båda har färdiga adaptrar.                                                                                                                               |
| **Auto-dokument**                   | **Fäll in** i `s-dok`                                         | Underordnat innehåll som hör hemma i Dokument. Inget personalflöde tappas.                                                                                                                      |
| **Anteckningar**                    | **Fäll in** i `s-journal`                                     | Underordnat innehåll som hör hemma i Journal. Navigeringen förenklas.                                                                                                                           |

### Vad beslutet betyder för strukturen

**Huvudkolumnen får tolv sektioner, inte elva.** Hälsa stannar som egen
sektion utöver facits elva. Det är ett medvetet avsteg från facit, inte ett
förbiseende — skriv inte om det senare i tron att det är ett fel.

Ordningen för Hälsa är inte bestämd. Facit har ingen plats för den. Föreslå
en och fråga innan du bygger; "det första personalen letar efter" talar för
tidigt, sannolikt strax efter Kritiska varningar.

**Högerspalten får två sektioner till** utöver de fem egna: Bokningar och
den delade Insikter/Nästa steg. Alla har befintliga adaptrar.

**Två sektioner ska nybyggas:** Uppföljning (`s-uppf`) och Historik
(`s-hist`). De saknas helt i canon.

Allt annat är omflyttning av kod som redan finns och fungerar.
