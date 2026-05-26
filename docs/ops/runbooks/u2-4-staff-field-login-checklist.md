# U2.4 — STAFF login i fält (checklista)

**Syfte:** Verifiera STAFF-inloggning på riktig mobil (iPhone/Android) efter att automation är grön.  
**Relaterat:** [auth-go-live-rollback-runbook.md](./auth-go-live-rollback-runbook.md) § STAFF login (U2.4), `docs/strategy/cco-mobile-staff-pilot-checklist.md` Fas 5.5–5.6.

## Förutsättningar

| Krav | Notering |
|------|----------|
| Prod automation PASS | `npm run verify:u2-4-field-prep-prod` |
| STAFF-konto | E-post + lösenord (samma som prod) |
| Tenant | `hair-tp-clinic` om fältet visas |
| Nätverk | Mobil data eller klinik-WiFi (inte bara desktop-simulator) |

**Passkey:** STAFF-formuläret stöder **lösenord only** — testa inte passkey i fält för U2.4.

## Automatiserad prep (kör alltid först)

```bash
npm run verify:u2-4-field-prep-prod
```

Skriptet kedjar:

1. `verify:staff-mobile-login-prod` — Chromium + WebKit @ iPhone 13, API-login
2. `verify:staff-ui-prod` — staff-yta grund
3. `verify:booking-engine-policy-prod` — publik webb-bokning fortfarande av (503)
4. `verify:cco-mobile-pilot-prod` — bred mobil suite inkl. journal

Kräver i `.env`: `ARCANA_STAFF_EMAIL`, `ARCANA_STAFF_PASSWORD`. OWNER MFA: `ARCANA_OWNER_MFA_SECRET` eller recovery (för API-delen i login-verify).

## Fältchecklista (fysisk enhet)

Kör **endast** om prep ovan är PASS. Markera datum + initialer.

### A. PWA / start

- [ ] Öppna `https://arcana.hairtpclinic.se/staff?view=customers` i Safari (iOS) eller Chrome (Android)
- [ ] **Add to Home Screen** — ikon öppnar samma URL
- [ ] Ingen open access — login-formulär visas (`data-staff-login-form`)

### B. Inloggning

- [ ] Ange STAFF e-post + lösenord (+ tenant om synligt)
- [ ] Efter login: kundlista synlig (`data-customer-list` / `data-patient-row`)
- [ ] Token finns i `localStorage` eller `sessionStorage` (`ARCANA_ADMIN_TOKEN`)
- [ ] Uppdatera sidan — fortfarande inloggad (session kvar)

### C. Pilotflöde (minst en kund)

- [ ] Öppna pilotkund från listan
- [ ] Flik **Filer** laddar utan vit skärm / evig spinner
- [ ] Flik **Journal** laddar; inga blockerande blur-lager över innehåll
- [ ] Scroll i journal/lista fungerar (ingen “fastlåst” body)

### D. Utloggning / återlogin

- [ ] Logga ut (eller rensa token) → login-formulär igen
- [ ] Logga in igen — samma resultat som B

### E. Edge (valfritt men rekommenderat)

- [ ] Svag nätverksmiljö: login timeout/error är begripligt (inte tom skärm)
- [ ] Rotera skärm portrait ↔ landscape — layout trasig men användbar

## Resultat

| Fält | Värde |
|------|-------|
| Datum | |
| Enhet (modell + OS) | |
| Browser | Safari / Chrome |
| Prep verify | PASS / FAIL |
| Fält U2.4 | PASS / FAIL |
| Anteckningar | |

## Sign-off (fysisk enhet)

| Gate | Status | Datum | Initialer | Notering |
|------|--------|-------|-----------|----------|
| Automation prep (`verify:u2-4-field-prep-prod`) | ☐ PASS / ☐ FAIL | | | PASS = prep komplett; kräver **inte** fysisk enhet |
| Fysisk iPhone/Android (A–D i checklistan) | ☐ PASS / ☐ FAIL | | | Kräver riktig enhet — automation täcker **inte** PWA/add-to-home, session efter reload i Safari/Chrome, eller svagt nät |
| U2.4 totalt klart | ☐ | | | Sätt ☑ endast när **båda** raderna ovan är PASS |

> **Ärlig status:** Automation prep ☑ räcker för deploy-gate. U2.4 som helhet är ☑ först efter fysisk sign-off ovan.

## Vid FAIL

1. Screenshot + kort beskrivning (steg, URL, felmeddelande)
2. Kör om relevant del av `verify:u2-4-field-prep-prod` från desktop
3. Jämför med senaste körning i CI/deploy-logg
4. Eskalera till auth-runbook rollback om prod-login helt trasig

**Senast granskad:** 2026-05-25
