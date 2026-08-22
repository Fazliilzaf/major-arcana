# CCO · Kunder — uppdrag

Skickas när kalendern är klar. Gäller **bara CCO:s kundvy**.

Riktig vy: `/staff?view=customers`
Mockup: `docs/design/kunder-mockup-v9.html`

---

## Läs det här först — annars bygger du fel sak

**Mockup v9 är inte ett facit för Kunder.**

För kalendern var mockupen ett facit: alla 188 klassnamn i den riktiga
kalendern fanns också i mockupen. Det var att fortsätta där någon slutade.

**Här gäller det motsatta.** Av mockupens 284 klassnamn finns 26 i den
riktiga kundvyn, som har 1 119. De delar ingen struktur.

Den riktiga vyn är dessutom **mer färdig** än mockupen. Den har journal,
varningar, hälsodeklaration, kundresa, aktivt besök, offerter,
auto-dokument, riktiga foton och konversationstrådar. Mockupen har inget
av det.

**Bygg alltså inte om Kunder efter mockupen.** Att följa den vore att göra
vyn sämre.

### Och: "allt på en lång sida" är redan byggt

V11-railen är **default på** (`app/cco-v11-rail-flag.js:53` — `!== '0'`,
alltså opt-out). Den är en enda scrollande kolumn med sektionerna:

A Profil · B Smart info · C Statistik · V Aktivt besök · D Varningar ·
E Hälsodeklaration · F Kundresa · G Smart nästa steg · H Bokningar ·
I Historik · J Journal · K Offerter · L Auto-dokument · M Foton · N Filer ·
O Anteckningar · P Kommunikation · P2 Konversationer · Q Ekonomi ·
R Insikter · S Sticky footer · Z V12-launcher

Ingen flikväxling. Inget att bygga om. Problemet är ett annat.

---

## Det verkliga problemet: railen går inte att arbeta i

`cco-v11-rail.js` är en **ren HTML-strängrenderare**. Noll
`addEventListener`, noll `fetch`, noll `<input>`, `<textarea>`, `<form>`
eller `contenteditable`. All interaktivitet ska komma från externa
handlers via `data-*`-attribut.

Flera av dem finns inte.

### 1. Fyra döda knappar

| Knapp                                | Fil · rad              | Varför den är död                                                                                                                                              |
| ------------------------------------ | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **✎ Redigera** (profil)              | `cco-v11-rail.js:84`   | `data-v11-rail-edit-profile` har ingen handler någonstans i repot                                                                                              |
| **Bekräfta kommande tider (N)**      | `cco-v11-rail.js:607`  | `data-v9-quick` fångas av `bindDossierQuickPills`, som kräver `[data-v9-zone3]` (`cco-v9-customers-parity.js:4114–4131`). Railen renderar aldrig det elementet |
| **✉ Svarstudio**                     | `cco-v11-rail.js:1169` | Samma sak                                                                                                                                                      |
| **Bekräfta kommande tider** (footer) | `cco-v11-rail.js:1314` | Samma sak                                                                                                                                                      |

Kommentarerna på rad 543–545, 1126–1127 och 1291–1292 påstår uttryckligen
"BEFINTLIGA handlers (inga nya)". Det stämmer inte. **Verifiera i webbläsaren
innan du fixar** — om det är en regression vill vi veta när den uppstod.

### 2. "+ Ny kund" gör ingenting

`index.html:3318` skickar `data-customer-command="new"`.
`handleCustomerCommand()` i `app.js:28063–28103` hanterar fyra grenar:
`bulk_merge`, `export`, `import`, `settings`. Ingen `new`.

Funktionen faller igenom **utan fallback** — ingen `console.warn`, ingen
statusrad. Tyst no-op.

Lägg till en fallback som säger ifrån vid okänd nyckel. Annars uppstår
samma bugg igen.

### 3. V12-launchern äter klick den inte borde äta

`bindV12WorkspaceRailLauncher` (`patient-master-ui.js:2579–2603`) sätter en
**capture-phase**-lyssnare på hela rail-skalet som kör `preventDefault` +
`stopImmediatePropagation`.

Allt som inte står i undantagslistan (`patient-master-ui.js:1477`) kapas och
öppnar V12 i stället för sin egen handler. Konsekvenser:

- **K Offerter** och **L Auto-dokument** — dokumentförhandsvisning öppnas aldrig
- **M Foton** — `<a target="_blank">` navigerar aldrig
- **N Filer** — samma
- **E Hälsodeklaration** och **F Kundresa** — deep-links går till V12 i stället

Avgör vilka av dessa som ska nå sin egen handler och utöka undantagslistan.

### 4. Går inte att skriva en anteckning

`cco-v11-rail.js:1054` säger rakt ut: _"Display-only (som legacy) — ingen
handler."_

Knappen "Anteckning" i Aktivt besök (`cco-v11-rail.js:283`) byter bara flik
(`patient-master-ui.js:1981–1986`). Fliken renderar befintliga journalposter.
**Ingen textarea, ingen sparaknapp, ingen POST.**

Det finns **ingen POST-route för kundanteckningar** i `src/`. De två som finns
är trådscopade, inte kundscopade:

- `src/routes/ccoWorkspace.js:1178` — kräver både `conversationId` och `customerId`
- `src/routes/ccoConversation.js:2893` — scopad på `conversationKey`

Enda skrivvägen mot kunden är fältet **Viktig notering** —
`PUT /api/v1/cco-patient-master/patient/demographics`
(`patient-master-ui.js:5245`, route `src/routes/ccoPatientMaster.js:1835`).
Ett enda överskrivbart fält, ingen logg. Man kan inte lägga till, bara ersätta.

**Detta är den enskilt viktigaste luckan.** Personalen ska kunna skriva ner
vad som hände.

### 5. Bara två riktiga skrivvägar finns i hela railen

1. **V Aktivt besök** — `POST /api/v1/cco/staff/watch-checkin`
   (`patient-master-ui.js:6683`) och `.../watch-complete-visit` (6703)
2. **G Smart nästa steg** — avtal från offert och skicka för signering
   (`cco-kundkort-referens.js:6402`, `6521`)

**Varning:** `bindIntelligentJourney` för railen anropas efter
`if (!isV9CustomersEnabled()) return;` (`patient-master-ui.js:6728`). Är V9 av
är även incheckningen död. Kontrollera det först.

### 6. Fem åtgärder är hårdkodat avstängda

`app/cco-kunder-actions.js`. Notera rad 71: **default är `disabled`** — allt är
avstängt tills något säger annat. Det är designat så, inte glömt.

| id        | rad | angivet skäl                                     |
| --------- | --- | ------------------------------------------------ |
| `export`  | 239 | Ej kopplat ännu                                  |
| `bulk`    | 245 | Ej kopplat ännu                                  |
| `merge`   | 251 | Kräver behörighet · P1 (`customers.merge`)       |
| `gdpr`    | 258 | Kräver behörighet · P1 (`customers.gdpr_export`) |
| `payment` | 272 | Kräver Fortnox                                   |

Ytterligare avstängda beroende på data: `book`, `rebook`, `form`, `agreement`,
`offer`, `access`.

Ta dem en i taget. Skälen är skrivna av någon som visste något — läs dem
innan du river.

---

## Vad mockupen faktiskt är bra på

Fyra saker, och bara fyra. Ta dem som idéer, inte som design.

### 1. Innehållsöversikt

Mockupens sektioner är `<details>`-dragspel med antalsbricka i `<summary>`
(CSS rad 3732–3771). Bara två är öppna som default. Man ser direkt vad som
finns utan att scrolla.

Railen är en platt, alltid utfälld stack. **Detta är railens tydligaste
förlust.** Man måste scrolla förbi allt för att veta vad som finns.

### 2. Åtgärder som faktiskt gör något

Mockupens kamera är riktig — `getUserMedia`, annoteringscanvas, sparas som
ny ruta i Filer (rad 8435–8467, 8705–8712). Övriga knappar är döda även där.

Mockupen har också en GDPR-rad railen helt saknar (rad 8913–8917):
**exportera GDPR-paket · aktivitetslog · radera kund permanent**.

### 3. AI-insikter med motivering

Mockupens fyra insikter (rad 7759–7776) säger _varför_:

- "4/6 i PRP-kur → föreslå 5:e omkring 12 juni"
- "Bokar oftast tor 08:00 (4 av senaste 5)"
- "Engagemang sjunker (96 % → 92 % på 3 mån)"
- "Värd att uppgradera till VIP+ — passerar 35 000 kr"

Railens R Insikter har **samma form** (titel + varför) men är märkt LATER och
matar bara ut `automationSignals`. Ingen av mockupens fyra beräkningar finns.

Mockupens siffror är påhittade. **Beräkningarna är däremot rimliga och värda
att bygga på riktigt.**

### 4. Navigation

⌘K-palett med tangentbordsnavigering (rad 5604–5634), brödsmula med bakåtpil
(rad 7996–8002), Esc stänger (rad 8096–8104). Railen har inget av det.

---

## Två saker jag först trodde men som är fel

Rättat, så du inte bygger på dem:

1. **"Kundvyn har sju flikar."** Fel. Railen är redan en lång sida. De sju
   är mockupens dragspelssektioner.
2. **"Mockupen har en riktig ekonomigraf, railen bara text."** Fel. Mockupens
   kunddossié har exakt samma fyra ekonomifält som railens Q
   (`cco-v11-rail-adapters.js:1833–1838`). Stapeldiagrammet i mockupen
   (rad 6481–6501) hör till **aggregatvyn** — hela kundstocken, inte en kund.
   Där saknar railen motsvarighet, men det är ett annat problem.

---

## Vad som INTE ska göras

- **Bygg inte om kundvyn efter mockupen.** Se överst.
- **Rör inte `cco-v12-workspace.js`.** Den är arkiverad död kod —
  `patient-master-ui.js:7036–7039` säger det uttryckligen. Aktiv renderare är
  `CcoV12Canon` (`app/cco-v12-canon.js`). Filen är 67 kB och ser levande ut.
  Den är det inte.
- **Ta inte bort empty-states.** Varje sektion säger idag "Inga journalposter
  ännu" i stället för att döljas eller fejka. Det ska stanna.

---

## Regel

Vyn säger idag **varför** något är tomt. Mockupen gissar.

En kundvy som ser säker ut men gissar är sämre än en som säger att den inte
vet. Behåll ärligheten.

---

## Mål

Kundkortet ska gå att **arbeta i**, inte bara läsa.

Använd dina egna agenter för att komma dit på bästa sätt. Vi styr inte hur.
