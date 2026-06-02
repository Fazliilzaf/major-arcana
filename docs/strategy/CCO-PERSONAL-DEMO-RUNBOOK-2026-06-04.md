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
