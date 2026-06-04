# Aisia DS-3 — Klinisk pilot-testplan (fysisk rutin)

**Spår:** Aisia/Kamera — separat pilotspår  
**Status:** FAS 1 MVP klar och isolerad i repo (`592ffda5`)  
**CCO prod:** Modulen är **avstängd** (`ENABLE_AISIA_SCALP_ANALYSIS=false`) tills owner säger **`APPLY AISIA TO CCO`**  
**Ej i scope:** FAS 2 (export/API), FAS 3 (kamera/USB/SDK i CCO), FAS 4 (egen klinisk AI)

**Paketindex:** [`AISIA-PILOT-PACKAGE-INDEX-2026-05-30.md`](./AISIA-PILOT-PACKAGE-INDEX-2026-05-30.md)

**Källor:** `AISIA-CAPTURE-PROTOCOL.md` (befintlig) · `AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md` (befintlig) · DS-3 manual (feature matrix)

**Syfte:** Förbereda **klinisk testning och fysisk arbetsrutin** i behandlingsrummet — utan att aktivera CCO-modulen i prod och utan nya kodändringar.

---

## 1. Klinisk testchecklista

Använd vid varje pilotbesök. Bocka av **före**, **under** och **efter** konsultation.

### Före besök (rum + utrustning)

| #   | Kontroll                                                                  | OK  | Anm |
| --- | ------------------------------------------------------------------------- | :-: | --- |
| 1   | Aisia DS-3 startar utan fel                                               |  ☐  |     |
| 2   | Kamera ansluten, kalibrerad enligt klinik-SOP                             |  ☐  |     |
| 3   | Rätt patient identifierad i Aisia (namn + besöksdatum)                    |  ☐  |     |
| 4   | Sessionstyp vald: baseline / uppföljning / pre-op                         |  ☐  |     |
| 5   | Patient informerad om bildtagning (muntligt, enligt klinik)               |  ☐  |     |
| 6   | CCO patientkort öppet (för senare import — **endast när flag aktiverad**) |  ☐  |     |
| 7   | Ingen fil skickas till extern AI, Slack, GitHub eller privat e-post       |  ☐  |     |

### Under besök (capture enligt protokoll)

| #   | Kontroll                                                    | OK  | Anm |
| --- | ----------------------------------------------------------- | :-: | --- |
| 8   | Globalbilder: front, vänster, höger, bak                    |  ☐  |     |
| 9   | Donor: occipital, vänster, höger                            |  ☐  |     |
| 10  | Recipient: hairline, mid-scalp, crown, problemområde        |  ☐  |     |
| 11  | Mikrobilder 10×–200× där protokollet kräver (vit / PL / UV) |  ☐  |     |
| 12  | Aisia-analys slutförd i DS-3 (inte avbruten halvvägs)       |  ☐  |     |

### Efter besök (export + CCO — CCO-steg gäller först efter `APPLY AISIA TO CCO`)

| #   | Kontroll                                                             | OK  | Anm           |
| --- | -------------------------------------------------------------------- | :-: | ------------- |
| 13  | Aisia-rapport/PDF exporterad och öppningsbar                         |  ☐  |               |
| 14  | Exportbilder sparade (PNG/JPEG) per zon om DS-3 exporterar separat   |  ☐  |               |
| 15  | PDF **inte** redigerad efter export                                  |  ☐  |               |
| 16  | CCO: session skapad med rätt typ (`consultation` / `follow_up`)      |  ☐  | _väntar flag_ |
| 17  | CCO: PDF importerad (`aisia_report`)                                 |  ☐  | _väntar flag_ |
| 18  | CCO: bilder importerade                                              |  ☐  | _väntar flag_ |
| 19  | CCO: nyckelmätvärden inlagda manuellt                                |  ☐  | _väntar flag_ |
| 20  | Behandlare verifierat session i CCO                                  |  ☐  | _väntar flag_ |
| 21  | Patientvy/disclaimer granskad — endast som stöd, inte diagnos        |  ☐  | _väntar flag_ |
| 22  | Pre-op callout (om aktuellt): baseline/donor/verified status stämmer |  ☐  | _väntar flag_ |

### Sign-off (pilot)

| Roll                | Namn | Datum | Signatur |
| ------------------- | ---- | ----- | -------- |
| Behandlare (verify) |      |       |          |
| Operatör (import)   |      |       |          |
| Owner/pilotledare   |      |       |          |

---

## 2. Hur personalen ska använda kameran i konsultation

**Princip:** All bildtagning sker i **Aisia DS-3 på plats** — inte i CCO. CCO tar emot resultat **efter** besöket (manuell import när flaggan är på).

### Fysisk arbetsordning (typisk baseline-konsultation)

```
1. Patient in   →  ID/konsultationsstart i CCO (journal som vanligt)
2. Förklaring   →  Varför scalp-analys tas (Hair TP rutin)
3. Aisia        →  Starta DS-3-session, välj patient
4. Globalbild   →  Patient sitter/står — 4 vinklar (vit ljus)
5. Donor        →  Occipital + vänster + höger (10× eller global)
6. Recipient    →  Hairline, mid-scalp, crown, problemområde
7. Mikro        →  50× / 100× / 200× + tri-spektral där indicerat
8. Analys       →  Slutför i Aisia — vänta tills rapport finns
9. Export       →  PDF + ev. bildexport till lokal mapp
10. CCO         →  (Efter APPLY AISIA TO CCO) manuell import + verify
11. Samtal      →  Behandlare går igenom med patient — slutlig bedömning av behandlare
```

### Roller i rummet

| Roll                   | Gör                                                             |
| ---------------------- | --------------------------------------------------------------- |
| **Behandlare/konsult** | Tolkar Aisia-resultat, verifierar i CCO, pratar med patient     |
| **Assistent/operatör** | Kamerahanttering, export, CCO-import (behörighet `scalp.write`) |
| **CCO**                | Lagring, tidslinje, protokollstatus — **inte** bildtagning      |

### Tri-spektral rutin (påminnelse från DS-3-manual)

| Ljus                     | Användning                                  |
| ------------------------ | ------------------------------------------- |
| **Vit (RGB)**            | Håravfall, antal, diameter, global översikt |
| **Korspolariserat (PL)** | Känslighet, rodnad, telangiektasier         |
| **UV**                   | Talg, porfyriner, talgrelaterade fynd       |

Förstoring **10× → 50× → 100× → 200×** enligt zon och klinisk frågeställning — se capture-protokoll.

---

## 3. Vilka bilder som ska tas

Full zonlista: [`AISIA-CAPTURE-PROTOCOL.md`](./AISIA-CAPTURE-PROTOCOL.md)

### Minimum baseline (konsultation)

| Prioritet | Zon                             | Obligatorisk i pilot         |
| --------- | ------------------------------- | ---------------------------- |
| P0        | Global front/vänster/höger/bak  | Ja                           |
| P0        | Donor occipital, vänster, höger | Ja                           |
| P0        | Problemområde (recipient)       | Ja                           |
| P1        | Hairline frontal                | Ja vid TP-planering          |
| P1        | Mid-scalp, crown                | Rekommenderat                |
| P2        | Mikro 50×/100×/200× per zon     | Enligt behandlares bedömning |

### Uppföljning (`follow_up`)

- Återta **samma zoner** som baseline där jämförelse behövs.
- Timepoints: dag 14, mån 1, 3, 6, 12 (enligt protokoll).
- Syfte: visuell + metric-jämförelse — **inte** automatisk behandlingsrekommendation.

### Pre-op (om aktuellt)

Kräver enligt protokoll:

1. Verifierad baseline (`consultation`, status verified)
2. Donor occipital + vänster + höger
3. Recipient hairline + minst en recipient-mikrobild
4. Behandlarverifiering klar

---

## 4. Vilka rapporter som ska exporteras

| Export                  | Format                | När                               | Lagring                           |
| ----------------------- | --------------------- | --------------------------------- | --------------------------------- |
| **Aisia analysrapport** | PDF                   | Efter varje slutförd session      | Lokal exportmapp / klinik-SOP     |
| **Bilder per zon**      | PNG/JPEG              | Om DS-3 exporterar separata filer | Samma mapp, namngivning per zon   |
| **Jämförelserapport**   | PDF (om DS-3 stödjer) | Vid uppföljning mot baseline      | Lokal — importeras som ny session |

**Krav:**

- PDF ska vara **oförändrad** efter export (CCO lagrar originalbytes).
- Filnamn ska innehålla patientreferens + datum enligt klinik-SOP (inte i GitHub).
- **Ej:** automatisk sync till CCO via API/exportfolder (FAS 2).

---

## 5. Manuell import till CCO (när feature flag aktiveras)

**Gate:** Owner måste först säga **`APPLY AISIA TO CCO`** och IT sätter:

```bash
ENABLE_AISIA_SCALP_ANALYSIS=true
```

**Detaljerad steg-för-steg:** [`AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md`](./AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md)

### Kortversion

| Steg | Handling          | CCO                                                    |
| ---- | ----------------- | ------------------------------------------------------ |
| 1    | Öppna patientkort | Flik **Hår-/scalpanalys** syns                         |
| 2    | Skapa session     | Matcha Aisia-typ (`consultation` / `follow_up`)        |
| 3    | Importera PDF     | Knapp **Importera PDF** → `aisia_report`               |
| 4    | Importera bilder  | **Importera bilder** → `photo_before` / `photo_after`  |
| 5    | Mätvärden         | Manuellt från Aisia-rapport (t.ex. `total_hair_count`) |
| 6    | Verify            | Behandlare klickar **Verifiera**                       |
| 7    | Uppföljning       | Ev. **Skapa baseline-jämförelse** (metric-delta)       |

**Timeline-events efter korrekt flöde:** `scalp_analysis_imported`, `scalp_image_added`, `scalp_metrics_added`, `scalp_analysis_verified`, ev. `scalp_comparison_created`.

---

## 6. Vad som ska verifieras av behandlare

Behandlare (`scalp.verify`) ska **explicit** bekräfta innan session markeras `verified`:

| #   | Verifieringspunkt                                                           |
| --- | --------------------------------------------------------------------------- |
| 1   | Rätt patient i Aisia och CCO                                                |
| 2   | Rätt besöksdatum/sessionstyp                                                |
| 3   | PDF motsvarar Aisia-sessionen (läsbar, komplett)                            |
| 4   | Bilder tillhör samma besök och rätt zoner                                   |
| 5   | Manuellt inlagda mätvärden stämmer mot Aisia-rapport                        |
| 6   | Saknade zoner noterade (protokollvarningar accepterade eller kompletterade) |
| 7   | **Klinisk tolkning** dokumenterad i journal — CCO ger stöd, inte diagnos    |
| 8   | Patientvy/disclaimer lämplig om resultat visas för patient                  |

**Verifieringskommentar** i CCO (valfri text) ska spegla behandlarens bedömning — t.ex. _"Granskat mot Aisia-rapport 2026-05-30, används som underlag i konsultation."_

---

## 7. Vad som inte får göras ännu

| Förbjudet / pausat                                                         | Varför                                |
| -------------------------------------------------------------------------- | ------------------------------------- |
| Aktivera modulen i **CCO prod** utan `APPLY AISIA TO CCO`                  | Isolerad pilot — flag off som default |
| **FAS 2:** exportfolder, auto-import, `aisiausa.umersoft.com:8864`         | Kräver `START AISIA FAS 2`            |
| **FAS 3:** direkt kamera/USB/SDK-koppling till CCO                         | CCO tar inte bilder i FAS 1           |
| **FAS 4:** egen klinisk AI / auto-diagnos / auto-behandlingsrekommendation | Compliance + owner-GO                 |
| Extern AI på patientbilder, PDF eller journal                              | Hårregel — inga PHI till extern AI    |
| Patientbilder/PDF i GitHub, Slack, dev-e-post                              | Patientdata får inte läcka            |
| Drive-länk som slutdestination i CCO                                       | Secure storage only                   |
| Ersätta Aisia DS-3-programmet                                              | Aisia förblir capture + primäranalys  |
| Blanda pilot med migration-tråd eller Claude UI-arbete                     | Separata spår                         |
| Nya **CCO-kodändringar** i Aisia-spåret                                    | Kräver owner-GO                       |

---

## Pilotfaser (rekommenderad ordning)

| Fas                           | Var             | CCO flag         | Mål                                                 |
| ----------------------------- | --------------- | ---------------- | --------------------------------------------------- |
| **A — Rumstest**              | Aisia DS-3 only | Off              | Bekräfta capture + export rutin                     |
| **B — Torkkörning CCO**       | Dev/staging     | On (efter APPLY) | 1–2 testpatienter, manuell import                   |
| **C — Begränsad klinikpilot** | Prod            | On (efter APPLY) | Utvalda behandlare, sign-off per besök              |
| **D — Utvärdering**           | —               | —                | Owner beslut: fortsätt paus / bredare pilot / FAS 2 |

---

## Relaterade dokument

| Dokument                                                                                                 | Innehåll                         |
| -------------------------------------------------------------------------------------------------------- | -------------------------------- |
| [`AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md`](./AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md)                       | Operativ runbook (10 steg)       |
| [`AISIA-MVP-HANDOFF-2026-05-30.md`](./AISIA-MVP-HANDOFF-2026-05-30.md)                                   | Teknisk handoff, flag, endpoints |
| [`AISIA-CAPTURE-PROTOCOL.md`](./AISIA-CAPTURE-PROTOCOL.md)                                               | Zoner, förstoring, pre-op gates  |
| [`AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md`](./AISIA-CCO-INTEGRATION-VERIFICATION-2026-05-30.md) | Integration verify PASS          |

---

## Regel framåt (Aisia/Kamera-spår)

- **Pilotspår aktivt** — klinisk förberedelse och fysisk rutin OK
- **CCO prod** — modulen fortfarande **av** tills `APPLY AISIA TO CCO`
- **FAS 2+** — pausad tills `START AISIA FAS 2`
- **Inga nya CCO-kodändringar** utan owner-GO

---

_Skapad: 2026-05-30 · source: befintliga AISIA-dokument + DS-3 capture-protokoll (new — klinisk testplan)_
