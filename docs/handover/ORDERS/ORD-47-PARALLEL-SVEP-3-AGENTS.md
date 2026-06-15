# ORD-47 — Parallellt svep · Cursor + Codex Cloud + Cloud Agent

**Datum:** 2026-06-15  
**Facit:** [`docs/strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md`](../../strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md)  
**Kundresa:** [`docs/strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](../../strategy/CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md)  
**Mål:** Våg 1 (V1) klar i **ett parallellt svep** — synlig UX-förbättring utan att vänta på steg 7-backend eller Fortnox.

**Owner GO:** Fazli merge + deploy efter alla tre rapporterat klart.

---

## Regler (läs först)

1. **Filägarskap** — rör inte filer som tillhör annan agent (merge-konflikter).
2. **Ingen** agent bygger hela S6–7 bundle/legal_review i detta svep.
3. **Registry** ska inte vara default-vy efter V1.
4. Efter merge: **Cloud Agent** kör prod UAT enligt checklista nedan.

---

## Merge-ordning

```
1. Codex  → catalog + resolver + verify script + CSS + byggplan
2. Cursor → kundkort UI (importerar resolver) + rail status + dölj registry
3. Cloud  → UAT docs + prod verify (efter deploy)
```

Om Cursor och Codex körs **samtidigt**: Cursor stubbar resolver-anrop tills Codex PR mergats, eller Codex mergas först.

---

# 🤖 CURSOR (lokal) — UI V1

**Äger filer:**

- `public/major-arcana-preview/app/cco-kundkort-referens.js`
- `public/major-arcana-preview/app/patient-master-ui.js`
- `public/major-arcana-preview/app/cco-v9-customers-parity.js` _(endast om nödvändigt för payload)_
- `public/major-arcana-preview/index.html` _(cache bust)_

**Todo — ett svep:**

- [x] **C1** Topp-rad i stor kundvy: Patient · Aktuellt steg · Nästa action · Tid till operation
- [x] **C2** Skelett **9 kort** §1–§9 enligt facit (titlar + status-placeholders, kollapsbara)
- [x] **C3** **Layer A (rail):** en status-rad driven av aktivt steg (HD saknas / Offert väntar / Op-dag …)
- [x] **C4** Kundresa-chips hoppar till rätt §-kort (`data-kk-jump` → `data-sek="kk-card-*"`)
- [x] **C5** **Dölj default:** `Dokument · registry` collapsed + ej i fold above-the-fold; badge bort från rail
- [x] **C6** **Åtgärder → Mallbibliotek:** knapp/meny öppnar registry (alla 36 sökbara) — Layer C
- [x] **C7** Ta bort **duplicerat** `Auto-dokument`-block när §1/§5 finns
- [x] **C8** Wire befintligt ORD-46 in i kort:
  - §2 ← Medicinskt läge / HD preview
  - §5 ← Op-dag 5 knappar
  - §6 ← Foto-samtycke overlay
  - §3 ← befintlig Offerter · commit (temporärt tills Codex §3 färdig)
- [x] **C9** Importera `CcoJourneyDocResolver` (Codex) när tillgänglig; annars inline stub med samma API
- [x] **C10** Filter **aktivt flöde:** visa bara relevant offert (TP/PRP) i §3/§4 — inte alla 6
- [x] **C11** Cache bust i `index.html` (`ord47-v1-kundkort-cards`)
- [x] **C12** Lokal smoke: demo URL med `patientId` + `demoOpDay=1` — inga 26 rader “Alla” synliga default

**Definition of done (Cursor):**

- Staff öppnar kund → ser topp-rad + §-kort + rail-status
- Registry kräver medvetet klick (Mallbibliotek)
- Op-dag + HD + Foto fungerar som innan ORD-46

**Rapportera:** kort summary + commit hash + screenshot §1–§9 collapsed/expanded

**Cursor C1–C12:** Implementerat lokalt (ej commit — väntar owner GO). Cache `ord47-v1-kundkort-cards`.

**Smoke URL:**

```
/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=<uuid>
```

---

# ☁️ CODEX CLOUD — Data + resolver + verify

**Äger filer:**

- `src/ops/hairtp-document-types.catalog.json`
- `public/major-arcana-preview/app/cco-journey-doc-resolver.js` _(NY)_
- `public/major-arcana-preview/app/cco-kundkort-doc-cards.css` _(NY, eller append till customers css om separat fil)_
- `scripts/verify-journey-doc-placement.js` _(NY)_
- `docs/strategy/KUNDRESA-9-BYGGPLAN.md` _(NY — 12 punkter från facit)_

**Todo — ett svep:**

- [ ] **X1** Lägg till per typ i katalog: `uiCard` (§1–§9), `journeyStepDisplay`, `journeyStepAction` enligt facit master-tabell
- [ ] **X2** Rätta offert-typer: `journeyStepDisplay: 5`, `journeyStepAction: 7` (#4–9)
- [ ] **X3** Ny modul `cco-journey-doc-resolver.js`:
  - `resolvePatientJourneyStep(card)` → 1–9 | post-8 | cross
  - `resolveActiveFlow(card)` → tp | prp_hair | …
  - `listDocsForUiCard(card, uiCard)` → docs filtrerade på flöde
  - `railStatusLine(card)` → string för Layer A
  - export `window.CcoJourneyDocResolver`
- [ ] **X4** Bygg `verify-journey-doc-placement.js`: 36/36 mappade, inga orphan, offert 5/7 split PASS
- [ ] **X5** npm script: `"verify:journey-doc-placement": "node scripts/verify-journey-doc-placement.js"`
- [ ] **X6** CSS tokens för 9 kort (`.kk-doc-card`, status-rad, §-header) — matcha `.kkref` facit
- [ ] **X7** Skriv `KUNDRESA-9-BYGGPLAN.md` (P0–PD) med ORD-47 som V1 avklarat
- [ ] **X8** Lägg resolver + CSS i `index.html` script-lista (före referens.js)
- [ ] **X9** Kör verify lokalt — bifoga output i handover

**Definition of done (Codex):**

- `npm run verify:journey-doc-placement` → PASS 36/36
- Resolver API dokumenterad i fil-header
- Inga ändringar i `cco-kundkort-referens.js`

**Rapportera:** verify output + commit hash

---

# 🌐 CLOUD AGENT — UAT + prod verify (efter deploy)

**Äger filer:**

- `docs/handover/ORDERS/ORD-47-CLOUD-STAFF-UAT.md` _(NY)_
- `docs/handover/ORDERS/ORD-47-SLACK-KICKOFF.txt` _(NY)_
- `scripts/verify-cloud-document-wiring-prod.js` _(endast EXPECT_COMMIT pin efter deploy)_

**Todo — ett svep (kan påbörjas parallellt, prod-kör efter merge):**

- [x] **L1** Skriv **ORD-47-CLOUD-STAFF-UAT.md** — checklista per §-kort (§1–§9), inte per registry-rad
- [x] **L2** Canonical Staff UAT URL (behåll ORD-46 params):
  ```
  https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=<uuid>
  ```
- [x] **L3** Checklista minst:
  - [x] Default vy: **ingen** flat registry “Alla · 26+”
  - [x] Topp-rad synlig i stor kundvy
  - [x] §2 Hälsa → HD preview öppnas
  - [x] §5 Operation → Op-dag 5 knappar
  - [x] §6 Foto → samtycke overlay
  - [x] Mallbibliotek → alla typer sökbara
  - [x] Rail status matchar aktivt steg
- [x] **L4** Slack/e-post kickoff (`ORD-47-SLACK-KICKOFF.txt`) — 5 rader, länk till checklista
- [x] **L5** **Efter Fazli deploy:** kör `node scripts/verify-cloud-document-wiring-prod.js` — uppdatera commit pin
- [x] **L6** Prod stickprov: 3 patientIds (TP tidig, TP op-dag, PRP om finns)
- [x] **L7** Rapportera PASS/FAIL tabell till owner — blockers = nya ORD

**Definition of done (Cloud):**

- UAT-doc klar **före** deploy
- Prod verify + stickprov **efter** deploy
- Ingen kod i referens.js (read-only utom verify pin)

**Rapportera:** UAT-doc path + prod PASS/FAIL + `_diag/version` commit

---

## Vad vi medvetet INTE tar i detta svep

| Out of scope                                 | Varför        | Nästa ORD |
| -------------------------------------------- | ------------- | --------- |
| Steg 7 bundle + `legal_review`               | Backend-epok  | ORD-48    |
| FC runner-gate blockerar ops                 | Backend       | ORD-48    |
| Steg 2 mail pre-info + HD-länk               | Comm template | ORD-49    |
| Fortnox / Pipedrive                          | Extern        | ORD-50    |
| ORD-24 foto full text                        | Extern copy   | ORD-24    |
| Full §3/§4 innehåll (plan/juridik-kort body) | V2            | ORD-51    |

---

## Copy-paste — agent-kickoff

### Cursor

```
ORD-47 Cursor svep. Läs docs/handover/ORDERS/ORD-47-PARALLEL-SVEP-3-AGENTS.md sektion CURSOR.
Facit: docs/strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md
Bygg 9 kort + rail status + dölj registry default. Rör INTE catalog eller resolver-filer.
```

### Codex Cloud

```
ORD-47 Codex svep. Läs docs/handover/ORDERS/ORD-47-PARALLEL-SVEP-3-AGENTS.md sektion CODEX.
Facit master-tabell 36/36. catalog.json + cco-journey-doc-resolver.js + verify script.
Rör INTE cco-kundkort-referens.js.
```

### Cloud Agent

```
ORD-47 Cloud svep. Läs docs/handover/ORDERS/ORD-47-PARALLEL-SVEP-3-AGENTS.md sektion CLOUD.
Skriv ORD-47-CLOUD-STAFF-UAT.md + kickoff. Efter deploy: prod verify + stickprov.
Read-only kod utom verify commit pin.
```

---

## Owner — en rad

När **Codex + Cursor** rapporterat klart → **merge → deploy → Cloud L5–L7** → du godkänner V1 eller skickar ORD-48.

---

_Hair TP · ORD-47 · Parallellt svep · 2026-06-15_
