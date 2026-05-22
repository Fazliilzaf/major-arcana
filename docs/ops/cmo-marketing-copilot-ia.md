---
owner: OWNER
status: active
next_step: v3 — se docs/strategy/cmo-v3-rollout-plan.md (commit/CI → prod connectors → live publish)
---

# Arcana Marketing Copilot — Adminpanel IA

## Produktpositionering

**Arcana Marketing Copilot** (API: `CMO`) — skapar, analyserar och föreslår marknadscontent.  
**Inte** en autonom marknadschef i v1: extern publicering, annonsbudget och utskick kräver OWNER-godkännande.

Pipeline:

```
Strategi → Produktion → Compliance → Godkännande → Schemaläggning (förslag) → Analys → Kontroll
```

---

## Sektioner (UI v1.5)

| Flik | `data-cmo-tab-panel` | Innehåll |
|------|----------------------|----------|
| Strategi | `strategi` | CMO-körning, KPI-kort, executive summary, kalender |
| Content | `content` | Social, SEO, ads, mail-utkast |
| Kampanjer | `kampanjer` | Draft-lista, godkänn/avvisa workspace |
| Compliance | `compliance` | Claims, CLINICAL_GUARD, orkestrerings-gates |
| Kalender | `kalender` | Schema, UTM, tracking-validering |
| Analys | `analys` | Vecko/månadsrapport (read-only) |

JS: `public/admin/cmo-copilot.js`, `cmo-tabs.js`, `cmo-workspace.js`, `cmo-analytics.js`.

---

## Sex lägen

| Läge | UI-trigger | API / capability |
|------|------------|------------------|
| Strategi | “Månadens fokus” | `GenerateContentBrief`, `AnalyzeAudienceSegments` |
| Produktion | “Skapa content” | `GenerateSocialPostPack`, `GenerateSeoBrief`, `GenerateAdCopyPack`, `GenerateEmailDraft` |
| Compliance | Auto efter produktion | `ValidateMarketingClaims`, `ReviewMarketingCompliance`, CLINICAL_GUARD |
| Schemaläggning | “Föreslå kalender” | `ProposeContentCalendar`, `ProposePublishSchedule` |
| Analys | “Veckorapport” | `SummarizeMarketingPerformance`, `GenerateMarketingBrief` |
| Kontroll | Feed + flaggor | Executive feed, paus-förslag, budget/UTM/CTA-check |

---

## Marketing Workspace API (Fas C)

| Endpoint | Syfte |
|----------|--------|
| `GET /api/v1/marketing/campaigns` | Lista kampanjdrafts |
| `GET /api/v1/marketing/campaigns/:id` | Enskild draft + versioner |
| `PATCH /api/v1/marketing/campaigns/:id` | Uppdatera owner, status, schedule proposal |
| `POST /api/v1/marketing/campaigns/:id/approve` | OWNER godkänner |
| `POST /api/v1/marketing/campaigns/:id/reject` | Avvisa med motivering |
| `GET /api/v1/marketing/claims/whitelist` | Godkända claims (read) |

Agent-run (befintlig):

| Endpoint | Syfte |
|----------|--------|
| `POST /api/v1/agents/CMO/run` | Kör CMO bundle (brief + audience + campaigns) |

---

## Compliance-gate (Fas B)

- Extern copy (social, ads, mail, landningssidor) ** måste** passera:
  1. `ValidateMarketingClaims` (whitelist)
  2. `ReviewMarketingCompliance` (GDPR/samtycke-hints, patientnära, juridik)
  3. CLINICAL_GUARD (policy floor)
- Status: `passed` | `blocked` | `needs_owner`
- Draft får inte sättas till `ready` om status ≠ `passed` (L3+ kräver alltid OWNER)

Store: `data/marketing-claims-whitelist.json`

---

## Godkännande & executive feed

| actionType | Trigger | Owner action |
|------------|---------|--------------|
| `approve_campaigns` | Kampanjer med `readiness: ready` | Godkänn i workspace eller feed |
| `review_claims` | Flagged claims | Uppdatera whitelist eller redigera copy |
| `approve_social_batch` | Content batch redo | Batch-godkännande |
| `pause_campaigns` | COO incident / låg performance | Pausa (förslag) |

Feed persist: samma store som CAO — `data/executive-decision-feed.json`.

---

## Agent-orkestrering (Fas F)

| Agent | Koppling |
|-------|----------|
| **CLINICAL_GUARD** | Obligatorisk för extern copy |
| **CAO** | Launch/readiness — blockera “go live” vid låg readiness |
| **COO** | Incident → föreslå paus av externa kampanjer |
| **CCO** | MQL/SQL, battlecards, pipeline-alignment |
| **CFO** | Budgettak för spend-förslag |

Orchestrator intent: `marketing_campaign` (execute → CMO + gates)  
Befintlig: `tenant_branding` → CMO + CLINICAL_GUARD

Riskmatris: `docs/strategy/cmo-capability-risk-matrix.md`

---

## Gränser (v1)

| Tillåtet | Blockerat |
|----------|-----------|
| Skapa utkast | Auto-publicera |
| Föreslå schema | Auto-spend |
| Generera UTM | Bypassa consent |
| Analysera (med datakälla) | Hitta på metrics |
| Versionera + audit | Patientnära copy utan gate |

---

## Datakällor (analys, Fas E)

Varje metric i rapporter måste inkludera:

```json
{
  "value": 0.042,
  "source": "google_ads|meta|linkedin|mail|analytics",
  "window": "7d",
  "fetchedAt": "ISO-8601",
  "fresh": true
}
```

Om `fresh: false` eller källa saknas → `insufficient_data — no recommendation`.

---

## Relaterade dokument

- Implementation plan: `docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md`
- CAO-plan (mönster): `docs/strategy/cao-arcana-admin-operator-implementation-plan.md`
- ADR (plan): `docs/adr/0002-cmo-publish-and-spend-boundary.md`
