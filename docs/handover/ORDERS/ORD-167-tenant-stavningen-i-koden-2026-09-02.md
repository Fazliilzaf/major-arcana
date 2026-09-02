# ORD-167 — tenant-stavningen i koden, en fil i taget

**Arbetsorder · 2026-09-02**
**Bas:** `main` (`2a8557f6`)
**Föregås av:** ORD-165 §3 + TILLÄGG 1 och 2, ORD-166
**Grind:** ORD-131 · `CCO_SEND_LIVE` orörd · journalens skrivväg orörd
**Prioritet:** P3 — ingenting brådskar, och det är själva poängen

---

## Varför den här ordern finns

Koden defaultar tenantId till `hairtpclinic` på 50 ställen. Datan i prod säger
`hair-tp-clinic` — numera på **alla** 5 176 journalposter (ORD-166 tog bort de
767 som bar den andra stavningen; de var rester från ett smoke-test).

Fallbacken är alltså fel överallt där den träffar. Att den sällan träffar är
tur, inte konstruktion: när den *gjorde* det — smoke-testet i juni — hamnade 767
poster i en tenant som ingen kanonisk vy frågar efter. De var osynliga i varje
mätning i tre månader.

Nästa gång kan det vara en riktig journal.

---

## Varför det inte får göras som ett svep

**Mätt 2026-09-02.** Jag bytte alla 50 fallbacks till `hair-tp-clinic` och körde
sviten. Inget annat.

```
7 625 tester   7 527 gröna   98 RÖDA
```

Och de föll där det gör mest ont:

```
✖ grind AV → dry-run: skickar inget, utkastet orört på needs_approval
✖ grind PÅ + Resend → skickar och utkastet blir sent
✖ grind PÅ + Graph → använder graphSendAdapter.sendMail
✖ ORD-153 §6: CCO_SEND_LIVE av → send_gate_off för BÅDA kanalerna
✖ sändfel → utkastet blir failed (återhämtningsbart)
```

**Sändgrinden.** Den mekaniska ändringen går rakt genom mail-, SMS- och
utkastvägarna — de som faktiskt når patienter. Den minsta tänkbara skivan råkade
vara den farligaste.

Fördelningen av de 98:

```
48  tests/routes/ccoConversationRbac.test.js
48  tests/routes/ccoC5ThreadAction.test.js
24  tests/ops/ccoComposeSend.test.js
20  tests/routes/ccoConversationBulkAction.test.js
16  tests/routes/staffPortalOrdinationWrite.test.js
16  tests/routes/ccoConversationIdentity.test.js
12  tests/routes/ccoComposeSend.test.js
10  tests/routes/ccoPortalAccess.test.js
10  tests/routes/ccoComposeNewMail.test.js
 …  (RBAC, portal, audit, SMS)
```

Arbetskopian är återställd. Det här var en mätning, inte ett försök.

---

## Omfattning

```
50 fallbacks i src/         alla av formen  x || 'hairtpclinic'
234 rader i 51 testfiler    tenant-strängen (inte domänen hairtpclinic.com)
20 rader i public/          klientkod
```

Per fil i `src/`, störst först:

```
13  routes/staffPortal.js
 5  routes/ccoCommDraft.js
 3  routes/ccoTreatmentAgreement.js
 2  routes/ccoPortalMessages.js · ccoPortalBankId · ccoComposeNewMail · ccoCommercial
 2  ops/ccoConversationPatientResolver.js
 1  × 15 filer   (portal, compose, SMS, kontakt, BankID, dossier)
```

Utöver fallbacken finns **31 filer med egna variant-listor** på läsvägen —
`cfoFortnoxTenantResolve`, `ccoPatientAssetIdentity`, `clinicConversionFunnel`,
`ccoJournalQaDashboardStore`, `ccoDriveImportReviewReadService` med flera. Ingen
av dem känner till de andra. Tre vyer kan ge tre olika svar på samma fråga om
samma klinik.

`src/tenant/tenantIdCanonical.js` finns och är testad. **Noll filer i `src/`
importerar den.**

---

## Uppgiften

### 1 · En fil i taget. Inte ett sök-och-ersätt.

Per fil, i den här ordningen:

1. **Mät före.** Vilken tenant får de anrop filen gör i dag, och vilka rader
   returnerar de? Skriv ned siffran.
2. Byt fallbacken till `canonicalTenantId(...)` från modulen, eller till
   `HAIR_TP_CANONICAL` där en literal är rätt.
3. **Mät efter.** Samma anrop, samma siffra? Skiljer den sig — förklara varför
   innan du går vidare. En vy som plötsligt returnerar fler rader kan vara
   rättelsen, eller ett läckage mellan kliniker.
4. Kör sviten. Röda tester som bara låser fast den gamla stavningen rättas i
   samma commit. Röda tester som visar en **beteendeändring** stoppar arbetet.
5. Committa den filen för sig, med före/efter-siffran i meddelandet.

**Börja med de små.** `ccoContactLookup`, `ccoInboundSmsIngest`,
`ccoPortalSelfTest` — en fallback var, liten yta. Ta `staffPortal.js` (13) sist,
när mönstret sitter.

### 2 · Sändvägarna sist, och separat

`ccoComposeSend`, `ccoComposeNewMail`, `ccoCommDraft`, `ccoPortalSmsNudge`,
`ccoPortalNudge`, `ccoPortalReplyNotification`. 84 av de 98 röda testerna ligger
här eller i RBAC runt dem.

De rör `CCO_SEND_LIVE` och utkastens godkännandeflöde. Egen omgång, egen
granskning, och kör igenom S6-diagnostiken innan de committas.

### 3 · De 31 läsvägslistorna

Efter §1 och §2. Varje lista ersätts av modulen. **En lista i taget**, och för
varje: vilka värden matchade den förut som modulen inte matchar, och tvärtom?
`cfoFortnoxTenantResolve` matchar på substräng (`includes('hairtp')`) — den
träffar värden de andra missar. Att smalna av den är en beteendeändring, inte en
städning.

### 4 · Testet som gör det klart

När `src/` är fri från literalen: ett test som failar om `'hairtpclinic'` dyker
upp som tenant-värde i `src/` igen. Läs filsystemet, inte git
(`tests/meta/testerFragarInteGit.test.js`).

Mönstret ska skilja tenant-strängen från domänen `hairtpclinic.com`, som är
korrekt och ska finnas kvar.

---

## Rör inte

**Journalens skrivväg.** Se kommentaren i `ccoJournalStore.upsertEntry` och
`tests/ops/ccoJournalTenantNormalizeBlockerad.test.js`. Kanonisering före
uppslaget duplicerar poster med samma `entryId`. Ordningen är: migrera först,
gör `upsert` entryId-baserad sedan, normalisera sist.

**BRAND- och FORMVARIANT-raderna.** `hair_tp` betyder tre olika saker:
tenant (~30 ställen), brand (~15), formVariant (~9).
`patientDocumentSignRegistry.js` bär två av dem i samma fil —
`DEFAULT_TENANT = 'hair_tp'` (rad 33) och `formVariant: 'hair_tp'` (rad 63, 79).

**`isTestData`-märkningen i `normalizeJournalEntry`.** ORD-166 §3.

---

## Godkänt när

1. Noll `|| 'hairtpclinic'` kvar i `src/`.
2. Varje fil har en egen commit med före/efter-siffra.
3. Sändvägarna har gått igenom S6-diagnostiken.
4. De 31 läsvägslistorna importerar modulen, eller så står det nedskrivet
   varför en av dem inte kan det.
5. Testet i §4 finns och är mutationstestat.
6. Full svit grön. `CCO_SEND_LIVE` orörd.

---

## Vad jag inte avgjort

**Om `public/`-koden ska med i samma omgång.** 20 rader klientkod plus två
byggda bundlar. Bundlarna byggs om — men jag har inte kollat om någon av dem
skickar tenantId till servern, och i så fall vilken.

**Om `ccoCustomerDossier.js:41`** — `unique([text(tenantId), 'hairtpclinic',
'hair-tp-clinic', 'hair_tp', 'cco'])` — ska bli modulen eller förbli en
kandidatlista. Den söker brett med flit. Det kan vara rätt.

**Varför fallbacken skrevs som `hairtpclinic` från början.** Det är den enda
stavning som inte finns i datan. Någon valde den en gång, och 50 ställen ärvde
valet. Jag har inte letat efter var.
