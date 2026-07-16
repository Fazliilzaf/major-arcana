# CCO-Kalender v8 — Live-smoke (efter merge + deploy)

> Kör denna checklista i **prod** efter att kalender-PR:erna (#194 v8 P1, #195 v8 P2+P3+#17)
> mergats till `main` och Render deployat. Statiskt verifierad via harness under bygget —
> denna lista täcker det som bara går att bekräfta i den körande appen med riktig data.
> Ordnad efter risk: kör uppifrån.

---

## Kalender 2.0 / #999 — prod-verifiering efter Drive-spärr

Den här sektionen gäller bokningshistoriken i #999 och ersätter den äldre direkta
`/staff?view=calendar`-vägen för just denna verifiering. Kör **endast** på
`https://arcana.hairtpclinic.com/admin#cco`.

### Grind före start

- [ ] Drive-importen är uttryckligen rapporterad **stabil/klar** och gemensam GO är given.
- [ ] #999 är retestad mot aktuell `main`, mergad och deployad enligt ordinarie process.
- [ ] Deploy-commit och `/readyz` är verifierade innan någon UI-kontroll börjar.
- [ ] Ingen manuell eller automatisk patientkoppling ska göras under kontrollen.

### Kalender → canonical kund

- [ ] Öppna `admin#cco → Kalender` och välj en bokning med känt canonical `patientId`.
- [ ] Klicka bokningen och välj **Öppna kund i V11/V12**.
- [ ] Browserns URL ligger kvar på `/admin#cco`; segmentet **Kunder** blir aktivt.
- [ ] Kunder-iframen använder `/staff?view=customers&v9=on&demo=off&embed=admin&v11rail=on&v12workspace=on&patientId=…`.
- [ ] `patientId` i Kunder-iframen är exakt samma canonical id som kalenderbokningen.
- [ ] V11 och V12 visar samma patient och samma besökstillfälle.

### Status och anteckningar per besök

- [ ] Kontrollera representativa besök med status **bokad**, **genomförd**, **avbokad** och **utebliven**.
- [ ] Datum/tid, behandling och status överensstämmer mellan Kalender och Kunder.
- [ ] Bokningsanteckning, intern anteckning och behandlingsanteckning visas på rätt besök.
- [ ] Saknade anteckningar visas som tomma/ärliga empty states; data flyttas inte mellan besök.

### Read-only reviewrapport

- [ ] Läs `GET /api/v1/cco-bookings/cliento-unlinked-review` i samma inloggade prod-session.
- [ ] Svaret har `Cache-Control: no-store`, `zeroWrites: true` och endast GET används.
- [ ] För den låsta Cliento-snapshoten är `total: 55`; avvikelse är **STOPP** och utreds via `byReason`.
- [ ] Varje rad visar `bookingId`, datum, maskerad `identityBasis` och exakt `reasonCode`/`reason`.
- [ ] Varje rad har `patientId: null`, `encounterId: null`, `linkAllowed: false` och `readOnly: true`.
- [ ] Inga råa e-postadresser, telefonnummer, Cliento-id:n eller kandidat-patient-id:n exponeras.

### Stopp och evidens

- [ ] Stoppa vid fel patient, olika `patientId`, fel besöksstatus, anteckningsläckage eller annat antal än 55.
- [ ] För collision/no-match: dokumentera boknings-id och orsak, men sök inte fram och skriv aldrig en gissningskoppling.
- [ ] Spara deploy-commit, tidpunkt, testade boknings-id:n, statusutfall och reviewrapportens totalsumma som verifieringsevidens.

---

## 0. Förberedelse

- [ ] #194 + #195 mergade till `main`
- [ ] Render-deploy klar för merge-commiten (bundle ombyggd, `?v=`-hashar uppdaterade)
- [ ] **Hård-refresh** i browsern (Cmd/Ctrl+Shift+R) — annars cachas gamla bundlen
- [ ] Inloggad med giltig `ARCANA_ADMIN_TOKEN` (Bearer) — annars 401 på data-anrop

## A. Grundvyer laddar (v8-utseende)

Öppna `…/staff?view=calendar`

- [ ] **Veckovyn** i v8-stil: tids-kolumn, 7 dagkolumner, positionerade bokningskort, idag-kolumn highlightad + **now-line** med klockslag
- [ ] **Dag**-fliken → en bred v8-kolumn
- [ ] **Resurs**-fliken → en kolumn per behandlare med antal-pill
- [ ] **Mobil** (≤768px): dagsvyn visar v8-listkort (rail-färg + status-tint)
- [ ] ~141 riktiga bokningar syns, rätt placerade i tid

## B. Bokning → kund-dossier (#17) — **högsta risk, testa noga**

- [ ] Klicka en bokning **med kund** → höger-panel växlar till kund-läge
- [ ] **Skeleton** visas kort, sedan dossiern (huvud, nyckeltal, sektioner)
- [ ] **Rätt patient** laddas (namn/kontakt matchar bokningen)
- [ ] Nyckeltal (Besök / Intäkt / Skuld) visar **riktiga värden**
- [ ] Sektioner (Kommande, Historik, Filer, Anteckningar, Kommunikation, Ekonomi, AI-insikter) fylls med riktig data — eller **ärlig empty-state** om tomt
- [ ] "‹ Tillbaka till bokning" + × återgår till boknings-läget; **Esc** stänger
- [ ] Kundkort/Journal-knapparna öppnar fulla kundvyn för rätt patient
- [ ] Klicka bokning **utan kund** (drop-in) → behåller boknings-intel, **ingen tom dossier**
- ❌ _Om dossiern är tom/fel:_ DevTools → Network → `cco-workspace/bootstrap` ska vara **200** (ej 401/500); verifiera att adapter-fälten matchar svaret

## C. Morgon-standup (data-binding)

Klicka **☼ Morgon**

- [ ] "Idag": antal bokningar + first/last-tid + day-spark stämmer mot verklig dag
- [ ] "Hantera först": riktiga risker (konflikter/saknade formulär) med rätt namn/tider — eller "Inga risker idag"
- [ ] "Fyll luckor": riktiga lediga tider
- [ ] "Prognos": meter visas (heuristik — inte AI)
- [ ] Busy-bar: beläggning per behandlare; Vibe-väder: emoji speglar dagens täthet; Watch: nästa riktiga bokning

## D. P3-interaktioner

- [ ] Densitet (Vanlig/Stressig/Maraton) komprimerar korten
- [ ] Lugnt läge dämpar visuellt
- [ ] **Scroll** fungerar i den höjdlåsta fullscreen-vyn (ingen klippt grid)
- [ ] Nav (‹ Idag ›), vy-växling, print, filter funkar
- [ ] Mic-knapp → toast "Röststyrning ej kopplad än" (förväntat skal)

## E. Regression (inget gammalt tappat)

- [ ] **Drag→omboka** en bokning (vecka + dag) → tid uppdateras
- [ ] Dubbelklick ledig lucka → ny bokning öppnas
- [ ] Öppna dagvy från dag-header
- [ ] Mobilkalenderns månadsgrid + dagslista

## F. Hälsa (DevTools)

- [ ] **Console:** inga röda fel när kalendern öppnas/interageras
- [ ] **Network:** inga 401/500 på `cco-workspace/bootstrap`, `patient/summary?includeDriveFiles`, kalender-range-anrop

---

## Medvetet uppskjutet (kräver backend/data — ej buggar)

- **Röstbokning (mic):** ärligt skal ("ej kopplad än"). Riktig röst→bokning behöver tal-/NLP-backend.
- **Predictive gold-dots:** utelämnade — ingen riktig prediktions-datakälla.

## Koordinationspunkt

- `ArcanaPatientMasterUi.loadDossierData(patientId)` i `patient-master-ui.js` (V12-ägd fil, **additiv** accessor för #17-sömmen — ingen beteendeändring). Bra om V12-tråden/Codex ser den vid granskning.
