# MA — dokumentplacering & genomförandeplan

Skapad 2026-05-22. Master-plan för att få in arkiv, juridik och journal i Major Arcana.

## Mål

| Lager   | Innehåll                         | Plats                                   |
| ------- | -------------------------------- | --------------------------------------- |
| Källa   | Word, zip, CSV, SharePoint       | `MA-Archive/` (utanför repo)            |
| Runtime | Importerad data, mallar, journal | `major-arcana/data/` + `/var/data` prod |
| UI      | Personalflöden                   | `/staff` → Kunder → Journal / Avtal     |

## Fas A — Arkivstädning + dokumentindex

**Mål:** Tydlig fysisk struktur, inget riskabelt i kod.

- [ ] Skapa `MA-Archive/` med undermappar: `juridik/`, `cliento/`, `journal-zips/`, `offert-word/`, `sharepoint/`
- [ ] Kopiera `Juridik-GDPR/` → `MA-Archive/juridik/`
- [ ] Kopiera Cliento-export → `MA-Archive/cliento/`
- [ ] Flytta färdiga journal-zip (ej `.crdownload`) → `MA-Archive/journal-zips/`
- [ ] Extrahera `Offertmallar-*.zip` → `MA-Archive/offert-word/`
- [ ] Ladda ner SharePoint-original (hälsodekl, friskförsäkran, TP Word) → `MA-Archive/sharepoint/`
- [ ] Uppdatera `Juridik-GDPR/INNEHALL-OCH-NYCKELPUNKTER.md`:
  - Gabrielle Handler process (konsultation → patientinfo → offert → avtal → bokning)
  - Bilaga 1 = patientinformation
  - Bilaga 3 = [Konsumentverkets ångerblankett](https://www.konsumentverket.se/for-foretag/konsumentratt-for-foretagare/om-konsumentratt/om-konsumentratt/angerblankett/) (extern, uppdateras av KO)
  - Gällande avtalsversion: `251203_Behandlingsavtal…docx`
  - Distans vs på-plats: betänketid endast vid distansavtal
- [ ] Flytta `JOURNAL-DATAMODELL.md` → `docs/strategy/JOURNAL-DATAMODELL.md`
- [ ] Länka denna plan från `docs/strategy/cco-patient-journal-build-plan.md`

**Klart när:** Alla filer har en känd plats och indexet beskriver version + juristflöde.

---

## Fas B — Pilotkunder + historikimport

**Mål:** Personal kan använda journal på riktiga kunder i prod.

- [ ] Välj 3–5 pilotkunder (namn, personnummer, Cliento-ID, Drive-profil)
- [ ] Verifiera att de finns i `migration-index.json` / Cliento-export
- [ ] Importera till prod `cco-patient-master.json` (script eller admin-flöde)
- [ ] Sätt `ARCANA_PILOT_PATIENT_IDS` i Render
- [ ] Per pilotkund: Journal → **Importera historik**
- [ ] Testa: behandlingsplan (Ta bild), TP-journal, spara, signera
- [ ] Dokumentera pilot-ID:n i `docs/strategy/cco-mobile-staff-journal-plan.md`

**Klart när:** Minst 3 kunder har profil + historik + fungerande journal i prod.

---

## Fas C — Behandlingsavtal-modul

**Mål:** Juristens flöde digitalt i MA (ersätter GetAccept för nya kunder).

**Spec (skriv först):**

- [ ] `docs/strategy/cco-treatment-agreement-spec.md` — distans/på-plats, betänketid, bilagor, signering

**Backend:**

- [ ] `ccoTreatmentAgreementStore.js` + `data/cco-treatment-agreements.json`
- [ ] Routes: skapa, skicka, signera, status, bilagor
- [ ] HTML-mall från `251203_Behandlingsavtal…docx`
- [ ] Auto-bifoga bilaga 1 (patientinfo PDF från befintlig route)
- [ ] Logg: patientinfo skickad (datum, kanal, version)
- [ ] Ångerblankett: länk till Konsumentverket i avtal + kundvy

**UI (kundkort):**

- [ ] Ny flik eller sektion **Avtal**
- [ ] Skicka patientinformation
- [ ] Skapa avtal från offert
- [ ] Skicka för signering
- [ ] Status: utkast / betänketid / signerad / bokningsbar

**Offert:**

- [ ] Moms-rad i offertmall om juristen kräver det

**Klart när:** Hela kedjan konsultation → offert → avtal → signerad går utan GetAccept.

---

## Fas D — Hälsodekl + friskförsäkran

**Mål:** Ersätta Pipedrive/SharePoint för pre-behandlingsunderlag.

- [ ] Importera Word-mallar till `MA-Archive/sharepoint/`
- [ ] Fältlista från `JOURNAL-DATAMODELL.md` avsnitt hälsodekl + friskförsäkran
- [ ] `journal-health-declaration-form.js` (mobil, samma mönster som TP)
- [ ] `journal-fitness-certificate-form.js`
- [ ] Integrera i kundkort: före eller vid konsultation
- [ ] Signera/lås enligt samma journal-API som TP

**Klart när:** Personal fyller hälsodekl i MA istället för externa system.

---

## Fas 6 — Booking kopplad till signerat avtal

**Mål:** Ingen behandlingstid bokas före signerat avtal (juristens punkt 5–6).

- [ ] `commercialCase.phase === 'agreement_signed'` som gate för bokning
- [ ] Cliento/booking-motor läser avtalsstatus från MA
- [ ] Av-/ombokningsregler från behandlingsavtal i boknings-UI
- [ ] E2E-test: offert → avtal → signera → boka

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
- `Juridik-GDPR/INNEHALL-OCH-NYCKELPUNKTER.md`
- Jurist: Gabrielle Handler, Nordbro — processmail 2025
