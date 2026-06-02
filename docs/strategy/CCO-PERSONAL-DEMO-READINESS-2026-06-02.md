# CCO Personal-Demo Readiness Report

**Datum:** 2026-06-02
**Sida:** `/personal-demo.html`
**Syfte:** Presentation-säker startsida för personalmötet inför kontrollerad journalföringspilot

---

## Vad sidan är (och inte är)

| Är | Är inte |
|---|---|
| Smal, kontrollerad start för personalmötet | En öppen demoportal |
| Endast verifierade routes | Inte en sandlåda med "magisk AI" |
| Journalföring som huvudflöde | Inte cutover-portal |
| Reflekterar verklig CCO-status idag | Inte ett löfte om framtida features |

Layout/känsla bygger på `cco-demo.html`-DNA (Cormorant + Jost, pill-shadow, vellum-paletten) men **innehållet är nyskrivet och verifierat**.

---

## Klickbara länkar (verifierade)

| Knapp | Route | Status post-preflight |
|---|---|---|
| Öppna kundlistan | `/kunder.html` | 200 ✅ |
| Öppna pilotkund 1-3 | `/kunder.html?focus={cid}` eller `openRoute` från manifest | 200 ✅ (när manifest publicerat) |
| Öppna Finance | `/finance.html` | 401 (auth req) ✅ |
| Revisorportal | `/finance-review.html` | 401 (auth req) ✅ |
| Rapporter | `/finance-reports.html` | 401 (auth req) ✅ |
| Visa dag-1-regler | `#dag-1-regler` (anchor) | n/a (anchor) |

Auth-skyddade routes returnerar 401 utan token — det är **förväntat** beteende, inte fel.

---

## Pausade kort (visas, men är inte klickbara)

| Sektion | Status | Förklaring |
|---|---|---|
| Bilder (Photo Review) | `data-paused="true"` | "Använd inte migrerade före/efter-bilder kliniskt ännu" |
| Fortnox-integration | Visas som blockerad | Utvecklarportal-blocker på Fortnox-sidan |
| Mail-worklist | Visas som "pågående aktivering" | Inte primärt verktyg dag 1 |

Inga pausade kort har klickbara `href`. Verifierat av preflight (`scripts/verify-personal-demo-links.js`).

---

## Tre pilotkunder

Sidan läser `/data/reports/cco-personal-demo-manifest.json` vid laddning. Den filen ska Cursor publicera med 3 säkra testkunder. Schema:

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-06-02T...",
  "pilotCustomers": [
    {
      "customerId": "cliento_XXXXX",
      "redactedLabel": "Pilot 1 · (initialer)",
      "hasJournalFeed": true,
      "hasTimeline": true,
      "hasHistory": true,
      "hasReview": false,
      "openRoute": "/kunder.html?focus=cliento_XXXXX"
    },
    ...
  ]
}
```

**Om manifestet saknas:** sidan visar en fallback ("Manifest ej publicerat ännu") med en länk till `/kunder.html`. Inget kraschar.

---

## Demo-flow (12 steg)

Detta är ordningen Fazli ska följa under personalmötet:

1. **Öppna `personal-demo.html`** — startsidan
2. **Klicka "Öppna kundlistan"** eller en av pilotkunderna
3. **Öppna pilotkund 1** (verifierad customerId från manifest)
4. **Visa identitetskontroll** — namn, telefon, Cliento-id
5. **Visa journal-feed** — befintliga poster
6. **Skapa journalanteckning** på en testkund
7. **Signera/lås** posten → bekräfta `locked=true`
8. **Visa rättelseflöde** — ny post, inte ändring av låst
9. **Visa timeline** — kronologisk händelsekedja
10. **Visa importerad historik** — halso, GetAccept, Drive (med review-flaggor)
11. **Visa "Behöver granskning"** — flagga som inte klinisk sanning
12. **Avsluta:** "Nu börjar vi kontrollerat med journalföring"

---

## Vad Fazli säger i rummet (talmanus-utdrag)

> Det här är inte längre ett löst demosystem. CCO är nu redo för kontrollerad
> journalföringspilot. Vi börjar med kända patienter. Ni ska verifiera identitet,
> skriva journal, signera och använda rättelseflödet. Historik finns där den
> är importerad, men allt som är markerat "Behöver granskning" ska inte
> användas som klinisk sanning ännu. Bilder finns inne, men före/efter-bilder
> ska inte användas kliniskt förrän Photo Review är klar. Det här är vårt
> nya kundkort och journalnav.

Fullt talmanus finns längst ned på `/personal-demo.html`.

---

## Vad personal **inte** ska använda dag 1

Sidan har en explicit "Inte för pilot dag 1"-sektion som listar:

- AI no-show predict
- AI triage som sanning
- Email-to-booking automation
- Unified inbox som färdig
- Automation hub
- Watch app / multi-tenant / showcase / AI coach
- Aisia / kamera / scalp-analys (bakom feature flag)
- Full analytics som sanning

---

## Säkerhetscheckar (gjorda)

- ✅ Inga mock-siffror på sidan ("25 Live-vyer", "1 247 Demo-kunder", "49 MSEK" — alla borttagna)
- ✅ Inga "live"-badges för overifierade vyer
- ✅ Inga gamla demo-claims om AI magic / no-show / unified inbox som färdig
- ✅ Inga Drive-länkar
- ✅ Inga `webcal://localhost`
- ✅ Inga externa mock-länkar (förutom Google Fonts CDN)
- ✅ Inga disabled-kort med klickbart `href`
- ✅ Journalföring positionerad som primärt flöde (första sektionen efter hero)
- ✅ CCO presenteras som **kontrollerad intern pilot**, inte cutover

Alla regler enforceas av `scripts/verify-personal-demo-links.js`.

---

## Preflight — kör så här

```bash
node scripts/verify-personal-demo-links.js
# Default BASE=https://arcana.hairtpclinic.com
# Eller egen: node scripts/verify-personal-demo-links.js --base=http://localhost:3000
```

Exit-kod:
- **0** = ALL PASS (presentation-säker)
- **1** = någon kontroll faller — fixar krävs före presentation
- **2** = source-fil saknas
- **3** = fatal error

---

## Beroenden från Cursor (manifest-spår)

För att alla pilotkund-knappar ska fungera behöver Cursor publicera:

- `data/reports/cco-personal-demo-manifest.json` med 3 customerIds + flaggor
- (valfritt) `docs/strategy/CCO-PERSONAL-DEMO-MANIFEST-2026-06-02.md` som beskriver vilka customerIds som valts och varför

Sidan fungerar utan manifest (fallback), men full demo-värde uppnås med manifest.

---

## Status

| Komponent | Status |
|---|---|
| `public/personal-demo.html` | ✅ skapad |
| `scripts/verify-personal-demo-links.js` | ✅ skapad |
| Den här rapporten | ✅ |
| Manifest från Cursor (3 pilotkunder) | ⏳ väntar |
| Render-deploy | ⏳ trigger efter push |

---

## Säkerhetsnoteringar

- Sidan rör **inte** journal-routes, kundkort-routes eller forms-routes (jag bevarar journal-block per regression-regeln 2026-06-02).
- Server.js är orörd — sidan är en ren static-fil i `public/`.
- Ingen patientdata i denna rapport eller i sidans HTML.
- Aisia/DS-3 är inte aktiverat och nämns inte som tillgängligt.

_Slut på rapport._
