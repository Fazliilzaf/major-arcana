# Välkommen till CCO · Presentation Readiness · 4 juni 2026

> **Korrigering 2026-06-04T04:00Z (owner P0):** Huvudflöde 4 juni är inte längre `/cco-personal-start.html`. Det är `/cco-demo.html` omdöpt till **"Välkommen till CCO"**.

---

## Ny huvudstart

| Roll | URL |
|---|---|
| **Primär presentationssida** | **`https://arcana.hairtpclinic.com/cco-demo.html`** |
| Sekundär hjälpsidor | Journal Pilot Guide · Go-Live Control · Ops Workbench · övriga staff-resurser |
| Legacy (dold) | `/cco-personal-start.html` — har nu legacy-banner som leder vidare till `/cco-demo.html` |

---

## Mock-claims borttagna från cco-demo.html

| Före | Status |
|---|---|
| "CCO Demo-portal" | ❌ borttaget — heter nu "Välkommen till CCO" |
| "alla har simulerad data" | ❌ borttaget |
| "1 247 demo-kunder" | ❌ borttaget |
| "49 MSEK · Total intäkt" | ❌ borttaget |
| "mockup för planering" | ❌ borttaget |
| "demo"-stage-taggar | ❌ ersatta med live/imported/pending/paused/blocked status |
| no-show som live | ❌ borttaget (AI/automation listat som "inte huvudflöde dag 1") |
| AI triage som färdigt | ❌ borttaget |
| Automation/watch/Aisia som live | ❌ borttaget (Aisia listat under "Pausade") |
| Fortnox som kopplat | ❌ borttaget (listat som "blocked integration") |
| Mail som dagligt verktyg | ❌ borttaget (listat som "aktivering pågår · inte dagligt") |
| Photo Review som klar | ❌ borttaget (listat som "pending · ~885 needs review") |
| Full cutover | ❌ borttaget (footer säger "kontrollerad pilot — inte full cutover") |
| webcal://localhost | ❌ inga lokala URL:er |
| Alla mock-siffror | ❌ borttagna |

---

## Korten på Välkommen till CCO

### A · Kunder · huvudnav (4 kort)
- Öppna Kunder (`/kunder.html`) — **redo**
- Pilotkund 1 / 2 / 3 (`cco-pilot-20260602-a/b · readiness-smoke-c`) — **pilot 1/2/3**

### B · Journal & formulär (4 kort)
- Skapa journal — **live**
- Signera / lås — **live**
- Skapa rättelse — **live**
- Hälsodeklaration · friskförsäkran (cco-forms) — **live**

### C · Bilder & historik (5 kort)
- halso@ · Hälsodeklarationer (~1660 kunder) — **imported**
- GetAccept · Avtal (~1331 kunder) — **imported**
- Drive · Safe-match dokument — **imported**
- Photo Review pending — **needs review** (migrerade bilder INTE kliniska)
- Behöver granskning · osäker metadata — **needs review**

### D · Kommunikation (1 kort)
- Mail · Svarstudio & worklist — **aktivering pågår** (inte dagligt verktyg)

### E · Ekonomi · Chief of Finance (4 kort)
- Finance Dashboard (`/finance.html`) — **cco-native**
- Review-paket (`/finance-review.html`) — **cco-native**
- Rapporter (`/finance-reports.html`) — **cco-native**
- Fortnox-sync — **blocked integration**

### F · Ops · drift (3 kort)
- Ops Workbench (`/cco-ops-workbench.html`) — **live**
- 4 juni Command Center (`/personal-demo.html`) — **live**
- Go-Live Control (`/cco-staff-go-live-control.html`) — **live**

### Pausade · försiktiga (4 kort)
- Aisia · DS-3 (kamera/scalp) — **paused** bakom feature flag
- Photo Review (~885 assets) — **pending**
- Mail worklist · enrichment — **aktivering**
- AI / automation — **inte huvudflöde dag 1**

### Dag-1-regler (5 punkter)
1. Verifiera identitet före signering
2. Skapa inte ny kund vid osäker match
3. Review-material är inte klinisk sanning
4. Migrerade bilder används inte kliniskt
5. Ingen extern AI på journaltext

---

## Primära CTAs i hero

Synliga direkt under "Välkommen till CCO"-rubriken:

1. **Öppna Kunder** (primary rose-pill)
2. Pilotkund 1
3. Pilotkund 2
4. Pilotkund 3
5. Ops Workbench
6. Finance
7. Journalguide (sekundär)

---

## Demoflöde 4 juni — 15 steg (uppdaterad)

1. Öppna **Välkommen till CCO** (`/cco-demo.html`)
2. Säg: *"Det här är CCO — vårt nya kundkort och arbetsnav."*
3. Visa korten: Kunder · Journal · Formulär · Historik · Bilder · Avtal · Kommunikation · Ekonomi
4. Säg: *"Idag börjar vi i Kunder."*
5. Klicka **Kunder** (CTA primary)
6. Öppna **Pilotkund 1**
7. Visa kundkort
8. Visa journal-feed
9. **Skapa journal** (Ny anteckning → mall → spara)
10. **Signera / lås**
11. Visa att låst post inte ändras (peka på "signerad"-badge)
12. **Skapa rättelse** (ny post länkad)
13. Visa **timeline** (båda posterna)
14. Visa **Behöver granskning** (badges)
15. Avsluta med **dag-1-regler**

---

## Ändringar i existerande sidor

| Sida | Ändring |
|---|---|
| `/cco-demo.html` | **Komplett omskriven** som "Välkommen till CCO". 366 → ~300 rader. CCO-shell. 6 sektioner + pausade + dag-1-regler. Inga mock-siffror. |
| `/cco-personal-start.html` | **Legacy-banner** överst som leder till `/cco-demo.html`. Resten av sidan kvar för preflight-kompatibilitet. |
| `/personal-demo.html` | Primary link i quick-bar bytt: Personalstart → **Välkommen till CCO** (`/cco-demo.html`). |
| `/cco-presenter-mode.html` | Quick-bar primary bytt: ▶ Välkommen till CCO först · Personalstart (legacy) sekundär. |

---

## Länkar testade

| URL | Krav | Status |
|---|---|---|
| `/cco-demo.html` | Ny huvudstart | **200** ✅ |
| `/kunder.html` | Huvudnav | **200** ✅ |
| `/journal-feed-demo.html?customerId=cco-pilot-20260602-a/b/c` | Pilot 1/2/3 | **200/200/200** ✅ |
| `/journal-pilot-guide.html` | Journalguide | **200** ✅ |
| `/finance.html` · `/finance-review.html` · `/finance-reports.html` | Finance | **200** ✅ |
| `/cco-ops-workbench.html` | Ops | **200** ✅ |
| `/personal-demo.html` | Pilot-status | **200** ✅ |
| `/cco-staff-go-live-control.html` | Drift-styrning | **200** ✅ |
| `/cco-personal-start.html` | Legacy (med banner) | **200** ✅ |

**Inga 404 · inga 5xx · inga Drive-länkar · inga gamla mock-claims.**

---

## Gate-resultat

| Test | Resultat |
|---|---|
| `verify-personal-demo-links` | **ALL PASS** |
| `run-personal-demo-readiness` | **PASS** |
| Pilot 1/2/3 feed/timeline/forms | **200/200/200** |
| Journal create · sign · correction | **PASS** |

---

## Vad Fazli säger till personalen 4 juni

> *"Det här är CCO — vårt nya kundkort och arbetsnav. Vi börjar kontrollerat med journalföring idag. Här ser ni vad systemet erbjuder. Kunder är huvudnavet. Allt med 'pending' eller 'aktivering pågår' kommer separat. Idag börjar vi i Kunder."*

---

_Hair TP Clinic · 4 juni 2026 · Välkommen till CCO är ny huvudstart_
