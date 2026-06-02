# Hair TP Clinic · Journalpilot · Dag 1 · 4 juni 2026

> **En sida för personalen — skriv ut, häng upp, ha framme.**

---

## ☀️ Vad du **får** göra dag 1

1. **Öppna kundkort** på kända patienter via `/cco-personal-start.html` → "Öppna kundkort"
2. **Verifiera identitet** först — alltid: **namn + telefon + Cliento-id**
3. **Skapa journalanteckning** på kundkortets Journal-flik
4. **Signera/lås** posten (gör det när du är klar — låsning sker direkt)
5. **Skapa rättelse** som ny post om något blivit fel
6. **Visa timeline** för patienten — alla händelser kronologiskt
7. **Läs importerad historik** som referens (halso@, GetAccept, Drive)

---

## 🚫 Vad du **inte** ska göra dag 1

| Förbjudet | Varför |
|---|---|
| Klinisk användning av migrerade före/efter-bilder | Photo Review är inte klar — bilder är inte verifierade än |
| Skapa ny kund manuellt vid osäker identitet | Risk för dubblett — eskalera till admin/ops istället |
| Kopiera journaltext till externa AI-verktyg (ChatGPT, etc.) | Patientdata får inte lämna systemet |
| Lita på "Behöver granskning"-material som klinisk sanning | Materialet är importerat men inte verifierat — endast referens |
| Använda mail-worklist / unified inbox / e-post-bokning | Under aktivering — inte primärt verktyg dag 1 |
| Aktivera kamera/scalp-funktioner | Aisia är pausad bakom feature flag |

---

## ✍️ Så här signerar du en journalpost

1. På kundkortet → klicka **Journal-fliken**
2. **Skriv anteckningen** (välj mall: konsultation / behandling / follow-up)
3. Klicka **"Spara"** (du har nu en draft som kan ändras fritt)
4. När du är klar — klicka **"Signera"**
5. Bekräfta dialog → posten låses (`locked = true`)
6. **Låst post kan aldrig ändras**. Den syns för alla med läsrätt.

⚠️ **Signera först när du är säker.** Du kan göra rättelse efteråt, men originalet är permanent.

---

## ✏️ Så här gör du en rättelse

Du upptäcker att en signerad post är fel.

1. Öppna den signerade posten → klicka **"Skapa rättelse"**
2. En **ny tom post** öppnas — den är länkad till originalet
3. **Skriv vad som ska rättas** + ange anledning
4. Klicka **"Spara"** → **"Signera"**
5. Båda posterna syns i journal-feed och i timeline med tydlig länkning

🟢 **Originalet ändras aldrig.** Rättelsen är en separat, signerad post.

❌ **Försök inte ändra det låsta originalet.** Systemet blockerar det. Använd alltid rättelse.

---

## 🔍 Vad betyder "Behöver granskning"?

Det är gamla dokument/bilder/journaler som **importerats** från externa källor:
- Drive (gamla journaler + bilder)
- halso@hairtpclinic.com (hälsodeklarationer)
- GetAccept (signerade avtal)

Dessa är **inte automatiskt verifierade**. De behöver en människa som granskar och godkänner.

| Betyder | Betyder **inte** |
|---|---|
| "Det här fanns någonstans i en gammal källa" | "Det här är granskat och godkänt" |
| "Använd som referens" | "Använd som klinisk sanning" |
| "Diskutera med kollega om osäker" | "Kopiera rakt in i ny journal" |

---

## 📞 Vem eskalerar du till?

| Situation | Eskalera till |
|---|---|
| Osäker patient-identitet vid bokning | **Admin/ops** (Fazli eller Egzona) |
| Tekniskt fel — sidan visar något konstigt | **Fazli** direkt + skicka skärmdump |
| Misstänker dubblett-kund | **Admin/ops** — radera inte själv |
| Journalpost är felaktig och redan signerad | Gör **rättelse** själv (se ovan) |
| Patient frågar om bilder/Photo Review | "Kommer separat. Vi har materialet men granskar fortfarande." |
| Patient vill ha kopia på sin journal (GDPR) | **Admin/ops** — det görs separat via export |
| Kund frågar efter Fortnox-faktura | "Fortnox-integration är pausad. Manuell export sker via Fazli." |

---

## 🛟 Om något ser fel ut på sidan

1. **Refresha först** (Cmd+R / F5)
2. Om fortfarande fel → **byt till backup-URL:** `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html`
3. Om fortfarande fel → **säg det direkt till Fazli** + skärmdump
4. **Skapa aldrig journaler i en sida som ser trasig ut** — vänta tills den fungerar

---

## 🧭 Snabb-länkar

- **Startsida:** `https://arcana.hairtpclinic.com/cco-personal-start.html`
- **Kundlistan:** `https://arcana.hairtpclinic.com/kunder.html`
- **Backup:** `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html`

---

## 📜 Dag-1-regler i en mening var

1. **Verifiera identitet** före signering
2. **Skapa inte ny kund** vid osäker match
3. **Review-material** är inte klinisk sanning
4. **Migrerade bilder** används inte kliniskt
5. **Ingen extern AI** på journaltext

---

_Hair TP Clinic · 2026-06-04 · Kontrollerad journalföringspilot · Frågor: Fazli_
