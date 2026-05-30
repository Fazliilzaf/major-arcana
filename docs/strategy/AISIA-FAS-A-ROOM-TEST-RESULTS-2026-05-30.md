# Aisia Fas A — Rumstestresultat (MALL / plan)

> **Typ:** Tom rapportmall för kliniska rumstest — **inte ifylld**.  
> **Får INTE committas med:** riktiga patienter, patientbilder, journaldata eller ifyllda sessionsloggar.  
> **Iifyllda loggar:** sparas **lokalt/säkert på kliniken** — aldrig i GitHub.

**Spår:** Aisia/Kamera — kliniskt pilotspår  
**Fas A:** DS-3 i rummet · CCO **OFF** · `ENABLE_AISIA_SCALP_ANALYSIS=false`  
**Fas B-gate:** Owner säger **`APPLY AISIA TO CCO`**

**Guider:** [`AISIA-ROOM-TEST-FLOW-2026-05-30.md`](./AISIA-ROOM-TEST-FLOW-2026-05-30.md) · [`AISIA-PILOT-SESSION-LOG-TEMPLATE-2026-05-30.md`](./AISIA-PILOT-SESSION-LOG-TEMPLATE-2026-05-30.md)

---

## Executive summary (ifylls efter 3 rumstest)

| Fält                      | Värde                                           |
| ------------------------- | ----------------------------------------------- |
| Rapportdatum              | ****\_\_****                                    |
| Antal planerade rumstest  | 3                                               |
| Antal genomförda rumstest | \_\_\_ / 3                                      |
| DS-3 stabil               | ☐ Ja ☐ Delvis ☐ Nej                             |
| Protokoll följbart        | ☐ Ja ☐ Delvis ☐ Nej                             |
| PDF-export OK             | ☐ Ja ☐ Delvis ☐ Nej                             |
| Bildexport OK             | ☐ Ja ☐ Delvis ☐ Nej                             |
| Rekommendation Fas B      | ☐ Redo för `APPLY AISIA TO CCO` ☐ **Inte redo** |

---

## Sessioner (plan — ifylls på klinik)

| #   | Pilot-ID | Datum | Typ                       | Sessionslogg (lokal) | Sign-off |
| --- | -------- | ----- | ------------------------- | -------------------- | :------: |
| 1   | P-001    |       | ☐ Baseline                | _fil på klinik_      |    ☐     |
| 2   | P-002    |       | ☐ Baseline / donor        | _fil på klinik_      |    ☐     |
| 3   | P-003    |       | ☐ Baseline full protokoll | _fil på klinik_      |    ☐     |

---

## Utrustning

| Komponent                          | Notering              | Testad |
| ---------------------------------- | --------------------- | :----: |
| Aisia DS-3 (program + kamera)      |                       |   ☐    |
| Förstoring 10× / 50× / 100× / 200× |                       |   ☐    |
| Spektrum vit / PL / UV             |                       |   ☐    |
| PDF-export                         |                       |   ☐    |
| Bildexport (PNG/JPEG)              |                       |   ☐    |
| CCO                                | **Ej använd i Fas A** |   —    |

---

## Testmatris

### 1. DS-3-enhet och workflow i rummet

| Test                                   | S1  | S2  | S3  |
| -------------------------------------- | :-: | :-: | :-: |
| Program startar stabilt                |  ☐  |  ☐  |  ☐  |
| Kamera ansluter utan avbrott           |  ☐  |  ☐  |  ☐  |
| Session sparas utan krasch             |  ☐  |  ☐  |  ☐  |
| Fysisk workflow följs (room test flow) |  ☐  |  ☐  |  ☐  |

**Kameran stabil totalt?** ☐ Ja ☐ Delvis ☐ Nej · **Anteckning:** ****\_\_****

---

### 2. Förstoring (10× / 50× / 100× / 200×)

| Förstoring | Kunde tas | Skarp nog | Anteckning |
| ---------- | :-------: | :-------: | ---------- |
| 10×        |     ☐     |     ☐     |            |
| 50×        |     ☐     |     ☐     |            |
| 100×       |     ☐     |     ☐     |            |
| 200×       |     ☐     |     ☐     |            |

---

### 3. Spektrum (white / cross-polarized / UV)

| Ljus                 | Använd där relevant | Bild acceptabel | Anteckning |
| -------------------- | :-----------------: | :-------------: | ---------- |
| Vit (RGB)            |          ☐          |        ☐        |            |
| Korspolariserat (PL) |          ☐          |        ☐        |            |
| UV                   |          ☐          |        ☐        |            |

---

### 4. Baseline capture

| Zon / område                        | Protokollkrav           | S1  | S2  | S3  |
| ----------------------------------- | ----------------------- | :-: | :-: | :-: |
| Global (4 vinklar)                  | front/vänster/höger/bak |  ☐  |  ☐  |  ☐  |
| **Donor** occipital                 | 10× eller global        |  ☐  |  ☐  |  ☐  |
| **Donor** vänster                   | separat zon             |  ☐  |  ☐  |  ☐  |
| **Donor** höger                     | separat zon             |  ☐  |  ☐  |  ☐  |
| **Recipient** hairline              | 10× vit/PL              |  ☐  |  ☐  |  ☐  |
| **Recipient** problemområde         | patient concern         |  ☐  |  ☐  |  ☐  |
| **Recipient** crown/mid (vid behov) | enligt protokoll        |  ☐  |  ☐  |  ☐  |
| Mikro 50×+                          | minst en relevant zon   |  ☐  |  ☐  |  ☐  |

**Baseline enligt protokoll?** ☐ Ja ☐ Delvis ☐ Nej

---

### 5. Export

| Export              | Fungerar | Fil öppningsbar | PDF orörad | Anteckning |
| ------------------- | :------: | :-------------: | :--------: | ---------- |
| PDF-rapport (Aisia) |    ☐     |        ☐        |     ☐      |            |
| Bildexport          |    ☐     |        ☐        |     —      |            |

---

## Personalens feedback (ifylls på klinik — anonymisera före eventuell extern delning)

| Tema                  | Vad fungerade | Vad var svårt | Träning behövs |
| --------------------- | ------------- | ------------- | -------------- |
| Kamera / DS-3         |               |               | ☐              |
| Zoner / protokoll     |               |               | ☐              |
| Spektrum / förstoring |               |               | ☐              |
| Export PDF/bilder     |               |               | ☐              |
| Tid / workflow        |               |               | ☐              |

---

## Friktion och förbättringar

| #   | Steg | Problem (klinik) | Förbättring | Prioritet |
| --- | ---- | ---------------- | ----------- | --------- |
| 1   |      |                  |             | ☐ P0 ☐ P1 |
| 2   |      |                  |             | ☐ P0 ☐ P1 |
| 3   |      |                  |             | ☐ P0 ☐ P1 |

---

## Fas A-regler (checklista)

| Regel                                  | OK  |
| -------------------------------------- | :-: |
| CCO prod av — ingen import             |  ☐  |
| `ENABLE_AISIA_SCALP_ANALYSIS=false`    |  ☐  |
| Ingen FAS 2 / API / exportfolder       |  ☐  |
| Ingen kamera/USB/SDK i CCO             |  ☐  |
| Ingen extern AI på patientdata         |  ☐  |
| Inga patientbilder/journal i GitHub    |  ☐  |
| Sessionsloggar endast lokalt på klinik |  ☐  |

---

## Anonymiserad sammanfattning (efter 3 rumstest — för owner)

_Fyll i när alla 3 sessioner är klara. **Inga namn, personnummer eller bilder.**_

| Punkt                          | Sammanfattning                                      |
| ------------------------------ | --------------------------------------------------- |
| Antal rumstest genomförda      | \_\_\_ / 3                                          |
| Delar som fungerade            |                                                     |
| Delar som var svåra            |                                                     |
| PDF-export                     | ☐ OK ☐ Problem: \_\_\_                              |
| Bildexport                     | ☐ OK ☐ Problem: \_\_\_                              |
| Personal kunde följa protokoll | ☐ Ja ☐ Delvis ☐ Nej                                 |
| **Rekommendation**             | ☐ Redo för **`APPLY AISIA TO CCO`** ☐ **Inte redo** |

**Motivering (kort, anonym):**

---

## Sign-off

| Roll        | Namn | Datum | PASS |
| ----------- | ---- | ----- | :--: |
| Pilotledare |      |       |  ☐   |
| Behandlare  |      |       |  ☐   |
| Owner       |      |       |  ☐   |

---

## Efter denna mall

1. **3 rumstest** på klinik → ifyll sessionslogg **lokalt**.
2. **Iifyll denna mall** på klinik (eller kopia med datum i filnamn).
3. **Anonymiserad sammanfattning** till owner — **inte** råa loggar i GitHub.
4. **Fas B** endast om owner säger **`APPLY AISIA TO CCO`**.

---

_Mall skapad: 2026-05-30 · source: new · commit as template only_
