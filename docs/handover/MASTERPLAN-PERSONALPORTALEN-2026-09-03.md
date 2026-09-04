# Masterplan · personalportalen som mötespunkt

**2026-09-03** · byggd på `BASLINJE-PERSONALPORTALEN-2026-09-03.md`
Varje påstående nedan är mätt. Inget är antaget.

---

## Vad vi bygger, och vad vi inte bygger

**Bygger:** personalportalen — och kopplingarna mellan kundens portal och
personalens.

**Bygger inte:** kundportalens gränssnitt. Ägarbeslut 2026-09-03: _"vi ska inte
bygga vidare på kundportalen, vi ska bygga vidare på staff-portalen — men
kopplingarna mellan kund och staff-portalen menar jag."_

Kundportalen får alltså ny funktionalitet bara där en koppling kräver det, och
då i den fil som faktiskt fungerar (`patient-portal-chat.html`), aldrig i
mockupen (`cco-patient-offer-portal-v3.html`, noll `fetch()`).

---

## Beslut som redan är fattade

| Beslut                               | Datum      | Innebörd                                                                   |
| ------------------------------------ | ---------- | -------------------------------------------------------------------------- |
| Portalen följer nya bokningar        | 2026-09-03 | Ny kund som bokar får portal automatiskt                                   |
| Befintliga kunder får en fråga       | 2026-09-03 | Vid återbesök frågar systemet personalen om kundkort ska skapas            |
| Inget svep bakåt                     | 2026-09-03 | 790 automatgenererade utkast arkiverade bort, `302357ca`                   |
| Video i egen regi                    | 2026-09-03 | WebRTC i portalen, inte extern tjänst — patientdata lämnar aldrig systemet |
| Två tenants, modell B                | 2026-09-02 | `hair-tp-clinic` och `curatiio`, ORD-165                                   |
| Kunden ser inte journal som standard | 2026-09-03 | Endast på begäran, via knapp hos personalen                                |
| Hubben består av åtta ytor           | 2026-09-03 | Se nedan — ägaren godkände listan och ordningen                            |

---

## Hubbens åtta ytor

Den öppna frågan från baslinjen — _vilka fem till tolv ytor personalportalen ska
länka till_ — är besvarad 2026-09-03. Åtta, inte fler. 191 HTML-sidor finns; en
hubb som länkar till allt blir `cco-demo.html` igen.

| #   | Yta           | Vad den svarar på                       | Läge                                                  |
| --- | ------------- | --------------------------------------- | ----------------------------------------------------- |
| 1   | Min dag       | vilka kunder har jag idag, vilka samtal | `Mitt schema` lever (`ccoBookings.js:1871`)           |
| 2   | Mina kunder   | vilka är mina, var i resan är de        | endpoint finns, väcks av fas 0                        |
| 3   | Inkorgen      | vad har kunder skrivit till mig         | 422 i dag, en parameter                               |
| 4   | Kalendern     | boka, omboka, avboka                    | `kalender.html` fungerar mot motorn                   |
| 5   | Uppföljningar | vem ska jag höra av mig till            | endpoint finns, väcks av fas 0                        |
| 6   | Delegering    | vad har någon skickat vidare till mig   | fungerar, 19 poster                                   |
| 7   | Att granska   | vad väntar på läkarbeslut               | `review-queue` + `ordination-reviews`                 |
| 8   | Kollegor      | vem jobbar idag, vem kan jag fråga      | `/api/v1/staff/team` finns, fyller bara en rullgardin |

Rad 1, 3, 5 och 7 är ägarens egen mening rakt av: _"varje person ser dagens
kunder, samtal, uppföljningar och frågor."_ Rad 2 och 4 är verktygen för att
göra något åt dem. Rad 6 och 8 är _"kollegor ska kunna prata med varandra."_

**Medvetet utelämnat.** Kliniköversikt och Personalöversikt med siffror — de är
kulisser, och en hårdkodad siffra som ser rätt ut är värre än ingen siffra.
Ordinationsdokument och Dokumentkatalog hör hemma inne i kundkortet. CFO,
revision och compliance är viktiga men inte det en sköterska ska mötas av
klockan åtta.

**Byggordning:**

```
nu                     6 · Delegering    fungerar — flytta bara in den
                       8 · Kollegor      endpoint finns, byt rullgardin mot vy
                       4 · Kalendern     länka, den är klar

sen                    3 · Inkorgen      fixa 422, mät vad som kommer
                       1 · Min dag       bygg ovanpå Mitt schema

när fas 0 burit frukt  2 · Mina kunder
                       5 · Uppföljningar
                       7 · Att granska
```

De tre sista väntar inte på kod utan på att ärenden börjar skapas. Fas 0 gjorde
dem möjliga — den fyller dem inte.

---

## Fas 0 · En rad som gör nio vyer möjliga

```
server.js:241   path.join(__dirname, 'data', 'cco-booking-cases.json')
.gitignore:3    data/
git ls-files    filen är inte spårad — deployas aldrig
```

`cco-booking-cases.json` är den **enda** storen som pekar på repokatalogen i
stället för den beständiga disken. Alla andra använder `${config.stateRoot}`.
På Render finns filen därför inte, och skulle den skapas försvinner den vid
nästa deploy.

Nio endpoints läser den: tasks, my-customers, daily-work-queue, followups,
review-queue, ordination-reviews, delegated-inbox, delegated-photo-inbox, och
case-halvan av work-priorities.

**Var ärlig om vad fixen ger.** Den gör inte vyerna fyllda i morgon. Den gör att
ärenden **överlever** när de börjar skapas. Fixen är nödvändig men inte
tillräcklig.

**RÄTTELSE 2026-09-03.** Jag skrev här att ärenden skapas av
`ccoBookings.js:1025`. Det stämmer inte — den raden skriver till en _annan_ store
(`cco-booking.json`, kommersiell triage, 369 ärenden på `/var/data`).
`cco-booking-cases.json` är den **kliniska** ärendemodellen (new → qualifying →
proposed → confirmed → scheduled → in_progress → handoff → completed, med
behandlingsplan, ordinationsbeslut och överlämningschecklista) och fylls av
personalportalen och patientportalen. Se
`KALENDERN-SKA-ERSATTA-CLIENTO-2026-09-03.md`.

**Bevis:** skapa ett ärende via API:t, starta om tjänsten, läs det igen. Överlever
det en omstart är fasen klar.

---

## RÄTTELSE 2026-09-04 · det fanns en fas före fas 0

Planen nedan förutsatte att portalen har en session och bara saknar rätt
kliniknamn i den. **Den hade ingen session alls.** Uppmätt mot prod:

```
GET /staff-portal.html                ->  200
GET /api/v1/staff/availability-rules  ->  401  {"error":"Inloggning krävs."}
GET /api/v1/staff/team                ->  401  {"error":"Inloggning krävs."}
```

`requireAuth` läser token ur `Authorization: Bearer` eller `x-auth-token`
(`authMiddleware.js:87`). `staff-portal.html` skickade `credentials: 'include'`
— cookies. Det finns ingen cookie i systemet: ingen `res.cookie`, ingen
cookie-parser, ingen brygga, och ingen HTML-sida i `public/` anropade
`auth/login` mot portalen. **Alla 28 anrop svarade 401.**

Det syntes inte, eftersom `apiFetch` returnerade `null` på allt utom 2xx. 401
och tom lista blev samma värde. Alla vyer visade sitt tomma läge, `_liveMode`
blev aldrig true, och statusraden sa "Demoläge · ingen session" — sant, men
det lästes som ett valt läge.

Och inget test fångade det: varje portaltest monterar routern med en egen
`requireAuth` som sätter `req.auth` direkt. De bevisar att SERVERN svarar rätt.
Ingen läste klientfilen. Det gäller även ORD-191 och ORD-194, vars vyer alltså
aldrig gick att nå.

**Löst i ORD-196** (`cb5f7eb`): portalen läser samma token som `admin.js`
redan lägger i localStorage. Ingen andra inloggning byggd. Fas 1 nedan är
avklarad på köpet — kliniknamnet kommer nu ur sessionen, och en okänd tenant
visar "Klinik okänd" i stället för en klinik.

---

## Fas 1 · Portalen måste veta vilken klinik den visar — KLAR (ORD-196)

I dag: `staff-portal.html:2131` säger `<div class="logo">Hair TP Clinic</div>`
hårdkodat. Curatiio nämns inte en enda gång i filen. Klientkoden läser inte
tenant ur sessionen.

Servern gör redan rätt — varje rutt läser `req.auth?.tenantId`. Och växlingen
finns byggd: `POST /auth/switch-tenant` (`auth.js:790`) kontrollerar medlemskap,
skapar ny session, återkallar den gamla och revisionsloggar både lyckade och
nekade försök. `auth:switch_tenant` ligger i både OWNER:s och STAFF:s
rättighetslista.

**Bygg:** läs tenant ur sessionen, visa rätt kliniknamn, och en växlare för dem
som har medlemskap i båda.

**Varför tidigt:** utan den vet ingen vilken kliniks data de tittar på. Det är
en förtroendefråga, inte en bekvämlighetsfråga. Och Curatiio-medlemskapen är på
väg in.

---

## Fas 2 · Personalen ska kunna svara där de läser

Det här är kärnan i din vision, och den halva som saknas.

Kundens meddelande **når redan** personalen:

```
patient-portal-chat.html:194 → :299 → POST /api/patient-portal/<token>/messages
  → patientPortal.js:754 → :764 appendMessage({direction:'inbound'})
  → ccoConversationThreadStore.js:683–697 → staffPortal.js:2355 · :3042
```

Men **ingen av de 28 rutterna i `staffPortal.js` kan skicka ett
portalmeddelande.** Knappen "Öppna tråd" (`staff-portal.html:3644`) länkar till
rå JSON i ny flik. Routern säger det själv (`staffPortal.js:2402`): _"Svar skrivs
i CCO-konversationen med ordinarie audit."_

Vägen finns: `POST /cco/runtime/customer/:id/portal-message`
(`ccoPortalMessages.js:106`, RBAC `mail.send`). Den anropas bara från
Svarstudion (`konversationer-bottom-actions.js:1680`).

**Bygg:** en trådvy med svarsruta i personalportalen som använder den befintliga
endpointen. Ingen ny serverkod.

**Bevis:** kund skriver i portalen, personal ser och svarar utan att lämna
portalen, kunden ser svaret. Mätt hela vägen, inte antaget.

---

## Fas 3 · Konversationer slutar svara 422

Portalen anropar consumer-endpointen utan `mailboxIds`
(`staff-portal.html:5014`). Fallbacken ger fem adresser
(`capabilities.js:92`), taket är två (`:123`), kontrollen ligger på `:9997`.
`apiFetch` returnerar `null` på icke-2xx (`:3005`), så vyn visar alltid
"Konversationslistan är inte tillgänglig just nu."

En parameterbugg, inte en saknad funktion.

**Oavgjort:** vad vyn faktiskt visar när anropet går igenom.
`/var/data/cco-mailbox-truth/` är 491 MB och worklist-snapshoten byggs om varje
morgon, vilket talar för att det finns innehåll bakom — men det är en indikation,
inte ett bevis. Mät efter fixen innan något byggs ovanpå.

---

## Fas 4 · De fem kulisserna

Hårdkodad HTML utan endpoint:

```
Min historik            staff-portal.html:2673–2696
Ordinationsdokument     :2698–2723
Kliniköversikt          :2734–2751   (hårdkodade siffror)
Personalöversikt        :2783–2814
Dokumentkatalog         :2908–2929
```

Två av dem har redan en datakälla som inte används: Personalöversikt kan läsa
`/api/v1/staff/team` (`staffPortal.js:2291`) som i dag bara fyller en
rullgardin. Dokumentkatalogen kan läsa samma katalog som Delegering redan läser
och som fungerar (19 poster).

**Bygg de två först** — de är påkoppling, inte nybygge. Kliniköversikt, Min
historik och Ordinationsdokument kräver att någon bestämmer vad de ska visa.

**Och ta bort demodatan.** `adminFallbackCases` göms bara när anropet lyckas
(`:4785`). En STAFF-användare som öppnar Audit-loggen får 403 och ser demorader
från juni som om de vore verkliga. Det är värre än en tom vy.

---

## Fas 5 · Delningsknappen

Din modell: kunden ber, ni trycker på en knapp, kunden ser just det. Tio kunder
av hundratals.

Byggstenarna finns, men en av dem gör tvärtemot sitt namn:

`isPatientPortalJournalVisible` (`ccoJournalStore.js:48`) används **bara i tre
personal-endpoints** (`server.js:4176`, `:4422`, `:4739`). På kundvägen skickas
_alla_ journalposter in utan filtrering (`ccoPortalBankId.js:342`). Flaggan
heter "synlig i patientportalen" och styr personalvyer.

`isPatientVisible` på bilder (`ccoPatientAssetStore.js:274`, default `false`) —
ingen route sätter den, ingen route filtrerar på den.

**Det som redan fungerar som mall:** bilddelning via offerten. Personal markerar
"offertklara" bilder (`cco-kundkort-referens.js:3014`), de blir `portalPhotos`
(`ccoCommercial.js:330–349`) och serveras per bild med L2-session,
ägarskapskontroll, whitelist och audit (`:1538–1580`). Den mekanismen är rätt
byggd — den ska generaliseras, inte uppfinnas på nytt.

**Bygg:** en delning som binder _ett dokument_ till _en kund_ med tidsstämpel,
vem som delade och varför. Samma L2-krav och samma audit som offertbilderna.

**Innan något byggs:** journalåtkomst för patient är ett juridiskt beslut, inte
ett tekniskt. Det hör hemma i samma spår som Nordbro-frågorna.

---

## Fas 6 · Ombokning

Serversidan är **komplett och testad**: `bookingPublicActions.js:217` renderar
en SlotPicker, `:281` gör atomiskt slot-lås, avbokning, ombokning och audit.
Monterad `server.js:12310`.

Men `generateActionToken` (`:36`, exponerad `:621` med kommentaren "Export token
generator for use in confirm-flow") **anropas aldrig**. Ingen mall, inget mejl,
ingen portal bygger länken.

**Bygg:** generera token vid bokningsbekräftelse, visa knappen i kundportalen.
Ingen ny affärslogik.

---

## Fas 7 · Video

Ditt val: egen WebRTC i portalen, inte extern tjänst. Patientdata lämnar aldrig
systemet.

Byggt men okopplat i **tre** lager samtidigt:

```
1. Ingen transport   signalingServer.js:9 lovar WebSocket på /api/v1/video/signal.
                     Ingen ws-server finns i kodbasen. handleSignalingMessage
                     (:140, exporterad :182) anropas aldrig.
2. Ingen klientdel   RTCPeerConnection: 0 förekomster i hela repot.
3. Ingen knapp       .btn-video har ingen onclick. Enda JS som rör den togglar CSS.
```

REST-lagret finns (`video.js:18,29,76,82,99–147`) och tjänsten är monterad
(`server.js:13350`, `:13578`). Ingenting anropar det.

**Sist i planen.** Inte för att den är oviktig, utan för att den är det enda som
kräver helt ny infrastruktur — WebSocket-server, TURN/STUN, klientkod,
mediehantering. Allt annat i planen är påkoppling eller en saknad knapp.

---

## Ordningen, och varför

```
0  stateRoot-raden          en rad, gör nio vyer möjliga
1  klinikväxlaren           liten, och Curatiio är på väg in
2  svara i portalen         kärnan i visionen, ingen ny serverkod
3  Konversationer 422       en parameter
4  kulisserna               två är påkoppling, tre kräver beslut
5  delningsknappen          mall finns, men juridiskt beslut först
6  ombokning                servern klar, saknar länk och knapp
7  video                    tre lager ny infrastruktur
```

Fas 0–3 är billiga och ger mest. Fas 7 är dyrast och kan vänta.

**Kalendersegmentet ligger vid sidan av den här listan.** Ägaren 2026-09-03:
_"målet är att det segmentet ska ersätta Cliento som vi har idag."_ Det är ett
eget program med egen kritisk väg — se
`KALENDERN-SKA-ERSATTA-CLIENTO-2026-09-03.md`. Kort: motorn är arkitektoniskt
färdig men driftmässigt på noll (5 icke-test-bokningar mot Clientos ~776 i
månaden), Cliento-API:t kan bara läsa så parallelldrift är omöjlig, och
öppettiderna är konstanter i källkoden.

---

## Regler som gäller genom hela planen

**Mät före, mät efter.** Varje fas ska ha en före- och eftersiffra. En vy som
"ser rätt ut" är inte mätt.

**Mutationstesta grindarna.** Ett grönt test bevisar ingenting förrän det setts
bli rött av rätt skäl. Fyra falskt gröna test upptäcktes 2026-09-02 och 09-03.

**Skriv aldrig vid sidan om en levande statusfil.** `scripts/lib/
levandeStatusfil.mjs`. Servern håller filerna i minnet och skriver hela bilden
vid varje spara. Det har bränt två gånger, senast i går kväll och i morse.

**`hair_tp` betyder tre saker** — tenant, brand och formVariant. En
normalisering som matchar på värdet i stället för fältet förstör 6 538
patientposter. `tests/tenant/tenantIdCanonical.test.js` vaktar det.

---

## Öppna frågor som planen inte löser

- **Om `cco-booking-cases.json` någonsin funnits i prod.** Ingen `.bak` med det
  namnet finns. Fas 0 gör den möjlig, men om det finns historiska ärenden som
  gått förlorade vet vi inte.
- **Om BankID körs skarpt.** `PORTAL_BANKID_LIVE = false` mätt 2026-09-02. Utan
  L2 är offertportalen och bilddelningen stängda — vilket påverkar fas 5.
- **Vad `CCO_SEND_LIVE = false` ska bli.** Fas 2 och 6 fungerar i portalen även
  med grinden av. Notismejlen gör det inte.
- **Vilka fem–tolv ytor personalportalen ska länka till** när den blir
  mötespunkt. 191 HTML-sidor finns. En hubb som länkar till allt blir
  `cco-demo.html` igen.
