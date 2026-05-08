# ADR-0002: Multi-tenant via tenantId i alla stores + tenantConfigStore

- Status: accepted
- Datum: 2026-03-20 (MT1-MT9 leverans)
- Beslutsfattare: CCO-arkitektur
- Berörda: tenantConfigStore, alla cco*Store-instanser, capabilities

## Kontext

CCO ska serva flera kliniker/företag samtidigt i samma deploy. Krav:

- Strikt data-isolation per tenant.
- Tenant-specifik branding (färg, logotyp) — utan kod-deploy.
- Tenant-specifika feature-flags (rulla ut feature till en tenant först).
- Plan-tiers för billing-kvota (free/pro/enterprise).
- Self-service onboarding utan att engineering involveras.
- Kunna disable en tenant utan att ta ner appen.

## Alternativ

1. **Schema-per-tenant** (multi-database) — högsta isolation men dyr drift.
2. **Row-level isolation via tenantId-kolumn** + en kanonisk tenantConfigStore — den valda.
3. **Subdomän per tenant + separat deploy** — högsta isolation, högsta kostnad, ingen central admin.

## Beslut

Alla stores tar `tenantId` som första nyckel (`state[tenantId] = {...}`). Alla capabilities tar `tenantId` från middleware (default-tenant via `ARCANA_DEFAULT_TENANT`). En central `tenantConfigStore` håller per-tenant config:

- `brand` (name, primaryColor, accentColor, logoUrl)
- `planTier` (free | pro | enterprise)
- `featureFlags` (per-feature on/off override)
- `disabled` (boolean — om true → 503 med "tenant disabled")

`TenantList`/`TenantCreate`/`TenantDisable`-capabilities ger admin-konsolen runtime-CRUD.

## Konsekvenser

- **Positiva**: Single-deploy enkelt drift, central admin-konsol, low overhead per tenant. Onboarding-wizard skapar tenant + theming + feature flags via API.
- **Negativa**: Kräver disciplin att alltid filtrera på tenantId i nya queries. Cross-tenant bug risk.
- **Risker / mitigation**: Multi-tenant isolation tests (S2) försöker läcka data mellan tenants. Body parser refuserar requests utan tenantId i context.

## Uppföljning

- Mätvärde: 0 fall av cross-tenant-läckage rapporterade.
- Utvärdera schema-per-tenant om enterprise-kunder kräver fysisk isolation eller olika datacenter (GDPR data residency).
