# ORD-165 · Ett tenant eller två

**Arbetsorder · 2026-09-02**
**Bas:** `main` (`5fa7b1bf`)
**Föregås av:** ORD-164 (Curatiios friskförsäkran), ORD-159 (betänketid per ingreppstyp), ORD-133
**Grind:** ingen datamigrering utan ägarbeslut · `CCO_SEND_LIVE` orörd
**Prioritet:** P2 — inget är trasigt i dag, men varje nytt Curatiio-dokument fördjupar valet

---

## Frågan

Ägaren 2026-09-02:

> Båda företagen tar betalt genom samma org 559034-2688, Hair TP Clinic GBG AB.
> Men vi har två helt olika kunder, hemsidor, marknadsföring, olika dokument.
> Kundresan nästan densamma, olika betänketid. Kanske bäst att ha en egen, men
> att vi styr dem under samma tak — åtkomsten under samma program.

Frågan kom ur en detalj i ORD-164: Curatiios friskförsäkran bär
`tenantId: 'hair_tp'`, ärvt ur `BASE_FORM`. Det är inte fel klinik — det är att
systemet inte vet att det finns två.

---

## Vad koden redan gör

Modellen ägaren beskriver **finns**, men är halvbyggd, och på två motstridiga sätt.

**Varumärke under tenant** — det avsedda:

```
ccoBrandUserStore.js        "klinik-brands/locations PER TENANT"
ccoBookingEngineStore:1010   brand: normalizeText(safe.brand)
cco-service-catalog.json     brand: "Curatiio" / "Hair TP Clinic"
```

**Varumärke SOM tenant** — det byggda:

```js
// src/routes/publicBookingEngine.js:529
const tenantId = brand?.id || brand;
// Curatiio Fas 1 — brand-isolation: skicka brand-key till engine …
```

Här sätts `tenantId` **ur** varumärket. Samma värde bär två betydelser beroende
på var man står.

Och registret är tomt: `cco-brands.json` finns inte i produktion. Ingen brand är
registrerad, trots att `brand: 'hairtp'` är hårdkodad på tre ställen i
bokningsmotorn.

Så valet är inte greenfield. Det är att välja vilken av två halvbyggda modeller
som ska bli den riktiga.

---

## Vad som står på spel, mätt

```
tenantId partitionerar          12 store-filer
  ccoHistoryStore               75 förekomster
  ccoBookingEngineStore         57
  ccoConversationStateStore     38
  ccoCustomerStore              34
  ccoCustomerJourneyStore       22
  …

filer som nämner hair_tp        35
filer som nämner hair-tp-clinic 46

i produktion
  5176 journaler   tenantId: hair-tp-clinic
   767 journaler   tenantId: hairtpclinic
     0 journaler   tenantId: curatiio
    24 medlemskap  alla hair-tp-clinic
```

Tre stavningar av samma klinik finns redan. En fjärde (`hair_tp`) skickas av
signeringsflödet men har aldrig landat, eftersom ingen friskförsäkran signerats.

---

## De två alternativen

### A · Ett tenant, två varumärken

`hair-tp-clinic` förblir tenant. `brand` bär skillnaden: dokument, hemsida,
marknadsföring, kundresa.

**Kostar:** fylla `cco-brands.json`, lägga `brand` på signeringskonfigurationerna,
ersätta de tre hårdkodade `'hairtp'` i bokningsmotorn, och reda ut
`publicBookingEngine:529` så att brand slutar sättas som tenant.

**Låser fast:** verksamheterna delar databas. Att skilja dem åt senare kräver en
migrering av allt som `tenantId` partitionerar.

**Passar:** en juridisk person, gemensam personal, gemensam åtkomst — precis det
ägaren beskriver i dag.

### B · Två tenants under ett konto

`hair-tp-clinic` och `curatiio` blir skilda tenants. Åtkomsten hålls ihop genom
att varje användare får medlemskap i båda.

**Kostar:** 24 medlemskap ska dubbleras. Varje vy som i dag antar ett tenant
måste välja. Journaler, bokningar, konversationer och kundresor för Curatiio
måste identifieras i befintlig data och flyttas — och 767 poster bär redan fel
stavning, så migreringen måste städa tre varianter samtidigt.

**Låser upp:** verksamheterna kan drivas, revideras eller säljas var för sig utan
datamigrering.

**Passar:** om Curatiio någon gång ska stå på egna ben.

---

## Uppgiften

### 1 · Ägaren väljer, och skälet skrivs ner

Det här är inte en teknisk fråga med ett riktigt svar. Skillnaden är vad som blir
dyrt senare:

```
A   billigt nu, dyrt om verksamheterna ska skiljas åt
B   dyrt nu, billigt om de ska skiljas åt
```

Frågan att ställa sig är inte vilken som är renast, utan: **är det tänkbart att
Curatiio en dag drivs eller ägs separat?** Är svaret nej är A rätt. Är svaret
"kanske" är B billigare i dag än om tre år.

Skriv beslutet med datum, som ORD-148:s.

### 2 · Oavsett val: stäng tvetydigheten först

`publicBookingEngine:529` sätter `tenantId` ur varumärket. Det är fel i båda
modellerna — i A ska brand vara ett eget fält, i B ska tenant komma från
inloggningen, inte från en publik parameter.

Den raden ska rättas innan något annat byggs, för den gör att båda modellerna ser
ut att fungera.

### 3 · Stavningarna

> **UTÖKAD 2026-09-02.** Ursprunglig formulering sa att signeringsflödet skapar
> "ett fjärde värde". Mätningen visar något större: **skrivvägen normaliserar
> inte alls, och läsvägen har trettioen filer med egna varianter av samma regel.**
>
> Tre normaliserare finns, ingen mappar `hair_tp` till något:
>
> ```
> ccoJournalStore.normalizeJournalEntry   trim
> authStore.normalizeTenantId              trim
> tenantLifecycle.normalizeTenantId        lowercase + slug  →  hair_tp blir "hair-tp"
> ```
>
> Och listorna på lässidan skiljer sig, inte bara i antal utan i innehåll:
>
> ```
> ccoPatientAssetIdentity     ['hair-tp-clinic', 'hair_tp', 'hairtp-clinic']
> ccoJournalQaDashboardStore  ['hair_tp', 'hairtpclinic']
> cfoFortnoxTenantResolve     ['hair-tp-clinic', 'hair_tp', 'hairtp-clinic', 'hairtpclinic']
>                             + substring-matchning: includes('hairtp'|'hair-tp'|'hair_tp')
> ```
>
> Ingen av dem känner till de andra. Tre vyer kan alltså ge tre olika svar på
> samma fråga om samma klinik — och en fjärde matchar på substräng, vilket
> träffar värden de andra missar.
>
> `hair_tp'` som litteral finns i **31 filer** under `src/`.
>
> Att det inte redan brustit beror på att `hairtpclinic` (767 journaler) och
> `hair-tp-clinic` (5176) råkar täckas av de flesta listorna. Den fjärde
> stavningen jag varnade för är alltså inte problemet — problemet är att ingen
> vet vilken lista som gäller.

**Samla regeln till ett ställe.** En modul, ett familjebegrepp, ett kanoniskt
värde. De trettioen filerna ska importera den i stället för att bära egna listor.

**Gör det kanoniska värdet till en parameter, inte en konstant.** Då är valet i
§1 en konfigurationsrad i stället för en refaktorering: `hair-tp-clinic` i A,
två kanoniska värden i B.

**Rör inte journalens skrivväg ännu.** Att kanonisera vid inskrivning lägger ett
värde på disk, och vilket som är rätt beror på §1. Risken av att vänta är noll:
inga friskförsäkringar finns, ORD-164:s dokument saknar innehåll, och
`CCO_SEND_LIVE` är `false`.

Skriv testet som failar när en okänd tenant-sträng når en store — det kan byggas
nu och gäller båda alternativen.

### 4 · Först därefter ORD-164:s `tenantId`

Curatiios friskförsäkran bär `tenantId: 'hair_tp'` från `BASE_FORM`. Rätt värde
beror på valet i §1 — `brand: 'curatiio'` i A, `tenantId: 'curatiio'` i B.

Rör den inte innan valet är fattat. Den kan inte skada i dag: noll
friskförsäkringar har signerats.

---

## Fällan

**Bygg inte A och B samtidigt.** Det är vad som redan hänt — `ccoBrandUserStore`
säger brands-under-tenant medan `publicBookingEngine` säger brand-som-tenant.
Halva vägen åt två håll är sämre än helt åt ett.

**Migrera ingenting förrän stavningarna är enhetliga.** Flyttar man Curatiios
data till ett nytt tenant medan tre tenant-strängar cirkulerar flyttar man
troligen fel poster, och felet syns först när någon saknar en journal.

**Låt inte ORD-164 vänta på det här.** Friskförsäkran behöver innehåll från
kliniken oavsett vilken modell som väljs. Det arbetet är oberoende.

---

## Godkänt när

1. Ägaren har valt A eller B, med skäl och datum, nedskrivet i repot.
2. `publicBookingEngine:529` sätter inte längre `tenantId` ur ett publikt
   varumärkesvärde.
3. Tenant-strängen normaliseras vid inskrivning, och ett test failar på en okänd
   variant.
4. Mutationstesta punkt 3: skriv en journal med `tenantId: 'hair_tp'` och visa
   att det fångas.
5. Ingen datamigrering är påbörjad innan punkt 1–3 är klara.

---

## Vad jag inte avgjort

**Om `hairtpclinic` (767 journaler) är en gammal stavning eller en annan sak.**
Jag har antagit att det är samma klinik. Om de posterna kom från en annan import
kan de behöva annan hantering. Mät innan normaliseringen skrivs.

**Vad "Curatiio Fas 1" var tänkt att bli.** Kommentaren i
`publicBookingEngine.js` antyder en påbörjad plan för brand-isolation. Om det
finns en order eller ett dokument bakom den bör den läsas innan §2 rättas — den
kan innehålla ett beslut som redan är fattat.
