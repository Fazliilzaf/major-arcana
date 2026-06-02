# Fazli · 4 juni morgon-checklist

> Skriv ut eller ha på telefonen. 10 min innan personalmötet.

---

## ⏰ T-10 min: Tekniskt go/no-go

```bash
node scripts/verify-personal-demo-links.js
node scripts/run-personal-demo-readiness.js
```

Båda måste säga **ALL PASS** / **E2E PASS**. Om en faller:
- Ping mig (Claude) direkt med output → fixar P0/P1
- Backup-URL redo: `https://major-arcana-frankfurt.onrender.com/cco-personal-start.html`

---

## ⏰ T-8 min: Browser-uppstart

1. Öppna Chrome → ny vanlig flik (inte incognito)
2. Navigera till **`https://arcana.hairtpclinic.com/cco-personal-start.html`**
3. Verifiera att sidan laddar **utan trasiga element** — pilot-hero "Journalföring · Redo för pilot" syns
4. Klicka **"Öppna kundkort"** → ska öppna `/kunder.html` utan fel
5. Backa till `/cco-personal-start.html`
6. Klicka **"Öppna pilotkund 1"** → ska öppna `/journal-feed-demo.html?customerId=cco-pilot-20260602-a...` utan fel
7. Backa igen

Om något knakar: refresha. Om kvarstår → backup-URL.

---

## ⏰ T-5 min: Inloggning (om du ska visa CF/finance)

1. Öppna ny flik → `https://arcana.hairtpclinic.com/admin.html`
2. Logga in: **Fazli@hairtpclinic.com** + lösenord
3. Verifiera att dashboard laddar med din data
4. Behåll fliken öppen i bakgrunden (för CF-demo om någon frågar)

Om inloggning misslyckas: presentationen funkar ändå för journal-flödet. CF-delen kan visas via UI-shell utan login.

---

## ⏰ T-2 min: Mental check-in

- Du är **inte** här för att sälja CCO som färdigt — det är **kontrollerad pilot**
- Du börjar med **journalföring** — inget annat
- Du säger **"Behöver granskning" är inte klinisk sanning**
- Du säger **"Photo Review pågår — bilder används inte kliniskt ännu"**
- Du säger **"Mail-pipeline är under aktivering — inte huvudverktyg dag 1"**

---

## ⏰ T-0: 12 stegs demo-flow

Följ ordningen i `CCO-PERSONAL-DEMO-READINESS-2026-06-04.md` (14 steg där, kärnan är 12):

1. Öppna `/cco-personal-start.html`
2. "Det här är startsidan för intern journalpilot"
3. Klicka **Öppna kundkort**
4. Klicka **Öppna pilotkund 1**
5. Visa identitet (namn/telefon/Cliento-id)
6. Visa journal-feed
7. Skapa journal (testpatient!)
8. Signera/lås
9. Försök ändra låst → visa att det blockeras
10. Skapa rättelse
11. Visa timeline
12. Visa historik + "Behöver granskning"
13. Förklara dag-1-regler (5 punkter)
14. Avsluta: *"Nu börjar vi kontrollerat med journalföring"*

---

## ⏰ Efter mötet

1. Säg till mig (Claude): **"pilot startar"**
2. Jag växlar till Render-log-observation
3. Rapporterar bara P0/P1-errors live
4. Personalen kör mot prod direkt

---

## ❌ Saker du **inte** ska säga eller visa

- ❌ Mock-siffror ("1 247 kunder", "49 MSEK" — borttagna men säg det inte ändå)
- ❌ AI no-show / unified inbox / automation hub / watch app som "live"
- ❌ Aisia / kamera/scalp (bakom feature flag)
- ❌ Fortnox-write (blockerad integration)
- ❌ Lova att Photo Review är klar
- ❌ Lova att mail-pipeline är full-prod

---

## 🆘 Om allt går åt skogen mid-presentation

> "Vi tar en kort paus medan jag säkerställer systemet — under tiden kan vi prata om upplägget i sin helhet."

Sen kör backup-URL eller flyttar till whiteboarden. Personalen ska inte se panik. Du har en plan.

---

_Hair TP Clinic · 4 juni 2026 · Kontrollerad journalföringspilot · Frågor under mötet: pinga Claude för P0/P1-fix_
