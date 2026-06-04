# CCO Personal Demo Runbook — 4 juni 2026

_För: Fazli · Personalmöte · Kontrollerad journalpilot_  
_Primär URL: https://arcana.hairtpclinic.com/cco-personal-start.html_  
_Backup: https://major-arcana-frankfurt.onrender.com/cco-personal-start.html_

---

## Före mötet — flikar att ha öppna

| Flik         | URL                         | Varför                                     |
| ------------ | --------------------------- | ------------------------------------------ |
| 1 · Huvud    | `/cco-personal-start.html`  | Demo-start                                 |
| 2 · Guide    | `/journal-pilot-guide.html` | Personal kan scanna under mötet            |
| 3 · (valfri) | `/kunder.html`              | Snabb öppning om du hoppar över startsidan |
| 4 · (valfri) | Backup-URL personal-start   | Om prod hänger                             |

**Ha INTE öppet:** mail review, photo review, cco-demo, automation, showcase, analytics.

**Tekniskt (T-10 min):**

```bash
npm run cco:presentation-gate
```

Båda delsteg måste vara **PASS**. Vid FAIL → stoppa, P0/P1-fix, kör om.

---

## Exakt klickordning (heliga flödet)

1. `/cco-personal-start.html`
2. **Öppna kundkort** → `/kunder.html`
3. **Öppna pilotkund 1** (eller sök test-ID) → journal-feed-demo med `cco-pilot-20260602-a`
4. Verifiera identitet på skärmen (namn · telefon · Cliento-id)
5. Journal-flik → **skapa** anteckning
6. **Signera/lås**
7. Försök **redigera låst** → visa blockering (409)
8. **Skapa rättelse** → signera rättelse
9. **Timeline**-flik
10. (Valfritt) Pilotkund 3 → visa befintlig sign+rättelse-tråd
11. Tillbaka personal-start → historik-badges + dag-1-regler

---

## Vad Fazli ska säga (kärnreplik)

> Det här är **CCO personalstart** för en **kontrollerad journalpilot** — inte full cutover.  
> Vi börjar med **kända patienter**: verifiera identitet, skriv journal, signera, rättelse, timeline.  
> **Importerad historik** finns där import är klar.  
> Allt **“Behöver granskning”** och review-badges är **inte klinisk sanning**.  
> **Migrerade bilder** finns i systemet men är **inte kliniska dag 1** — Photo Review pågår, write är av.  
> **Mail** finns men är **inte dagligt verktyg** än (`readyForWork=false`).  
> Det här är vårt nya **kundkort och journalnav**.

---

## 5-minutersversion

| Min | Gör                          | Säg                                                   |
| --- | ---------------------------- | ----------------------------------------------------- |
| 0   | Öppna personal-start         | “Startsidan — endast verifierade länkar.”             |
| 1   | Klick pilotkund 1            | “Anonym testkund för live-demo.”                      |
| 2   | Visa feed + identitet        | “Alltid verifiera innan signering.”                   |
| 3   | Skapa + signera (kort)       | “Låst post kan inte ändras.”                          |
| 4   | Rättelse + timeline (snabbt) | “Rättelse är ny signerad post, originalet står kvar.” |
| 5   | Scroll dag-1-regler          | “Personal får börja kontrollerat — se checklist.”     |

**Skippa:** CF-djupdykning, mail, photo review UI, Drive-import, AI/Aisia.

---

## 15-minutersversion

| Block                    | Innehåll                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| 1 · Ram (2 min)          | Kontrollerad pilot · inte full prod · dag-1-regler                       |
| 2 · Kundkort (2 min)     | Öppna kundkort · sektioner · historik-badges read-only                   |
| 3 · Live journal (6 min) | Skapa → sign → blockera edit → rättelse → sign → feed                    |
| 4 · Timeline (2 min)     | Kronologi · pilotkund 3 om tid                                           |
| 5 · Gränser (2 min)      | Review ≠ sanning · bilder · mail · ingen ny kund vid osäker match        |
| 6 · Personal (1 min)     | Peka på `/journal-pilot-guide.html` + `CCO-STAFF-DAY1-JOURNAL-CHECKLIST` |

---

## Backup-plan om sidan hänger

1. **Refresh** samma URL (Ctrl+R / Cmd+R)
2. **Backup-URL:** `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html`
3. Om fortfarande fel: öppna **pilotkund 1 direkt** (bypass startsida):  
   `/journal-feed-demo.html?customerId=cco-pilot-20260602-a&tenant=hairtpclinic&role=operator`
4. Säg: _“Vi kör på reservväg — journalflödet är verifierat, startsidan laddar om.”_
5. **Stoppa live skapande** om API ger 5xx — visa **pilotkund 3** (befintlig tråd) istället
6. Eskalera till ops/Cursor om journal create/sign/correction fail

---

## Vad personal **får** börja göra (dag 1)

- Öppna kundkort på **kända** patienter
- Verifiera identitet (namn + telefon + Cliento-id)
- Skapa journal → signera/lås
- Skapa rättelse vid fel
- Läsa timeline och importerad historik som **referens**
- Fråga admin/ops vid osäkerhet

---

## Vad personal **inte** får göra

- Skapa **ny kund** vid osäker identitet
- Använda **review-material** som klinisk sanning
- Använda migrerade **före/efter-bilder** kliniskt
- Kopiera journaltext till **extern AI**
- Mail/Svarstudio som primärt arbetsverktyg
- Aisia / kamera-scalp (pausat)
- Lova “allt är importerat” eller “full cutover”

---

## FAQ — frågor personal kan ställa + svar

| Fråga                                          | Svar                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| “Kan vi använda gamla Drive-journaler direkt?” | “De finns som referens där import är klar. Osäkert material är markerat review — inte klinisk sanning.” |
| “Varför syns inte alla bilder?”                | “860 bilder väntar Photo Review. 0 VISIBLE före granskning. Inte kliniska dag 1.”                       |
| “Kan jag fixa en signerad post?”               | “Nej — skapa **rättelse**. Originalet ändras inte.”                                                     |
| “Får jag skapa ny kund om jag är osäker?”      | “Nej — stoppa och eskalera. Risk för dubblett.”                                                         |
| “Fungerar mail i CCO nu?”                      | “Tekniskt pågår aktivering. Inte dagligt verktyg dag 1.”                                                |
| “Är CCO klart?”                                | “Kontrollerad **journalpilot** är klar. Övriga spår aktiveras stegvis.”                                 |
| “Vad är pilotkund A/B/C?”                      | “Anonyma test-IDs för demo och smoke — i vardag: riktiga kända patienter.”                              |
| “Kan jag använda ChatGPT på journaltext?”      | “Nej — patientdata lämnar inte systemet.”                                                               |

---

## Pilot-IDs (demo)

| #   | customerId                       | Användning               |
| --- | -------------------------------- | ------------------------ |
| 1   | `cco-pilot-20260602-a`           | Live skapa/sign/rättelse |
| 2   | `cco-pilot-20260602-b`           | Feed + timeline          |
| 3   | `cco-readiness-smoke-1780402011` | Befintlig sign+rättelse  |

---

## Relaterade dokument

- `CCO-STAFF-DAY1-JOURNAL-CHECKLIST-2026-06-04.md` — utskriftsbar checklista
- `CCO-STAFF-JOURNAL-PILOT-ONE-PAGER-2026-06-04.md` — en sida personal
- `CCO-PERSONAL-PRESENTATION-READINESS-2026-06-04.md` — readiness + CF-notis
- `CCO-FAZLI-MORGON-CHECKLIST-2026-06-04.md` — morgon T-10

---

_Ingen patientdata i detta dokument._

---

## Cycle-7 tillägg (Claude · 2026-06-02T20:50Z)

Två nya stöd-sidor LIVE för att gör mötet ännu tryggare:

| URL | Syfte |
|---|---|
| `/cco-presenter-mode.html` | **🎬 Presenter Mode** — Fazli's personliga assistent. Öppna i sido-skärm eller telefon. 14-stegs flow med _Säg detta · Klicka detta · Om fail · Backup-URL_ per steg. Stor 15-min countdown-timer. 4 fas-markörer (intro 0–2 / kundkort 2–7 / journal 7–12 / avslut 12–15). Interaktiv progress-checklist + quick-bar med snabblänkar till alla pilotkunder. |
| `/journal-pilot-print-pack.html` | **🖨 Print Pack** — Printvänlig A4-pack för personal. Skriv ut dagen före och ha på arbetsstationen. 9 sektioner: dag-1-regler · identitetskontroll · signerings-checklist · rättelse-flöde (ASCII) · review-tabell · eskalering · 30-min-tidslinje · 7 patientfrågor + svar · "aldrig dag 1"-lista. Ingen patientdata. |

Båda länkade diskret från `/cco-personal-start.html` footer (mellan baseline-text och footer-meta), samt från quick-bar i Presenter Mode.

**Rekommenderat upplägg dagen före mötet:**
- Skriv ut `/journal-pilot-print-pack.html` × 1 per personalstation
- Öppna `/cco-presenter-mode.html` på sido-skärm/telefon
- Klicka Start på timern när du börjar prata

---

## Cycle-8 tillägg (Claude · 2026-06-02T21:10Z) — Command Center live

| URL | Syfte |
|---|---|
| **`/personal-demo.html`** | **🎯 4 juni Command Center** — Fazli's enkla kontrollsida för dagen. Visar live-status (GO / WAIT / P0 FIX REQUIRED) från `/cco-4june-morning-check.json` (fallback `/cco-presentation-ops-status.json`). Innehåller: snabblänkar till alla viktiga sidor + 14-stegs demo-script + failover-protokoll med "vänta 2 min vid 502" + "öppna guide istället om journal failar". |

**Rekommenderat användning T-0 dag:**
1. Öppna `/personal-demo.html` i en sido-flik på telefonen
2. Klicka "↻ Uppdatera status" → ska visa **stor grön GO**
3. Om något är gult (WAIT) eller rött (P0) → läs failover-rutan på sidan
4. Om allt grönt → starta Presenter Mode och kör igenom 14 stegen


---

## Cycle-9 tillägg (Claude · 2026-06-02T22:00Z) — vattentäta personalpaketet

Komplett personalpaket nu länkbart från Personal Start + Command Center:

| URL | Roll |
|---|---|
| `/cco-personal-start.html` | Huvudfönster (REDESIGNAD — parchment, opak, skarp) |
| `/personal-demo.html` | Live-status + alla snabblänkar |
| `/cco-presenter-mode.html` | 14-stegs flow + 15-min timer |
| `/journal-pilot-print-pack.html` | A4-pack utskrift |
| `/journal-pilot-guide.html` | Online-guide MED ny "Vad gör jag nu?"-panel (sektion 0) |
| `/cco-morning-checklist.html` | **NY** — Fazli T-10→T-0 routine (HTML, länkbar) |
| `/cco-staff-day1-checklist.html` | **NY** — 10-stegs personal-checklist (HTML, länkbar) |

### "Vad gör jag nu?"-panel i personalguide

Ny sektion 0 överst i `/journal-pilot-guide.html` — 6 färgkodade beslutsscenarios:
- ✅ Kunden är säker → skriv journal
- ⛔ Identitet osäker → STOPPA → eskalera
- 🔵 Historik saknas → skriv ändå
- ⚠️ Review-material → INTE klinisk sanning
- 📸 Bild behövs → ta NY bild i CCO
- 🔴 Systemet hänger → refresh → backup → Fazli

---

## Cycle-10 tillägg (Claude · 2026-06-03T22:30Z) — Träningsläge + FAQ

| URL | Syfte |
|---|---|
| **`/cco-staff-training-mode.html`** | 🎓 **Personal Training Mode** — 5-stegs självträning för personal efter mötet (Hitta kund → Verifiera identitet → Skapa journal → Signera → Rättelse). Varje steg har: Vad du ska göra · Var du klickar · Rätt resultat · Vanligt misstag · Stoppa/eskalera. Interaktiv progress-checklist + quick-bar med alla pilotkunder. |
| **`/cco-journalpilot-faq.html`** | ❓ **Quick FAQ** — 9 dag-1-säkra svar på vanliga frågor. Färgkodade: grön (GÖR DET) · orange (FÖRSIKTIGT) · röd (STOPPA) · blå (INFO). Frågor: historik saknas, "Behöver granskning", importerade bilder, osäker kund, ändra signerad, rättelse-flow, AI-användning, system hänger, vem kontakta. |

**Personalflöde efter mötet:** Personal öppnar Training Mode → övar 5 steg själv → öppnar FAQ vid frågor → är redo att börja journalföra.

---

## Cycle-11 tillägg (Claude · 2026-06-03T23:30Z) — Go-Live Support + Sign-off Sheet

| URL | Syfte |
|---|---|
| **`/cco-journalpilot-go-live.html`** | 🚀 **Go-Live Support** för dag 1: roller (personal/admin/owner/observatör), första patienten/journalen-tidslinje, när stoppa/eskalera, vanliga scenarios, vad får INTE göras dag 1, 8 snabblänkar |
| **`/journal-pilot-signoff-sheet.html`** | ✍️ **Sign-off Sheet** — printbar bekräftelse där personal kryssar 9 punkter + namn/roll/datum/underskrift. Ingen patientdata. Arkiveras lokalt. |

**Copy audit (cycle-11):** Alla 11 personal-sidor granskade för förbjudna fraser ("full cutover", "Photo Review klar", "Aisia live", "Fortnox kopplat", "mail dagligt", mock-siffror). PASS — inget rött.

---

## Cycle-19 P0 KORRIGERING (2026-06-04T04:00Z · Claude)

**Huvudflöde 4 juni har bytts:**
- ❌ Tidigare: `/cco-personal-start.html`
- ✅ Nu: **`/cco-demo.html`** (omdöpt till "Välkommen till CCO")

`/cco-personal-start.html` har legacy-banner som leder till `/cco-demo.html`. Behåller URL för preflight-kompatibilitet.

Command Center primary link → `/cco-demo.html`. Presenter Mode quick-bar primary → "▶ Välkommen till CCO".

Borttagna mock-claims på cco-demo.html: "Demo-portal" · "1 247 demo-kunder" · "49 MSEK" · "alla har simulerad data" · "demo-stage" · automation/watch/Aisia som live · Fortnox kopplat · mail dagligt · Photo Review klar · full cutover · webcal-länkar.

Detaljerad rapport: `docs/strategy/CCO-WELCOME-PRESENTATION-READINESS-2026-06-04.md`

---

## Cycle-20 STOPP (2026-06-04T05:00Z · Claude)

**Owner-direktiv:** STOPP nya sidor. Rätt huvudflöde fastställt.

### Primär presentation 4 juni

```
Välkommen till CCO  →  Kunder  →  Kundkort  →  Journal
   /cco-demo.html       /kunder.html        (pilotkund)
```

### Vad har gjorts

- ✅ `/cco-demo.html` verifierad som riktig "Välkommen till CCO" (title + h1 korrekt, 0 mock-claims, 7 sektioner)
- ✅ Kommunikation-sektionen utökad med Konversationer + Kalender + Analytics-kort (komplettering, ingen ny sida)
- ✅ `/cco-personal-start.html` legacy-banner återställd (om den var borta)
- ✅ Använder cco-staff-shell.css för CCO-design (topnav + vellum + glass + pills)
- ❌ Inga nya stöd-sidor byggda — bara polish av existerande
- ❌ Inga nya guides eller moduler

### Status-claims verifierade på /cco-demo.html (0 förekomster vardera)
- 'Demo-portal' · 'demoportal' · 'simulerad data' · '1 247' · '49 MSEK'
- 'full cutover' · 'Fortnox kopplat' · 'Photo Review klar' · 'Aisia live'

### Personal-start är **inte** primär längre
- Legacy-banner överst med CTA till /cco-demo.html
- Filen behålls för preflight-kompatibilitet
