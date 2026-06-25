# CCO-Kalender v8 — Live-smoke (efter merge + deploy)

> Kör denna checklista i **prod** efter att kalender-PR:erna (#194 v8 P1, #195 v8 P2+P3+#17)
> mergats till `main` och Render deployat. Statiskt verifierad via harness under bygget —
> denna lista täcker det som bara går att bekräfta i den körande appen med riktig data.
> Ordnad efter risk: kör uppifrån.

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
