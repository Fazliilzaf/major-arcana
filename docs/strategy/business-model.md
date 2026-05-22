# Arcana Executive OS — Affärsmodell & Billing

Version: 1.0
Datum: 2026-05-14
Status: UTKAST — redo för produkt-/affärsbeslut.

---

## 1. Prismodell

### Per-tenant SaaS med tier-baserad prissättning

| Plan | Pris/mån (SEK) | Målgrupp | Inkluderat |
|------|-----------------|----------|------------|
| **Free** | 0 | Trial / utvärdering | 2 platser, 1000 capability-runs, 100 MB, AI summary |
| **Starter** | 290 | Enskild klinik (1-5 anställda) | 5 platser, 10K runs, 1 GB, full AI, custom branding |
| **Pro** | 990 | Medelklinik (5-20 anställda) | 20 platser, 50K runs, 10 GB, full AI, 365d audit |
| **Enterprise** | Offert | Klinikkedja / multi-site | Obegränsat, SLA, dedikerad support, 7 år audit |

### Implementationsstatus i kod

| Komponent | Fil | Status |
|-----------|-----|--------|
| Plan-tiers & quotas | `src/security/planQuotas.js` | ✅ Implementerad (4 plans) |
| Quota-check | `checkQuota()` | ✅ Implementerad |
| Feature-flags per plan | `isFeatureEnabled()` | ✅ Implementerad |
| Usage metrics | `src/capabilities/tenantUsageMetrics.js` | ✅ Capability klar |
| Finance governance | `src/capabilities/financeGovernance.js` | ✅ Capability klar (CFO agent) |
| Tenant-config plan-tier | `src/tenant/configStore.js` | ⚠️ Fältet finns men sätts inte automatiskt |
| Stripe-integration | — | ❌ Saknas |
| Invoice-generering | — | ❌ Saknas |

---

## 2. Kostnadsstruktur per tenant

### Fasta kostnader (Arcana-plattformen)

| Post | Kostnad/mån | Källa |
|------|-------------|-------|
| Render Standard | 490 SEK | render.yaml |
| Persistent disk 1 GB | 30 SEK | render.yaml |
| Domän/SSL | 0 SEK | Inkluderat i Render |
| **Totalt fast** | **~520 SEK** | |

### Rörliga kostnader per tenant

| Post | Pris | Uppskattning vid 5 tenants |
|------|------|----------------------------|
| OpenAI tokens (gpt-4o-mini) | ~3 SEK / 1M tokens | 15-50 SEK/mån/tenant |
| Microsoft Graph API | 0 SEK (inkluderat i M365-licens) | 0 SEK |
| Lagring (JSON on disk) | ~0 SEK marginalkostnad | 0 SEK |
| **Rörlig per tenant** | | **~15-50 SEK** |

### Break-even

| Antal tenants | Intäkt (Starter) | Fast kostnad | Rörlig | Marginal |
|---------------|------------------|-------------|--------|----------|
| 1 | 290 | 520 | 30 | -260 |
| 2 | 580 | 520 | 60 | 0 (break-even) |
| 3 | 870 | 520 | 90 | +260 |
| 5 | 1450 | 520 | 150 | +780 |
| 10 | 2900 | 520 | 300 | +2080 |
| 10 (Pro) | 9900 | 520 | 500 | +8880 |

**Break-even:** 2 Starter-tenants.

---

## 3. LLM-kostnadsallokering per tenant

### Nuvarande (fallback-mode)
- `ARCANA_AI_PROVIDER=fallback` — inga LLM-kostnader
- Deterministisk template-generering

### Med OpenAI aktiverat

| Användningsfall | Tokens per anrop | Anrop/dag/tenant | Kostnad/mån (uppskattad) |
|-----------------|------------------|-------------------|--------------------------|
| Template draft (gpt-4o-mini) | ~2000 | 5 | ~9 SEK |
| Inbox analysis | ~5000 | 2 | ~9 SEK |
| Risk evaluation (heuristic) | 0 | 50 | 0 SEK |
| COO daily brief | ~3000 | 1 | ~3 SEK |
| CAO template advisor | ~4000 | 1 | ~4 SEK |
| Patient chat (om aktiverad) | ~1500 | 20 | ~27 SEK |
| **Totalt per tenant** | | | **~25-52 SEK** |

### Kostnadstak

| Plan | Token-tak/mån | Uppskattad gräns |
|------|---------------|------------------|
| Free | 100K tokens | ~1 SEK |
| Starter | 2M tokens | ~6 SEK |
| Pro | 10M tokens | ~30 SEK |
| Enterprise | Obegränsat (fair use) | Övervakas via CFO-agent |

### Implementation

CFO-agenten (`FinanceGovernance` capability) kan redan:
- Rapportera uppskattad LLM-kostnad per tenant
- Generera kostnadsvarningar vid tröskelöverskridande
- Visa break-even och projektioner

Saknas:
- Faktisk token-counting per tenant (kräver instrumentation i gateway)
- Stripe-koppling för automatisk fakturering

---

## 4. Billing-infrastruktur — Roadmap

### Fas 1: Usage tracking (implementerat)
- [x] Plan-tiers definierade (`planQuotas.js`)
- [x] Quota-check (`checkQuota`)
- [x] Feature-flags per plan (`isFeatureEnabled`)
- [x] Usage metrics capability (`TenantUsageMetrics`)
- [x] CFO-agent med kostnadsöverblick

### Fas 2: Token-counting (nästa)
```
Gateway run → count input/output tokens → store per tenant → CFO uses real data
```

Filer att ändra:
- `src/gateway/executionGateway.js` — räkna tokens per run
- `src/ops/runtimeMetrics.js` — lagra per-tenant token-usage
- `src/capabilities/financeGovernance.js` — läsa faktisk usage

### Fas 3: Stripe-integration (framtida)

| Steg | Beskrivning |
|------|-------------|
| 1 | Skapa Stripe-konto + produkt/plans | 
| 2 | Tenant-config: `stripeCustomerId`, `stripeSubscriptionId` |
| 3 | Webhook: `customer.subscription.created/updated/deleted` |
| 4 | Auto-upgrade/downgrade vid plan-byte |
| 5 | Invoice-generering + e-post |
| 6 | Usage-based billing (metered) för token-förbrukning |

### Fas 4: Self-service portal (framtida)
- Tenant-admin kan se sin faktura
- Uppgradera/nedgradera plan
- Se token-förbrukning i realtid
- Exportera fakturor som PDF

---

## 5. Prissättningsstrategi

### Positionering

| Faktor | Arcana | Typisk SaaS-konkurrent |
|--------|--------|----------------------|
| Målgrupp | Kliniker (1-20 anställda) | Generell CRM/helpdesk |
| Differentiator | AI-agenter + risk gate + medicinsk compliance | Generell automatisering |
| Prispunkt | 290-990 SEK/mån | 500-3000 SEK/mån |
| Bindningstid | Månad-till-månad | Ofta årlig |
| Setup-kostnad | 0 (self-service onboarding) | Ofta 5000-50000 SEK |

### Intäktsmål

| Tidshorisont | Tenants | MRR (SEK) | ARR (SEK) |
|-------------|---------|-----------|-----------|
| 6 månader | 3 | 1470 | 17 640 |
| 12 månader | 8 | 5920 | 71 040 |
| 24 månader | 20 | 14 800 | 177 600 |

### Expansionsintäkter

| Källa | Trigger | Värde |
|-------|---------|-------|
| Plan-uppgradering | Fler platser / features | +700 SEK/mån |
| Extra mailboxar | > 3 mailboxar | +100 SEK/mailbox/mån |
| AI premium (GPT-4o full) | Tenant vill ha bättre AI | +200 SEK/mån |
| White-label | Klinikkedja med eget varumärke | +500 SEK/mån |
| SLA-garanti | Enterprise | Offert |

---

## 6. Nästa steg

| # | Åtgärd | Prioritet | Beroende |
|---|--------|-----------|----------|
| 1 | **Produktbeslut: bekräfta prismodell** | Kritisk | Affärsbeslut |
| 2 | Token-counting i gateway | Hög | Kod (Fas 2) |
| 3 | Stripe-konto setup | Hög | Affärsbeslut |
| 4 | Webhook-integration | Medel | Stripe-konto |
| 5 | Self-service plan-byte i admin | Medel | Stripe + UI |

---

## Relaterade filer

- `src/security/planQuotas.js` — Plan-tiers och quotas
- `src/capabilities/tenantUsageMetrics.js` — Usage metrics
- `src/capabilities/financeGovernance.js` — CFO cost advisor
- `src/agents/cfoCostAdvisorAgent.js` — CFO agent runner
- `docs/legal/data-retention-policy.md` — Retention per plan
