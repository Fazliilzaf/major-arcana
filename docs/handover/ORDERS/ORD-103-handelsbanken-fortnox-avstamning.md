# ORD-103 — Bankavstämning Handelsbanken mot Fortnox-verifikat

**Status:** PÅBÖRJAD (kartläggning klar) · **Prio:** P1 (revisorsunderlag)
**Beställare:** Fazli / Hair TP Clinic GBG AB
**Ägar-GO krävs:** ja, för scope + kontoplan + skarp körning

---

## 1 · Bakgrund

Hair TP Clinic GBG AB har två huvudsakliga betalningsflöden som måste stämmas av varje månad:

1. **Utgifter** som betalas med **American Express** — dessa täcks av ORD-102 (kortavstämning).
2. **Inbetalningar och större utbetalningar** som går via **Handelsbanken** — dessa saknar en motsvarande avstämningsfunktion.

Revisorn behöver en översikt där banktransaktioner från Handelsbanken matchas mot verifikat som redan finns i Fortnox. Målet är att identifiera:

- Transaktioner som redan är bokförda i Fortnox.
- Transaktioner som saknar verifikat — och därmed behöver underlag.
- Eventuella dubbelbokföringar eller felbelopp.

## 2 · Datakällor som finns idag

### 2.1 Handelsbanken CSV

Filformatet är känt (exempel: `Transaktioner_558698131_2026-08-21_0641.csv`):

- Datum, beskrivning, belopp, saldo.
- Både inbetalningar (positiva) och utbetalningar/uttag (negativa).
- Kolumner inkluderar transaktionsdatum, text, belopp, och ibland referensnummer.

### 2.2 Fortnox API

`src/cfo/cfoFortnoxClient.js` har redan:

- `listVouchers({ financialYearDate, page, limit })` — läser verifikat.
- `listFinancialYears()` — för att hitta rätt räkenskapsår.

Ingen write behövs för denna order — endast läsning av verifikat.

### 2.3 CFO/CM-expenses

`src/cfo/cfoExpenseStore.js` innehåller redan utgifter med status `exported` och kopplade Fortnox-verifikat (`fortnoxVoucherId`).

## 3 · Önskat beteende

### 3.1 Import

1. Användaren laddar upp en Handelsbanken-CSV via UI (drag-and-drop eller filväljare).
2. Systemet parser CSV:n och klassificerar varje rad som:
   - `income` (positivt belopp)
   - `expense` (negativt belopp)
   - `transfer` / `fee` / `unknown` (t.ex. "ÅRSAVGIFT FÖR KONTOT", "HB KORT", "Investering")

### 3.2 Verifikat-hämtning

1. För varje transaktionsdatum, hitta rätt räkenskapsår via `listFinancialYears()`.
2. Hämta verifikat från Fortnox för det räkenskapsåret.
3. Matcha banktransaktioner mot verifikat på:
   - Belopp (exakt eller ±1 kr)
   - Datum (±7 dagar som standard, konfigurerbart)
   - Beskrivning (fuzzy match mot verifikat-radernas text)

### 3.3 Matchningsstatus

Varje banktransaktion får en status:

| Status       | Betydelse                                                              |
| ------------ | ---------------------------------------------------------------------- |
| `matched`    | Ett eller flera verifikat hittades med matchande belopp + datum        |
| `suggestion` | Möjliga verifikat hittades, men inte entydiga                          |
| `unmatched`  | Inga matchande verifikat hittades — saknar bokföring                   |
| `ignored`    | Manuellt markerad som irrelevant (t.ex. överföring mellan egna konton) |

### 3.4 UI i `finance.html`

Ny sektion: **Bankavstämning · Handelsbanken**

- Knapp: **Ladda upp bank-CSV**
- Statsrad: matchade / förslag / saknar verifikat / summa
- Tabell per transaktion: datum, beskrivning, belopp, status, matchat verifikatnummer, åtgärdsknappar
- Knappar per rad: **Bekräfta matchning**, **Ignorera**, **Skapa ärende** (t.ex. skicka till CFO/CM som saknat underlag)

### 3.5 Persistens

- Banktransaktioner sparas i egen JSON-fil under `stateRoot`, t.ex. `data/cfo/bank-reconciliation.json`.
- Ingen bankdata i GitHub.
- Audit på import, matchningsändringar och ignoreringar.

## 4 · Design-lås

- **Importen skapar aldrig verifikat i Fortnox** — den läser bara.
- **Ingen bankdata i GitHub** — endast i lokal state/secure storage.
- **Matchningen är fail-closed** — osäkra transaktioner lämnas som `suggestion` eller `unmatched` tills ägaren beslutar.
- **Revisor-rollen** får läsa men inte modifiera matchningar.

## 5 · Föreslagen filstruktur

```
src/cfo/cfoBankReconciliation.js      # parser + store + matchningsmotor
src/routes/cfoBankReconciliation.js   # routes: upload, list, match, ignore
public/finance.html                    # ny UI-sektion
tests/cfo/cfoBankReconciliation.test.js
```

## 6 · Acceptanskriterier

- [ ] Handelsbanken-CSV parsas korrekt (inklusive svenskt talformat och datum).
- [ ] Verifikat hämtas från Fortnox för rätt räkenskapsår.
- [ ] Auto-matchning hittar entydiga par (belopp + datum).
- [ ] Osäkra matchningar visas som förslag, aldrig auto-bekräftas.
- [ ] UI visar stats och lista i `finance.html`.
- [ ] Audit-loggar skrivs för alla mutationer.
- [ ] Ingen bankdata läcker till GitHub.
- [ ] Tester täcker parser, matchning och RBAC.

## 7 · Nästa steg

1. Ägaren godkänner scope och prioritering.
2. Cursor/Claude bygger modulen enligt denna order.
3. UAT i testmiljö med existerande Handelsbanken-CSV.
4. Skarp körning i prod med ägar-GO.

---

**Relaterat:** ORD-102 (Amex-kortavstämning), `docs/strategy/CHIEF-OF-FINANCE-MVP3-ROADMAP-2026-06-01.md` (CF.11 Bank-CSV-import).
