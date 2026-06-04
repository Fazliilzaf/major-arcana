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
- **UX-guide (printable):** `https://arcana.hairtpclinic.com/journal-pilot-guide.html`
- **Backup:** `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html`

---

## 📜 Dag-1-regler i en mening var

1. **Verifiera identitet** före signering
2. **Skapa inte ny kund** vid osäker match
3. **Review-material** är inte klinisk sanning
4. **Migrerade bilder** används inte kliniskt
5. **Ingen extern AI** på journaltext

---

## 🌳 Beslutsträd · vid osäker identitet

```
Patient kommer in
       │
       ▼
Verifiera tre saker:
  • namn
  • telefon
  • Cliento-id
       │
       ├─── Allt stämmer  ──────► Öppna kundkort · journalför
       │
       └─── Något stämmer inte
                 │
                 ▼
        Stoppa allt. Säg:
        "En sekund så dubbelkollar jag."
                 │
                 ▼
        Kontakta Fazli eller Egzona
                 │
                 ▼
        Vänta på bekräftelse
                 │
                 ▼
        Skapa ALDRIG ny kund själv
```

---

## 🟢 Första anteckningen — extra detaljerad guide

Första gången du skriver en journal i CCO. **Följ stegen i ordning.**

1. **Bekräfta identitet** (namn + telefon + Cliento-id) — säg det högt
2. Öppna **`https://arcana.hairtpclinic.com/cco-personal-start.html`**
3. Klicka **"Öppna kundkort"** eller direktlänken till pilotkunden
4. På kundkortet → klicka fliken **Journal**
5. Klicka **"Ny anteckning"** (knappen finns oftast uppe till höger)
6. Välj mall: **Konsultation** / **Behandling** / **Follow-up**
7. Skriv anteckningen — håll det kortfattat och faktabaserat
8. Klicka **"Spara"** → posten är nu en **draft** (kan ändras fritt)
9. Granska det du skrivit. Är det rätt? Bekräfta innan signering.
10. Klicka **"Signera"** → bekräfta dialog → **låst**
11. Refresh kundkortet → posten ska synas i Journal-feed + Timeline
12. Behöver du rätta? → klicka **"Skapa rättelse"** → ny post, aldrig direkt på låst original

**Tid:** Första journalen tar ~5 minuter. Efter några gånger är du på ~2 min.

---

## 💬 Vanliga frågor patienten kan ställa

| Patient säger | Du svarar |
|---|---|
| "Är min journal sparad?" | "Ja, jag har precis signerat. Den är låst nu — det betyder den är klar och säker." |
| "Får jag se mina gamla journaler?" | "De importerade journalerna ligger under Historik. Vi granskar dem just nu — jag kan visa det jag är säker på." |
| "Var är mina före/efter-bilder?" | "Bilderna finns inne i systemet, men vi har inte börjat använda dem kliniskt än. Det kommer separat." |
| "Kan jag få en kopia på min journal?" | "Ja, men det skickas via admin/ops. Jag vidarebefordrar din förfrågan till Fazli." |
| "Är min Fortnox-faktura här?" | "Fortnox-integrationen är pausad just nu. Fakturor hanteras manuellt via Fazli." |
| "Vem ser min journal?" | "Bara behandlande personal och administration. Det loggas vem som tittar (audit)." |
| "Kan AI läsa min journal?" | "Nej. Vi använder ingen extern AI på journaltexter — det är förbjudet i vår policy." |

---

## 🆘 Om det går fel — felsökning

| Det här händer | Gör så här |
|---|---|
| **Sidan visar fel/spinner i 10+ sekunder** | Refresha (Cmd+R / F5). Om kvarstår → byt till backup-URL |
| **Backup-URL:** | `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html` |
| **502-fel** | Vänta 2 minuter — Render startar om. Refresha sedan. |
| **"Inloggning krävs"-meddelande** | Logga in via admin.html. Om problem → säg till Fazli. |
| **Knappen "Signera" finns inte** | Posten är troligen redan signerad. Använd "Skapa rättelse" istället. |
| **Knappen "Skapa rättelse" finns inte** | Posten är inte signerad ännu — signera först. |
| **Sidan visar trasig layout** | Skärmdump → skicka direkt till Fazli. **Skriv ingen ny journal i en trasig sida.** |
| **Du har börjat journalföra på fel patient** | **Stoppa direkt.** Spara INTE. Stäng kortet. Kontakta Fazli omedelbart. |

---

## ⏱ De första 30 minuterna

| Tid | Vad gör du |
|---|---|
| 0-5 min | Öppna sidan. Bekanta dig med kundkortet. **Ingen journalföring än.** |
| 5-10 min | Öppna pilotkund 1. Klicka runt — feed, timeline, formulär, historik. |
| 10-15 min | Skapa en test-journal på pilotkund 1 ("dag-1-pilot, test"). Signera. |
| 15-20 min | Skapa en rättelse på testet. Verifiera båda syns i timeline. |
| 20-25 min | Läs igenom dag-1-reglerna en gång till. |
| 25-30 min | Klar att börja med riktiga patienter. **Verifiera identitet alltid.** |

---

_Hair TP Clinic · 2026-06-04 · Kontrollerad journalföringspilot · Frågor: Fazli_
