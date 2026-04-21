# CCO gap-analys: 100 % funktionellt flöde med riktig Microsoft/Outlook-mail

**Syfte:** Kartlägga vad som krävs för att CCO ska vara fullt funktionellt när riktig mail flödar genom systemet – inkorg, filter, åtgärder och intelligence.

**Omfattning:** Analys baserad på backend i **major-arcana** (t.ex. `server.js`, `src/routes/capabilities.js`, `src/ops/ccoMailboxTruthWorklistReadModel.js`) och `AGENTS.md` i Arcana-root. **Staging** kan bara verifieras säkert via faktiska miljövariabler och drift; nedan beskrivs vad koden *kräver* för att flöden ska fungera.

---

## Om AGENTS.md (Arcana-root)

Filen beskriver arbetssätt för **CCO-next-appen** (informationsarkitektur, kölogik, validering, leveransregler). Den adresserar **inte** Microsoft Graph, webhooks eller mailbox-pipeline. Svar på frågor om ingestion och synk måste utläsas ur backend (server, capabilities, scheduler, stores).

---

## 1. Hur kommer mail in idag – Graph-webhook eller polling?

### Push (Microsoft Graph-webhooks / subscriptions)

I genomgången av relevant kod finns **ingen** dedikerad HTTP-endpoint som tar emot Graph **change notifications**, och ingen tydlig subscription-livscykel i de granskade filerna. **Alert-webhook** (`alertNotifier`) är för interna larm, inte Graph.

**Slutsats:** Mail pushas **inte** in via Graph-webhooks som en färdig, synlig del av denna arkitektur i de analyserade filerna.

### Polling / pull

- **Graph Read** styrs av `ARCANA_GRAPH_READ_ENABLED`. Om den inte är sann returnerar `createRuntimeGraphReadConnector()` `null` – då finns ingen live Graph-koppling i processen.
- Graph-klienten kan använda **delta** mot mappar (t.ex. `messages/delta`) vid mailbox truth-backfill – det är fortfarande **pull** när jobbet körs, inte push-webhook.
- **Schemalagd synk:** Scheduler innehåller bl.a. **`cco_history_sync`**, som hämtar från Graph in i **`ccoHistoryStore`** (typiskt med intervall i timmar). Det är **periodisk polling**, inte webhook.

**Slutsats:** På kodnivå är det som finns **env-styrd Graph-läsning** + **scheduler-driven hämtning**. Om staging har `ARCANA_GRAPH_READ_ENABLED=false` finns **ingen** live Graph-ingång.

---

## 2. Flödar inkommande mail automatiskt in i CCO-kön, eller bara testdata?

Arkitekturen har **två parallella spår**:

| Spår | Vad fylls | Hur |
|------|-----------|-----|
| **Historik / analys** | `ccoHistoryStore` | Scheduler **`cco_history_sync`** hämtar från Graph. **AnalyzeInbox** kan vid körning använda `fetchInboxSnapshot` och mata analys/lagrad output. |
| **Operatörskö / truth-baserad worklist** | **`ccoMailboxTruthStore`** | Fylls via **mailbox truth backfill** (Graph-mappssidor) när backfill-endpoint och villkor är uppfyllda. |

**Worklist read model** (`ccoMailboxTruthWorklistReadModel.js`) bygger körader från **`store.listMessages`** på **truth store** – inte från `ccoHistoryStore`.

**Slutsats:** Automatiskt “all ny mail syns i CCO-kön som truth-worklist” är **inte** samma sak som historik-synk. Utan **regelbunden truth-backfill** (eller en inkopplad delta-pipeline) kan kön vara ofullständig, föråldrad eller endast det som explicit backfillats. Det handlar inte om “testdata” som sådan, utan om **vilken persistent källa** som faktiskt uppdateras.

En **delta-modul** (t.ex. `microsoftGraphMailboxTruthDelta`) kan finnas i kodbasen men måste vara **kopplad** till HTTP eller scheduler för att ge nära realtid; annars är truth alltid efter **manuellt eller sällan kört** backfill.

---

## 3. Fungerar “Markera klar” och “Svara senare” på riktiga mail?

**I kod:** Båda går via conversation state actions som **resolver mål mot `ccoMailboxTruthStore`** (match på meddelande + konversation + worklist consumer). De kan fungera för **riktiga mail** om:

1. Meddelandet finns i truth med relevanta mapptyper (`inbox` / `sent` / `drafts` / `deleted`).
2. Klienten skickar **samma** `conversationId` och `messageId` (t.ex. Graph message id) som truth.
3. Tråden ingår i consumer-modellen (t.ex. inte filtrerad bort som inaktiv kandidat, eller tidigare trunkerad i limit).
4. Eventuella **merge-konflikter** är hanterade om `hardConflictSignals` kräver review.

**Slutsats:** Funktionerna är inte “testdata-specifika”, men de är **strict beroende av att truth är korrekt ifylld och att UI skickar rätt nycklar**. Om staging främst synkar historik men inte håller truth i fas, uppstår fel mot truth/consumer trots att mail är “på riktigt”.

---

## 4. Vad saknas för att CCO-filter ska visa rätt data?

Exempel: **Uppföljning**, **Oägda**, **Hög risk**, **Idag**, **Imorgon**.

I **mailbox truth worklist read model** finns:

- **Lanes** som `act-now`, `review`, `all`, `later` – härledda från bl.a. oläst, `needsReply`, utkast, samt **operator state** (t.ex. `reply_later` → `later`, `handled` döljer rad).
- **Uppföljningsfält** via **conversation state projection** (`followUpDueAt`, `waitingOn`, …) när operator state finns.

Det som **saknas eller är ofullständigt** för era namngivna filter:

| Filter | Observation | Gap |
|--------|-------------|-----|
| **Uppföljning** | Delvis täckt via `followUpDueAt` efter parkering | Kräver konsekvent att **reply_later** skrivs och att UI/API filtrerar på datum; bredare “uppföljning” kan kräva mer affärsdata. |
| **Oägda** | Rollup har mailbox-/trådinformation; **tilldelad ägare** som produktbegrepp är inte fullt modellerat i samma rad | Behöver **ägar-modell** (inställningar, ticket, eller annan källa) och **projicering eller join** mot worklist-rader. |
| **Hög risk** | Worklist-raden i truth-modellen är inte primärt en riskmodell | **Risk** kommer typiskt från **analys (t.ex. CCO.InboxAnalysis)**, incidents eller gateway – måste **kopplas** till konversation/nyckel som UI filtrerar på. |
| **Idag / Imorgon** | Kräver tidsstämpel att filtrera på | Måste baseras på **`followUpDueAt`** eller annan planerad tid, med **tydlig tidszon** och konsekvent skrivning vid parkering. |

Dessutom: **`toCcoRuntimeStatusHandler`** i capabilities exponerar bl.a. **senaste analys** (`CCO.InboxAnalysis`) med en egen `conversationWorklist`. Om UI blandar **analys-snapshot** med **truth-consumer** utan en gemensam modell får filter **fel eller tomma** resultat trots att data “finns någonstans”.

**Slutsats:** För “rätt data” i alla dessa filter behövs antingen **en sammanslagen vy** (join: truth + operator state + risk + ägare) eller **tydligt separata** lägen med dokumenterad datakälla per filter.

---

## 5. Vad saknas för att Svarstudio ska kunna skicka riktiga svar via Microsoft?

Send-flödet styrs av env (t.ex. `ARCANA_GRAPH_SEND_ENABLED`, `ARCANA_GRAPH_SEND_ALLOWLIST`) och Graph **send connector** i capabilities. Utan aktivering och korrekt allowlist **blockeras** utskick (`CCO_SEND_DISABLED`, tom allowlist, eller saknad connector enligt `executionService`).

**För produktion behövs minst:**

- Aktiverad send-flagga och **ifylld allowlist** för avsedda mailboxar.
- App-registrering med rätt **behörigheter** (t.ex. Mail.Send enligt er implementation).
- Att **avsändar-mailbox** som studion använder matchar allowlist och Graph-anropen (`sendReply` / compose).
- **Efterverk:** att skickat mail syns i truth/historik efter synk (åter kopplat till punkt 2).

`server.js` bygger inte en separat send-connector; den skapas i **`createCapabilitiesRouter`** från env – **staging beteende = deployment config**.

---

## Prioriterad bygglista

1. **Datakälla för operatörsåtgärder:** Säkerställ att **`ccoMailboxTruthStore` hålls i fas** med verklig inkorg (schemalagd truth-backfill och/eller inkopplad **delta-synk**), eller ändra resolver så den använder **samma store som UI** – annars fortsätter markering/parkering att misslyckas eller kännas inkonsekvent.
2. **Delta i drift:** Koppla befintlig delta-logik till scheduler eller API så inkrementell uppdatering sker utan full manuell backfill varje gång.
3. **Valfritt för “live känsla”:** Microsoft Graph **subscriptions** + notifikations-endpoint + förnyelse – om kravet är push-driven synk.
4. **Enhetlig worklist för filter:** API eller batch som **joinar** truth-rader med risk, ägare och uppföljningsdatum så filter (Hög risk, Oägda, Idag, Imorgon) inte bygger på halva datakällor.
5. **Graph Send på staging/prod:** Aktivera send, allowlist, och end-to-end-test av svar – inklusive felhantering (403, throttling) och signatur/utkast.
6. **Observabilitet:** Tydliga signaler: Graph read audit, truth completeness, senaste backfill/delta, jämförelse mellan **analys worklist-storlek** och **truth consumer-storlek** för att fånga split-brain tidigt.

---

## Kort svar på “webhook vs polling på staging?”

Koden stöder **polling** (Graph-anrop + scheduler) när Graph-läsning är på. **Mail-webhooks** som färdig leverans i de granskade filerna finns inte. Vad som faktiskt gäller på **ert** staging avgörs av **deployade env-variabler** och om **scheduler** körs – det finns inte i denna markdown-fil.
