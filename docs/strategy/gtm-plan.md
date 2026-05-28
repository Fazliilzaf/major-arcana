---
owner: CCO
status: active
---

# Arcana Executive OS — Go-To-Market Plan

Version: 1.0
Datum: 2026-05-14
Status: UTKAST

---

## 1. ICP — Ideal Customer Profile

### Primär ICP: Estetisk klinik i Norden

| Attribut | Krav |
|----------|------|
| **Bransch** | Estetisk medicin (hårtransplantation, PRP, microneedling, hudvård) |
| **Storlek** | 1-20 anställda, 1-3 behandlingsplatser |
| **Geografi** | Sverige (primärt), Norge, Danmark, Finland (sekundärt) |
| **IT-mognad** | Använder M365/Outlook, har WordPress/Squarespace-sajt, ingen befintlig CRM-automation |
| **Smärtpunkt** | Ägare bär all administration, mail-hantering, uppföljning och bokningskoordinering manuellt |
| **Budget** | 300-1000 SEK/mån för operativt stöd |
| **Beslutsfattare** | Verksamhetsansvarig / klinikägare (samma person) |
| **Köpsignal** | Söker efter "klinikadministration", "patientkommunikation", "AI för kliniker" |

### Sekundär ICP: Tandhygienist / Tandläkarklinik

| Attribut | Krav |
|----------|------|
| **Storlek** | 2-10 anställda |
| **Likhet** | Samma administration/mail/boknings-smärta som estetiska kliniker |
| **Skillnad** | Tyngre journalkrav (PDL), mer reglerad |
| **Anpassning krävd** | Kunskapsbas, mallar, tonalitet |

### Anti-ICP (undvik)

| Typ | Varför |
|-----|--------|
| Sjukhus / stor vårdgivare | Kräver journal-integration, upphandling, lång säljcykel |
| Kliniker utan M365 | Graph-integration fungerar inte |
| Kliniker som vill ha "AI-läkare" | MDR-risk, utanför Arcanas scope |

---

## 2. Positionering

### Tagline
**"Ditt AI-drivna kliniksekretariat — så du kan fokusera på patienterna."**

### Positioneringstext (30 sekunder)
> Arcana är ett operativsystem för kliniker som automatiserar mail-hantering, patientuppföljning och driftkontroll — utan att du tappar kontroll. AI genererar utkast, du godkänner. Allt spåras i en audit-logg. Från 290 kr/mån.

### Differentiering vs alternativ

| Alternativ | Svaghet | Arcana-fördel |
|-----------|---------|---------------|
| Outlook + Excel | Inget system, allt manuellt | AI-agenter + mallar + automation |
| Journalsystem (Cosmic, TakeCare) | Dyrt, rigid, inte för kommunikation | Lättvikt, snabbt, fokuserat |
| Generell CRM (HubSpot, Pipedrive) | Inte anpassat för medicinsk compliance | Risk gates, policy floor, GDPR |
| AI-chattar (ChatGPT, Intercom) | Ingen spårbarhet, ingen medicinsk säkerhet | Audit, kill-switch, human handoff |

---

## 3. Referenscase — Hair TP Clinic

### Case-struktur

**Kund:** Hair TP Clinic, Göteborg
**Bransch:** Hårtransplantation (DHI/FUE), PRP, Microneedling
**Storlek:** 2-5 behandlare, 6 mailboxar
**Utmaning:** Ägaren hanterade all patientkommunikation, bokningsuppföljning och driftkontroll manuellt via Outlook + Excel.

**Lösning:** Arcana Executive OS
- CCO-operatörsyta för mail-triage och svarstudio
- 6 AI-agenter (COO, CAO, CFO, CMO, CCO, Patient)
- Automatiserad riskbedömning på alla mallar
- Daglig driftöversikt via COO daily brief

**Resultat:**
- 62 aktiva mallar med riskbedömning
- 6 mailboxar hanterade från en yta
- Incidenthantering med SLA-timer
- Readiness score 93/100

**Citat (förslag):**
> "Arcana ger mig överblick utan att jag behöver kolla varje mail själv. Det känns som att ha ett helt team bakom mig."
> — Fazli Krasniqi, Verksamhetsansvarig, Hair TP Clinic

---

## 4. Säljkollateral

### 4.1 One-pager (PDF)

**Innehåll:**
1. Problemformulering: "Du kör din klinik. Vem kör administrationen?"
2. Lösningsöversikt: 6 AI-agenter i ett operativsystem
3. Skärmbild: CCO-dashboard
4. Tre USP:er: AI med kontroll / Medicinsk compliance / Från 290 kr/mån
5. CTA: "Boka 15 min demo"

### 4.2 Demo-flöde (15 min)

| Min | Steg | Visar |
|-----|------|-------|
| 0-2 | Intro + smärtpunkt | "Känner du igen dig?" |
| 2-5 | CCO-dashboard | Trekolumns-vy, mailkö, fokusyta |
| 5-8 | COO daily brief | Kör agenten live — prioriteringar visas |
| 8-10 | Svarstudio | AI-utkast → riskbedömning → OWNER godkänner |
| 10-12 | CAO template advisor | Disclaimer-check på deras befintliga mallar |
| 12-14 | Admin-panel | Monitor, SLO, audit-logg |
| 14-15 | Priser + nästa steg | Starter 290 kr, onboarding 30 min |

### 4.3 Fallstudie-mall

```markdown
# [Kliniknamn] — Fallstudie

## Utmaning
[Beskriv smärtpunkten]

## Lösning
[Vilka Arcana-funktioner som aktiverades]

## Resultat
- [KPI 1]: [Före] → [Efter]
- [KPI 2]: [Före] → [Efter]
- [KPI 3]: [Före] → [Efter]

## Citat
> "[Klinikägarens ord]"
> — [Namn], [Titel], [Kliniknamn]
```

---

## 5. Kanaler

### Fas 1: Founder-led sales (0-10 tenants)

| Kanal | Taktik | Kostnad |
|-------|--------|---------|
| **LinkedIn** | Personlig outreach till klinikägare i Gbg/Sthlm/Malmö | 0 SEK |
| **Referral** | Hair TP Clinic → andra kliniker i nätverket | 0 SEK |
| **Google** | "hårklinik administration", "klinik CRM" (organisk) | 0 SEK |
| **Branschevent** | SEFS, estetiska kongresser — demo-bord | 3000-5000 SEK |

### Fas 2: Inbound + content (10-50 tenants)

| Kanal | Taktik |
|-------|--------|
| **SEO** | Artiklar: "AI för kliniker", "automatisera patientuppföljning" |
| **Newsletter** | Månatlig: "Klinikdrift-nytt" — tips + fallstudier |
| **YouTube** | Demo-videos: "5 min: Så svarar du på 50 mail/dag med AI" |
| **Partnerskap** | Cliento, Webflow/WordPress-byråer som servar kliniker |

### Fas 3: Product-led growth (50+ tenants)

| Kanal | Taktik |
|-------|--------|
| **Free tier** | Self-service signup → Free → Starter conversion |
| **In-app upsell** | "Du har nått 900/1000 capability-runs — uppgradera?" |
| **Marketplace** | Microsoft AppSource, Render marketplace |

---

## 6. Onboarding-flöde (för sälj)

| Steg | Tid | Vem |
|------|-----|-----|
| 1. Demo-call | 15 min | Fazli / Sales |
| 2. Tenant skapad | 5 min | Arcana (playbook) |
| 3. Mailbox-koppling | 10 min | Kund + Arcana |
| 4. Mall-import / knowledge-base | 15 min | Arcana |
| 5. Operatörsutbildning | 20 min | Videomöte |
| 6. Go-live | — | Kund |
| **Total onboarding:** | **~65 min** | |

---

## 7. KPI:er för GTM

| KPI | Mål (6 mån) | Mätning |
|-----|-------------|---------|
| Demos bokade | 15 | CRM |
| Demo → Trial | 60% | Conversion rate |
| Trial → Paid | 40% | Conversion rate |
| Betalande tenants | 3 | Render/Stripe |
| MRR | 1470 SEK | Stripe |
| Churn (månadsvis) | < 5% | Stripe |
| NPS | > 50 | Enkät |
| Time to first value | < 60 min | Onboarding-mätning |

---

## 8. Tidsplan

| Vecka | Aktivitet |
|-------|-----------|
| V1-2 | Referenscase klart (Hair TP), one-pager designad |
| V3-4 | 5 LinkedIn-outreach/dag, demo-bokning |
| V5-6 | Första externa demo, justera pitch |
| V7-8 | Tenant #2 onboardad, samla feedback |
| V9-12 | Iterera produkt + pitch, 2-3 fler demos/vecka |
| V13+ | Inbound-kanal startar (SEO-artiklar, newsletter) |

---

## 9. Demo-instans

### Krav
- Separat tenant med demo-data (inte Hair TP:s riktiga data)
- Pre-populerad med 10 mallar, 3 kundtrådar, bokningsdata
- Alla agenter körbara
- Reset-knapp för att återställa efter demo

### Implementation
```bash
POST /api/v1/tenants/onboard
{
  "tenantId": "demo-clinic",
  "ownerEmail": "demo@arcana.se"
}
```
Sedan: importera demo-templates + demo-knowledge-base.

---

## Relaterade dokument

- `docs/strategy/business-model.md` — Prismodell och billing
- `docs/strategy/arcana-master-plan-punktvis.md` — Masterplan
- `docs/ops/tenant-onboarding-playbook.md` — Onboarding-process
- `docs/legal/gdpr-dpa-template.md` — DPA för nya kunder
