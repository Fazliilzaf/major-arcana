# Channel Document Inventory — 7 källkanaler

*Steg 10.2 av 11-stegs CCO/Hair TP Clinic compliance-audit. Föregående: [`MERIDIQ-DOCUMENT-COVERAGE-REPORT.md`](./MERIDIQ-DOCUMENT-COVERAGE-REPORT.md) (228 dokument, 100 % coverage).*

> **Scope:** Inventera **alla** kanaler som producerar journal-/samtyckes-/avtals-/kommunikations-dokument för Hair TP Clinic + Curatiio och klassificera vad som **finns i repo**, vad som **finns utanför repo** (iCloud Migration-data) och vad som **saknas helt**.
>
> **Sekretess:** Den här filen citerar inga personnummer, namn, e-post eller telefonnummer. Endast antal, filstorlekar, schema-metadata och kategoriseringar.

---

## Klassificeringsnyckel

| Kod | Betydelse |
|---|---|
| `clinical_template` | Tomt journal-/hälsodeklarations-formulär (mall) |
| `patient_document` | Ifylld journal eller patientuppgift (innehåller PII) |
| `legal_template` | Tom juridisk mall (villkor, distansköp, ångerrätt) |
| `consent_template` | Tom samtyckes-mall (foto, marknadsföring, behandling) |
| `agreement_template` | Tom behandlingsavtals-mall |
| `aftercare_template` | Tom eftervårdsmall / instruktion |
| `communication_template` | SMS/email-mall (påminnelse, bokningsbekräftelse) |
| `workflow_rule` | Triggers, lead-time, status-övergångar |
| `migration_record` | Råexport från legacy-system (Cliento/Pipedrive) |
| `outdated_document` | Föråldrad version (ska markeras `archive=true`) |
| `unknown` | Oklassificerat — kräver manuell review |

---

## Kanalöversikt

| # | Kanal | Rådata-finns | Antal dokument | Format | Plats | Klassificering | GitHub-OK? | CCO-OK? | Status |
|---:|---|:---:|---:|---|---|---|:---:|:---:|---|
| 1 | **Meridiq** | ✅ | 151 (16+39+14+82) | JSON-katalog | `migration/meridiq/*.json` | clinical_template + consent_template + agreement_template + workflow_rule | ✅ ja | ✅ ja | **Komplett** (Steg 10.1) |
| 2 | **Cliento** | ✅ delvis | ~9 + 7 676 kunder | JSON + CSV | `migration/cliento/`, `migration/cliento-*.json`, iCloud `Migration-data/cliento-customers-2026-05-29.csv` | migration_record + workflow_rule | ✅ JSON / ❌ CSV (PII) | ✅ ja | **Delvis** — strukturerad, kundbas i iCloud |
| 3 | **Pipedrive** | ⚠️ flyttad | 3 694 personer + 3 487 affärer | CSV | iCloud `Migration-data/pipedrive-2026-05-24/` | migration_record | ❌ NEJ (PII, raderad i commit `19718e8`) | ✅ ja | **Flyttad** — endast README i repo |
| 4 | **Drive** | ❌ | ~1 981 profiler (refererat) | PDF/DOCX | Google Drive API (live på prod) | patient_document + agreement_template + outdated_document | ❌ NEJ (PII) | ✅ ja (säker arkivlagring) | **Saknas i repo** — endast online via Drive API |
| 5 | **Nordbro** | ⚠️ endast versioner | 14 mall-versioner | JSON-mapping | `config/external-template-versions.json` | legal_template + consent_template (proxy) | ✅ ja (versioner) | ✅ ja | **Versionsspårning** — råa PDFs saknas |
| 6 | **Insatt** | ⚠️ endast versioner | 4 mall-versioner | JSON-mapping | `config/external-template-versions.json` | legal_template + agreement_template (proxy) | ✅ ja (versioner) | ✅ ja | **Versionsspårning** — råa PDFs saknas |
| 7 | **GetAccept** | ❌ | okänt antal signerade avtal | PDF | GetAccept-konto (online) | patient_document + agreement_template (signerad) | ❌ NEJ (PII) | ✅ ja (export-arkiv) | **Saknas helt** — ingen export, ingen volym känd |

**Totalt repo-spårbara dokument-objekt (mallar/struktur):** 151 (Meridiq) + 9 (Cliento JSON) + 18 (versioner) + 77 (CCO-templates) ≈ **255 mallar/strukturer**, **0 patientdata i repo**.

---

## 1. Meridiq — ✅ Komplett

| Fil | Storlek | Objekt | Klassificering |
|---|---:|---:|---|
| `migration/meridiq/questionary-catalog.json` | 81 530 B | 16 formulär | clinical_template |
| `migration/meridiq/consent-catalog.json` | 81 236 B | 39 samtycken | consent_template + agreement_template |
| `migration/meridiq/journal-schema-catalog.json` | 112 552 B | 14 scheman | clinical_template |
| `migration/meridiq/service-bindings-catalog.json` | 30 314 B | 82 bindings | workflow_rule |

**Status:** ✅ 100 % parsbart (Steg 10.1). 0 PII, hashar i stället för citerad letterText.
**GitHub:** ✅ inga åtgärder. **CCO:** ✅ matas till `data/cco-templates.json` (77 templates, 55 revisioner).

---

## 2. Cliento — ✅ delvis (JSON i repo, CSV i iCloud)

### I repo (`migration/cliento*`)
| Fil | Storlek | Innehåll | Klassificering |
|---|---:|---|---|
| `migration/cliento/resource-catalog.json` | 38 947 B | personal/rum/utrustning | workflow_rule |
| `migration/cliento/addon-catalog.json` | 351 B | tom (0 addons konfigurerade) | workflow_rule |
| `migration/cliento-service-catalog.json` | 21 735 B | ~55 tjänster | workflow_rule |
| `migration/cliento-compact-export.json` | 31 433 B | komprimerad export | migration_record |
| `docs/strategy/CLIENTO-CUSTOMER-SCHEMA-LIVE.md` | dokumentation | kundkort-schema | dokumentation |
| `docs/strategy/CLIENTO-INVENTORY.md` | dokumentation | full Cliento-inventering | dokumentation |

### Utanför repo (iCloud `Migration-data/`)
| Fil | Storlek | Rader | Klassificering |
|---|---:|---:|---|
| `cliento-customers-2026-05-29.csv` | 518 037 B | 7 655 (7 654 kunder + header) | **patient_document** (PII: namn, telefon, personnummer) |

**GitHub:** ✅ JSON-katalogerna OK. ❌ CSV med kunddata får aldrig committas.
**CCO:** ✅ kundbas migreras via `npm run migration:import`.
**Status:** **Delvis** — Cliento UI-genomgång (CLIENTO-CUSTOMER-SCHEMA-LIVE.md) är gjord 2026-05-29.

---

## 3. Pipedrive — ⚠️ flyttad ur repo (commit `19718e8`, 2026-05-29)

### I repo (`migration/pipedrive/`)
| Fil | Storlek | Innehåll |
|---|---:|---|
| `README.md` | 1 145 B | flödesdokumentation + MD5-spårning |

### Utanför repo (iCloud `Migration-data/pipedrive-2026-05-24/`)
| Fil | Storlek | Rader | Klassificering |
|---|---:|---:|---|
| `personer-2026-05-24.csv` | 1 595 643 B | 3 694 (3 693 personer + header) | **patient_document** (PII) |
| `affarer-2026-05-24.csv` | 1 758 617 B | 3 488 (3 487 affärer + header) | **patient_document** (PII) |
| `review-ambiguous-2026-05-24.csv` | 34 395 B | ~164 | patient_document |
| `review-ambiguous-2026-05-24.json` | 162 932 B | ~164 obj | patient_document |
| `review-ambiguous-manual-2026-05-24.json` | 6 551 B | manuell konflikt-lösning | patient_document |

**Compliance-not (från commit-msg):** *"PII finns kvar i git-historik. Full purge via git-filter-repo kräver force-push och påverkar collaborators — väntar på owner-beslut."*

**GitHub:** ❌ filerna är borttagna ur HEAD, men kvar i historik. **CCO:** ✅ används för enrichment via `npm run migration:import-pipedrive`.
**Status:** **Flyttad** — README behålls, `.gitignore` skyddar mot re-add.

---

## 4. Drive — ❌ inget i repo

| Referens | Beskrivning |
|---|---|
| `docs/strategy/PROJECT-CHECKLIST.md` | "Prod snapshot 2026-05-24: 1 981 Drive-profiler" + "Drive-PDF på prod (Google Drive API live)" |
| `docs/strategy/MASTER-TODO.md` | "U3.2 Drive enrich + index push prod" |
| `docs/strategy/cco-patient-journal-build-plan.md` | Refererar Drive-PDF som journal-källa |
| `docs/strategy/NOTION-SYNC-MANIFEST.md` | Drive i sync-flöde |

**Vad finns:** ~1 981 patientprofiler nås via Google Drive API i produktion. **Inga PDFs/DOCXs i repo eller iCloud Migration-data.**

**GitHub:** ❌ får aldrig commitas (PII).
**CCO:** ✅ åtkomst via Drive API → arkiv-vy i CCO Kunder.
**Status:** **Saknas i repo** — kan endast nås live.

---

## 5. Nordbro — ⚠️ endast versions-tracking

**Källa:** `config/external-template-versions.json` (manuell mapping)

| Mall-ID | Version | Källa |
|---|---|---|
| `patient_info_fue` | 3.0.0 | nordbro.com/sv/h-tp/patient-info-fue-v3 |
| `patient_info_prp_hair` | 2.0.0 | nordbro |
| `patient_info_botox` | 2.0.0 | nordbro |
| `patient_info_bleph` | 2.0.0 | nordbro |
| `consent_photo_internal` | 2.0.0 | nordbro |
| `consent_photo_publish` | 2.0.0 | nordbro.com/sv/foto-publish-v2 |
| `consent_marketing` | 1.0.0 | nordbro |
| `aftercare_*` (7 mallar) | varierar | nordbro |

**Totalt:** 14 nordbro-mall-versioner i `external-template-versions.json`. **124 nordbro-referenser** i `data/cco-templates.json` (54 templates relaterar till nordbro via källa).

**GitHub:** ✅ versions-mapping är OK. ❌ själva PDF-mallarna är inte i repo.
**CCO:** ✅ versions-mapping används av `ccoComplianceScanStore` → flaggar `VERSION_CONFLICT`.
**Status:** **Versionsspårning** — råa PDF/DOCX-mallar saknas helt.

---

## 6. Insatt — ⚠️ endast versions-tracking

| Mall-ID | Version | Källa |
|---|---|---|
| `fitness_certificate_hair_tp` | 2.0.0 | insatt.com/sv/friskforsakran-fue-v2 |
| `fitness_certificate_curatiio` | 2.0.0 | insatt |
| `agreement_hair_tp_generic` | 4.0.0 | insatt.com/sv/avtal-hair-tp-v4 |
| `agreement_curatiio_generic` | 4.0.0 | insatt |

**Totalt:** 4 insatt-mall-versioner. **48 insatt-referenser** i `data/cco-templates.json`.

**GitHub:** ✅ versions-mapping OK. ❌ inga råmallar.
**CCO:** ✅ samma compliance-flagga som nordbro.
**Status:** **Versionsspårning** — råa Word/PDF saknas helt.

---

## 7. GetAccept — ❌ inget i repo

| Referens | Beskrivning |
|---|---|
| `docs/strategy/cco-treatment-agreement-spec.md` | "Ersätter GetAccept för nya kunder. Gällande Word-mall: 251203_Behandlingsavtal…docx" |
| `docs/strategy/ma-document-placement-plan.md` | "Juristens flöde digitalt i MA (ersätter GetAccept)" |
| `docs/strategy/CCO-SYSTEM-SCOPE.md` | "GetAccept för nya avtal (ersatt av Arcana avtal)" |
| `docs/strategy/MERIDIQ-DOCUMENT-COVERAGE-REPORT.md` | 14 tomma `Behandlingsavtal`-mallar i Meridiq pekar troligen mot GetAccept-PDFs |

**Vad finns:** Inga signerade avtal, inga mallar, ingen export. GetAccept-kontot är i bruk men inget data har hämtats in.

**GitHub:** ❌ får aldrig commitas (signerade avtal = PII).
**CCO:** ✅ måste arkiveras säkert efter export.
**Status:** **Saknas helt** — okänt antal signerade avtal, ingen volym-uppskattning.

---

## Vilka kanaler är BLOCKING för Meridiq-paritet?

| Kanal | Blocking? | Skäl |
|---|:---:|---|
| Meridiq | — | Facit / källa |
| Cliento | ⚠️ delvis | Schema klart, kundbas i iCloud — behövs för bokningstriggers |
| Pipedrive | ❌ nej | Berikning, inte facit för kundresan |
| **Drive** | ✅ **JA** | Ifyllda journaler + signerade avtal — utan dessa kan vi inte verifiera att Meridiq-mallar matchar produktion |
| **Nordbro** | ✅ **JA** | 14 mallar styr juridisk text i samtycken & patient-info. Versionsmapping finns men **inga råmallar att diffa mot** |
| **Insatt** | ✅ **JA** | 4 mallar styr avtal + friskförsäkran. Samma gap som Nordbro |
| **GetAccept** | ✅ **JA** | 14 tomma `Behandlingsavtal`-mallar i Meridiq är platshållare — själva signerade avtalen lever här |

**Slutsats:** 4 av 7 kanaler är BLOCKING. Meridiq-paritet kan inte verifieras förrän **Drive + Nordbro + Insatt + GetAccept** har exporterats till en gemensam plats utanför Git.

---

## Konkreta åtgärder per kanal

| Kanal | Åtgärd | Ägare | Deadline |
|---|---|---|---|
| Meridiq | (klar) | — | — |
| Cliento | Verifiera att `cliento-customers-2026-05-29.csv` matchar produktion (7 676 vs 7 654) | Fazli | innan cutover |
| Pipedrive | Be owner besluta om `git-filter-repo` purge av historik | Owner | sprint 11 |
| **Drive** | Skapa export-script som dumpar alla 1 981 Drive-profiler till `iCloud/Migration-data/drive-2026-XX-XX/` (PDF + metadata.json per kund) | Fazli | innan paritetstest |
| **Nordbro** | Be Nordbro-kontakt skicka senaste PDF för alla 14 mall-IDs → `iCloud/Migration-data/nordbro/{template_id}-{version}.pdf` | Wendela | sprint 11 |
| **Insatt** | Be Insatt-kontakt skicka senaste PDF/Word för alla 4 mall-IDs → `iCloud/Migration-data/insatt/{template_id}-{version}.docx` | Wendela | sprint 11 |
| **GetAccept** | Exportera alla aktiva mallar + bulk-export av signerade avtal (senaste 12 mån) → `iCloud/Migration-data/getaccept/{templates,signed}/` | Wendela | sprint 11 |

---

*Genererad: 2026-05-29*
