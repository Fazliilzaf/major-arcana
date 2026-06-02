# Personal · Dag 1 journalpilot-checklist · 4 juni 2026

> Skriv ut. Ha på arbetsstationen. Kör igenom varje patient.

---

## ☑ 1 · Verifiera identitet (ALLTID FÖRST)

Innan du öppnar kundkortet — bekräfta tre saker:

- ☐ **Namn** — patienten säger sitt fulla namn (inte du säger det)
- ☐ **Telefon** — sista 4 siffror, jämför med Cliento
- ☐ **Cliento-id** — matchar mot kundkortets header

**Allt stämmer?** → fortsätt. **Något stämmer inte?** → gå till sektion 7 (eskalering).

---

## ☑ 2 · Öppna kundkort

- ☐ Öppna `/cco-personal-start.html` (huvudfönster)
- ☐ Klicka **"Öppna kundkort"** eller använd pilotkund-knapparna
- ☐ Verifiera kundkortets header (namn/telefon/Cliento-id) **igen**
- ☐ Klicka **Journal-fliken**

---

## ☑ 3 · Skapa journalanteckning

- ☐ Klicka **"Ny anteckning"**
- ☐ Välj mall: **Konsultation** / **Behandling** / **Follow-up**
- ☐ Skriv anteckningen — kort, faktabaserad, datum + observation + plan
- ☐ Klicka **"Spara"** (du har nu en **draft** som kan ändras fritt)

---

## ☑ 4 · Signera/lås

**Innan du klickar "Signera" — gå igenom mentalt:**

- ☐ Rätt patient öppen? (kontrollera kortets header)
- ☐ Anteckningen är komplett?
- ☐ Jag har läst igenom texten?
- ☐ Inga personnummer i fritext om inte krävs?
- ☐ Ingen extern AI använd? (copy-paste från ChatGPT förbjudet)
- ☐ Jag är säker?

**Allt grönt?** → klicka **"Signera"** → bekräfta dialog → posten **låses direkt**.

> ⚠️ **Signering är permanent.** Du kan inte ändra originalet — du kan bara göra en rättelse som ny post.

---

## ☑ 5 · Rättelse (om det behövs)

Du upptäcker att en signerad post är fel.

- ☐ Öppna den signerade posten
- ☐ Klicka **"Skapa rättelse"** — ny tom post öppnas, länkad till originalet
- ☐ Skriv det korrigerade i sin helhet (inte bara "stryk allt ovan")
- ☐ Ange anledning: "typo", "ny info", "felaktig dos", etc.
- ☐ Klicka **"Spara"** → **"Signera"**
- ☐ Verifiera i timeline att båda posterna syns kronologiskt

**Aldrig:**
- ☐ Försök inte ändra det låsta originalet (systemet blockerar)
- ☐ Skapa inte rättelse utan att signera den
- ☐ Glöm inte ange anledning

---

## ☑ 6 · Vad "Behöver granskning" betyder

Material flaggat med "Behöver granskning" / `needs review` är **importerat** från externa källor:

- Drive (gamla journaler + bilder)
- halso@hairtpclinic.com (hälsodeklarationer)
- GetAccept (signerade avtal)

**Det är INTE klinisk sanning.** Det är inte automatiskt verifierat.

| Använd som... | Använd **inte** som... |
|---|---|
| Referens när du frågar patienten | Beslut för behandling utan verifiering |
| Bakgrundsinfo om historik | Källa till diagnoser/dosering |
| Underlag för uppföljningsfrågor | Klinisk sanning |

---

## ☑ 7 · När stoppa och eskalera

**STOPPA OCH ESKALERA om:**

- ☐ Du är osäker på patient-identiteten (säg: *"En sekund så dubbelkollar jag"*)
- ☐ Du misstänker dubblett-kund i systemet
- ☐ Du har börjat journalföra på fel patient (**STOPPA. SPARA INTE.** Stäng kortet.)
- ☐ Sidan beter sig konstigt / visar trasig layout
- ☐ Patient ifrågasätter sin journal eller historik
- ☐ Du är osäker på vilken mall som är rätt
- ☐ Patient frågar om GDPR-export

**Det är aldrig fel att eskalera. Bättre att fråga än att gissa.**

---

## ☑ 8 · Vem kontaktas vid problem

| Problem | Kontakta | Hur |
|---|---|---|
| Osäker patient-identitet | **Admin/ops** (Fazli/Egzona) | Direkt — säg åt patienten *"En sekund så dubbelkollar jag"* |
| Tekniskt fel på sidan | **Fazli** | Skärmdump + tidpunkt + vilken sida |
| Misstänker dubblett-kund | **Admin/ops** | Radera inte själv — låt admin merga |
| Du har journalfört på fel patient | **Fazli direkt** | Stoppa allt först — skärmdump om möjligt |
| Patient vill ha kopia på journal (GDPR) | **Admin/ops** | "Jag vidarebefordrar din förfrågan" |
| Patient frågar om bilder/Photo Review | Säg själv: *"Kommer separat"* | Behöver inte eskaleras |
| Patient frågar om Fortnox-faktura | Säg själv: *"Pausad integration"* | Behöver inte eskaleras |

---

## ☑ 9 · Felsökning — vad gör jag om...

| Symptom | Åtgärd |
|---|---|
| Sidan visar spinner i 10+ sek | Refresh (Cmd+R / F5) |
| Refresh hjälper inte | Byt till backup: `major-arcana-frankfurt.onrender.com/cco-personal-start.html` |
| 502 / Bad Gateway | Vänta 2 min — Render startar om — refresh |
| "Inloggning krävs" | Logga in via `/admin.html` |
| Knappen "Signera" syns inte | Posten är redan signerad — använd "Skapa rättelse" |
| Sidan ser trasig ut visuellt | Skärmdump → Fazli. **Skriv ingen ny journal i en trasig sida.** |
| Du har börjat på fel patient | **STOPPA. SPARA INTE.** Stäng kortet. Kontakta Fazli. |

---

## ☑ 10 · End-of-shift-checklist

Innan du loggar ut för dagen:

- ☐ Alla påbörjade journaler signerade (eller medvetet kvar som draft för imorgon)
- ☐ Inga rättelser hängande utan signering
- ☐ Inga öppna patientkort på din skärm
- ☐ Logga ut från `/admin.html` om du var inloggad

---

## 📜 Dag-1-regler i en mening var

1. **Verifiera identitet** före signering
2. **Skapa inte ny kund** vid osäker match
3. **Review-material** är inte klinisk sanning
4. **Migrerade bilder** används inte kliniskt
5. **Ingen extern AI** på journaltext

---

## 🧭 Snabb-länkar

- **Personalstart:** `https://arcana.hairtpclinic.com/cco-personal-start.html`
- **Personalguide (printable):** `https://arcana.hairtpclinic.com/journal-pilot-guide.html`
- **Backup:** `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html`

---

_Hair TP Clinic · 4 juni 2026 · Kontrollerad journalföringspilot · Dag 1_
