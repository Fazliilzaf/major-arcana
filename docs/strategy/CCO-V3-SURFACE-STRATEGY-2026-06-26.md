# CCO v3 — Yt-strategi, logik & funktion (detaljerad plan)

_Datum: 2026-06-26 · Status: arbetsdokument · Omfattar alla `cco-*-v3`-prototyper under `public/major-arcana-preview/`_

Det här dokumentet svarar på tre saker för **varje yta vi skickat/byggt hittills**:
1. **Vad är byggt** (status)
2. **Vad behöver vi det till** (funktion + vilket område det hör hemma i)
3. **Strategi, logik & data** (hur det ska fungera + vilken riktig kod/API det kopplas mot)

Allt är responsiva, självständiga HTML-prototyper på en gemensam **WCAG-härdad foundation** (varm palett ≥4.5:1, touch ≥44px, rem/clamp) + den riktiga **5-items duoton-bottom-naven** (Hem · Boka · Kalender · Kund · Journal). Inget är ännu kopplat mot riktig data — det är nästa fas.

---

## 1. Informationsarkitektur — så hänger ytorna ihop

CCO är en **operatörsarbetsyta** för en klinik (Hair TP / Curatiio). Ytorna delas i sju funktionsområden:

```
A. OPERATIV KÄRNA (dagligt arbete)        → bottom-nav + topp-nav
B. TRIAGE & GRANSKNING (köer operatören jobbar i)
C. JOURNAL & SÄKERHETSGRINDAR (compliance före permanent åtgärd)
D. FINANS (owner/finance/revisor)
E. DRIFT & ADMIN (styrning)
F. ONBOARDING & UTBILDNING (personal)
G. PATIENT (patientvänd, annan publik)
```

**Navigations-strategi:**
- **Bottom-nav (mobil/primär):** Hem · Boka · Kalender · Kund · Journal — de fem mest använda destinationerna.
- **Topp-nav / kommandopalett (⌘K):** hoppar till alla operativa ytor (Konversationer, Analys, Automatisering, Senare, Skickat, Integrationer, Makron, Inställningar, Showcase) utan att lämna arbetsflödet.
- **Console-ytor** (Ops Workbench, Admin, Drift) nås från Hem/Mer — inte i bottom-naven.
- **Finans + Patient** är egna inloggnings-/rollgränssnitt (auth-gated).

---

## 2. Inventering & status (42 byggda v3-ytor)

Legend: ✅ byggt & verifierat · ♻️ uppgradering rekommenderas (rikare underlag finns) · 🧹 dubblett att städa · 🆕 gap (ej byggt)

### A. Operativ kärna
| Yta | Fil | Status | Funktion |
|-----|-----|--------|----------|
| Konversationer (unified inbox) | `cco-konversationer-v3` | ✅ | Tråd-arbetsyta: rail→lista→tråd→kontext. Mejl över 5 brevlådor. |
| Kunder | `cco-kunder-v11` | ✅ | Kundregister + kundkort/dossier (V12-DNA). |
| Kalender | `cco-kalender-v8` | ✅ | Vecko-/dagvy, bokningar, koppling till kundpanel. |
| Analys (enkel) | `cco-analys-v3-2` | 🧹→konsolidera | Operativ telemetri + team + coaching (in-app-källa). |
| **Analytics 2.0 (rik)** | `cco-analytics-v3` | ✅ (PR #323) | KPI-sparklines, stapeldiagram, donut, behandlings-breakdown, AI-insikter. **Ersätter analys-v3-2.** |
| Senare | `cco-senare-v3` | ✅ | Snoozade **konversationer** att återuppta (master-detail). |
| Skickat | `cco-skickat-v3` | ✅ | Skickade meddelanden (mail-feed). |
| Automatisering | `cco-automatisering-v3` | ✅ | Flödesbyggare (6 flikar: Byggare/Analys/Mallar/Testing/Versioner/Autopilot). |
| Makron (automation) | `cco-makron-v3` | ✅ | "Makron & arbetsflöden" — automation-makron. |
| Inställningar | `cco-installningar-v3-2` | ♻️ | 12 paneler. **Underlaget (arkiv) är mycket rikare** (policy, cron, SMS, mailbox-admin, brand-isolation, push, per-user). |
| Showcase | `cco-showcase-v3` | ✅ | Funktions-explorer för power features. (Arkiv-versionen = identisk.) |
| ~~Analys v3~~ | `cco-analys-v3` | 🧹 ta bort | Superseded av v3-2 + analytics. |
| ~~Inställningar v3~~ | `cco-installningar-v3` | 🧹 ta bort | Superseded av v3-2. |

### B. Triage & granskning
| Yta | Fil | Status | Funktion |
|-----|-----|--------|----------|
| AI Triage | `cco-ai-triage-v3` | ✅ (arkiv rikare ♻️) | 3-bucket sortering (Akut/Idag/v.22), routing-rails, SLA, AI-skäl, send-actions. |
| Import Review | `cco-import-review-v3` | ✅ | Osäkra kundmatchningar (READ-ONLY canary). |
| Bildgranskning | `cco-photo-review-v3` | ✅ | Foto-kö, stadium/bodyArea-filter, godkänn/avvisa. |
| Mail-berikning | `cco-mail-review-v3` | ✅ | Tvetydig mail-review, ≥3-fält-regel före approve. |

### C. Journal & säkerhetsgrindar
| Yta | Fil | Status | Funktion |
|-----|-----|--------|----------|
| Smart anteckning | `cco-smart-anteckning-v3` | ♻️ | Snabb anteckning → AI-strukturerad journal (draft→signed-skydd). Arkiv-underlag rikare. |
| Pre-signering-check | `cco-pre-signering-v3` | ✅ | 5-stegs identitetscheck före Signera. |
| Review-material-varning | `cco-review-warning-v3` | ✅ | "Använd inte review-material som klinisk sanning". |
| Journal Safety Helper | `cco-journal-safety-v3` | ✅ | 6-frågors säkerhetsflöde före permanent åtgärd. |
| Journalbygge | `cco-journalbygge-v3` | ✅ | Översikt journalmotor + endpoints + paritet. |
| Journal QA | `cco-journal-qa-v3` | ✅ | Cutover-QA-dashboard (5 statusblock + DoD). |

### D. Finans (auth-gated)
| Yta | Fil | Status | Funktion |
|-----|-----|--------|----------|
| Chief of Finance | `cco-finance-v3` | ✅ | Kvitto-inkorg, uppladdning (SHA256), återkommande kostnader. |
| Revisor-portal | `cco-revisor-v3` | ✅ | Read-only granskning, export-batches + detalj. |
| Finansrapporter & Månadsstängning | `cco-finansrapporter-v3` | ✅ | Period-state-machine, checklista, 12 rapport-typer. |

### E. Drift & admin
| Yta | Fil | Status | Funktion |
|-----|-----|--------|----------|
| Operatörsdashboard (Hem) | `cco-operator-dashboard-v3` | ✅ | Operatörens översikt (utkast, tråd-states, cron, kundresa, mailbox-täckning). |
| Ops Workbench | `cco-ops-workbench-v3` | ✅ | Migration/drift-konsol (spår A–D, eskaleringskö, status). |
| Admin | `cco-admin-v3` | ✅ | 14 sektioner (Översikt/Mallar/Granskningar/Incidenter/Revision/Team/Inställningar/Drift/COO/CAO/CFO/CMO/CCO/CM). |
| Drive-historik | `cco-drive-historik-v3` | ✅ | 8 år av behandlingar (deeplinks per år/brand). |

### F. Onboarding & utbildning
| Yta | Fil | Status |
|-----|-----|--------|
| Efter mötet — börja här | `cco-after-meeting-v3` | ✅ |
| Presenter Mode | `cco-presenter-mode-v3` | ✅ |
| Personal Go-Live Control | `cco-staff-go-live-v3` | ✅ |
| Personal Training Mode | `cco-staff-training-v3` | ✅ |
| Personal-start | `cco-personal-start-v3` | ✅ |
| Morgon-checklist | `cco-morning-checklist-v3` | ✅ |

### G. Patient (patientvänd)
| Yta | Fil | Status |
|-----|-----|--------|
| Patient-hub | `cco-patient-hub-v3` | ✅ |
| Patient-portal | `cco-patient-portal-v3` | ✅ |

### Funktionsytor (kod-backed, byggda)
| Yta | Fil | Status | Backing |
|-----|-----|--------|---------|
| AI Coach | `cco-ai-coach-v3` | ✅ (PR #323) | `/cco-telemetry/coaching` |
| Signaturer & samtycken | `cco-signaturer-v3` | ✅ | `patientDocumentSignRegistry`, `ccoTreatmentAgreementStore` |
| Notiser | `cco-notiser-v3` | ♻️ | `/cco-notifications/feed` (arkiv har 23 riktiga kinds) |
| Bokningsguide | `cco-booking-wizard-v3` | ✅ (arkiv rikare ♻️) | `ccoBookingEngineStore` |
| Uteblivna besök (no-show) | `cco-no-show-v3` | ✅ | `ccoKunderEnrichment` |

---

## 3. Gap-analys — vad saknas (genuint nytt)

| Behov | Varför | Underlag | Backing-API |
|-------|--------|----------|-------------|
| 🆕 **Macros (text-expansion)** | Snabbsvar i Svarstudio: skriv `/pris` → expanderas till mall med `{{variabler}}`. **Annan funktion** än automation-Makron. Sparar sekunder × tusentals svar. | Arkiv `macros.html` | (ny: snippet-store + variabel-resolver mot kundkort) |
| 🆕 **Later & Sent (utskickskö)** | Schemalagda **utskick** (auto/manuella flows, Cancel före sändning) + skickat-arkiv med deliverability/open/click. **Inte** = Senare (snoozade konversationer). | Arkiv `latersent.html` | `/cco-send/*`, `/cco-comm/drafts` |

**Underlag-lösa (ej i koden, kräver spec innan bygge):** email-to-booking (delvis täckt av Triage→Bokningsguide), onboarding-tour, pwa-install, print, m-kalender-demo.

---

## 4. Konsolidering & städning (innan data-koppling)

1. **Ta bort superseded dubletter:** `cco-analys-v3.html`, `cco-installningar-v3.html` (ersatta av `-v3-2`).
2. **Analys-spår:** behåll **`cco-analytics-v3`** (rik 2.0) som kanonisk; `cco-analys-v3-2` blir en enklare variant eller fasas ut. Beslut behövs: en eller två analys-ytor?
3. **Uppgradera mot rikare arkiv-underlag:** Inställningar, Notiser, Smart anteckning, AI Triage, Bokningsguide → till de kanoniska 2.0-designerna (behåll mina datakopplingar, lyft UI:t).

---

## 5. Logik & data-kopplingsplan (per område)

När designen är låst kopplas varje yta mot sin **riktiga endpoint** (alla finns redan i backend):

| Område | Ytor | Endpoints |
|--------|------|-----------|
| **Telemetri/Analys/Coach** | Analytics, Operatörsdashboard, AI Coach | `/cco-telemetry/{live,leaderboard,team,coaching}` · `/cco-analytics/export` |
| **Notiser** | Notiser, (topbar-klocka) | `/cco-notifications/{feed,mark-read,push-subscriptions,sms-config,cron-jobs}` |
| **Send/Triage** | AI Triage, Mail-review, Later&Sent | `/cco-send/{kind}` · `/cco-send/stats` · `/cco-comm/drafts` |
| **Bokning** | Bokningsguide, Kalender, No-show | `/cco-booking-engine/{reservations,confirm,cancel,rebook,case-summary}` · `/cco-bookings/{slots,candidates,ref-data,event}` |
| **Journal** | Smart anteckning, Journalbygge | `/cco-journal-quick/{entry}` · `/cco-ai/extract` (draft→signed-guard) |
| **Finans** | Finance, Revisor, Finansrapporter | `/cco-cf/*` · `/cco-fortnox/*` · `/cco-swish/*` |
| **Inställningar/Admin** | Inställningar, Admin | `/cco-policies/*` · `/cco-users/*` · `/cco-brands` · `/cco-compliance-scan/*` |
| **Integrationer** | Integrationer | `/cco-fortnox/*` · `/cco-swish/*` + integration-katalog |
| **Signaturer** | Signaturer, Pre-signering | `patientDocumentSignRegistry` · `/cco-workspace/*` |

**Genomgående regler (logik):**
- **Journal-skydd:** AI får aldrig auto-skriva. Allt är `draft` tills människa signerar (`draft→signed`, locked).
- **Send-gate:** send-actions körs i dry-run tills `CCO_SEND_DRY_RUN=false`; varje send audit-loggas; compliance-bekräftelse innan live.
- **RBAC:** finans/admin/revisor är rollgated (owner/finance/revisor); patient-ytor är egen publik.
- **Audit:** alla statusändringar (policy, signering, period-stängning) loggas.

---

## 6. Detaljerad faseplan

**Fas 0 — Städning & beslut (snabb)**
- [ ] Ta bort `cco-analys-v3`, `cco-installningar-v3` (dubletter).
- [ ] Beslut: en analys-yta (`analytics`) eller behåll båda?
- [ ] Beslut: bygg `macros (text-expansion)` + `later-sent`? (gap)
- [ ] Beslut: uppgradera Inställningar/Notiser/Smart-anteckning/Triage/Booking till 2.0-underlag?

**Fas 1 — Design-konsolidering (om beslut = ja)**
- [ ] Bygg gap-ytorna (macros, later-sent) faithfully från arkiv-underlag.
- [ ] Uppgradera de fyra ♻️-ytorna till kanoniska 2.0-designer.
- [ ] En PR per logiskt paket, draft → Bugbot → merge.

**Fas 2 — Index & navigation**
- [ ] Samla alla v3-ytor i en preview-index med rätt gruppering (A–G).
- [ ] Wire kommandopaletten (⌘K) + bottom-nav till rätt ytor.

**Fas 3 — Data-koppling (yta för yta)**
- [ ] Bakom en flagga (default OFF): byt demo-data mot fetch mot endpoint (tabellen i §5).
- [ ] Per yta: loading/empty/error/403-states + audit + RBAC.
- [ ] Verifiera mot riktig backend (dry-run för send/journal).

**Fas 4 — Cutover**
- [ ] Flagga per yta ON i staging → verifiera → produktion.
- [ ] Avveckla gamla (icke-v3) sidor när v3 är live.

---

## 7. Beslutspunkter jag behöver från dig

1. **Analys:** behåll bara `cco-analytics-v3` (rik), eller både den + enkla `analys-v3-2`?
2. **Gap:** bygger vi `macros (text-expansion)` + `later-sent`?
3. **Uppgraderingar:** kör vi 2.0-uppgradering av Inställningar / Notiser / Smart anteckning / AI Triage / Bokningsguide?
4. **Städning:** OK att ta bort de två superseded dubbletterna?
5. **Prioritet:** vill du fortsätta på design-spåret (fas 0–1) eller hoppa till data-koppling (fas 3) för de viktigaste ytorna?
