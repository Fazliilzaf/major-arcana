# CCO Staff Day-1 Journal Checklist — 4 juni 2026

_Utskriftsbar checklista för personal · Hair TP Clinic · Kontrollerad journalpilot_

**Start:** https://arcana.hairtpclinic.com/cco-personal-start.html  
**Guide (skärm/print):** https://arcana.hairtpclinic.com/journal-pilot-guide.html

---

## Innan du skriver journal

- [ ] Patienten är **känd** — du är säker på identitet
- [ ] Du har kontrollerat **namn + telefon + Cliento-id** (alla tre där det finns)
- [ ] Du är på **rätt kundkort** (inte liknande namn)
- [ ] Du har **inte** skapat ny kund vid tvekan

**Om osäker identitet → STOPP → eskalera admin/ops (Fazli).**

---

## Steg-för-steg: journal på kundkort

### 1 · Öppna kundkort

- [ ] Gå via personal-start → **Öppna kundkort** eller direkt `/kunder.html`
- [ ] Sök/öppna rätt patient

### 2 · Skapa journal

- [ ] Öppna **Journal**-fliken / journal-feed
- [ ] **Skapa** ny anteckning (draft)
- [ ] Skriv klart innan signering

### 3 · Signera och lås

- [ ] Klicka **Signera**
- [ ] Bekräfta — posten blir **låst**
- [ ] Förstå: låst post **kan inte** redigeras

### 4 · Rättelse (om något blev fel)

- [ ] Öppna signerad post → **Skapa rättelse**
- [ ] Skriv korrigering + anledning
- [ ] **Signera** rättelsen
- [ ] Kontrollera att båda syns i **timeline**

### 5 · Timeline

- [ ] Öppna **timeline** för samma patient
- [ ] Bekräfta att händelserna ligger i rätt ordning

---

## Vad “Behöver granskning” betyder

| Betyder                                                 | Betyder **inte**                          |
| ------------------------------------------------------- | ----------------------------------------- |
| Importerat från gammal källa (Drive, halso@, GetAccept) | Granskat och godkänt                      |
| Får användas som **referens**                           | Får användas som **klinisk sanning**      |
| Kan behöva admin/ops senare                             | Ska kopieras rakt in i ny klinisk journal |

**Regel:** Om det står review / needs review — behandla som **osäkert** tills någon med ansvar sagt godkänt.

---

## När du ska **stoppa**

Stoppa och eskalera om:

- Du är osäker på **vilken patient** det är
- Systemet föreslår **ny kund** vid matchning
- **Signering** eller **rättelse** ger fel (5xx, konstigt meddelande)
- Du vill använda **gamla före/efter-bilder** kliniskt
- Någon ber dig kopiera journal till **ChatGPT / extern AI**
- Mail/inbox ska bli “huvudverktyg” samma dag

---

## Vem eskalerar du till?

| Situation                       | Kontakt                                          |
| ------------------------------- | ------------------------------------------------ |
| Osäker identitet / ny kund      | **Fazli / admin / ops**                          |
| Tekniskt fel (vit skärm, 5xx)   | **Fazli / IT / ops**                             |
| Tolkning av importerad historik | **Fazli / ansvarig läkare**                      |
| Photo/bilder kliniskt           | **Nej dag 1** — eskalera policy-fråga till Fazli |

---

## Dag-1 — tillåtet vs förbjudet (snabbreferens)

**Tillåtet:** journal skapa · sign · rättelse · timeline · läsa importerad historik som referens

**Förbjudet:** ny kund vid tvekan · kliniska migrerade bilder · extern AI på journaltext · mail som primär inbox · Aisia/kamera

---

## Efter passet

- [ ] Alla signerade poster du skapat är **låsta** (medvetet)
- [ ] Eventuella rättelser är **signerade**
- [ ] Du har **inte** lämnat patientdata utanför CCO

---

_Senast synkad med journalpilot smoke PASS 2026-06-02 · Ingen patientdata._

---

## Cycle-7 tillägg (2026-06-02T20:50Z)

**Print pack** är nu live: `/journal-pilot-print-pack.html` — skriv ut dagen före och ha på arbetsstationen. Den innehåller alla regler, checklists, eskaleringsväg, patientfrågor och 30-min-plan i printvänligt A4-format utan internet-behov.

Snabb-länkar uppdaterade:

| Stöd | URL |
|---|---|
| Personalstart | `https://arcana.hairtpclinic.com/cco-personal-start.html` |
| Personalguide (online) | `https://arcana.hairtpclinic.com/journal-pilot-guide.html` |
| **Print pack (skriv ut!)** | `https://arcana.hairtpclinic.com/journal-pilot-print-pack.html` |
| Backup | `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html` |

---

## Cycle-9 tillägg (2026-06-02T22:00Z)

Denna checklist finns nu också som **klickbar HTML-version** på `/cco-staff-day1-checklist.html` — länkbar från personal-start (Section E) och Command Center.

Använd:
- **HTML-versionen** på arbetsstationen — kan refreshas, klickbara länkar
- **Markdown-versionen** här i `docs/strategy/` för print/export
