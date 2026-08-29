# ORD-126 · Estetik-journalen finns inte — åtta Curatiio-behandlingar delar ett tomrum

**Arbetsorder · 2026-08-27**
**Bas:** `main` (`9589d47a`)
**Till:** DeepSeek
**Underlag:** `public/major-arcana-preview/cco-workflow-curatiio.html` och
`cco-workflow-v13.html` — Fazlis två workflow-sidor. Läs dem först, de är
sanningen om vad som ska finnas.

---

## Vad jag mätte

Curatiio-sidan listar **åtta behandlingar**. Alla åtta pekar på samma
journaltyp:

| Behandling                    | Journaltyp enligt sidan | Extraherat dokument |
| ----------------------------- | ----------------------- | ------------------- |
| Botox (botulinumtoxin)        | Estetik-journal         | **saknas**          |
| Fillers                       | Estetik-journal         | **saknas**          |
| Profhilo                      | Estetik-journal         | **saknas**          |
| Ögonlocksplastik              | Estetik-journal (op)    | **saknas**          |
| PRF-hud (PRF + microneedling) | Estetik-journal         | **saknas**          |
| Microneedling                 | Estetik-journal         | **saknas**          |
| PRP-hud + microneedling       | Estetik-journal         | **saknas**          |
| Ortopedi                      | Estetik-journal         | **saknas**          |

Sidan skriver ut det själv: estetik-journalen **genereras** av
`cco-journalbygge-v3.html` · `cco-journal-qa-v3.html` ·
`cco-journal-safety-v3.html` · `journal-plan-editor-demo.html`.
Alla fyra filerna finns i `public/major-arcana-preview/`.

Jämför med Hair TP, där varje journal är extraherad ur Meridiq med
verkliga fält — TP-journal **52 fält**, post-PRP **24**, uppföljning 4/8
**8**, 12-månadersresultat **12**. För estetik finns noll fält.

### Katalogen bekräftar samma hål

`src/ops/hairtp-document-types.catalog.json` — 39 rader:

- **38** har `clinic: "hairtp"`
- **1** har `clinic: "curatiio"` — `offert_profilo`, och det är en offert,
  inte en journal

`flowApplies` fördelar sig så här: `['all']` 15, `['tp']` 13,
`['prp_hair']` 3, `['microneedling']` 2, `['hud']` 2, och en vardera för
`prp_skin`, `prf`, `profhilo`. Ingen rad heter estetik-journal.

**Slutsats:** åtta behandlingar på en klinik som är i drift har ingen
journaltyp i katalogen. Aggregatorn kan därför aldrig visa "journal
saknas" för en Curatiio-patient, och readiness-motorn kan aldrig blockera
på den.

---

## Uppgiften

### 1 · Ta reda på vad generatorerna faktiskt producerar

De fyra filerna ovan är byggda. Läs dem och skriv ner, i text:

- vilka fält en genererad estetik-journal får
- om fälten skiljer sig per behandling eller är samma mall för alla åtta
- vad QA-steget (`cco-journal-qa-v3`) respektive safety-steget
  (`cco-journal-safety-v3`) tillför
- vad `journal-plan-editor-demo` gör med resultatet

**Gissa inte.** Om en generator inte går att köra utan data, säg det.

### 2 · Lägg in estetik-journalen i katalogen

När fälten är kända: en rad per journaltyp som behövs. Minst en
(`journal_estetik`), fler om behandlingarna kräver olika mallar — det
avgörs av vad du hittar i steg 1, inte i förväg.

Varje rad ska ha samma fält som Hair TP-raderna redan har:
`clinic: "curatiio"`, `filler`, `journeyStep`, `uiCard`, `requiredFor`,
`flowApplies`, `formProvider`, `legallySensitive`.

`flowApplies` ska matcha de befintliga värdena — `hud`, `prf`,
`microneedling`, `prp_skin`, `profhilo` finns redan. Botox, fillers,
ögonlocksplastik och ortopedi har inga flöden i dag och behöver få det.

### 3 · Ögonlocksplastik är undantaget

Den är kirurgisk och utförs på Curatiio. Den ska ha **estetik-journal
(op)** plus friskförsäkran på operationsdagen, precis som sidan säger.
Behandla den inte som de sju andra.

Se ORD-129 — den handlar bara om ögonlocksplastikens vägvariant och ska
göras separat.

---

## Godkänt när

1. Det finns ett textdokument som listar estetik-journalens fält, med
   källa (vilken generator, vilken rad).
2. Katalogen har rader för Curatiios journaler, och
   `ccoPatientDocumentAggregator` plockar upp dem för en Curatiio-patient
   utan ny hårdkodning.
3. En Curatiio-patient utan journal ger en `document.requiredFor.*`-signal
   — alltså samma mekanik som Hair TP redan har, inte en parallell.
4. Inget dokument godkänns av kod. `pending` är fortfarande rätt förval.

## Rör inte

- `CCO_SEND_LIVE` — ska vara `"false"`.
- Hair TP-radernas befintliga fält.
- De två workflow-sidorna. De är underlag i den här ordern, inte
  leveransen.
