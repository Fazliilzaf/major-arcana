# CCO Personal Presentation Readiness

_Deadline: 2026-06-04 · Prod smoke: 2026-06-02T13:54Z_  
_Deploy: `c31536da` live · `/cco-personal-start.html` 200_

---

## Kan personal börja journalföra?

### **JA** — kontrollerad pilot

Journal-backend, kundkort-routes, feed, timeline och forms är verifierade på prod. E2E smoke **PASS** (skapa → signera → lås → rättelse → feed/timeline).

---

## Vad kan visas?

| Demo-punkt                         | URL / flöde                                | Status                                  |
| ---------------------------------- | ------------------------------------------ | --------------------------------------- |
| **Personalstart**                  | `/cco-personal-start.html`                 | ✅ klickbar                             |
| **Kundkort**                       | `/kunder.html`                             | ✅                                      |
| **Pilotkund 1–3**                  | journal-feed-demo med query params         | ✅                                      |
| **Journal skapa/signera/rättelse** | live på pilotkund A / visa C               | ✅                                      |
| **Timeline**                       | flik i journal-feed-demo                   | ✅                                      |
| **Importerad historik**            | status-badges på startsidan                | ✅ (informera, inte lova full täckning) |
| **Behöver granskning**             | regel på startsidan                        | ✅                                      |
| **CF (internt)**                   | finance / finance-review / finance-reports | ✅                                      |

---

## Vad ska INTE visas?

| Visa inte                                                   | Säg istället                      |
| ----------------------------------------------------------- | --------------------------------- |
| Mail / unified inbox / Svarstudio som dagligt verktyg       | “Pågående aktivering”             |
| Migrerade före/efter-bilder som kliniska                    | “Väntar Photo Review”             |
| `cco-demo.html` / gamla demoportalen                        | Använd `/cco-personal-start.html` |
| AI no-show · triage · automation · watch · Aisia · showcase | Ej P0 — pausat                    |
| Analytics som sanning                                       | Ej verifierad för personalmöte    |
| Full cutover / “allt funkar fritt”                          | “Kontrollerad pilot”              |

---

## Begränsningar dag 1

1. **Pilot** — utbildad personal, kända patienter, identitetskontroll före signering
2. **Test-IDs** A–C för live-demo; riktiga patienter i vardag efter verifiering
3. **Historik** syns där import finns (~767 journal · ~1 660 formulär i register)
4. **Review-material** är inte klinisk sanning
5. **Bilder** — inte kliniska före/efter förrän Photo Review
6. **Mail enrichment** pausad — `readyForWork=false`
7. **Ingen ny kund** vid osäker match · **ingen extern AI** på journaltext

---

## Top 5 kvar innan bred intern drift

| #   | Kvar                                                    |
| --- | ------------------------------------------------------- |
| 1   | **Photo Review** (~14k Drive-bilder, write av)          |
| 2   | **Mail aktivering** (493 ambiguous, worklist ej daglig) |
| 3   | **Import review queue** (1 497 osäkra kundmatchningar)  |
| 4   | **Täckning** (~4 867 kunder utan importerat innehåll)   |
| 5   | **Encounter/metadata** + Drive alias-sweep              |

---

## Presentationsordning (12 steg)

1. `/cco-personal-start.html`
2. **Öppna kundkort**
3. **Pilotkund 1** (journal-feed-demo)
4. Identitetskontroll (regler)
5. Journal-feed
6. Skapa journal (live på A)
7. Signera/lås
8. **Pilotkund 3** — rättelse + thread
9. Timeline-flik
10. Historik-status (badges)
11. “Behöver granskning”-regeln
12. Avsluta: _“Nu börjar vi kontrollerat med journalföring”_

---

## Vad du ska säga i rummet

> CCO är redo för **kontrollerad journalföringspilot**. Vi börjar med kända patienter. Ni verifierar identitet, skriver journal, signerar och använder rättelseflödet. Historik finns där den är importerad. Allt markerat “Behöver granskning” ska **inte** användas som klinisk sanning. Bilder finns inne, men före/efter-bilder ska inte användas kliniskt förrän Photo Review är klar. Det här är vårt nya kundkort och journalnav.

---

## 4 juni morgon — smoke-test

```bash
node scripts/verify-personal-demo-links.js
node scripts/run-personal-demo-readiness.js
```

**Backup-plan:** Om prod 502 under deploy → vänta 2 min, kör om. Fallback-URL: `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html`

---

_Ingen patientdata i denna rapport._
