# First 3 Patients · Pilot Plan · 4 juni 2026

> Strukturerad plan för de tre första patienterna i journalpiloten. Varje patient testar ett specifikt scenario. **Stoppa om något avviker.**

---

## Mål

Verifiera att journalflödet fungerar i live-läge med tre kontrollerade tester. Personalen ska känna sig säkra på flödet **innan** de fortsätter med dagens övriga patienter.

**Tidsåtgång:** ~45 min totalt (15 min/patient).
**Vem är på plats:** Personal (utför) · Egzona (observerar/stöd) · Fazli (Command Center + Render-loggar).

---

## Patient 1 — Enkel journal (rent flöde)

**Mål:** Verifiera grundflöde create → signera utan rättelse, utan importerad historik.

**Förutsättningar:**
- Patient: känd patient utan komplicerad historik (välj från dagens bokningar)
- Helst en återkommande patient där identitet är trivial
- Helst utan importerade dokument i kundkortet

**Personalens steg:**
1. Verifiera identitet (namn + telefon + Cliento-id) — alla tre matchar
2. Öppna kundkort
3. Klicka Journal-fliken
4. Klicka "Ny anteckning" → välj mall **Konsultation**
5. Skriv kort: datum + observation + plan (2–4 meningar)
6. Spara som draft
7. Öppna Pre-Signering Check i sido-flik → bocka 5 punkter
8. Klicka "Signera" → bekräfta

**Verifiera efter patient 1:**
- [ ] Posten syns i journalfeeden med "signerad"-badge
- [ ] Timeline-fliken visar posten kronologiskt
- [ ] Render-loggar visar inga 5xx (kolla Command Center)
- [ ] Personalen säger att det kändes naturligt

**Stoppa om:**
- Spara-knappen hänger > 5 sek
- Signera ger fel eller posten låses inte
- Sidan ser trasig ut
- Personalen är osäker på vad de gjorde

---

## Patient 2 — Journal + rättelse-test

**Mål:** Verifiera rättelse-flödet på en ny signerad post (test, inte verkligt fel).

**Förutsättningar:**
- Annan känd patient
- Personalen är redo att skapa en post som de medvetet "rättar" för att öva flödet
- Detta är **inte** en verklig rättelse — det är ett kontrollerat test

**Personalens steg:**
1. Steg 1–8 som Patient 1 (skapa + signera första posten)
2. Öppna den signerade posten
3. Klicka "Skapa rättelse"
4. Skriv det korrigerade i sin helhet: "Rättelse — kompletterar med [detalj]"
5. Ange anledning: "ny info" (eller "förtydligande")
6. Spara
7. Pre-Signering Check igen → bocka 5 punkter
8. Klicka "Signera" på rättelsen

**Verifiera efter patient 2:**
- [ ] Båda posterna syns i journalfeeden (original + rättelse)
- [ ] Timeline visar dem kronologiskt med tydlig länk mellan dem
- [ ] Originalet är fortfarande "signerad" — INTE ändrad
- [ ] Rättelsen visar "signerad" + referens till originalet
- [ ] Render-loggar tysta

**Stoppa om:**
- "Skapa rättelse"-knappen saknas eller är gråad
- Rättelsen ändrar originalet direkt (det får ALDRIG hända)
- Timeline visar dem felaktigt eller saknar länk
- Personalen är förvirrad över vad rättelse är

---

## Patient 3 — Historik + review-material-varning

**Mål:** Verifiera att personalen förstår "Behöver granskning"-material och INTE använder det som klinisk sanning.

**Förutsättningar:**
- Känd patient som **har importerad historik** (badges: `imported`, `needs review`, `drive`, `halso@`)
- Helst en patient som har material från Drive eller halso@-mailbox

**Personalens steg:**
1. Verifiera identitet
2. Öppna kundkort
3. **Innan journal:** öppna Historik-fliken — peka på badges, läs material
4. **Öppna Review-Material Warning** i sido-flik (`/cco-review-material-warning.html`)
5. Bekräfta mentalt: "Detta är referens, inte klinisk sanning"
6. Klicka Journal-fliken → "Ny anteckning"
7. Skriv en post som hänvisar till patientens **muntliga** uppgifter (inte direkt till det importerade)
   - Korrekt: "Patienten uppger att tidigare behandling X gjordes 2023"
   - Felaktigt: "Enligt importerad journal gjordes behandling X 2023"
8. Pre-Signering Check → signera

**Verifiera efter patient 3:**
- [ ] Personalen kunde särskilja review-material från klinisk sanning
- [ ] Journalen är formulerad korrekt (patienten uppger... INTE importerad sägeR...)
- [ ] Importerad historik syns men användes som referens
- [ ] Personalen förstår vad de INTE ska göra
- [ ] Render-loggar tysta

**Stoppa om:**
- Personalen kopierade text från review-material direkt till journalen
- Personalen baserade en diagnos/plan på oferifierat material
- Personalen är osäker på vad badges betyder
- Importerat material renderas som om det vore klinisk sanning (rendering-bug)

---

## Vad ska verifieras efter varje patient

| # | Check | Verktyg |
|---|---|---|
| 1 | Journal-feed visar nya posten | Kundkort → Journal-fliken |
| 2 | Timeline visar kronologi (+ rättelse-länk om P2) | Kundkort → Timeline-fliken |
| 3 | Render-loggar tysta (inga 5xx) | Command Center · Render dashboard |
| 4 | Personalen kan beskriva vad de gjorde | Egzona/Fazli frågar muntligt |
| 5 | Gate fortsatt grön | `npm run cco:presentation-gate` |

---

## Avbrytningskriterier (stoppa hela pilot dag 1)

Pilot stoppas direkt och Fazli kallas in om något av nedan inträffar:

- **5xx-fel** i journal-API mot Render
- **Signerad post går att ändra direkt** (det får aldrig hända)
- **Rättelse skapas på fel patient** (binding-bug)
- **Importerat material kopieras till klinisk journal** utan att personalen markerar källan
- **Trasig UI-rendering** på journalsidan
- **Identitet-bug** där fel kundkort öppnas

---

## När gå vidare till "vardagsläge"

Efter att alla 3 testpatienter är klara och alla checks är gröna:

- ✅ Fazli säger "vi fortsätter" till personalen
- ✅ Personalen kör vidare med dagens övriga patienter med samma flöde
- ✅ Egzona fortsätter övervaka Ops Workbench
- ✅ Fazli observerar Render-loggar passivt resten av dagen
- ✅ Vid slutet av dagen — kör `npm run cco:presentation-gate` igen, dokumentera dag-1-resultat

---

## Dokumentation efter pilot dag 1

| Vad | Var |
|---|---|
| Hur många journaler signerades | Daily Readiness 2026-06-04 |
| Rättelser skapade | Daily Readiness |
| Fel/incidenter | Append till CCO-DAILY-READINESS-2026-06-04.md |
| Personalens feedback | Mun-till-mun → Fazli dokumenterar |
| Gate-resultat slutet av dagen | preflight + E2E reports |

---

_Hair TP Clinic · 4 juni 2026 · Journalpilot dag 1 — First 3 Patients Plan_
