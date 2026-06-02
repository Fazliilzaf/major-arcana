# CCO Personalmöte · Demo-runbook · 4 juni 2026

> Fazli's kompletta runbook. Skriv ut eller ha på telefonen.
> Två versioner: **5-minutersversion** (snabb) + **15-minutersversion** (komplett).

---

## 📑 Flikar som ska vara öppna före mötet

| # | Flik | URL |
|---|---|---|
| 1 | **Personalstart** (huvudfönster) | `https://arcana.hairtpclinic.com/cco-personal-start.html` |
| 2 | **Personalguide** (sido-flik) | `https://arcana.hairtpclinic.com/journal-pilot-guide.html` |
| 3 | **Admin** (för inloggning om du visar CF) | `https://arcana.hairtpclinic.com/admin.html` (inloggad som Fazli) |
| 4 | **Backup-flik** (om huvud-domän hänger) | `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html` |

**Stäng alla andra flikar.** Inga distraherande tabs under demonstration.

---

## ⚡ 5-minutersversion (snabb-demo)

Använd om du har lite tid eller om personalen redan är insatt.

| # | Klicka | Säg |
|---|---|---|
| 1 | Öppna `/cco-personal-start.html` | *"Det här är startsidan för intern journalpilot."* |
| 2 | Klicka **"Öppna pilotkund 1"** | *"Verifierad testpatient. Säker att jobba i live."* |
| 3 | Klicka **Journal-fliken** → skapa anteckning → spara → signera | *"Signering låser posten. Den kan inte ändras direkt."* |
| 4 | Klicka **"Skapa rättelse"** → spara → signera | *"Behöver vi rätta? Vi skapar ny post. Originalet ändras aldrig."* |
| 5 | Klicka **Timeline-fliken** | *"Båda posterna syns kronologiskt — original + rättelse länkade."* |
| 6 | Avsluta | *"Det här är kärnan. Vi börjar kontrollerat. Frågor?"* |

---

## 🎬 15-minutersversion (komplett demo)

Använd om personalen är ny för CCO eller om du vill täcka allt.

### Del 1 — Sätta scen (2 min)

1. Öppna `/cco-personal-start.html`
2. Säg: *"CCO är vårt nya kundkort och journalnav. Vi börjar kontrollerat med journalföring."*
3. Peka på hero-texten "Journalföring · Redo för pilot"
4. Säg: *"Allt som är klickbart här är verifierat. Allt pausat är tydligt markerat."*

### Del 2 — Öppna kundkort + identitet (3 min)

5. Klicka **"Öppna kundkort"** → visar kundlistan
6. Backa → klicka **"Öppna pilotkund 1"**
7. Peka på header (namn/telefon/Cliento-id högst upp)
8. Säg: *"Före varje signering: verifiera namn, telefon och Cliento-id. Tre saker som måste matcha."*
9. Klicka **journal-fliken** → visa befintliga poster om några finns

### Del 3 — Journal create + signera (3 min)

10. Klicka **"Ny anteckning"**
11. Välj mall: **Konsultation**
12. Skriv något kortfattat: *"Dag-1 pilot, test."*
13. Klicka **"Spara"**
14. Säg: *"Det här är en draft. Ändras fritt. Inte signerad ännu."*
15. Klicka **"Signera"** → bekräfta dialog
16. Säg: *"Nu är posten låst. Den kan inte ändras direkt — bara via rättelse."*

### Del 4 — Rättelse (2 min)

17. Klicka **"Skapa rättelse"**
18. Säg: *"Vi gör en ny post som är länkad till originalet. Det är journalkraven."*
19. Skriv: *"Rättelse: kompletterande info."*
20. Klicka **"Signera"** → bekräfta

### Del 5 — Timeline + historik (3 min)

21. Klicka **Timeline-fliken**
22. Säg: *"Båda posterna syns kronologiskt. Original + rättelse länkade tydligt."*
23. Klicka **Historik-fliken**
24. Peka på badges (`imported`, `needs review`, `drive`, `getaccept`, `halso`)
25. Säg: *"Här ligger importerad historik. Markerade som review är inte verifierade än."*
26. Klicka **"Behöver granskning"**-fliken
27. Säg: *"Det här ska personalen INTE använda som klinisk sanning. Bara referens."*

### Del 6 — Dag-1-regler + avslutning (2 min)

28. Scrolla till sektion 5 i `/cco-personal-start.html`
29. Säg de 5 reglerna högt:
   - *Verifiera identitet före signering*
   - *Skapa inte ny kund vid osäker match*
   - *Review-material är inte klinisk sanning*
   - *Migrerade bilder används inte kliniskt före Photo Review*
   - *Ingen extern AI på journaltext*
30. Avsluta:
   > *"Det här är vårt nya kundkort och journalnav. Vi börjar kontrollerat med journalföring. Mail, Photo Review, Fortnox-sync, Aisia kommer separat i nästa steg. Personalguide ligger på `journal-pilot-guide.html` — ha den öppen i en sido-flik medan ni jobbar. Frågor?"*

---

## 👥 Vad personalen får börja göra (direkt efter mötet)

- ✅ Öppna kundkort på kända pilotkunder
- ✅ Verifiera identitet (namn + telefon + Cliento-id)
- ✅ Skapa journalanteckning
- ✅ Signera/lås posten
- ✅ Skapa rättelse som ny post
- ✅ Läsa importerad historik som referens
- ✅ Använda timeline för att följa patient över tid

---

## 🚫 Vad personalen **inte** ska göra (dag 1)

- ❌ Klinisk användning av migrerade före/efter-bilder (Photo Review ej klar)
- ❌ Skapa ny kund manuellt vid osäker identitet — eskalera till admin/ops
- ❌ Kopiera journaltext till externa AI-verktyg (ChatGPT, etc.)
- ❌ Lita på "Behöver granskning"-material som klinisk sanning
- ❌ Mail-worklist / unified inbox som dagligt verktyg (aktivering pågår)
- ❌ AI no-show / AI triage som sanning (ej verifierat)
- ❌ Aisia / kamera/scalp-funktioner (bakom feature flag)
- ❌ Förvänta sig Fortnox-fakturor (integration blockerad)

---

## 💬 Frågor personal kan ställa + svar

| Fråga | Svar |
|---|---|
| *"Kan jag använda CCO för riktiga patienter direkt?"* | "Ja, för journalföring. Men börja med kända patienter och verifiera identitet alltid." |
| *"Vad händer om jag signerar fel?"* | "Du gör en rättelse som ny post. Originalet ändras aldrig — det är journalkraven." |
| *"Vad är 'Behöver granskning'?"* | "Importerat material från Drive, halso@, GetAccept som inte är verifierat ännu. Använd bara som referens." |
| *"Kan jag använda ChatGPT för att förbättra anteckningar?"* | "Nej. Patientdata får aldrig lämna systemet. Det är vår policy." |
| *"Varför syns inte alla mina patienters bilder?"* | "Photo Review är pausad — vi har bilderna men granskar fortfarande. Inte kliniskt dag 1." |
| *"Vad gör jag om sidan kraschar?"* | "Refresh först. Om kvarstår: byt till backup-URL. Om allt är trasigt: säg till Fazli direkt." |
| *"Hur fakturerar jag mot Fortnox?"* | "Fortnox-integration är pausad. Fakturering sker manuellt via Fazli tills vidare." |
| *"Kan jag ändra på en signerad post?"* | "Nej. Du gör en rättelse som ny post som länkas till originalet." |
| *"Vad gör jag om patienten ifrågasätter identitetskontrollen?"* | "Förklara att det är för deras säkerhet. Vi måste vara säkra på att rätt person får rätt vård." |
| *"Hur länge sparas journalerna?"* | "Lagligt minimum 10 år. Lagras säkert i CCO med full audit." |

---

## 🆘 Fallback — om internet/Render hänger

### Scenario 1: Sidan laddar långsamt (10+ sek)
1. Refresha (Cmd+R / F5)
2. Om kvarstår → öppna backup-URL i ny flik
3. Säg: *"En sekund — vi tar backup-URL:en istället."*

### Scenario 2: 502 Bad Gateway
1. Vänta 2 minuter (Render startar om)
2. Refresha
3. Om fortfarande 502 → backup-URL
4. Säg: *"Vi tar en kort paus medan jag säkerställer systemet — under tiden kan vi prata om upplägget."*

### Scenario 3: Internet helt nere
1. Mobilhotspot från telefonen
2. Säg: *"Vi byter nätverk — en minut."*

### Scenario 4: Allt fallerar
1. Visa speaker-notes från `/journal-pilot-guide.html` (cachad lokalt om du öppnat den tidigare)
2. Whiteboard det viktigaste: 12-stegs flöde + 5 regler
3. Boka uppföljningsmöte: *"Vi tar live-demon imorgon istället när systemet är stabilt."*

---

## 🧭 Snabb-länkar

- **Personalstart:** https://arcana.hairtpclinic.com/cco-personal-start.html
- **Personalguide:** https://arcana.hairtpclinic.com/journal-pilot-guide.html
- **Kundlista:** https://arcana.hairtpclinic.com/kunder.html
- **Backup:** https://major-arcana-frankfurt.onrender.com/cco-personal-start.html
- **Smoke-test (terminal):** `node scripts/verify-personal-demo-links.js && node scripts/run-personal-demo-readiness.js`

---

_Hair TP Clinic · 4 juni 2026 · Kontrollerad journalföringspilot · Fazli runbook_
