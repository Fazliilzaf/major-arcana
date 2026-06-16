# ORD-6 — Cloud Staff UAT (legal review · mall-version-godkännande)

**Status:** Ready for staff UAT  
**Prod:** `https://arcana.hairtpclinic.com`  
**Automated pre-check:** `npm run verify:ord6-prod-sticks`  
**Browser capture:** `npm run capture:ord6-browser-uat`  
**Förväntad tid:** 30–40 min

---

## Förutsättningar

1. Inloggad som staff/owner
2. Prod grön: `/readyz` + `npm run verify:ord6-prod-sticks`
3. **Använd Axel utan `demoSkipSteg7`** för legal-review-path (steg 7 gate)
4. Screenshot vid FAIL

---

## Pilot-URL:er (prod)

| Scenario                                               | Kund               | URL                                                                                                                             |
| ------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| U6.2/U6.4 · Legal gate (Axel, **ingen** demoSkipSteg7) | Axel Meijer        | `https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=54a658c8-7412-4f10-877e-9e607e03b74f` |
| U6.1 · Saknar avtal                                    | Valfri utan utkast | Skapa ej avtal — förvänta `needsFromOffer`                                                                                      |
| U6.3 · Godkänd mall                                    | Efter U6.5         | Gate OK, signering tillåten                                                                                                     |

**OBS:** Lägg **inte** till `demoSkipSteg7=1` på Axel — då hoppas legal gate över.

---

## U6.1 — Blockera utan avtal (needsFromOffer)

| #     | Steg                           | Förväntat                                        | PASS |
| ----- | ------------------------------ | ------------------------------------------------ | ---- |
| U6.1a | Patient utan behandlingsavtal  | Smart nästa steg / utkast visar avtal saknas     | ☐    |
| U6.1b | **Kontrollera gate** (preview) | 404 / `needsFromOffer` — inget skickat till kund | ☐    |

---

## U6.2 — Blockera utan legal review (needsLegalReview)

| #     | Steg                                          | Förväntat                                                           | PASS |
| ----- | --------------------------------------------- | ------------------------------------------------------------------- | ---- |
| U6.2a | Öppna Axel (URL ovan, **utan** demoSkipSteg7) | Steg 7 / bundle visar legal gate ELLER smart nästa med avtal-signal | ☐    |
| U6.2b | Bundle modal                                  | Copy **"Avtal väntar juridisk granskning"** / `legal_review`        | ☐    |
| U6.2c | Preview API                                   | `needsLegalReview: true`, `allowed: false`                          | ☐    |

---

## U6.3 — Tillåt när mall-version godkänd

| #     | Steg                     | Förväntat                                        | PASS |
| ----- | ------------------------ | ------------------------------------------------ | ---- |
| U6.3a | Efter godkännande (U6.5) | **Kontrollera gate** → Gate OK ✓                 | ☐    |
| U6.3b | Preview-svar             | `allowed: true`, `templateVersionApproved: true` | ☐    |

---

## U6.4 — Staff UI "Kontrollera gate" (skickar inte)

| #     | Steg                                             | Förväntat                                                 | PASS |
| ----- | ------------------------------------------------ | --------------------------------------------------------- | ---- |
| U6.4a | Öppna utkast (smart nästa steg → avtal/samtycke) | Knapp **"Kontrollera gate (skickar inte)"** syns          | ☐    |
| U6.4b | Klicka Kontrollera gate                          | Modal uppdateras — **ingen** kund-länk skickad            | ☐    |
| U6.4c | DOM                                              | Text `Kontrollera gate` och `send-for-sign/preview` wired | ☐    |

---

## U6.5 — Godkänn mall-version (internt)

| #     | Steg                  | Förväntat                                           | PASS |
| ----- | --------------------- | --------------------------------------------------- | ---- |
| U6.5a | Efter spärrad preview | Knapp **"Godkänn mall-version (internt)"**          | ☐    |
| U6.5b | Klicka godkänn        | POST `template-version-approval` → success          | ☐    |
| U6.5c | Upprepad preview      | Gate OK — kan gå vidare till **Aktivera signering** | ☐    |

---

## U6.6 — Väg A: ingen `record-legal-review`

| #     | Steg                               | Förväntat                                  | PASS |
| ----- | ---------------------------------- | ------------------------------------------ | ---- |
| U6.6a | Kod/deploy                         | Route `record-legal-review` **finns inte** | ☐    |
| U6.6b | Endast `template-version-approval` | Juridik loggas via mall-godkännande-store  | ☐    |

---

## Automatiserad prod-check (före manuell UAT)

```bash
npm run verify:ord6-prod-sticks
node --test tests/ops/ccoTreatmentAgreementSendGate.test.js
npm run cco:verify-fas-a-readiness
npm run capture:ord6-browser-uat
```

---

## Godkännandekriterier

- [ ] U6.1–U6.6 manuellt PASS ( eller N/A med motivering )
- [ ] `verify:ord6-prod-sticks` PASS
- [ ] Owner prod GO

---

_Hair TP · ORD-6 Cloud Staff UAT · 2026-06-16_
