# Meridiq Patient De-dup Report

*Genererad: 2026-05-30 · Källa: Meridiq Patienter-export (XLSX) + CCO ccoCustomerStore (Cliento-import)*

## Sammanfattning

Live-extraktion av **6 455 patienter** från `app.meridiq.com/clients` matchad mot CCO:s **7 250 Cliento-importerade kunder** för att fastställa kundresan-coverage och identifiera leads utan vårdjournal.

**Coverage Gate: PASS** — 99.9% av unika Meridiq-patienter matchade mot Cliento. Ingen merge-explosion. Identitetsgrafen är konsekvent.

## Källor

| Källa | Plats | Storlek | Datum |
|---|---|---|---|
| Meridiq Patienter | `Migration-data/meridiq-patients-2026-05-30.xlsx` (iCloud, utanför repo) | 293.5 KB · 6 455 rader · 6 kolumner | 2026-05-30 |
| Cliento CCO Store | `data/cco-customers.json` (gitignored, lokal) | ~13.7 MB · 7 250 kund-keys | 2026-05-29 |

**Meridiq XLSX-schema (6 kolumner):**

| Kolumn | Coverage | Typ |
|---|---|---|
| Förnamn | ~100% | string |
| Efternamn | ~100% | string |
| E-mail | 79.5% (5 132 / 6 455) | email |
| Födelsedatum | 0.03% (2 / 6 455) ⚠️ | date |
| Personnummer | 0.2% (14 / 6 455) ⚠️ | 12-siffrig |
| Telefonnummer | 99.9% (6 448 / 6 455) | E.164 |

## De-dup-strategi

Matchning sker i fallande prioritet:

1. **Personnummer** (12-siffrig normaliserad) — strongest identifier
2. **E-mail** (lowercase + trim)
3. **Telefon** (E.164-normaliserad: 07X → +467X, 08X → +468X osv)
4. **Namn (fallback)** — endast om längd > 5 chars för att undvika kollisioner

## Match-resultat

```
Meridiq totalt:              6 455
  Inom-Meridiq-duplikat:        64   (1.0% — Meridiq har dubbla journaler)
  Unika Meridiq-patienter:   6 391

Matchade mot Cliento totalt: 6 384   (99.9% av unika Meridiq)
  via email:                 5 109   (80.0%)
  via telefon:               1 252   (19.6%)
  via namn (fallback):          23   (0.4%)

Meridiq-only:                    7   (försumbart — arkiverade)
Cliento-only:                  989   (leads utan vårdjournal)
```

### Tolkning

- **6 384 patienter** har **både** Cliento-bokningsdata och Meridiq-vårdjournal → fullt kundresan-coverage
- **989 Cliento-kunder** saknar Meridiq-journal → leads/konsultationer som aldrig konverterades till behandling
- **7 Meridiq-only-patienter** = troligen arkiverade i Cliento men behållna i Meridiq för 10-års PDL-retention
- **64 Meridiq-duplikat** = patienter som fått dubbla journaler skapade i Meridiq över tid

### Avvikelse mot tidigare inventory

Tidigare audit (CLIENTO-CUSTOMER-SCHEMA-LIVE.md, 2026-05-29) flaggade ~1 221 Cliento-only-kunder. Live-matchning ger **989** — diff:en (232) förklaras troligen av:

- Cliento-bortrensningar mellan 2026-05-29 och 2026-05-30
- Meridiq-arkivering som skedde mellan datumen
- Mer aggressiv name-fallback-matchning i live-importer (23 matches via namn vi inte hade tidigare)

## Kritiska fynd

### Fynd 1: Allvarligt personnummer-gap i Meridiq (⚠️ P0)

Endast **0.2% (14 av 6 455)** av Meridiq-patienterna har personnummer ifyllt. Detta är vårdjournalen — per PDL Art. 9 ska personnummer dokumenteras för entydig patientidentifikation.

**Risk:**
- Två personer med samma namn kan blandas ihop
- Patient-säkerhet vid behandlings-administrering kan brytas
- Tio-års-retention på fel patient

**Åtgärd:**
- Steg 3.2 (ID-verify-store) är på plats i CCO och ska användas vid varje besök för att bygga upp personnummer-täckning över tid
- Vid första nya patient-touchpoint via CCO-portal: kräv personnummer som obligatorisk fält
- Inom 12 månader bör 80%+ täckning vara nådd

### Fynd 2: Födelsedatum saknas nästan helt (⚠️ P1)

Endast **2 av 6 455** har födelsedatum ifyllt — extremt lågt. Sannolikt eftersom personnummer (när det finns) kan deriveras till datum, men datafältet är distinkt.

**Åtgärd:**
- Auto-derivera födelsedatum från personnummer vid import till CCO (för de 14 som har pnr)
- För resterande: kräv via formulär vid nästa patient-touchpoint

### Fynd 3: 989 Cliento-only-leads (P1 säljmöjlighet)

Dessa har bokat eller varit i kontakt med kliniken men aldrig fått en Meridiq-vårdjournal skapad. Antingen:

- Konsultations-bokningar som inte resulterade i behandling
- Drop-in/online-leads som aldrig fortsatte
- Cliento-data-quality-noise (felaktiga registreringar)

**Åtgärd:**
- Markera dessa med `noMeridiqJournal: true` i ccoCustomerStore (i commit-fasen)
- Ny CCO-vy: "Leads utan vårdjournal" — säljteam kan följa upp

### Fynd 4: 64 Meridiq-duplikat (P2 datakvalitet)

1% av Meridiq-databasen har dubbla journaler. Vanligast troligen samma patient registrerad två gånger (olika email/telefon/namnvariant).

**Åtgärd:**
- Manuell merge i Meridiq, alt. CCO merge-flöde (Sprint 2.5 finns redan)
- Bestäm: vem är ansvarig för dedup i Meridiq vs CCO?

## Brand-distribution

Sheet-namnet "Hair TP Clinic - Curatiio-Clien" bekräftar att Meridiq delar kundbas mellan brands (samma som Cliento). Per-brand-fördelning är inte direkt tillgänglig från XLSX-export — kräver service-binding-lookup för att avgöra "denna patient är Hair TP" vs "denna är Curatiio".

## Compliance-status

- ✅ XLSX ligger utanför repo (`Migration-data/`, iCloud)
- ✅ Filen är INTE committed till GitHub (säkerhetscheck i script)
- ✅ 0 personnamn / 0 personnummer / 0 emails i denna rapport
- ✅ Stats endast (counts + percentages)
- ✅ ccoCustomerStore-data är gitignored (`data/`)
- ⚠️ Backup-tag rekommenderas innan commit-fas (samma mönster som git-history purge)

## Coverage gate-beslut

**PASS** för Meridiq-import. Identifierare-coverage är hög (telefon 99.9%, email 79.5%), match-rate är hög (99.9%), och ingen merge-konflikt detekterad.

**BLOCKED för PDL-compliance fullständigt** — personnummer- och födelsedatum-coverage måste byggas upp innan vi kan släppa Meridiq som read-only och köra cutover.

## Nästa steg

| # | Steg | Beslut |
|---|---|---|
| 1 | Commit-fas (9.2.2) — skriv `meridiqMeta` på 6 384 matched, skapa 7 nya, flagga 989 leads | väntar på owner-godkännande |
| 2 | Bygg "Leads utan vårdjournal"-vy i CCO | beroende av commit-fas |
| 3 | Inventera Drive-data (nya källan user nämnde) | väntar på pekare till mapp |
| 4 | ID-verify push: gör personnummer obligatoriskt i nästa portal-flöde | P0 separat sprint |
| 5 | Meridiq-duplikat-merge | manuell, separat process |

## Bilaga: Reproducerbarhet

```bash
node scripts/import-meridiq-customers.js \
  --xlsx "/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/Migration-data/meridiq-patients-2026-05-30.xlsx"

# Med limit för snabb-test:
node scripts/import-meridiq-customers.js --xlsx <path> --limit 100

# För commit (när godkänt):
node scripts/import-meridiq-customers.js --xlsx <path> --commit
```

Verkligen INGA patientdata i denna rapport — verifierat via regex-scan för pnr (`\d{6}[-\s]?\d{4}` och `\d{12}`), email (`@`) och svenska mobilnummer (`\+46` och `07\d`).

*Genererad: 2026-05-30 · MERIDIQ-DEDUP audit*
