# CMO v3 — Rollout-plan (commit, prod-connectors, produktscope)

**Status:** BYGGFAS (Fas N klar; Fas O–R pågår — prod secrets medvetet av)  
**Datum:** 2026-05-22  
**Ägare:** OWNER + plattform  
**Förutsättning:** Fas A–M levererade (mutation **66.32%**, 168 CMO-tester gröna lokalt)

---

## Syfte

Samla tre spår som återstår efter feature-complete v2.4:

1. **Fas N** — Säkra kodbasen i git och verifiera CI
2. **Fas O** — Driftsätta marketing connectors i produktion (read-only metrics)
3. **Fas P–R** — Definiera och prioritera v3 (live publish, connector-härdning, kvalitet)

Spåren kan köras delvis parallellt; **Fas N ska vara klar före prod-deploy (Fas O)**.

---

## Översikt

| Fas   | Namn                      | Mål                                        | Uppskattning | Blocker                     |
| ----- | ------------------------- | ------------------------------------------ | ------------ | --------------------------- |
| **N** | Commit & CI               | Ren main, grön pipeline, mutation-artifact | 1–2 dagar    | —                           |
| **O** | Prod connectors           | Live Google/Meta/LinkedIn/Mail metrics i prod | 1–2 veckor   | Fas N, secrets, OWNER       |
| **P** | v3.0 Live publish (pilot) | Extern publicering efter OWNER + gates     | 3–4 veckor   | Fas O, ADR 0002-uppdatering |
| **Q** | v3.1 Connector ops        | Observability, fallback, tenant-config     | 2 veckor     | Fas O                       |
| **R** | v3.2 Kvalitet & scope     | Mutation ≥70%, mail/analytics+, UI         | Löpande      | —                           |

**2026-05-22 sweep (lokal kod):**
- P: `cmoPublishConnectors.js`, live publish gate (`ARCANA_MARKETING_PUBLISH_LIVE_ENABLED`), ADR v3 addendum
- Q: tenant `marketing.connectors`, health job `cmo_connector_health_check`, mail adapter, cache TTL, admin force-refresh
- R: `GenerateContentSeries`, trust topics i brief, `cmoPhaseV3Sweep.test.js`

---

## Fas N — Commit & CI-verifiering

### Mål

All CMO v2.4 + Fas M-arbete committat, pushat och verifierat i GitHub Actions utan manuella undantag.

### Uppgifter

#### N1 — Förbered working tree

- [ ] Gruppera ändringar i **logiska commits** (rekommenderad ordning):
  1. `feat(cmo): content asset store + workspace sync` (stores, routes, UI)
  2. `feat(cmo): marketing connectors v2.1/v2.2` (connectors, adapters, hydrate)
  3. `feat(cmo): publish policy v2.3 + pilot queue scheduler`
  4. `test(cmo): mutation hardening, store integration, edge cases`
  5. `ci(cmo): stryker job + npm script + config`
  6. `docs(cmo): plan, runbook, handover, ADR addendum`
- [x] **Städa Stryker-artefakter** före commit (ska inte ligga i repo):
  - `src/ops/cmoPublishPolicy 2.js`, `cmoPublishPolicy 3.js`
  - `src/ops/marketingCampaignDraftsStore 2.js`, `... 3.js` (om de finns)
  - Verifiera `.gitignore` täcker `.stryker-tmp/` och ev. `* 2.js`-mönster
- [x] Kontrollera att **inga secrets** (.env, tokens) ingår i diff

#### N2 — Lokal verifiering (pre-push)

```bash
cd major-arcana
npm ci
node tests/_cmoMutationRunner.js          # förväntat: 168/168 pass
npm run smoke:cmo-staging                   # lokalt mot dev:offline
npm run test:mutation:cmo                   # valfritt pre-push; ~16 min, ≥65%
```

- [x] CMO runner grön
- [x] Staging-smoke grön (eller dokumenterat env-krav)
- [ ] Mutation ≥65% om körd lokalt

#### N3 — Push & CI

- [x] Push till feature branch **eller** `main` (efter teambeslut)
- [x] Verifiera GitHub Actions:
      | Jobb | Förväntat |
      |------|-----------|
      | Huvud-CI (`ci.yml`) | unit + contract + closure guard grön |
      | `cmo-mutation` | Fast gate (`_cmoMutationRunner.js`) grön på alla branches; Stryker + artifact på `main` |
      | `cmo-nightly-smoke` | Nattlig Stryker + staging smoke (fallback om main-push timeout) |
- [x] Ladda ner mutation HTML-artifact från CI och jämför score med lokal baseline (~66%)
- [x] Om `cmo-mutation` failar: **smoke** fixad (metadata 20→21 efter `GenerateContentSeries`); **Stryker** tvåstegs (fast gate + main-only, 120 min, concurrency 4)

**Status 2026-05-23:** Run `f3b4e55` (#26329100081) **grön** — smoke 1m40s, Stryker ~60m, score **58.85%** (artifact `cmo-mutation-report-26329100081`). `arcana-drift-gate` failar på prod-login (MFA) — **ej Fas N-blocker** (prod medvetet av).

#### N4 — Acceptans (Fas N)

- [x] Alla CMO-relaterade commits på remote
- [x] CI grön på merge-commit (`f3b4e55`, run #26329100081)
- [x] Runbook + implementationsplan refererar denna rollout-plan
- [x] Ingen Stryker-instrumenterad källkod kvar i `src/`

---

## Fas O — Prod-driftsättning av connectors

### Mål

**Read-only** marketing metrics från Google Ads, Meta och LinkedIn i produktion — utan auto-publish och utan autonom spend.

### Principer (ADR 0002)

- Connectors hämtar **endast metrics** (CTR, spend, impressions) till `SummarizeMarketingPerformance`
- `ARCANA_MARKETING_CONNECTORS_LIVE_FETCH=true` i prod efter secrets är på plats
- Global `autoPublish: false` oförändrad
- Fallback till `insufficient_data` vid API-fel (befintligt beteende)

### O1 — Secrets & config (infra)

| Variabel                                 | Kanal    | Obligatorisk i prod                        |
| ---------------------------------------- | -------- | ------------------------------------------ |
| `ARCANA_MARKETING_CONNECTORS_ENABLED`    | Alla     | `true`                                     |
| `ARCANA_MARKETING_CONNECTORS_MODE`       | Alla     | `live`                                     |
| `ARCANA_MARKETING_CONNECTORS_LIVE_FETCH` | Alla     | `true`                                     |
| `ARCANA_MARKETING_GOOGLE_ADS_*`          | Google   | customer id, developer token, access token |
| `ARCANA_MARKETING_META_*`                | Meta     | ad account id, access token                |
| `ARCANA_MARKETING_LINKEDIN_*`            | LinkedIn | ad account id, access token                |

- [ ] Lagra tokens i **secret manager** (Render/Vault/GitHub env — enligt plattform)
- [x] Rotationspolicy dokumenterad (90 dagar — se runbook Fas O)
- [x] **Staging smoke:** `npm run smoke:cmo-connectors` (+ valfritt `ARCANA_SMOKE_BASE_URL`)

### O2 — Deploy-sekvens

1. [ ] Deploy app med connectors **disabled** (`ENABLED=false`) — kod på plats, ingen live fetch
2. [ ] Sätt secrets i staging → `ENABLED=true`, `MODE=live` (**prod avstängt tills OWNER go-live**)
3. [x] Automatiserad verifiering: `npm run smoke:cmo-connectors`

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "$STAGING_URL/api/v1/marketing/connectors/status?window=7d"
```

Förväntat: minst en kanal `status: ok` med `fetchedAt` inom freshness-fönster

4. [ ] Kör CMO analytics mode i staging:

```bash
curl -X POST "$STAGING_URL/api/v1/agents/CMO/run" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mode":"analytics","period":"weekly"}'
```

Förväntat: `data.status` ≠ `insufficient_data` när metrics finns

5. [ ] Upprepa O2 steg 1–4 i **prod** (under underhållsfönster) — **byggfas: fixture klar, live väntar go-live**
6. [ ] OWNER bekräftar analytics-rapport i admin (Analys-fliken)

**Q-lite (byggfas):** Connectors-flik i admin (`public/admin/cmo-connectors.js`) — read-only status, ingen live fetch.

### O3 — Observability & drift

- [ ] Alert om connector `status: error` > 15 min (log + ev. executive feed `review_marketing_connectors`)
- [ ] Dashboard/logg: `fetchChannelMetrics` latency, HTTP 4xx/5xx per kanal
- [x] Runbook-sektion: **rollback** = sätt `LIVE_FETCH=false` (återgå till fixture/insufficient_data)

### O4 — Acceptans (Fas O)

- [ ] `GET /marketing/connectors/status` visar `ok` för aktiverade kanaler i prod
- [ ] Analytics-mode använder live metrics när tillgängliga
- [ ] Ingen auto-publish eller spend-ändring aktiverad
- [ ] Rollback testad i staging (`LIVE_FETCH=false` — verifieras av `smoke:cmo-connectors`)

### O5 — Prod rollout-checklista (sandbox vs prod)

**Miljöer**

| Miljö | URL / syfte | Connector-läge |
| ----- | ----------- | -------------- |
| **Sandbox / staging** | Ephemeral CI + valfri staging-URL | `MODE=live`, testtokens, `LIVE_FETCH=true` |
| **Prod** | `https://arcana.hairtpclinic.se` | `MODE=live` endast efter OWNER go-live; annars `fixture` |

**Checklista — staging (sandbox)**

1. [ ] Deploy med `ARCANA_MARKETING_CONNECTORS_ENABLED=false` (kod på plats)
2. [ ] Sätt connector-secrets i Render **staging** env (inga prod-tokens i repo)
3. [ ] `ENABLED=true`, `MODE=live`, `LIVE_FETCH=true`
4. [ ] `npm run smoke:cmo-connectors` + `npm run smoke:cmo-staging`
5. [ ] Nattlig CI: [`.github/workflows/cmo-nightly-smoke.yml`](../../.github/workflows/cmo-nightly-smoke.yml) — staging smoke + sandbox publish E2E + mutation (03:15 UTC)

**Checklista — prod (Fas O go-live)**

1. [ ] Underhållsfönster + OWNER sign-off
2. [ ] Deploy prod med connectors **disabled** (`ENABLED=false`)
3. [ ] Lagra **prod** tokens i Render secret env (Google/Meta/LinkedIn) — aldrig i git
4. [ ] Aktivera: `ENABLED=true`, `MODE=live`, `LIVE_FETCH=true`
5. [ ] Verifiera:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "https://arcana.hairtpclinic.se/api/v1/marketing/connectors/status?window=7d"
```

6. [ ] Kör CMO analytics i prod; bekräfta att `insufficient_data` inte dominerar när metrics finns
7. [ ] Rollback redo: sätt `LIVE_FETCH=false` (återgå till fixture)
8. [ ] Bekräfta att `cmo-nightly-smoke` var grön ≥7 dagar före prod flip

**CI-referens:** `cmo-nightly-smoke.yml` kör `smoke:cmo-staging`, `demo:cmo-sandbox-publish:e2e` och mutation-gate — använd som regressionsnet innan prod-secrets aktiveras.

---

## Fas P–R — v3 produktscope (definition)

### v3 vision

**CMO v3** = mätvärden i prod **plus** kontrollerad extern publicering efter pilot, utan att bryta OWNER/compliance-modellen.

```
v2.4 (idag)     →  utkast + workspace + pilot queue stub + connectors (kod)
Fas O           →  live metrics i prod
v3.0 (Fas P)    →  riktig extern publish (pilot-kanaler)
v3.1 (Fas Q)    →  connector drift, multi-tenant, mail metrics
v3.2 (Fas R)    →  kvalitet, UI, mutation ≥70%
```

---

### Fas P — v3.0 Live publish (pilot)

**Mål:** Efter OWNER-godkännande och alla gates — faktisk publicering till **pilot allowlist** (default: LinkedIn).

| #   | Leverans                           | Beskrivning                                                                   |
| --- | ---------------------------------- | ----------------------------------------------------------------------------- |
| P1  | ADR 0002 v3 addendum               | Formellt godkännande av extern publish per kanal                              |
| P2  | `cmoPublishConnectors.js`          | Adapter-lager: LinkedIn post, Meta (optional), mail stub                      |
| P3  | Utöka `executePilotChannelPublish` | Anropa riktig API; sätt `externalPublishInvoked: true`                        |
| P4  | Idempotency + audit                | CorrelationId, retry, dead-letter i audit store                               |
| P5  | UI                                 | Publish-status i Kampanjer-fliken (`publish_queued` → `published` / `failed`) | **workspace UI klar** |
| P6  | Tester                             | Contract + integration med mocked APIs; mutation på publish path              | **E2E script klar** |

**Acceptans:** Godkänd kampanj på LinkedIn publiceras i staging sandbox-konto; prod efter OWNER sign-off. L5-kanaler fortfarande `proposal_only`.

**Blocker:** Fas O stabil i prod ≥2 veckor utan connector-incident.

---

### Fas Q — v3.1 Connector operations

**Mål:** Driftsäker, tenant-aware connector-yta.

| #   | Leverans                       | Beskrivning                                                 |
| --- | ------------------------------ | ----------------------------------------------------------- | --------------------------- |
| Q1  | Tenant-scoped connector config | Per-tenant ad account ids i tenant store (ej bara env)      | **PATCH `/tenant-config` + `marketing.connectors`** |
| Q2  | Health job                     | Schemalagd `cmo_connector_health_check` → feed vid fel      | **All-tenant loop i scheduler** |
| Q3  | Mail/CRM connector             | Read-only (Mailchimp/Sendgrid metrics) eller webhook ingest | **Generic mail adapter (fixture/live HTTP)** |
| Q4  | Rate limit & cache             | TTL-cache för metrics; respektera API quotas                | **TTL cache klar; API quota backoff återstår** |
| Q5  | Admin UI                       | Connectors-flik: status, senaste fetch, manuell refresh     | **Q-lite klar (read-only + force refresh)** |

**Acceptans:** Multi-tenant staging med två tenants och separata ad accounts; health alert triggas vid invalid token.

---

### Fas R — v3.2 Kvalitet & utökad scope

**Mål:** Hårdare testtäckning och utvalda backlog-områden från 22-kapacitetsmatrisen.

| #   | Leverans            | Beskrivning                                                                        |
| --- | ------------------- | ---------------------------------------------------------------------------------- |
| R1  | Mutation ≥70%       | Prioritet: `cmoMarketingMetrics`, `cmoContentAgent`, `marketingContentAssetsStore` | **CI threshold 65%; `generateContentSeries` + publish i mutate scope** |
| R2  | E2E prod-smoke      | `smoke:cmo-staging` i CI mot ephemeral env (nightly)                               | **`cmo-nightly-smoke.yml` (staging + sandbox E2E)** |
| R3  | Organisk tillväxt   | Serie/kampanjsekvenser (`GenerateContentSeries` capability)                        | **Capability + copilot metadata; compose wiring återstår** |
| R4  | Product & trust     | Security/trust content templates i content brief                                   | **trust_template topics i brief + test** |
| R5  | Asset governance v2 | Content asset diff/history i UI                                                    | **Read-only asset-lista i Content-fliken** |

**Acceptans:** Mutation high-tröskel 70% i CI; nightly smoke grön 7 dagar i rad.

---

## Prioritering (rekommenderad ordning)

```
Fas N  ──►  Fas O  ──►  Fas P  ──►  Fas Q
                │
                └──►  Fas R (parallellt efter N)
```

| Vecka   | Fokus                                |
| ------- | ------------------------------------ |
| 1       | Fas N (commit + CI) + städning       |
| 2–3     | Fas O staging → prod connectors      |
| 4–7     | Fas P live publish pilot (LinkedIn)  |
| 6–8     | Fas Q connector ops (överlapp med P) |
| Löpande | Fas R mutation + E2E                 |

---

## Risker

| Risk                              | Mitigering                                                                 |
| --------------------------------- | -------------------------------------------------------------------------- |
| iCloud-sökväg stör Stryker lokalt | CI är source of truth; kör mutation i GitHub                               |
| Live token expiry                 | Rotation + health job (Q2)                                                 |
| Oavsiktlig auto-publish           | Feature flag `ARCANA_MARKETING_PUBLISH_LIVE_ENABLED=false` default; ADR P1 |
| Stort monolit-commit              | Fas N1 — dela i 4–6 commits                                                |
| Scope creep v3                    | P = publish only; Q = ops; R = backlog                                     |

---

## Relaterade dokument

- `docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md` — Fas A–M (klar)
- `docs/ops/runbooks/cmo-marketing-copilot-runbook.md` — operativ drift
- `docs/adr/0002-cmo-publish-and-spend-boundary.md` — publish-gräns (uppdateras i Fas P)
- `docs/ops/cmo-marketing-copilot-ia.md` — UI/API IA

---

## Checklista — ”klar för v3 kickoff”

- [x] Fas N complete (CI grön, commits pushade)
- [ ] Fas O complete (prod connectors ok)
- [ ] OWNER sign-off på ADR 0002 v3 addendum (Fas P)
- [ ] v3.0 sprint backlog skapad i issue tracker (P1–P6 som tickets)
