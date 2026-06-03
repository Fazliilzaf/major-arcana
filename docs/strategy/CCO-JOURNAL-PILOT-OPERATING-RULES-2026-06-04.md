# Journalpilot · Driftregler · 4 juni 2026

> Operativa regler för journalpiloten på Hair TP Clinic. Gäller från personalmötet 4 juni 2026 tills uttryckligt go-live-beslut tagits för vardagsläge. **Pilot är inte cutover** — det är kontrollerad start.

---

## 1 · Pilotens omfattning

**I scope:**
- Journalföring i CCO på kända patienter via `/kunder.html` → kundkort → Journal-fliken
- Identitetsverifiering före varje signering
- Rättelse av signerade poster (alltid som ny länkad post)
- Läsning av importerad historik som **referens**
- Personalmöte 4 juni 2026 + första veckans rollout enligt First Week Rollout Plan

**Inte i scope (uttryckligt undantaget):**
- Mail-worklist som dagligt verktyg (aktivering pågår — inte produktionsklar)
- Photo Review som klinisk bildsanning (~885 assets pending, write AV på prod)
- Aisia / kamera/scalp-spår (bakom feature flag — kräver explicit "APPLY AISIA TO CCO")
- Fortnox-write (license error på Fortnox-sidan)
- Drive-import batch 2 (pausad — kräver explicit owner-GO)
- Mail-import (ny batch — pausad)
- Extern AI på journaltext (ChatGPT/Claude/Copilot — förbjudet GDPR-policy)
- OCR/AI auto-classify (inte aktivt)
- Full cutover (definieras tidigast efter 4 veckors stabil pilot)

---

## 2 · Vem får journalföra

| Roll | Får journalföra | Får inte journalföra |
|---|---|---|
| Behandlare / sköterska / läkare | ✅ Ja — efter avklarad Training Mode + Sign-off + Training Completion | — |
| Reception | ✅ Endast administrativa noteringar (bokningsändringar, kontakt-info) | ❌ Inga kliniska anteckningar |
| Operator / admin (Egzona) | ✅ Endast korrigeringar via rättelse efter eskalering | ❌ Inte nya kliniska poster |
| Fazli / owner | ✅ Får skapa journalposter som behandlare | — |
| Revisor / observatör | ❌ | ❌ Ingen patientdata-åtkomst |
| Cursor / Claude (AI) | ❌ | ❌ Aldrig — system bygger UI, inte journal |

**Förutsättning:** Varje journalförande personal har:
1. Gått igenom Training Mode (`/cco-staff-training-mode.html`)
2. Skrivit under Sign-off Sheet (`/journal-pilot-signoff-sheet.html`)
3. Bekräftat Training Completion (`/cco-staff-training-completion.html`)

---

## 3 · Vilka patienter först

**Dag 1 (4 juni):**
- 1-3 testpatienter enligt First 3 Patients Pilot Plan (pilotkund A/B/C eller motsvarande)
- Sedan första riktiga: **känd, lugn patient** som personalen redan haft

**Dag 2-5 (5-10 juni):**
- Fortsatt kända patienter — inga nya patienter dag 2
- Patienter med importerad historik tillåts dag 3+
- Nya patienter (ej tidigare i Cliento) först dag 4+ efter feedback-runda

**Aldrig under pilot:**
- Akut-besök som dyker upp utan bokning (osäkert flöde)
- Patient under 18 år utan vårdnadshavare-kontroll
- Patient som ifrågasätter sin journal eller historik vid besök
- Patient som specifikt vill diskutera Photo Review-material

---

## 4 · Identitetskrav

**Tre obligatoriska bekräftelser före signering:**

| # | Vad | Hur |
|---|---|---|
| 1 | **Namn** | Patienten säger sitt fulla namn själv (inte personalen säger åt dem) |
| 2 | **Telefon** | Sista 4 siffrorna matchar Cliento-id |
| 3 | **Cliento-id** | Visas i kundkortets header — verifieras visuellt |

**Om något av tre inte stämmer:**
- Säg: *"En sekund så dubbelkollar jag."*
- Eskalera till admin/ops (Egzona)
- Skapa **aldrig** ny kund vid tvekan

**Stickprov av admin/ops:**
- Egzona observerar identitetsverifiering på minst 1/personal/dag första veckan
- Vid avvikelse — Fazli informeras

---

## 5 · Signeringskrav

**Personal måste mentalt bekräfta innan klick på "Signera":**

1. ✅ Rätt patient öppen (header visar rätt namn/telefon/Cliento-id)
2. ✅ Anteckningen handlar om **dagens besök** — inte gammalt/framtida
3. ✅ Text läst igenom — komplett, faktabaserad
4. ✅ Inga personnummer i fritext om inte krävs
5. ✅ Inget review-material använt som klinisk sanning
6. ✅ Ingen extern AI använd
7. ✅ Säker

**Stöd:** `/cco-pre-signering-check.html` öppen i sido-flik.

**Signering är permanent.** Originalet kan aldrig ändras direkt — bara via rättelse.

---

## 6 · Rättelseflöde

**När en signerad post är fel:**

1. Öppna den signerade posten
2. Klicka **"Skapa rättelse"** — ny tom post öppnas, länkad till originalet
3. Skriv det korrigerade **i sin helhet** (inte "stryk allt ovan")
4. Ange anledning: typo / ny info / felaktig dos
5. Spara
6. Gå igenom Pre-Signering Check igen
7. Signera rättelsen
8. Verifiera i timeline att båda posterna syns kronologiskt och är länkade

**Förbjudet:**
- Försök att ändra det låsta originalet (systemet blockerar — om det inte blockerar = kritisk bug, Fazli direkt)
- Rättelse utan signering
- Rättelse utan angiven anledning

---

## 7 · Review-material-regler

Material flaggat `needs review`, `pending`, `imported` (från Drive/halso@/GetAccept) är **inte verifierat** dag 1.

**Tillåtet:**
- Läsa som **referens** när du frågar patienten
- Använda som bakgrundsinfo om historik
- Underlag för uppföljningsfrågor

**Förbjudet:**
- Basera diagnos eller dosering på oferifierat material
- Skriva i journalen "enligt importerad journal..." som faktum (skriv istället "patienten uppger...")
- Visa material som "officiell CCO-journal" till patient
- Använda migrerade före/efter-bilder som kliniska behandlingsbilder

**Stöd:** `/cco-review-material-warning.html` förklarar alla badges.

---

## 8 · Stop conditions

**Pilot pausas omedelbart om:**

| Trigger | Konsekvens |
|---|---|
| 5xx-fel i journal-API > 5 min | Hela kliniken pausar pilot tills Fazli ger klartecken |
| Signerad post går att ändra direkt | Kritisk bug — STOPPA omedelbart, Fazli direkt |
| Patientdata renderas på fel kundkort | Binding-bug — STOPPA, dokumentera, Fazli direkt |
| Trasig UI-rendering på journalsida | Pausa den station, byt till backup-URL, eskalera |
| Två separata personal-rapporter om samma fel | Pausa, debug, vänta tills fix verifierad |
| GDPR-incident (data-läcka, fel-routing) | Pausa, juridisk + Fazli |
| Patient-incident (lider skada från fel data) | Pausa, dokumentera, juridisk |

**Pilot återupptas efter:**
- Fix verifierad
- Gate PASS (`npm run cco:presentation-gate`)
- E2E PASS (`npm run cco:run-daily-readiness`)
- Owner-godkännande från Fazli

---

## 9 · Eskaleringskedja

| Problem | Eskalera till | Hur |
|---|---|---|
| Osäker identitet · dubbletter · GDPR-frågor | Admin/ops (Egzona) | Säg "en sekund" → fråga admin |
| Tekniskt fel · 5xx · trasig sida | Fazli | Skärmdump + URL + tidpunkt + deploy-ID |
| Fel patient (skrivit fel) | Fazli direkt | STOPPA omedelbart, SPARA INTE, ring |
| GDPR-export-förfrågan från patient | Admin/ops + Fazli | "Jag vidarebefordrar" |
| Misstänkt patient-incident | Fazli + juridisk | Dokumentera + skärmdump |
| Allmänna journal-frågor från personal | Egzona först → Fazli om Egzona osäker | — |

---

## 10 · Vad dokumenteras efter varje pass

**Personal noterar (kort, < 1 min):**
- Antal patienter signerade
- Antal rättelser
- Antal eskaleringar (vilken typ?)
- Anteckning om något kändes konstigt

**Egzona noterar i Ops Workbench:**
- Identitets-eskaleringar och hur de löstes
- Eventuella dubbletter upptäckta
- Drive/photo/mail-review-progress

**Fazli noterar i Daily Readiness:**
- Total pilot-volym för dagen
- Inträffade P0/P1 (om några)
- Beslut om fortsatt pilot eller paus
- Tekniska observationer från Render-loggar

**Slutet av varje vecka:**
- Genomgång med Fazli + Egzona
- Beslut om fortsatt vägledning vs justering

---

## Sammanfattning · pilot-DNA

| Princip | Praktik |
|---|---|
| **Kontrollerad start** | Få patienter först · eskalera tidigt |
| **Verifierad identitet** | 3 fält måste matcha · aldrig gissa |
| **Permanent signering** | Rättelse = ny post · originalet låst |
| **Referens, inte sanning** | Importerat material används försiktigt |
| **Eskalera tidigt** | Aldrig fel att fråga |
| **Pausa vid tvekan** | Hellre stopp än fel-journal |
| **Dokumentera dagligen** | Daily Readiness är sanningen |

---

_Hair TP Clinic · 4 juni 2026 · Journalpilot Driftregler_
_Komplement till: First 3 Patients Pilot Plan · First Week Rollout · Staff Role Cards_
