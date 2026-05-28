---
owner: Compliance
status: active
---

# Registerförteckning (GDPR Art. 30) — Major Arcana / Hair TP Clinic

**Version:** 2026-05-25 (repo-kopia, kompletterar Excel i `MA-Archive/juridik-gdpr/`)  
**Ansvarig:** Kvalitetsansvarig / OWNER  
**Status:** Uppdaterad för Arcana-drift — juristgranskning av helheten kvarstår

---

## Behandlingsaktiviteter i Arcana (2026-05)

| # | Aktivitet | Syfte | Laglig grund | Kategorier | Mottagare | Lagring | Retention |
|---|-----------|-------|--------------|------------|-----------|---------|-----------|
| A1 | **CCO journal & kundmaster** | Medicinsk journalföring, behandlingsplan, signering | Rättslig förpliktelse (PDL) + vård | Identitet, kontakt, personnummer, hälsodata, journaltext, signatur | STAFF/OWNER (intern) | Render EU Frankfurt (`/var/data`) | **10 år** (`ARCANA_JOURNAL_RETENTION_YEARS`) |
| A2 | **Journalfoton (konsultation/behandling)** | Dokumentation av behandlingsresultat | Rättslig förpliktelse | Hälsodata, bilder | STAFF/OWNER | `data/journal-photos/` + encounter metadata | 10 år (journal) |
| A3 | **Post-op uppföljning & foton** | Eftervård, frivilligt omdöme/marketing-consent | Berättigat intresse + **samtycke** (publicering) | Identitet, bilder, fritext | Patient (token-länk), STAFF (intern vy) | `post-op-reviews.json`, `post-op-photos/` | Metadata: journalkoppling; foton **365 d** utan consent / obegränsat med consent |
| A4 | **Webb-bokning (Plan A engine)** | Boka konsultation/behandling | Avtal + berättigat intresse | Identitet, kontakt, bokningsval | Operatör (notify), patient (bekräftelse) | `cco-booking-engine.json`, audit | Bokningsdata enligt bokförings-/vårdkrav |
| A5 | **Patientkanal / chat (triagem)** | Första kontakt, routing till operatör | Berättigat intresse | Kontakt, ev. hälsosignal | STAFF, AI fallback | `memory.json`, signals | Signal retention 180 d (config) |
| A6 | **Auth & audit** | Säker inloggning, spårbarhet | Rättslig förpliktelse + berättigat intresse | Identitet, IP, session, audit | Intern ops | `auth.json` | Session TTL; audit 365 d (policy) |
| A7 | **GDPR export/anonymize** | Registrerades rättigheter | Rättslig förpliktelse | Alla ovan vid begäran | Patient (export), intern (logg) | Capability-artifacts | Export: engångs; anonymize: enligt beslut |

---

## Personuppgiftsbiträden (urval)

| Biträde | Roll | Plats | PUB/DPA |
|---------|------|-------|---------|
| **Render** | Hosting (Arcana) | EU Frankfurt | DPA via Render |
| **Microsoft 365 / Graph** | E-post send/read, operatörsinkorg | EU/EES (tenant policy) | Microsoft DPA |
| **Resend** (valfritt) | Transactional bokningsmail | USA (DPF/SCC) | Resend DPA — **ej live utan API-nyckel** |
| **OpenAI** (valfritt) | AI-assist (fallback mode utan nyckel) | USA (DPA) | Enterprise DPA vid live |
| **Google Drive** (legacy import) | Historisk journal-PDF | EU (Workspace) | Google DPA |

---

## Tekniska åtgärder (Arcana)

- EU-hosting Render Frankfurt
- Rollbaserad åtkomst (OWNER / STAFF / OPERATOR)
- Audit på journal-läs/skriv och capabilities
- Kryptering i transit (TLS); disk krypterad hos Render
- Backup scheduler + restore runbooks
- `mailDeliveryGuard` blockerar `@example.com` i verify/live send
- Post-op token: hash lagras, rate-limit, EXIF-strip

---

## Referenser

- Excel (master): `MA-Archive/juridik-gdpr/Artikel 30-register - färdig version .xlsx`
- Index: [INNEHALL-OCH-NYCKELPUNKTER.md](./juridik-gdpr/INNEHALL-OCH-NYCKELPUNKTER.md)
- Retention: [data-retention-policy.md](./data-retention-policy.md)
- PUB (public): [personuppgiftspolicy-pub-maj-arcana.md](./personuppgiftspolicy-pub-maj-arcana.md)
