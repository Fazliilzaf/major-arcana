# CUTOVER PLAN — CCO som enda systemet

*Skapad: 2026-05-30 · Owner-beslut: Meridiq + Cliento bort, CCO tar över alla 4 områden*

## Strategiskt beslut

CCO ska ersätta **Meridiq** (journal) och **Cliento** (bokning + POS + kundregister) som enda systemet för Hair TP Clinic + Curatiio. Inga parallella subscriptions efter v24.

**Booking-strategi (Fas 3): bygg helt i CCO** — högst risk, högst långsiktigt värde.

## 4 områden CCO ska ta över

| Område | Idag | Mål | Mognad NU |
|---|---|---|---|
| Patient-master | Cliento (7 250) + Meridiq (6 455) | **CCO ccoCustomerStore** | ✅ **100% (Fas 1 KLAR)** |
| Journal | Meridiq | **CCO ccoJournalStore** | 🟡 75% (saknar historisk-import) |
| Bokning + kalender + resurser | Cliento | **CCO ny booking-engine** | 🟠 20% (största gapet) |
| POS + kassa + utskick | Cliento + manuellt | **CCO (eller integrerad vendor)** | 🟠 5% (vendor-beslut behövs) |

## 5-fas-plan · 24 veckor

### Fas 1 — Customer-master cutover (v1-2) ✅ **KLAR 2026-05-30**

**Outcome:** CCO är Hair TP:s patient-master. Meridiq + Cliento read-only.

| Steg | State |
|---|---|
| Importera 7 250 Cliento-kunder | ✅ |
| Importera 6 455 Meridiq-patienter, de-dup | ✅ |
| Berika 6 261 matched med `meridiqMeta` | ✅ |
| Skapa 7 nya CCO-kunder för Meridiq-only | ✅ |
| Flagga 989 leads med `noMeridiqJournal: true` | ✅ |
| Backup-tag `data/cco-customers.pre-meridiq-commit-*.json` | ✅ |

**Final state:** 7 257 unika kund-keys (Hair TP-tenant), 100% har minst en identifierare.

**Reproducerbart:**
```bash
node scripts/import-meridiq-customers.js \
  --xlsx ".../Migration-data/meridiq-patients-2026-05-30.xlsx" \
  --commit
```

### Fas 2 — Journal-cutover (v3-8) 🟡 PÅGÅR

**Outcome:** Alla nya entries i CCO. Meridiq strikt read-only.

| Sprint | Steg | Ansvar |
|---|---|---|
| v3 | Wendela testkör smart-anteckning på 1 patient parallellt med Meridiq | Owner+Wendela |
| v4 | Utvärdera. Om OK → rulla ut till 5 staff | Owner |
| v5-6 | Bygg Meridiq read-only-läsare i CCO smart-anteckning (referens-panel) | CCO-dev |
| v7 | Bulk-import av 6 391 Meridiq-journaler till CCO (read-only-arkiv) | CCO-dev |
| v8 | Meridiq-write-access tas bort. Cutover komplett för journal. | Owner |

**Risker:**
- Staff motvilja → mitigera med träning + cheat-sheet
- Datakvalitet i historisk-import → mitigera med dry-run + samples

### Fas 3 — Booking-cutover (v9-16) 🟠 STÖRST RISK

**Outcome:** CCO är enda bokningssystemet. Cliento avstängt.

| Sprint | Steg | Ansvar |
|---|---|---|
| v9 | Bygg booking-engine: resurs-schema (6 staff × kalender-blocks) | CCO-dev |
| v10 | Booking-CRUD + conflict-detection | CCO-dev |
| v11 | Online-booking-widget (publik) | CCO-dev |
| v12 | Drop-in-flöde + walk-in-handling | CCO-dev |
| v13 | Bokningsbekräftelse + 24h-påminnelse via CCO (email + SMS) | CCO-dev |
| v14 | Historisk Cliento-data-import (9 års bokningshistorik) | CCO-dev |
| v15 | Parallell drift Cliento + CCO för stress-test | Alla |
| v16 | Cutover. Cliento-bokning avstängt. CCO enda. | Owner |

**Risker:**
- Daglig drift-disruption → mitigera med parallell drift v15
- Online-booking-widget bug → mitigera med beta-period
- Resurs-konflikter under cutover → mitigera med backup-plan + retreat-strategy

**Beslutspunkter under fasen:**
- v11: vill vi behålla Cliento publik-widget under cutover eller bygga ny direkt?
- v13: SMS-leverantör (Twilio, 46elks, Sendinblue)?
- v15: hur länge ska parallell drift köras (1v eller 2v)?

### Fas 4 — POS + utskick (v17-20) 🟠 VENDOR-BESLUT

**Outcome:** Kassa/kvitto/utskick i CCO eller integrerad vendor.

| Sprint | Steg |
|---|---|
| v17 | Vendor-beslut: bygg själv vs Stripe Terminal vs Square vs annan |
| v18 | Implementera kassa-flöde (POS) |
| v19 | Marketing-utskick — flytta från Cliento Utskick (redan klart i CCO Steg 8) |
| v20 | Gift-card-handling + lagerhantering |

**Vendor-alternativ:**
| Vendor | Pros | Cons |
|---|---|---|
| Bygg själv | Full kontroll, billigast på lång sikt | 4-6v + PCI-compliance |
| Stripe Terminal | Modernt, bra API, svenska QR-kvitton | ~2.5% per transaktion |
| Square | Etablerat, hyfsad app | ~2.4% + svensk-stöd osäkert |
| Cliento POS (behåll) | 0 jobb, fungerar idag | Strider mot cutover-målet |

### Fas 5 — Sunset (v21-24) ⚪ PLANERAD

**Outcome:** Meridiq + Cliento subscriptions uppsagda. CCO ensam.

| Sprint | Steg |
|---|---|
| v21 | Final data-export från Meridiq → CCO read-only-arkiv |
| v22 | Final data-export från Cliento → CCO read-only-arkiv |
| v23 | Säg upp Meridiq + Cliento subscriptions |
| v24 | Post-cutover-audit. PDL 10-års-retention verifierad i CCO. |

## Compliance-track (parallellt över alla faser)

**PDL-krav som måste hålla varje vecka:**
- ✅ 10-års-retention på alla journals (hard-block redan i CCO)
- ✅ Audit-trail per patient-touchpoint
- ✅ Tamper-hash på låsta journals
- ✅ Personnummer för entydig identifiering (BLOCKED: 0.2% i Meridiq → behöver byggas upp)
- ⚠️ ID-verifiering vid varje besök (Steg 3.2 finns, måste aktiveras i staff-flow)

**GDPR-krav:**
- ✅ Marketing-consent opt-in/opt-out (Steg 8)
- ✅ Photo-consent (Sprint 1.4)
- ✅ Rätt att bli glömd — 989 leads kan raderas på begäran
- ⚠️ Data Protection Impact Assessment (DPIA) för cutover — behöver göras

## Risk-matris

| Risk | Sannolikhet | Impact | Mitigering |
|---|---|---|---|
| Cliento-cutover disrupterar daglig drift | Hög | Hög | Parallell drift v15, retreat-plan, backup-kalender |
| Staff motvillig till nya systemet | Medel | Medel | Träning + cheat-sheet + parallell journalering v3-7 |
| Meridiq read-only-API ej tillgänglig | Låg | Hög | Eskalera till Meridiq vendor v3, fallback: manuell export |
| Drive-photos kopplas fel patient | Medel | Medel | AI Fas 3 auto-tagging + manuell review v9-12 |
| PDL-revisions efter cutover | Låg | Mycket hög | DPIA klar v8, juridik-review v20 |
| Booking-conflicts under parallell drift | Hög | Medel | Source-of-truth-flagg per booking, manuell konfliktlösning |

## Beslut-loggning

| Datum | Beslut | Av | Källa |
|---|---|---|---|
| 2026-05-30 | Cutover-strategi godkänd: full CCO take-over | Owner | Chat |
| 2026-05-30 | Booking-strategi: bygg helt i CCO | Owner | AskUserQuestion |
| 2026-05-30 | Fas 1 körs idag (Meridiq commit) | Owner | AskUserQuestion |
| 2026-05-30 | Fas 1 KLAR — 6 268 enrichments, 989 leads, 7 nya | System | scripts/import-meridiq-customers.js |
| TBD | Fas 2 staff-träning datum | Owner | Veckomöte |
| TBD | Fas 3 SMS-vendor | Owner | v13 |
| TBD | Fas 4 POS-vendor vs bygg själv | Owner | v17 |

## Milestones

| Vecka | Milestone | Verifierbar |
|---|---|---|
| v2 | Patient-master cutover klar | ✅ 7 257 keys i CCO, 6 268 med meridiqMeta |
| v4 | Wendela aktivt journalför i CCO | Audit-event count > 0 |
| v8 | Meridiq read-only | Meridiq write-API blockerar 100% |
| v12 | Online-booking i beta | Publik URL fungerar |
| v16 | Cliento avstängt | Cliento dashboard tom |
| v20 | POS-vendor live | First POS-transaction loggad |
| v24 | Cutover komplett | Subscription-cancellations bekräftade |

## Vad jag (agent) gör mellan owner-actions

När du inte är aktiv:
- Fas 2: bygger Meridiq read-only-läsare + smart-anteckning enhancements
- Fas 3: bygger booking-engine modul för modul
- Drive AI Fas 3: när service-account är klar, kör AI-features
- Tester + smoke-tests + commits för varje sprint

## Reproducerbarhet av nuvarande state

Vid varje fas-slut tas en backup-tag i git + en JSON-backup av relevanta stores:
```bash
# Inför Fas 2:
git tag cutover/v2-customer-master-complete
cp data/cco-customers.json data/cco-customers.v2-checkpoint.json
```

Återställning vid problem:
```bash
git checkout cutover/v2-customer-master-complete -- data/
```

---

*Status: Fas 1 KLAR. Fas 2 PÅGÅR. Nästa milestone: v4 Wendela aktiv i CCO.*

*Live-track i denna fil. Uppdateras vid varje större milestone.*
