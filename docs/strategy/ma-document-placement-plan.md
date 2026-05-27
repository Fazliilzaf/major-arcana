# MA — dokumentplacering & genomförandeplan

Skapad 2026-05-22. Master-plan för att få in arkiv, juridik och journal i Major Arcana.

## Mål

| Lager   | Innehåll                         | Plats                                   |
| ------- | -------------------------------- | --------------------------------------- |
| Källa   | Word, zip, CSV, SharePoint       | `~/Code/MA-Archive/` (utanför repo)     |
| Runtime | Importerad data, mallar, journal | `major-arcana/data/` + `/var/data` prod |
| UI      | Personalflöden                   | `/staff` → Kunder → Journal / Avtal     |

## Fas A — Arkivstädning + dokumentindex

**Mål:** Tydlig fysisk struktur, inget riskabelt i kod.

- [x] Skapa `MA-Archive/` med undermappar: `juridik/`, `cliento/`, `journal-zips/`, `offert-word/`, `sharepoint/`
- [x] Kopiera `Juridik-GDPR/` → `MA-Archive/juridik/` (symlink `juridik-source/`)
- [x] Kopiera Cliento-export → `MA-Archive/cliento/`
- [x] Flytta färdiga journal-zip (ej `.crdownload`) → `MA-Archive/journal-zips/`
- [x] Extrahera `Offertmallar-*.zip` → `MA-Archive/offert-word/` (`scripts/sync-offert-archive.sh`, 14 docx 2026-05-23)
- [x] SharePoint-original → `~/Code/MA-Archive/sharepoint/` via `scripts/sync-sharepoint-archive.sh` (**GitHub repo**, inte Word-nedladdning)
- [x] Uppdatera juridik-index (`docs/legal/juridik-gdpr/INNEHALL-OCH-NYCKELPUNKTER.md`):
  - Gabrielle Handler process (konsultation → patientinfo → offert → avtal → bokning)
  - Bilaga 1 = patientinformation
  - Bilaga 3 = [Konsumentverkets ångerblankett](https://www.konsumentverket.se/for-foretag/konsumentratt-for-foretagare/om-konsumentratt/om-konsumentratt/angerblankett/) (extern, uppdateras av KO)
  - Gällande avtalsversion: `251203_Behandlingsavtal…docx`
  - Distans vs på-plats: betänketid endast vid distansavtal
- [x] Flytta `JOURNAL-DATAMODELL.md` → `docs/strategy/JOURNAL-DATAMODELL.md`
- [x] Länka denna plan från `docs/strategy/cco-patient-journal-build-plan.md`

**Klart när:** Alla filer har en känd plats och indexet beskriver version + juristflöde.

---

## Fas B — Pilotkunder + historikimport

**Mål:** Personal kan använda journal på riktiga kunder i prod.

- [x] Välj 3–5 pilotkunder (namn, personnummer, Cliento-ID, Drive-profil)
- [x] Verifiera att de finns i `migration-index.json` / Cliento-export
- [x] Importera till prod `cco-patient-master.json` (script eller admin-flöde)
- [x] Sätt `ARCANA_PILOT_PATIENT_IDS` i Render
- [x] Per pilotkund: Journal → **Importera historik**
- [x] Testa: behandlingsplan (Ta bild), TP-journal, spara, signera
- [x] Dokumentera pilot-ID:n i `data/pilot-patients.json`

**Klart när:** Minst 3 kunder har profil + historik + fungerande journal i prod.

---

## Fas C — Behandlingsavtal-modul

**Mål:** Juristens flöde digitalt i MA (ersätter GetAccept för nya kunder).

**Spec (skriv först):**

- [x] `docs/strategy/cco-treatment-agreement-spec.md` — distans/på-plats, betänketid, bilagor, signering

**Backend:**

- [x] `ccoTreatmentAgreementStore.js` + `data/cco-treatment-agreements.json`
- [x] Routes: skapa, skicka, signera, status, bilagor
- [x] HTML-mall från `251203_Behandlingsavtal…docx`
- [x] Auto-bifoga bilaga 1 (patientinfo PDF från befintlig route)
- [x] Logg: patientinfo skickad (datum, kanal, version)
- [x] Ångerblankett: länk till Konsumentverket i avtal + kundvy

**UI (kundkort):**

- [x] Ny flik eller sektion **Avtal**
- [x] Skicka patientinformation
- [x] Skapa avtal från offert
- [x] Skicka för signering
- [x] Status: utkast / betänketid / signerad / bokningsbar

**Offert:**

- [x] Moms-rad i offertmall om juristen kräver det

**Klart när:** Hela kedjan konsultation → offert → avtal → signerad går utan GetAccept.

---

## Fas D — Hälsodekl + friskförsäkran

**Mål:** Ersätta Pipedrive/SharePoint för pre-behandlingsunderlag.

- [x] Importera Word-mallar till `MA-Archive/sharepoint/` (delvis — kör `scripts/sync-sharepoint-archive.sh`)
- [x] Fältlista från `JOURNAL-DATAMODELL.md` avsnitt hälsodekl + friskförsäkran
- [x] `journal-pre-treatment-forms.js` (hälsodekl + friskförsäkran, mobil)
- [x] Integrera i kundkort: före konsultation (gate på behandlingsplan)
- [x] Signera/lås enligt samma journal-API som TP

**Klart när:** Personal fyller hälsodekl i MA istället för externa system.

---

## Fas 6 — Booking kopplad till signerat avtal

**Mål:** Ingen behandlingstid bokas före signerat avtal (juristens punkt 5–6).

- [x] Behandlingsavtal `agreementStatus === 'bookable'` som gate för behandlingsbokning
- [x] Bokningsmotor läser avtalsstatus från MA (`ccoTreatmentBookingGate.js`)
- [x] Avbokning tillåten; ombokning/reserve/confirm spärrad utan avtal
- [x] Prod-verifiering: `scripts/verify-pilot-journey-prod.sh`
- [x] E2E prod (alla 5 pilotkunder): `scripts/run-pilot-e2e-all-prod.sh` + `scripts/verify-all-pilot-journey-prod.sh`

**Klart när:** Bokning blockeras tills avtal signerat; efter signering öppnas Cliento/plan A.

---

## Beroenden

```
Fas A ──► Fas B ──► Fas C ──► Fas 6
              └──► Fas D (parallellt efter B)
```

## Referenser

- [cco-patient-journal-build-plan.md](./cco-patient-journal-build-plan.md)
- [cco-mobile-staff-journal-plan.md](./cco-mobile-staff-journal-plan.md)
- [PROJECT-CHECKLIST.md](./PROJECT-CHECKLIST.md) — samlad projektchecklista
- `Juridik-GDPR/INNEHALL-OCH-NYCKELPUNKTER.md`
- Jurist: Gabrielle Handler, Nordbro — processmail 2025

---

## Fas C, Inline-docs i admin per sektion (planerat 2026-05-28, onsdag förmiddag)

**Mål:** Varje dokument visas inline i den admin-sektion det beskriver, inte gömt
i CAO-Workspace-fliken. Booking-docs vid bokningsmotorn, journal-docs vid journal,
legal-docs vid GDPR-vyn, osv.

**Förkrav:**
- Dagtid (personal i beredskap för snabb rollback om något bryts).
- Frankfurt-migrationen rör inte admin.html, så detta arbete kan göras parallellt
  innan söndagens cutover utan att blockas av den.

**Steg:**
1. Bygg reusable `<DocsForSection sectionId="...">`-widget (vanilla JS,
   anropar GET `/api/v1/docs/section/:sectionId` och renderar collapse-lista).
2. Mockup på 1 sektion (Journal) → fazli godkänner visuellt.
3. Rulla ut samma pattern till de 17 andra sektionerna (Booking, Settings,
   Team, Ops, Templates, Reviews, Audit, CCO, COO, CAO, CFO, CMO, Legal, etc).
4. Behåll CAO-Workspace-fliken som översikt-vy parallellt.
5. Lägg topp-nivå "Docs"-länk i admin som hoppar till CAO-översikten.

**Backend:** redan på plats (`src/ops/contextualDocs.js` + 3 endpoints under
`/api/v1/docs/`). Inga backend-ändringar krävs, bara UI-integration.

**Beslut:** sparat på Fazlis begäran 2026-05-27 sent kväll.
