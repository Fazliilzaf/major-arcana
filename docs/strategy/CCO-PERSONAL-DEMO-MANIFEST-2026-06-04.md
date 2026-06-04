# CCO Personal Demo Manifest

_Deadline: 2026-06-04 · Verifierad: 2026-06-02T13:54Z (prod)_  
_Maskinläsbar: `data/reports/cco-personal-demo-manifest.json`_  
_Startsida: `/cco-personal-start.html`_

---

## 1. Tre säkra pilotkunder

| #   | customerId                       | Redacted label                        | journal-feed | journal-timeline | forms    | Historik | Review | Kundkort       | Öppna                                                                                                                                                   |
| --- | -------------------------------- | ------------------------------------- | ------------ | ---------------- | -------- | -------- | ------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `cco-pilot-20260602-a`           | Pilotkund A · ren journalföringstest  | **PASS**     | **PASS**         | **PASS** | nej      | nej    | `/kunder.html` | [journal-feed-demo](https://arcana.hairtpclinic.com/journal-feed-demo.html?customerId=cco-pilot-20260602-a&tenant=hairtpclinic&role=operator)           |
| 2   | `cco-pilot-20260602-b`           | Pilotkund B · journal-feed + timeline | **PASS**     | **PASS**         | **PASS** | nej      | nej    | `/kunder.html` | [journal-feed-demo](https://arcana.hairtpclinic.com/journal-feed-demo.html?customerId=cco-pilot-20260602-b&tenant=hairtpclinic&role=operator)           |
| 3   | `cco-readiness-smoke-1780402011` | Pilotkund C · signering + rättelse    | **PASS**     | **PASS**         | **PASS** | nej      | nej    | `/kunder.html` | [journal-feed-demo](https://arcana.hairtpclinic.com/journal-feed-demo.html?customerId=cco-readiness-smoke-1780402011&tenant=hairtpclinic&role=operator) |

**Notis:** A–C är **anonyma test-IDs** (ingen riktig patientdata). I vardag: sök känd patient i kundkort efter identitetskontroll. Importerad historik (halso/GetAccept/Drive) syns på riktiga kunder där import finns.

---

## 2. Verifierade routes (prod preflight)

| Route                                                   | Status | Resultat            |
| ------------------------------------------------------- | ------ | ------------------- |
| `/cco-personal-start.html`                              | 200    | **PASS**            |
| `/kunder.html`                                          | 200    | **PASS**            |
| `GET /api/v1/cco-customers/:id/journal-feed`            | 200    | **PASS**            |
| `GET /api/v1/cco-customers/:id/journal-timeline`        | 200    | **PASS**            |
| `GET /api/v1/cco-forms/patient/:id/missing`             | 200    | **PASS**            |
| `GET /api/v1/cco-journal-quick/entries`                 | 200    | **PASS**            |
| `PUT /api/v1/cco-journal-quick/entry` (tom body)        | 400    | **PASS** (monterad) |
| `POST /api/v1/cco-journal-quick/entry/sign` (tom)       | 400    | **PASS**            |
| `POST /api/v1/cco-journal-quick/entry/correction` (tom) | 400    | **PASS**            |
| `GET /api/v1/cco-audit` (owner)                         | 200    | **PASS**            |
| `/finance.html`                                         | 200    | **PASS**            |
| `/finance-review.html`                                  | 200    | **PASS**            |

Inga oväntade **404** eller **5xx** i preflight (2026-06-02).

---

## 3. E2E journalföring (pilotkund A)

| Steg             | Resultat                      |
| ---------------- | ----------------------------- |
| Skapa draft      | **PASS** (200)                |
| Signera/låsa     | **PASS** (200, locked)        |
| Ändra låst post  | **PASS** (409 blocked)        |
| Skapa rättelse   | **PASS** (200)                |
| Signera rättelse | **PASS** (200)                |
| Feed synlig      | **PASS**                      |
| Timeline synlig  | **PASS**                      |
| Audit            | **PASS** (endpoint 200 owner) |

---

## 4. Demo-status

| Område        | Status                                                       |
| ------------- | ------------------------------------------------------------ |
| Journalföring | **Ready for controlled pilot**                               |
| Photo Review  | **Pending**                                                  |
| Mail pipeline | **Activation ongoing** (~93% coverage, `readyForWork=false`) |
| CF            | **CCO-native** · Fortnox blocked                             |
| Aisia         | **Paused**                                                   |

---

## 5. Rödlista

- AI no-show · AI triage (som färdig)
- Unified inbox som färdig daglig vy
- Automation hub · watch app · showcase
- Aisia · kamera · treatment canvas
- Analytics som sanning (om ej verifierad)
- Gamla `cco-demo.html` mock-siffror (1 247 kunder / 49 MSEK / 25 live-vyer)

---

## 6. Guardrails

- Inga Drive-länkar · ingen patientdata i GitHub
- Inga nya kunder vid demo/osäker identitet
- Ingen extern AI på journaltext
- Ingen ny import

---

## Preflight-kommandon

```bash
node scripts/verify-personal-demo-links.js
node scripts/run-personal-demo-readiness.js
```

_Inga personnummer · inga patientnamn._
