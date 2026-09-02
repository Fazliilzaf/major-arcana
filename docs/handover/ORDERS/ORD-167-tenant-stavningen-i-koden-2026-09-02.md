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

## Besvarat 2026-09-02, efter att ordern skrevs

### `hairtpclinic` var aldrig ett tenantId

Jag skrev att "någon valde den en gång". Mätt i git-historiken: ingen valde den.

```
dab227a0  2026-02-18  first commit
  src/brand/resolveBrand.js   hostNoWww.endsWith('hairtpclinic.se')
                              hostNoWww.includes('hairtpclinic')
  src/config.js               hair-tp-clinic
```

I första commiten finns `hairtpclinic` **bara som domänmatchning** — webbadressen
utan punkter. Det kanoniska `hair-tp-clinic` fanns i `config.js` från dag ett.
Prods `tenant-config.json` deklarerar exakt en tenant: `hair-tp-clinic`.

Tenant-fallbacken uppstod långt senare:

```
46893b61  2026-06-05  feat(cco): v9 kunddossiér kolumn 3 med inline flikar
  public/major-arcana-preview/app/cco-kunder-actions.js
    const DEFAULT_TENANT = 'hairtpclinic';
```

**Domännamnet kopierades till ett tenant-fält**, och 50 ställen ärvde det.
Datumet är värt att notera: 5 juni, två dagar efter smoke-testet som skrev de
767 posterna (2–3 juni).

Det betyder att `hair-tp-clinic` inte är en preferens att försvara. Det är vad
`tenant-config.json` deklarerar, och `hairtpclinic` är inte en gammal stavning
utan ett fält som fyllts med fel sorts värde.

### Ja, `public/` ska med — klienten skickar värdet till servern

Jag skrev att jag inte kollat. Nu gjort:

```
public/major-arcana-preview/app/patient-master-ui.js:6630
  function resolveKunderActionContext() {
    return { tenantId: 'hairtpclinic', role: 'staff', … };   ← hårdkodat
  }

public/major-arcana-preview/app/patient-master-ui.js:9106
  CcoScalpAnalysis.mount(mountEl, { patientId, tenantId: runtime.tenantId || 'hairtpclinic', baseUrl: '' })

public/major-arcana-preview/app/cco-kunder-actions.js:8
  const DEFAULT_TENANT = 'hairtpclinic';
```

Det är inte kosmetik. Klienten kan skapa poster under en tenant som ingen
kanonisk vy frågar efter — samma mekanism som gjorde de 767 osynliga, fast från
webbläsaren. `public/` hör till §1, inte till en uppföljning.

### Kvar som ägarbeslut

**`ccoCustomerDossier.js:41`** — `unique([text(tenantId), 'hairtpclinic',
'hair-tp-clinic', 'hair_tp', 'cco'])`. Den söker brett med flit. Om den ska
smalnas av är en fråga om vad dossiéen ska hitta, inte om stavning.

---

## Bieffekt av ORD-166 som ingen bad om

Tränings- och presentatörssidorna länkar till de fyra testpatienter jag
arkiverade i dag:

```
public/major-arcana-preview/cco-staff-training-v3.html      3 länkar
public/major-arcana-preview/cco-presenter-mode-v3.html      6 länkar
  ?customerId=cco-pilot-20260602-a&tenant=hairtpclinic&role=operator
```

Länkarna pekar nu på poster som inte finns. Sidorna är interna demo-/utbildnings-
vyer, så ingen patient påverkas — men den som öppnar dem i utbildningssyfte får
tomma vyer utan förklaring. Egen liten åtgärd, inte en del av §1.
