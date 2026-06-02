# CCO Personal-Demo Readiness — 4 juni-verifiering

**Datum:** 2026-06-02 (verifiering inför 2026-06-04)
**Ägare:** Claude (display/UAT-spår)
**Primär doc:** `docs/strategy/CCO-PERSONAL-PRESENTATION-READINESS-2026-06-04.md` (Cursor — write/data-spår)
**Live deploy:** `c31536da` · `fc8f12ca` (docs only)

Detta är **min UI-verification** + **14-stegs speaker-notes** för Fazli. Cursors PRESENTATION-READINESS-doc är huvudkällan för status/scope; denna fil kompletterar med presentation-säkerhetsverifiering och exakt talmanus.

---

## 1 · Live URL-status (probe 2026-06-02 14:15Z)

| URL | HTTP | Verifierad |
|---|---|---|
| `https://arcana.hairtpclinic.com/cco-personal-start.html` | **200** | ✅ |
| `https://arcana.hairtpclinic.com/kunder.html` | **200** | ✅ |
| `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html` | **200** | ✅ (backup-URL) |
| `https://major-arcana-frankfurt.onrender.com/kunder.html` | **200** | ✅ |

---

## 2 · Presentation-säkerhet (verifierad)

| Krav | Status | Källa |
|---|---|---|
| Inga mock-siffror (`1 247`, `49 MSEK`, `25 live-vyer`) | ✅ | grep tom på sidan |
| Inga AI-magic-claims (no-show, triage, automation, watch, Aisia) | ✅ | sidan markerar dessa `pausad`/`blockerad` |
| Inga `webcal://localhost` | ✅ | preflight grön |
| Inga Drive-länkar | ✅ | preflight grön |
| Inga klickbara disabled-kort (`data-paused="true"` utan href) | ✅ | preflight grön |
| Pilotkund-knappar fungerar **eller** är tydligt markerade | ✅ | knapparna pekar nu på riktiga `customerId` (se §3) |

Preflight: `node scripts/verify-personal-demo-links.js` → **9/9 PASS** + **3/3 pilotkunder PASS**.
E2E journal: `node scripts/run-personal-demo-readiness.js` → **alla 7 steg PASS** (create → sign → edit_locked_blocked → correction → sign → feed → timeline).

---

## 3 · Cursor-manifest verifierad

Cursor har bakat in customerIds **direkt i HTML** (inget runtime `fetch` behövs). Hittade i live-HTML:

| Slot | customerId | Route |
|---|---|---|
| 1 | `cco-pilot-20260602-a` | `/journal-feed-demo.html?customerId=cco-pilot-20260602-a&tenant=hairtpclinic&role=operator` |
| 2 | `cco-pilot-20260602-b` | `/journal-feed-demo.html?customerId=cco-pilot-20260602-b&tenant=hairtpclinic&role=operator` |
| 3 | `cco-readiness-smoke-1780402011` | `/journal-feed-demo.html?customerId=cco-readiness-smoke-1780402011...` |

Sync-risk **stängd** — manifestet behöver inte serveras via HTTP eftersom värdena redan finns i HTML. Inga `aria-disabled`-knappar.

---

## 4 · P0/P1 render-/presentationsbuggar

Inga hittade. Sidan är presentation-säker som den är. Inga fixar gjorda.

---

## 5 · Speaker-notes för Fazli — 14 stegs talmanus

### Före mötet
- Öppna **`https://arcana.hairtpclinic.com/cco-personal-start.html`** i Chrome
- Om 502: vänta 2 min och refresha (Render-restart). Backup: `major-arcana-frankfurt.onrender.com/cco-personal-start.html`
- Ha **`/kunder.html`** redo i en granne-flik

### Under mötet

| # | Klicka | Säg |
|---|---|---|
| **1** | Öppna `/cco-personal-start.html` | "Det här är startsidan för intern journalpilot." |
| **2** | (peka på hero "Journalföring · Redo för kontrollerad pilot") | "Journalföring är det vi börjar med. Allt annat är pausat eller informativt." |
| **3** | Klicka **"Öppna kundkort"** | "Kundkortet är det nya navet. Allt om en patient samlas här." |
| **4** | Backa, klicka **"Öppna pilotkund 1"** | "Det här är en verifierad testpatient — säker att jobba i live." |
| **5** | Peka på namn/telefon/Cliento-id högst upp | "Innan vi gör nåt — verifiera identitet: namn, telefon, Cliento-id." |
| **6** | Klicka **Journal-feed-fliken** | "Här ser ni alla journalposter på patienten." |
| **7** | Klicka **"Ny anteckning"** → skriv något → spara | "Vi skapar en journalanteckning. Mall för konsultation, behandling eller follow-up." |
| **8** | Klicka **"Signera"** | "Signering låser posten omedelbart. `locked=true` — den kan inte ändras." |
| **9** | Försök redigera den signerade posten | "Som ni ser — låst original kan **inte** ändras. Det är journalkrav." |
| **10** | Klicka **"Skapa rättelse"** → ny post öppnas | "Behöver vi rätta? Vi skapar en **ny post** länkad till originalet. Aldrig direkt på låst." |
| **11** | Klicka **Timeline-fliken** | "Båda posterna syns kronologiskt — original + rättelse länkade." |
| **12** | Klicka **Historik-fliken** | "Här ligger importerat material: halso@, GetAccept-avtal, Drive-journaler." |
| **13** | Klicka **"Behöver granskning"** | "Allt här är flaggat som **icke-klinisk sanning** tills någon granskat det. Vi behandlar inte baserat på review-material." |
| **14** | Scrolla till **Dag-1-regler** (sektion 5) | "Fem regler från dag ett: verifiera identitet · skapa ej ny kund vid osäker match · review är ej sanning · migrerade bilder används ej kliniskt · ingen journaltext till extern AI." |

### Avslutning
> "Det här är vårt nya kundkort och journalnav. Vi börjar **kontrollerat** med journalföring. Mail, Photo Review, Fortnox-sync, Aisia — kommer i nästa steg. Frågor?"

---

## 6 · Vad personal får börja göra dag 1

- ✅ Öppna kundkort på kända pilotkunder
- ✅ Verifiera identitet (namn + telefon + Cliento-id)
- ✅ Skapa journalanteckning
- ✅ Signera/lås posten
- ✅ Skapa rättelse som ny post
- ✅ Visa timeline + journal-feed på samma patient
- ✅ Läsa importerad historik som referens
- ✅ Använda "Behöver granskning"-fliken som **referens**, inte sanning

---

## 7 · Vad personal **inte** får använda dag 1

- ❌ Migrerade före/efter-bilder för **kliniska beslut**
- ❌ Manuellt skapa nya kunder vid osäker identitet → eskalera ops
- ❌ Kopiera journaltext till **externa AI-verktyg**
- ❌ Lita på "Behöver granskning"-material som klinisk sanning
- ❌ Mail-worklist / unified inbox / email-to-booking
- ❌ AI no-show predict / AI triage som sanning
- ❌ Aisia / kamera/scalp (bakom feature flag — kräver "APPLY AISIA TO CCO")
- ❌ Fortnox-write (blockerad integration)

---

## 8 · Sync-risk-stängning (innan 4 juni)

| Risk | Status | Åtgärd |
|---|---|---|
| Manifest serveras inte via HTTP (`/data/reports/...` → 404) | ✅ **Hanterad** | Cursor inlinade customerIds i HTML — `fetch` behövs ej |
| Pilotknapparna disabled vid sidladdning | ✅ **Stängd** | Knapparna har riktiga `href` från första render |
| Cursor-manifest överensstämmer med HTML | ✅ **Verifierad** | 3 customerIds matchar mellan `cco-personal-demo-manifest.json` och `cco-personal-start.html` |
| Live-prod kör samma commit som lokal repo | ✅ | `c31536da` deployat |

---

## 9 · Smoke-test inför mötet (kör 4 juni morgon)

```bash
# 1. Probe live
curl -sS -o /dev/null -w "%{http_code}\n" https://arcana.hairtpclinic.com/cco-personal-start.html
# Förväntad: 200

# 2. Full preflight + readiness
node scripts/verify-personal-demo-links.js
node scripts/run-personal-demo-readiness.js
# Förväntad: ALL PASS
```

Om något inte är PASS — pinga mig, jag debuggar P0/P1 utan att bygga nytt.

---

## 10 · Referenser

- Cursors huvuddoc: `docs/strategy/CCO-PERSONAL-PRESENTATION-READINESS-2026-06-04.md`
- Cursors manifest: `docs/strategy/CCO-PERSONAL-DEMO-MANIFEST-2026-06-04.md`
- Cursors data: `data/reports/cco-personal-demo-manifest.json`
- Journal-readiness: `docs/strategy/CCO-JOURNALING-READINESS-2026-06-02.md` (GO + regression-memo)

_Ingen patientdata i denna rapport. Server.js orörd._
