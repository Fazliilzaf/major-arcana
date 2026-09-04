# Baslinje · personalportalen och kundportalen

**Mätt 2026-09-03.** Underlag för masterplanen — fakta, inte avsikter.
Varje påstående har fil och radnummer. Det som inte gick att avgöra står som
oavgjort i stället för att gissas.

---

## 0 · En rättelse först

Jag sa i går att `cco-patient-offer-portal-v3.html` var "den nyaste och bästa"
kundportalen och analyserade den som om den fungerade — CCO-tråden, videoknappen,
journalhanteringen.

**Den filen har noll `fetch(` på 5 793 rader.** Den är en statisk mockup. CCO-tråden
visar ingenting, videoknappen har ingen handler, "Välj datum" har ingen handler.
Jag läste utseende och rapporterade funktion.

Den riktiga tvåvägskanalen ligger i `public/patient-portal-chat.html` — en fil på
10 kB som ingen pekat ut, och som fungerar hela vägen.

---

## 1 · Personalportalen: fyra vyer lever, fem är kulisser

Av 24 nav-etiketter är tre rollcontainrar (`Sjuksköterska`, `Läkare`,
`Admin / Ägare`, `staff-portal.html:6017/6043/6060`). Kvar: 21 vyer.

**Lever mot riktig data:**

| Vy          | Endpoint                                          | Källa                                                            |
| ----------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Mitt schema | `/api/v1/cco-bookings/slots` + `/calendar-blocks` | bookingEngineStore — 21 resurser, 72 tjänster, 220 reservationer |
| Offerter    | `/api/v1/cco-commercial/owner-offer-overview`     | ccoCommercialStore — 13 case                                     |
| Audit-logg  | `/api/v1/staff/audit`                             | `cco-audit.jsonl`, 25 MB, skriven i dag                          |
| Delegering  | `/api/v1/staff/documents`                         | statisk dokumentkatalog, 19 poster                               |

**Kulisser — hårdkodad HTML, ingen endpoint alls:**

```
Min historik            staff-portal.html:2673–2696
Ordinationsdokument     staff-portal.html:2698–2723
Kliniköversikt          staff-portal.html:2734–2751   (hårdkodade siffror)
Personalöversikt        staff-portal.html:2783–2814
Dokumentkatalog         staff-portal.html:2908–2929
```

**Tomma av en enda anledning:** `cco-booking-cases.json` **finns inte i prod** —
varken i `/opt/render/project/src/data/` eller `/var/data/`. `readJson` faller
tillbaka på `emptyState()` (`ccoBookingCaseStore.js:265`), så `listCases()`
returnerar `[]`.

Det slår ut **nio** endpoints samtidigt: tasks, my-customers, daily-work-queue,
followups, review-queue, ordination-reviews, delegated-inbox,
delegated-photo-inbox, och case-halvan av work-priorities.

Alltså: Mina kunder, Mina uppgifter, Uppföljningar, Alla ärenden, Ordinationer
och Prioritet är inte trasiga vyer. De är korrekt byggda vyer som läser en store
som aldrig skrivits.

**Konversationer returnerar alltid 422.** Portalen anropar consumer-endpointen
utan `mailboxIds` (`staff-portal.html:5014`). Fallbacken ger 5 adresser
(`capabilities.js:92`), taket är 2 (`capabilities.js:123`), kontrollen ligger på
`:9997`. `apiFetch` returnerar `null` på icke-2xx (`:3005`), så vyn visar alltid
"Konversationslistan är inte tillgänglig just nu." Det är en parameterbugg, inte
en saknad funktion.

**Rolletiketterna är dekoration.** Rollknapparna (`:2160–2162`) har en
villkorslös lyssnare (`:6377`). `roleFromSession` (`:6190`) mappar både `owner`
och `operator` till `admin`. Det finns inga konsult- eller personalkonton i prod,
så **alla 24 användare landar i Admin / Ägare**. Den enda riktiga grinden är
serversidans `requirePermission`, och den begränsar i praktiken fyra saker:
`audit.read`, `staff.manage`, `ordination.approve` och offertöversikten.

**Demodata ligger kvar när anropet misslyckas.** `adminFallbackCases` göms bara
`if (adminList && data.queue?.length)` (`:4785`). En STAFF-användare som öppnar
Audit-loggen får 403 och ser demorader från juni som om de vore verkliga.

---

## 2 · Kundportalen: två filer, och den som pekats ut är fel

```
cco-patient-offer-portal-v3.html   219 kB   0 fetch()      statisk mockup
patient-portal-chat.html            10 kB   fungerar       den riktiga kanalen
patient-portal.html                 37 kB   ej mätt        servas av server.js:9170
```

---

## 3 · Vad som faktiskt kopplar ihop portalerna

### Kund → personal · FUNGERAR

```
patient-portal-chat.html:194 (knapp) → :299 send() → POST /api/patient-portal/<token>/messages
  → patientPortal.js:754 → :764 appendMessage({direction:'inbound'})
  → ccoPortalMessageStore → /var/data/cco-portal-messages.json
  → ccoConversationThreadStore.js:683–697 väver in som kind:'portal_message'
  → staffPortal.js:2355 delegated-inbox · :3042 customer-threads
```

Personalen ser det i **Svarstudion** (`konversationer.html:6339` →
`konversationer-bottom-actions.js:1491`), inte i personalportalen.

### Personal → kund · FUNGERAR, men inte från personalportalen

```
konversationer-bottom-actions.js:1680 → POST /cco/runtime/customer/:id/portal-message
  → ccoPortalMessages.js:106 (RBAC mail.send) → :121 appendMessage({direction:'outbound'})
  → kunden hämtar i patient-portal-chat.html:272
```

Svaret hamnar i portalen, inte i mejl. Mejlet är bara en notis om att svar finns
(`ccoPortalReplyNotification.js`).

**`staff-portal.html` har ingen svarsruta.** Knappen "Öppna tråd"
(`:3644`) länkar till **rå JSON** i ny flik. Routern säger det själv:
`staffPortal.js:2402` — _"Svar skrivs i CCO-konversationen med ordinarie audit."_
Ingen av de 28 rutterna i `staffPortal.js` kan skicka ett portalmeddelande.

### Video · BYGGT MEN OKOPPLAT, i tre lager

```
1. Ingen transport      signalingServer.js:9 lovar WebSocket på /api/v1/video/signal
                        Ingen ws-server finns. handleSignalingMessage (:140,
                        exporterad :182) anropas aldrig.
2. Ingen klientdel      RTCPeerConnection: 0 förekomster i hela repot
3. Ingen knapp          .btn-video (v3:4290) har ingen onclick.
                        Enda JS som rör den är :5776 som togglar CSS.
```

REST-rutterna finns (`video.js:18,29,76,82,99–147`) och tjänsten är monterad
(`server.js:13350`, `:13578`). Ingenting anropar dem.

### Ombokning · BYGGT MEN OKOPPLAT

Serversidan är **komplett**: `bookingPublicActions.js:217` GET `/omboka/:token`
renderar en SlotPicker, `:281` POST gör atomiskt slot-lås, avbokning, ombokning
och audit. Monterad `server.js:12310`.

Men `generateActionToken` (`:36`, exponerad `:621`) **anropas aldrig**. Ingen
mall, inget mejl, ingen portal bygger länken. Och kundportalens "Välj datum"
(`v3:4274`) har ingen handler.

### Journal- och bilddelning · DELVIS

Det du beskrev — _kunden ber, ni trycker på en knapp, kunden ser just det_ —
finns inte. Men byggstenarna gör det, och en av dem beter sig tvärtemot sitt namn:

`isPatientPortalJournalVisible` (`ccoJournalStore.js:48`) används **bara i tre
personal-endpoints** (`server.js:4176`, `:4422`, `:4739`). Den appliceras **inte**
på kundvägen — `ccoPortalBankId.js:342` skickar in _alla_ journalposter till
`buildJournalReference`. Flaggan heter "synlig i patientportalen" och styr
personalvyer.

Kunden ser i dag bara en **referens**: antal, antal signerade, senaste datum,
typer (`ccoPortalCustomerPayload.js:64`). Aldrig innehåll.

`isPatientVisible` på bilder (`ccoPatientAssetStore.js:274`, default `false`) —
ingen route sätter den, ingen route filtrerar på den.

**Det enda som fungerar som selektiv delning:** bilder via offerten. Personal
markerar "offertklara" bilder i kundkortet
(`cco-kundkort-referens.js:3014–3024`), de blir `portalPhotos`
(`ccoCommercial.js:330–349`) och serveras per bild med L2-session,
ägarskapskontroll, whitelist och audit (`:1538–1580`). Låst till offertkontexten.

Sökningar utan träff i hela repot: `sharedWith`, `visibleToPatient`,
`shareWithPatient`, `grantAccess`, `releaseTo`, `portalVisible`.

---

## 4 · Det största fyndet

```
/var/data/cco-portal-messages.json    FINNS INTE
```

Storen skriver filen vid första meddelandet. **Ingen kund och ingen anställd har
någonsin skrivit ett portalmeddelande i skarp drift.**

Varför syns i `/var/data/cco-comm-draft.json`:

```
791  utkast innehåller portal-länken
790  står kvar i needs_approval
  1  har skickats — 2026-07-08
793  aktiva tokens är myntade
790  nudges skapade
```

Portalen är byggd. Tokens finns för nästan 800 kunder. Inbjudningarna är
skrivna. En enda gick ut.

---

## 5 · Tre sorters lucka

Det här är det som gör masterplanen enkel att prioritera — de kostar helt olika.

**Finns, men fel parameter eller fel plats.** Konversationer 422:ar på en
mailbox-gräns. Personalportalen kan läsa trådar men inte svara i dem. Kundens
meddelanden når systemet men visas i Svarstudion, inte i portalen.

**Finns på servern, saknar knapp.** Ombokning — hela flödet är byggt och
testat, ingen länk genereras. Videons REST-lager. Journalens
`visibility`-flagga.

**Saknas.** WebSocket-transport och klientdel för video. Selektiv
delningsknapp för journal och bilder. Klinikväxlaren. `cco-booking-cases.json`
— nio vyer väntar på en store som aldrig skrivits.

---

## 6 · Oavgjort — kräver beslut eller mätning som inte gick att göra

- **Varför 790 utkast aldrig godkändes.** Medvetet stopp, trasig
  godkännandevy, eller att ingen hunnit? Går inte att läsa ur filerna.
- **Om `cco-booking-cases.json` någonsin funnits.** Ingen `.bak` eller `.pre-*`
  med det namnet finns. Aldrig skriven, eller borttagen vid en migrering?
- **Om BankID körs skarpt i prod.** `PORTAL_BANKID_LIVE` mättes till `false`
  tidigare i dag, vilket stänger L2 och därmed offertportalen och bilddelningen.
- **Om `patient-portal.html` (37 kB) är i drift.** Servas av `server.js:9170`
  mot `patientPortalStore`-inbjudningar. Inte mätt.
- **Vad Konversationer skulle visa med rätt parameter.**
  `/var/data/cco-mailbox-truth/` är 491 MB och `cco-worklist-snapshot.json`
  byggdes om i morse, vilket talar för att det finns innehåll bakom 422:an. Men
  det är en indikation, inte ett bevis.

---

## Metod

Två parallella mätningar, båda mot filsystemet och mot prod över SSH, läsande.
Ingenting ändrat, ingenting committat under mätningen. `git grep` undveks — det
läser indexet och ljuger om otrackade filer
(`tests/meta/testerFragarInteGit.test.js`).

---

# Tillägg 2026-09-04 · vad som ändrades på ett dygn

Baslinjen ovan mättes 2026-09-03. Den lästes om dagen efter, och tre av dess
siffror stämde inte längre. Ingen av dem var fel när den skrevs.

## Vyerna: 21 blev 26

Navigationen har gjorts om till en datastruktur. Sedan mätningen har `Kollegor`
tillkommit (ägarbeslut 2026-09-03), delegeringarna delats i tre rollvyer, och
ORD-191 lagt till `Öppna tider`. Radnumren i avsnitt 1 pekar på annan kod.

Uppmätt 2026-09-04: **3 roller, 26 distinkta paneler, 1 utgående länk.**

Siffran räknas nu ur filen vid varje testkörning
(`src/infra/personalportalensVyer.js`), och jämförs mot
`config/personalportalens-vyer.json`. Ett dokument kan åldras tyst; en mätning
som körs kan det inte.

**De fem kulisserna står kvar oförändrade** — `history`, `docs`, `overview`,
`staff`, `catalog`. Ingen har byggts.

En fälla värd att notera: `/api/v1/staff/team` HÄMTAS, så Personalöversikt ser
levande ut. Svaret går till `_staffTeam` — tilldelningsrullgardinen — och rör
aldrig panelen. En endpoint i filen är inte en endpoint i vyn.

## Demoraderna var värre än dokumenterat

Avsnitt 1 noterade att demodata ligger kvar när anropet misslyckas. Det var
underdrivet, och gällde tre block, inte ett:

```
nurseFallbackList     göms bara if (container && data.tasks?.length)
adminFallbackCases    göms bara if (adminList && data.queue?.length)
auditFallback         göms bara i lyckat-grenen
```

`cco-booking-cases.json` finns inte i prod, så kön är **alltid** tom och
villkoret blev **aldrig** sant. Det handlar inte om ett 403-specialfall: en
inloggad ägare som öppnade "Alla ärenden" fick fyra uppdiktade patienter —
Magnus Eriksson, Leila Khalil, med ingrepp, graftantal och bokningsdatum —
serverade som klinikens aktiva ärenden. Varje gång.

Åtgärdat i ORD-212: demoinnehåll göms så fort sessionen blir skarp, före all
laddning, oavsett vad anropen svarar.

## Ombokningslänken är inte längre okopplad

Avsnitt 3 skrev att `generateActionToken` aldrig anropas och att ingen mall
bygger länken. ORD-190 tog bort den funktionen helt — dess token härleddes ur
`sha256(bookingId + salt)`, och saltet var literalen i källkoden eftersom
`ARCANA_TOKEN_SALT` inte är satt i prod. Att lägga den länken i ett mejl hade
gjort svagheten till en distributionskanal.

Ersatt av lagrad slump (`src/ops/bookingActionLink.js`). Påminnelse- och
bekräftelsemejlen bygger nu ombokningslänken. **Avbokningslänken skickas inte**
— ägarbeslut ORD-202: kunden får boka om själv, men avbokning kräver mejl eller
telefon till kliniken.

## Oförändrat sedan baslinjen

- Video: `RTCPeerConnection` fortfarande 0 förekomster i repot.
- Kundportalen: `cco-patient-offer-portal-v3.html` är kvar som statisk mockup.
- Konversationer: anropet saknar fortfarande `mailboxIds`.
- De 24 kontona i prod `auth.json`: 17 är testkonton, 0 har namn.
