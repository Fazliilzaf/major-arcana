# Estetik-journalens fält — ORD-126

**Datum:** 2026-08-27
**Syfte:** Dokumentera vilka fält den genererade Curatiio estetik-journalen får, var
fälten/strukturen kommer ifrån (generator + rad), och vad QA- respektive safety-steget
tillför. Underlaget är de åtta Curatiio demo-journalerna
(`public/major-arcana-preview/steg8-journal-*-curatiio-final-demo.html`) och de fyra
generator-/stödsidorna som workflowen pekar på.
**Källa (sanning):** `public/major-arcana-preview/cco-workflow-curatiio.html` §3 ·
`cco-workflow-v13.html` · demo-journalerna.

---

## 0 · Inledning — vad är egentligen "generatorn"?

Workflow-sidan (`cco-workflow-curatiio.html` rad 711–716) säger att estetik-journalen
"genereras" av fyra filer. **Det stämmer inte bokstavligen.** De fyra filerna är
*pipeline-stöd* — ett index-, ett QA- och ett safety-lager — men de **producerar inte
fält**. De konkreta fälten lever i de åtta `steg8-journal-*-curatiio-final-demo.html`
(plus en generisk `steg8-estetik-journal-curatiio-final-demo.html`), som var och en är
en **fristående, per-behandlingsmall** med sina egna fält.

| Fil i workflow-sidan rad 714–715 | Vad den faktiskt är | Producerar fält? |
| --- | --- | --- |
| `cco-journalbygge-v3.html` | **Index/översikt** "Journalbygge" — pekar på live-demos, API-endpoints och hävdar TP-fält-paritet (52/52). | Nej |
| `cco-journal-qa-v3.html` | **QA-dashboard** "Journal Cutover QA" — 5 statusblock. | Nej (mäter) |
| `cco-journal-safety-v3.html` | **Safety-helper** "Journal Safety" — 6-punkts checklista före signering. | Nej (gate) |
| `journal-plan-editor-demo.html` | **Fristående demo** av `app/journal-plan-editor.js` — rita zoner/grafts på skalpbild (Hair TP, ej estetik). | Nej (plan-ritning) |

Slutsats: fältkälla = demo-journalerna. Fälten **skiljer sig per behandling** — varje
mall har en gemensam "skalstruktur" (administratör, patientstatus, observation före,
läkemedel/tid, samtycke) men en behandlingsspecifik mittsektion.

---

## 1 · Gemensam skalstruktur (alla behandlingar)

Nummeringen varierar (7 avsnitt för icke-kirurgiska, 8 för ögonlocksplastik). Fälten
nedan är de **gemensamma** som återfinns i varje mall. Källa = demo-filens `data-i18n`-karta
plus `<label>`/`data-field`-markup.

| # | Sektion | Fält | Källa (demo) |
| --- | --- | --- | --- |
| 1 | Administratör / patientinfo | Patient (`fx-patient`), Legitimation (`fx-legitimation`, ID-kontroll t.ex. körkort/pass), Datum (`fx-datum`) | `steg8-journal-botox-…-final-demo.html` rad 518–543 |
| · | Patientstatus | Riskfaktorer/kontraindikationer (`data-field="risker"`), Gravid/ammar/försöker bli gravid (`gravid`), Blodförtunnande (`blodfortunnande`), Allergier (`allergi`), Tidigare samma behandling (`tidigare-botox`/`-filler`/`-profhilo`/`-mesoterapi`/`-microneedling`/`-prp`/`-op`) | t.ex. botox rad 738–825 |
| · | Observation före | Hudkondition/status/asymmetri/hudtyp (`fx-hud`), Före-bilder tagna + bifogade (checkbox `check-forebilder`) | botox rad 827–859 |
| · | Läkemedel / tidsregistrering / användning | Läkemedel? (`lakemedel`), Starttid (`fx-tid-start`), Sluttid (`fx-tid-slut`), Datum (`fx-datum-beh`), Nål/teknik/injektionsdjup (`fx-utrustning`) | botox rad 861–908 |
| · | Samtycke & underskrift | Risker/nytta förklarade, Graviditetskoll, Samtidig medicinering, Foto-användning (Steg 9), Samtycke till utförd behandling (5 checkboxes); Behandlare (`fx-sig-behandlare`, auto-fylls från inloggad CCO-användare), Datum (`fx-sig-behandlare-datum`) | botox rad 910–1028 |

> Sektionerna "Samtycke & underskrift" och "Administratör" är identiska i alla mallar.
> `fx-sig-behandlare` är den enda personalposten som fångas som organisationsidentitet.

---

## 2 · Behandlingsspecifika mittsektioner (fälten som skiljer)

Varje mall har en typisk "2 · `<Behandling>`-behandling" och/eller "3 · Dosering/volym"
med behandlingsspecifika fält. Här är diffen per behandling.

| Behandling | Sektion | Behandlingsspecifika fält |
| --- | --- | --- |
| **Botox** | 2 · Botox-behandling | Områden som injiceras (Panna, Glabella, Tinningar, Kindben, Nasolabial, Käklinje, Läppar, Hals, Ögon) |
| | 3 · Tjocklek / dosering | Preparat (`fx-preparat`, t.ex. Botox 100 IE), Enheter per område IE (`fx-enheter-omrade`), Total dos IE (`fx-total-ie`), Spädning/utspädning (`fx-spadning`, t.ex. 2,5 ml NaCl) |
| **Fillers** | 2 · Filler-behandling | Produkt (HA/filler) (`fx-produkt`), Volym per region ml (`fx-volym-region`), Total volym ml (`fx-total-volym`), Kanyl/nål (`fx-kanyl`) |
| **Profhilo** | 2 · Profhilo-behandling | Produkt (Profhilo) (`fx-produkt`), Antal injektioner/punkter (`fx-antal`) |
| | 3 · Dosering & volym | (volym/fördelning) |
| **Mesoterapi** | 2 · Mesoterapi-behandling | Preparat/produkt (`fx-preparat`), Volym ml per punkt/område (`fx-volym`), Injektionsteknik (`fx-injektionsteknik`) |
| **Microneedling** | 2 · Microneedling-behandling | (behandlingstyp) |
| | 3 · Dosering & tillämpning | Djup mm (`fx-djup`), Enhet/Dermapen (`fx-enhet`), Bedövning (`fx-bedovning`), Serum/produkt (`fx-serum`), Teknik (`fx-teknik`) |
| **PRP-hud (+MN)** | 2 · PRP-behandling | (PRP) |
| | 3 · Dosering & volym | PRP-volym ml (`fx-prp-volym`), Förberedelse/centrifugering (`fx-beredning`), Injektionsteknik (`fx-injektionsteknik`), Spädning (`fx-spadning`) |
| **Ortopedi** | 2 · Ortopedi-behandling | (injektion) |
| | 3 · Dosering & volym | Produkt (`fx-produkt`), Volym ml (`fx-volym`), PRF-preparation (`fx-prf-preparation`), Teknik/injektion (`fx-injektion`) |
| | Observation före | Ledstatus/kondition (`fx-kondition`) — ersätter hudkondition |

---

## 3 · Undantaget: ögonlocksplastik (op) — `steg8-journal-bleph-…-final-demo.html`

Ögonlocksplastik har **8 avsnitt** (inte 7) och är kirurgisk. Där tillkommer en
operations-kedja som de sju andra inte har:

| # | Sektion | Fält |
| --- | --- | --- |
| 2 | Bleph-planering | (pre-op) — plus checkbox `preop-friskforsakran` ("Friskförsäkran godkänd", rad 646) |
| 3 | Kirurgi | Blodtryck (`fx-blodtryck`), Incision (`fx-incision`), Excision/mängd (`fx-excision`), Suturer (`fx-suturer`), Teknik (`fx-teknik`) |
| 4 | Post-op | Vård (`fx-postop-vard`), Komplikationer? (`data-field="komplikationer"`), Återbesök (`fx-aterbesok`) |
| 7 | op-dag | **Friskförsäkran på operationsdagen** (sektion `sec7` rad 871) + före-bilder/op-status |

Detta är ORD-129:s vägvariant (kirurgi → `minorSurgery`, steg 8 = friskförsäkran) men här
nöjer vi oss med katalogtypen: **Estetik-journal (op)** + en friskförsäkran på op-dag.

---

## 4 · Vad QA-steget tillför (`cco-journal-qa-v3.html`)

"Journal Cutover QA-dashboard" — ett **mät-/verifieringslager** ovanpå journalkedjan,
inte en fältgenerator. Det läser befintliga journaldata och rapporterar i 5 statusblock:

1. **Importstatus** — senaste import-runs + antal importerade poster.
2. **Matchningsstatus** — hur väl importerade poster matchar patienter.
3. **Journalstatus** — antal journal-entries vs. förväntat, t.ex. `totalPatientsWithMissingJournalPdfs`.
4. **Bildstatus** — bilder/fore-efter-länkning.
5. **Cutover Readiness** — sammanvägd READY/NOT_READY med per-kategori-fel (koden rad 1480 t.ex. "Patienter med saknad journal-PDF").

QA tillför alltså **verifieringssignaler** (importerade journal-PDF:er, matchning,
readiness-rapport) — det genererar inga fält utan validerar den data som redan finns.

## 5 · Vad safety-steget tillför (`cco-journal-safety-v3.html`)

"Journal Safety Helper" (Hair TP Clinic, 4 juni 2026) — en **6-punkts checklista** som är
en mänsklig SOP-grind innan en journal får signeras. Den genererar inga fält; den styr
*om* signering är tillåten:

1. Är rätt patient verifierad?
2. Är journaltexten för rätt besök?
3. *(STOPP-villkor)* — om "nej": skriv om journalen från patientens muntliga uppgifter och eskalera.
4. Är detta en rättelse? Skapa då ny post (aldrig tyst edit).
5. Signera först när allt är kontrollerat.
6. Vid osäkerhet: eskalera (admin/ops för identitet/dubbletter, Fazli för tekniska fel).

Safety tillför **mänsklig signaturgrind + korrigera-som-ny-post-regel**. På motsvarande
sätt som QA inte skriver fält, skriver safety inga fält — det blockerar/beviljar signering.

## 6 · Vad `journal-plan-editor-demo.html` gör med resultatet

Den laddar `app/journal-plan-editor.js` och öppnar en **planritare** över en bild
(skalp/hårlinje) där man ritar zoner och fyller i grafts per zon (`zones`, `graftsTotal`,
`notes`, `staffNotes`). Det är behandlingsplan-ritning — en **Hair TP-artefakt** som
knyts till offert/behandlingsplan. Den tar INTE emot estetik-journalfält; den är en
oberoende plan-editor-demo.

---

## 7 · Katalog-mappning (hur detta blir rader i `hairtp-document-types.catalog.json`)

Eftersom fälten/mallarna skiljer sig per behandling (kapitel 2) läggs **en rad per
behandling** som saknar journal-typ i dag. PRF-hud / Microneedling / PRP-hud (+MN)
är **redan täckta** av befintlig rad `journal_prp_multi` (`flowApplies:
[prp_hair, prp_skin, prf, microneedling]`, `clinics: ["hairtp","curatiio"]`) — de
dupliceras inte. Se själva katalog-filen.

| Ny rad | flowApplies | requiredFor | Kommentar |
| --- | --- | --- | --- |
| `journal_estetik_botox` | `["botox"]` | `["behandlingsdag"]` | Estetik-journal (Botox) |
| `journal_estetik_filler` | `["filler"]` | `["behandlingsdag"]` | Estetik-journal (Fillers) |
| `journal_estetik_profhilo` | `["profhilo"]` | `["behandlingsdag"]` | Estetik-journal (Profhilo) |
| `journal_estetik_ortopedi` | `["ortopedi"]` | `["behandlingsdag"]` | Estetik-journal (Ortopedi) |
| `journal_estetik_op` | `["op"]` | `["op_dag"]` | **Estetik-journal (op)** — ögonlocksplastik, kirurgi |
| `friskfoers_curatiio_op` | `["op"]` | `["op_dag"]` | **Friskförsäkran på op-dag** (endast kirurgi) |

`flowApplies`-värden `botox`, `filler`, `op`, `ortopedi` är **nya** (både i `resolvePrimaryFlow`
i `ccoPatientDocumentAggregator.js` och i katalog-raden). `profhilo` är befintligt.
`requiredFor` väljs så att en Curatiio-patient utan journal ger en `document.requiredFor.behandlingsdag`
("krävs för behandlingsdagen") respektive `document.requiredFor.op_dag` för kirurgi.
