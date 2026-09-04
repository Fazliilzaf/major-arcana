# När är CCO klar? · din definition, mätt

**Mätt 2026-09-04.** Du svarade på frågan om startdatum med ett villkor, inte ett
datum: _"så fort alla funktioner funkar."_ Det är ett rimligt mål och ett
omöjligt beslut — "alla funktioner" går inte att kryssa av, så dagen kommer
aldrig.

Det här dokumentet gör om din mening till punkter som går att mäta. Varje rad är
uppmätt i kod eller mot prod, med fil och radnummer. Det som inte gick att
avgöra står som **oklart**, inte som klart.

**Ordförklaring:** _levande_ = kod finns och anropas från en vy. _kuliss_ = UI
finns, ingen endpoint bakom. _tom_ = korrekt byggd men läser data som saknas.

---

## Sammanräkning

|                               | Antal |
| ----------------------------- | ----- |
| Klart och verifierat          | 8     |
| Delvis — fungerar men med hål | 5     |
| Inte byggt                    | 4     |
| Oklart, kräver mätning        | 2     |

**Ingen av punkterna nedan blockeras av något jag kan bygga i kväll.** Fyra
blockeras av dina beslut, tre av klinikdata bara ni har, resten är byggarbete i
storleksordningen dagar till veckor.

---

## 1 · "kalendern funkar"

**KLART.** `bookingEngineStore` är levande med 21 resurser, 72 tjänster och 220
reservationer (mätt 2026-09-03). Personalens schemavy läser
`/api/v1/cco-bookings/slots` och `/calendar-blocks`.

**Hål:** elva tjänster saknar tillgänglighetsregler. En tjänst utan tider går
inte att boka — vyn finns ("Öppna tider", ORD-191), tiderna gör inte det.
Det är klinikdata, inte kod.

## 2 · "alla framtida bokningar är inne och historiska bokningar"

**DELVIS.** 12 110 historiska bokningar fick sin tjänst härledd ur data
(ORD-201). **1 077 återstår utan tjänst**, varav 174 färska. De går inte att
härleda — de behöver klinikens kunskap eller ett beslut att lämnas tomma.

## 3 · "anteckningar"

**KLART.** Journalskrivning är levande hela vägen:
`PUT /cco-journal/entry` (`src/routes/ccoJournal.js:328`), signering `:380`,
anropad från kundkortet (`patient-master-ui.js:930`, `:11616` m.fl.).

## 4 · "att konversationer i CCO funkar, alla funktioner bakom konversationer"

**DELVIS — och det här är den största posten på listan.**

Levande:

- Klar / Senare / Återöppna — `ccoConversation.js:2458`
- Svara, via utkast — `ccoCommDraft.js:794`
- AI-utkast — `ccoCommDraft.js:204`

Inte byggt:

- **Tilldela** — ingen backend alls. Koden säger det själv
  (`ccoConversation.js:2445`): _"frontend har 'Tilldela'-knappar … men det finns
  INGEN backend som lagrar vem en konversation är tilldelad till"_.
- **Arkivera** — `/action` accepterar bara `handled|reply_later|reopen`
  (`:2481`).
- **Makron** (mall, tagg, tilldela, snooze, SLA, arkivera) — storen registrerar
  körningen men **utför ingenting** (`ccoMacroStore.js:189`). Kör-knappen är
  därför avstängd i gränssnittet.
- **Mallar** — `cco-komm-panel.js:242` anropar `/api/v1/cco-comm/templates`.
  **Den routen finns inte.** Felet sväljs och listan blir tom (`:247`).

Oklart:

- **Vidarebefordra** — motorstöd finns (`executionService.js:2999`), men ingen
  route eller vy sätter `mode: 'forward'`. Gick inte att avgöra om vägen är
  nåbar.

Dessutom: **personalportalens** konversationsvy svarar alltid 422 — anropet
saknar `mailboxIds`, fallbacken ger 5 adresser mot ett tak på 2. Vyn säger
"inte tillgänglig just nu", varje gång. Det är en parameterbugg och den
billigaste fixen på hela listan.

## 5 · "att segmentet kunder funkar" och "V13 lilla och stora"

**KLART.** Kundkortet är levande. Lilla V13 = högerspaltens rail
(`cco-v13-render.js:898`), stora V13 = arbetsytan (`:932`, `:1037`, `:1328`).
Dossier-endpointen `/cco/runtime/customer/:id/dossier` anropas från kalendern,
kundkortet och konversationerna.

**Oklart:** "kundsegment" i betydelsen marknadssegmentering hittades inte. Det
som finns heter segment men betyder _besökssegment_
(`ccoPatientVisitSegments.js`). Om du menar något annat med "segmentet kunder"
behöver jag veta vad.

## 6 · "att kunden är kopplad genom hela CCO"

**KLART.** Kundresans 13 steg beräknas på ett enda ställe
(`src/ops/kundresan.js:38`) mot facit i `config/kundresan-13-steg.json`, och
serveras till alla vyer (`staffPortal.js:2263`). Det var ORD-200: lådan och
kortet räknade olika förut.

## 7 · "att staff portal funkar"

**DELVIS.** 26 paneler i tre roller. 20 levande, **5 kulisser**, 1 tom.

Kulisser: Min historik, Ordinationsdokument, Kliniköversikt, Personalöversikt,
Dokumentkatalog. Kliniköversikt är den farligaste — dess siffror är hårdkodade
och ser ut som mätvärden.

Den tomma är "Alla ärenden": korrekt byggd, men `cco-booking-cases.json` finns
inte i prod. **Samma saknade fil slår ut nio endpoints samtidigt** — Mina
kunder, Mina uppgifter, Uppföljningar, Alla ärenden, Ordinationer och Prioritet
är alltså inte trasiga vyer utan rätt byggda vyer som läser en store som aldrig
skrivits.

## 8 · "att kundportal funkar"

**DELVIS.** Den fil som pekats ut som kundportalen,
`cco-patient-offer-portal-v3.html`, har **noll `fetch(`** på 5 793 rader. Den är
en mockup.

Den riktiga tvåvägskanalen är `public/patient-portal-chat.html` — 10 kB, och den
fungerar hela vägen: kundens meddelande når personalen och syns i Svarstudion.

**790 av 793 portalinbjudningar står kvar i `needs_approval`.** En enda har gått
ut, 2026-07-08. Ingen vet varför de andra stannade — det går inte att läsa ur
filerna.

## 9 · "att kunder kan boka online"

**BYGGT, AVSTÄNGT MED FLIT.** Routerna är levande och monterade
(`publicBookingEngine.js:620`, `:637`, `:681`). Flaggan
`ARCANA_PUBLIC_WEB_BOOKING_ENABLED` är `false` i prod.

Att slå på den är **ditt beslut**, inte ett byggjobb.

VIP-rutterna (`:561`, `:585`, `:688`) går förbi flaggan **med flit** —
kommentaren säger _"VIP-bokning fungerar även när publik webb-bokning är
avstängd"_. Bokning sker där mot en token i stället. Notera att VIP-vägen kör
med `requireAbuseGuard: false` och `validatePublicResource: false`, alltså
lösare kontroll — rimligt för en länk ni själva delar ut, värt att veta.

## 10 · "vi kan boka in kunder"

**KLART.** Personalen bokar via kalendern och personalportalen. Kunden kan
själv omboka via länk i påminnelse- och bekräftelsemejl (ORD-190). Avbokning
kräver mejl eller telefon — ditt beslut i ORD-202.

## 11 · "allt skickas automatiskt"

**BYGGT, GRINDAT.** Tre schemalagda jobb skickar faktiskt post:

- `cco_daily_digest` — daglig sammanställning till er
- `cco_customer_reminders` — påminnelser till patient (J‑7), SMS, operatörsdigest
- `post_op_review_auto_trigger` — omdömesförfrågan efter ingrepp

Alla tre stoppas av kundutskicksgrinden, som är AV. Att öppna den är **ditt
beslut**.

## 12 · "att skicka fakturor funkar"

**INTE FÄRDIGT — och det är den punkt som ligger sämst till.**

- Fortnox OAuth är levande (`ccoFortnox.js:163`, `:190`).
- Endpointen som skapar och skickar faktura finns:
  `POST /pos/orders/:orderId/invoice` (`pos.js:99`).
- **Ingen vy anropar den.** Noll träffar på `/pos/` i hela `public/`.
- Fakturaanroparen läser `FORTNOX_ACCESS_TOKEN` ur env
  (`cfoFortnoxConnector.js:16`), **inte** ur OAuth-storen. De två hänger alltså
  inte ihop.
- `cfoBillingDraftService.exportDraftToFortnox` finns men **refereras noll
  gånger** utanför sina egna tester.

Det är alltså inte "nästan klart" utan tre halvfärdiga delar som aldrig kopplats
ihop. Räkna med byggarbete, inte en knapp.

## 13 · "alla dokument är kopplade"

**DELVIS.** Signeringsflödet fungerar i prod (verifierat ORD-164), avtalen är
byggda på Nordbros mall med proveniens (ORD-157), och dokumentkatalogen har 19
poster. Men **Dokumentkatalog-vyn i personalportalen är en kuliss** — den visar
hårdkodad HTML, inte katalogen.

## 14 · "hela workflow 13" / "hela CCO verksam"

Det här är inte en egen punkt utan summan av 1–13. Den blir sann när posterna
ovan är gröna.

---

## Vad som faktiskt står i vägen — sorterat

**Dina beslut (inget byggarbete):**

1. Öppna kundutskicksgrinden
2. Öppna publik webbokning
3. Öppna ordinationsgrinden
4. Vad "segmentet kunder" betyder, om det inte är besökssegment

**Klinikdata bara ni har:**

5. Tillgänglighetsregler för elva tjänster
6. De 1 077 bokningarna utan tjänst
7. Vilka av de 17 testkontona i prod som ska bort

**Byggarbete, i storleksordning:**

8. Fakturavägen — störst, tre delar som aldrig kopplats ihop
9. Konversationer: tilldela, arkivera, makron, mallar — fyra separata bitar
10. Fem kulissvyer i personalportalen
11. Konversationer-422 i personalportalen — minst, kanske en timme
12. `cco-booking-cases.json` — en saknad fil som ensam låser nio vyer

**Måste mätas innan de kan planeras:**

13. Varför 790 portalinbjudningar aldrig godkändes
14. Om vidarebefordran i konversationer är nåbar

---

## Förslaget jag skulle ge

Sätt inte startdatum efter listan. Sätt det efter **en behandlare och en
tjänst**, och låt resten vara kvar avstängt.

Skälet: punkterna ovan är inte lika viktiga för att komma igång. Fakturavägen
och makron behövs inte för att boka in en patient och skicka en bekräftelse.
Kör man skarpt på en smal väg upptäcker man de verkliga felen — de som ingen
mätning hittar — medan insatsen är låg.

Ordningen jag skulle öppna grindarna i:

1. **Kundutskick** först, med testmejl till er själva. Det är den enda grinden
   där ett fel är omedelbart synligt.
2. **Ordinationsgrinden** sedan. Den skyddar patienten och bör vara på innan
   någon bokas in på riktigt.
3. **Publik webbokning** sist. Den släpper in okända, och den är också den enda
   som går att öppna smalt först — VIP-token till utvalda kunder innan flaggan
   slås på för alla.
