# Personuppgiftsbiträdesavtal (DPA) — Mall

Version: 1.0
Datum: 2026-05-13
Status: UTKAST — ska granskas av juridisk rådgivare före användning.

---

## 1. Parter

**Personuppgiftsansvarig ("Kliniken"):**
- Org.nr:
- Adress:
- Kontaktperson:
- E-post:

**Personuppgiftsbiträde ("Arcana / Hair TP Clinic AB"):**
- Org.nr:
- Adress:
- Kontaktperson för dataskydd:
- E-post:

---

## 2. Bakgrund och syfte

Kliniken använder Arcana Executive OS ("Tjänsten") för klinikadministration, patientkommunikation, mallhantering och operativ drift. I samband med detta behandlar Arcana personuppgifter på uppdrag av Kliniken.

Detta avtal reglerar behandlingen i enlighet med GDPR (EU 2016/679) och kompletterande svensk lagstiftning.

---

## 3. Kategorier av personuppgifter

| Kategori | Exempel | Laglig grund |
|----------|---------|--------------|
| Patientuppgifter | Namn, e-post, telefon, stad | Avtal + berättigat intresse |
| Hälsorelaterade uppgifter | Hälsodeklaration i konsultationsflöde | Uttryckligt samtycke |
| Kommunikationsdata | E-postmeddelanden, chatthistorik | Avtal + berättigat intresse |
| Operatörsdata | Namn, e-post, roll, inloggningshistorik | Avtal |
| Tekniska data | IP-adress, session-ID, correlation-ID | Berättigat intresse |

---

## 4. Behandlingens art och ändamål

Arcana behandlar personuppgifter för:
- Klinikadministration (mallar, bokningar, uppföljning)
- AI-assisterad kommunikation (utkastsgenerering, riskbedömning)
- Driftsövervakning och incidenthantering
- Rapportering och revision

---

## 5. Underbiträden

Arcana använder följande underbiträden:

| Underbiträde | Syfte | Plats | DPA-status |
|-------------|-------|-------|------------|
| Render.com | Hosting | EU (Frankfurt) | Render DPA |
| OpenAI | AI-generering (fallback-läge tillgängligt) | USA (EU SCC) | OpenAI DPA |
| Microsoft (Graph API) | E-postintegration | EU | Microsoft DPA |

Kliniken informeras vid byte av underbiträde med 30 dagars förvarning.

---

## 6. Tekniska och organisatoriska åtgärder

Arcana implementerar:
- **Kryptering:** HTTPS/TLS i transit, krypterad disk i vila (Render persistent disk)
- **Åtkomstkontroll:** RBAC (OWNER/STAFF), MFA för OWNER, session-rotation
- **Spårbarhet:** Append-only audit-logg med hash-chain, correlation-ID per request
- **Dataminimering:** Tenant-isolering, inga cross-tenant exponeringar
- **Incidenthantering:** Automatisk eskalering L4/L5, SLA-timer, audit-event
- **Backup:** Daglig automatisk backup med retention-policy, restore drill månatligt
- **AI-säkerhet:** Alla AI-genererade utkast går genom input risk + output risk + policy floor; AI publicerar aldrig utan OWNER-godkännande

---

## 7. Registrerades rättigheter

Arcana stödjer Klinikens hantering av registrerades rättigheter via:
- **Rätt till tillgång:** `GET /api/v1/capabilities/GdprExportCustomer/run`
- **Rätt till radering:** `GET /api/v1/capabilities/GdprAnonymizeCustomer/run`
- **Rätt till dataportabilitet:** Export i JSON-format via ovan endpoints
- **Rätt till rättelse:** Via tenant-config och template-uppdatering
- **Rätt till invändning:** Kliniken ansvarar; Arcana verkställer via disable/anonymize

Arcana ska utan onödigt dröjsmål (och senast inom 48 timmar) informera Kliniken om begäran från registrerade som riktas direkt till Arcana.

---

## 8. Personuppgiftsincident

Vid personuppgiftsincident ska Arcana:
1. Informera Kliniken utan onödigt dröjsmål (senast 24 timmar)
2. Dokumentera incidenten i audit-loggen
3. Bistå Kliniken med information till Integritetsskyddsmyndigheten (IMY)
4. Vidta korrigerande åtgärder och dokumentera dem

---

## 9. Återlämnande och radering

Vid avtalets upphörande:
1. Arcana exporterar all personuppgiftsdata till Kliniken (JSON-format)
2. Arcana raderar all data inom 30 dagar efter export
3. Bekräftelse på radering lämnas skriftligt
4. Backup-kopior raderas vid nästa retention-prune (max 30 dagar)

---

## 10. Avtalstid och uppsägning

- Avtalet gäller så länge Kliniken använder Tjänsten
- Uppsägningstid: 30 dagar skriftligt
- Arcanas skyldigheter enligt §8 och §9 kvarstår efter uppsägning

---

## 11. Underskrifter

**Personuppgiftsansvarig (Kliniken):**

Datum: ____________  Namn: ________________________  Underskrift: ________________________

**Personuppgiftsbiträde (Arcana):**

Datum: ____________  Namn: ________________________  Underskrift: ________________________

---

*Detta är en mall. Anpassa efter klinikens specifika förhållanden och låt juridisk rådgivare granska innan signering.*
