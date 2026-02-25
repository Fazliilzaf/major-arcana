# Arcana (Hair TP Clinic)

Node + Express-app med en patientvänlig chatt som:
- har konversationsminne (via `conversationId`)
- kan öppna bokning via Cliento-widget (”Boka tid”)
- kan svara utifrån en lokal kunskapsbas (Markdown/TXT)

## Kom igång
1) Skapa `.env` (utgå från `.env.example`)
2) Installera deps: `npm install`
3) Starta: `npm run dev`

Öppna sedan `http://localhost:3000`.

### Offline/CI-läge (utan OpenAI-anrop)
Sätt `ARCANA_AI_PROVIDER=fallback` i `.env` för att köra Arcana utan externa OpenAI-anrop.
Det är användbart för lokal smoke/CI och kräver då inte `OPENAI_API_KEY`.

### Deploy på Render (Blueprint)
Repo:t innehåller `render.yaml` för snabb deploy.
I Render: välj **Blueprint** och fyll minst:
- `OPENAI_API_KEY`
- `ARCANA_OWNER_EMAIL`
- `ARCANA_OWNER_PASSWORD`
- `PUBLIC_BASE_URL` (t.ex. `https://arcana.hairtpclinic.se`)

## Steg 1: Foundation (Auth + RBAC + Tenant + Audit)
Arcana har nu en intern API-bas på `/api/v1` för Pilot 0.1.

### 1) Sätt owner i `.env`
```env
ARCANA_DEFAULT_TENANT=hair-tp-clinic
ARCANA_OWNER_EMAIL=owner@hairtpclinic.se
ARCANA_OWNER_PASSWORD=byt-till-starkt-losenord
```

### 2) Starta servern
`npm run dev`

Vid uppstart bootstrapas första OWNER automatiskt om ovan variabler finns.

### CORS (strict läge i produktion)
`CORS_STRICT` defaultar nu till:
- `true` i produktion (`NODE_ENV=production`)
- `false` i lokal utveckling

Rekommenderad production-konfiguration:

```env
CORS_STRICT=true
CORS_ALLOWED_ORIGINS=https://arcana.hairtpclinic.se,https://hairtpclinic.se,https://www.hairtpclinic.se
CORS_ALLOW_NO_ORIGIN=false
CORS_ALLOW_CREDENTIALS=false
```

`CORS_ALLOWED_ORIGINS` kan anges som kommaseparerad lista eller JSON-array.
Om `ARCANA_BRAND_BY_HOST` är satt läggs host-keys automatiskt till som `https://<host>` i strict allowlist.

### Session idle-timeout + API rate limits
Default-värden för hardening:

```env
AUTH_SESSION_TTL_HOURS=12
AUTH_SESSION_IDLE_MINUTES=180
AUTH_LOGIN_SESSION_ROTATION=tenant
ARCANA_API_RATE_LIMIT_WINDOW_SEC=60
ARCANA_API_RATE_LIMIT_READ_MAX=300
ARCANA_API_RATE_LIMIT_WRITE_MAX=120
ARCANA_RISK_RATE_LIMIT_MAX=120
ARCANA_ORCHESTRATOR_RATE_LIMIT_MAX=80
ARCANA_PUBLIC_RATE_LIMIT_WINDOW_SEC=60
ARCANA_PUBLIC_CLINIC_RATE_LIMIT_MAX=180
ARCANA_PUBLIC_CHAT_RATE_LIMIT_MAX=90
```

- `AUTH_SESSION_IDLE_MINUTES`: invalidates session efter inaktivitet (revoke reason: `idle_timeout`)
- `AUTH_LOGIN_SESSION_ROTATION`: `none|tenant|user` (default `tenant`) roterar bort äldre sessioner vid login/select-tenant
- `ARCANA_API_RATE_LIMIT_READ_MAX`: max read-anrop per IP inom fönstret
- `ARCANA_API_RATE_LIMIT_WRITE_MAX`: max write-anrop per IP inom fönstret
- `ARCANA_RISK_RATE_LIMIT_MAX`: dedikerad limiter för `/api/v1/risk/*`
- `ARCANA_ORCHESTRATOR_RATE_LIMIT_MAX`: dedikerad limiter för `/api/v1/orchestrator/*`
- `ARCANA_PUBLIC_CLINIC_RATE_LIMIT_MAX`: dedikerad limiter för `/api/public/clinics/*`
- `ARCANA_PUBLIC_CHAT_RATE_LIMIT_MAX`: dedikerad limiter för `POST /chat`
- `POST /api/v1/auth/login` och `POST /api/v1/auth/select-tenant` styrs fortsatt av dedikerade auth-limiters

### OWNER MFA (TOTP + recovery)
- OWNER-login kräver MFA-challenge.
- `POST /api/v1/auth/login` kan returnera:
  - `requiresMfa: true`
  - `mfaTicket`
  - `mfa.setupRequired` (första setup)
  - vid setup även `mfa.secret`, `mfa.otpauthUrl` och `mfa.recoveryCodes`
- Slutför med `POST /api/v1/auth/mfa/verify` (`mfaTicket`, `code`, valfritt `tenantId`).
- `code` kan vara 6-siffrig TOTP eller recovery-kod.

### Scheduler / Automation (Pilot driftstöd)

```env
ARCANA_REPORTS_DIR=./data/reports
ARCANA_REPORT_RETENTION_MAX_FILES=60
ARCANA_REPORT_RETENTION_MAX_AGE_DAYS=45
ARCANA_SCHEDULER_ENABLED=true
ARCANA_SCHEDULER_REPORT_WINDOW_DAYS=14
ARCANA_SCHEDULER_REPORT_INTERVAL_HOURS=24
ARCANA_SCHEDULER_BACKUP_INTERVAL_HOURS=24
ARCANA_SCHEDULER_RESTORE_DRILL_INTERVAL_HOURS=168
ARCANA_SCHEDULER_ALERT_PROBE_INTERVAL_MINUTES=15
ARCANA_SCHEDULER_INCIDENT_AUTO_ESCALATION_ENABLED=true
ARCANA_SCHEDULER_INCIDENT_AUTO_ESCALATION_LIMIT=25
ARCANA_SCHEDULER_INCIDENT_AUTO_ASSIGN_OWNER_ENABLED=true
ARCANA_SCHEDULER_INCIDENT_AUTO_ASSIGN_OWNER_LIMIT=100
ARCANA_ALERT_WEBHOOK_URL=
ARCANA_ALERT_WEBHOOK_SECRET=
ARCANA_ALERT_WEBHOOK_TIMEOUT_MS=4000
ARCANA_SECRET_ROTATION_STORE_PATH=./data/secret-rotation.json
ARCANA_SECRET_ROTATION_MAX_AGE_DAYS=90
ARCANA_MONITOR_RESTORE_DRILL_MAX_AGE_DAYS=30
ARCANA_MONITOR_PILOT_REPORT_MAX_AGE_HOURS=36
ARCANA_METRICS_MAX_SAMPLES=5000
ARCANA_METRICS_SLOW_REQUEST_MS=1500
ARCANA_SCHEDULER_STARTUP_DELAY_SEC=8
ARCANA_SCHEDULER_JITTER_SEC=4
ARCANA_SCHEDULER_RUN_ON_STARTUP=false
```

- Schedulern kör nightly rapport, backup+prune, restore-drill preview och alert-probe.
- Nightly rapporter (`Pilot_Scheduler_*.json`) prunas automatiskt enligt `ARCANA_REPORT_RETENTION_MAX_FILES`/`ARCANA_REPORT_RETENTION_MAX_AGE_DAYS`.
- `alert_probe` auto-tilldelar owner på öppna oägda incidents (owner prioriteras, fallback staff).
- `alert_probe` auto-eskalerar breachade öppna incidents (L4/L5) och skriver audit-event `incidents.auto_escalate`.
- Om `ARCANA_ALERT_WEBHOOK_URL` är satt skickas webhook-notifieringar för `incidents.auto_assign_owner` och `incidents.auto_escalate`.
- Sätt `ARCANA_ALERT_WEBHOOK_SECRET` för HMAC-signatur (`x-arcana-signature: sha256=...`).
- Secret rotation metadata för provider/webhook-nycklar lagras i `ARCANA_SECRET_ROTATION_STORE_PATH` (fingerprints + versioner, aldrig råa hemligheter).
- Status syns i `GET /api/v1/monitor/status` under `runtime.scheduler`.
- `monitor/status` exponerar även `gates.restoreDrill` (`healthy`/`noGo`) baserat på senaste lyckade `restore_drill_preview` i audit-loggen (persist över restart) och max-age (`ARCANA_MONITOR_RESTORE_DRILL_MAX_AGE_DAYS`).
- `monitor/status` exponerar även `gates.pilotReport` (`healthy`/`noGo`) baserat på senaste lyckade `nightly_pilot_report` + senaste scheduler-rapportfil och max-age (`ARCANA_MONITOR_PILOT_REPORT_MAX_AGE_HOURS`).

`POST /api/v1/auth/change-password` har nu global invalidation som default:
- revokerar alla user-sessioner (alla tenants) vid lösenordsbyte
- revokerar även aktuell session som default (`requiresReauth=true` i svar)
- kan overrideas via body-fält (`revokeAllSessions`, `revokeCurrentSession`, `revokeScope`)

Om prod-inloggning fastnar på gammalt lösenord:
1) Sätt i Render env: `ARCANA_BOOTSTRAP_RESET_OWNER_PASSWORD=true`
2) Deploy
3) Verifiera login med `ARCANA_OWNER_EMAIL` / `ARCANA_OWNER_PASSWORD`
4) Sätt tillbaka `ARCANA_BOOTSTRAP_RESET_OWNER_PASSWORD=false` och deploy igen

### Correlation ID
- Alla requests får/returnerar header `x-correlation-id`.
- Om klienten skickar `x-correlation-id` återanvänds den, annars genereras en ny.
- Audit-events inkluderar automatiskt `metadata.correlationId` för spårbarhet.

### 3) Viktiga endpoints (Foundation)
- `GET /healthz` (liveness)
- `GET /readyz` (readiness)
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/mfa/verify`
- `POST /api/v1/auth/select-tenant` (om användaren har flera tenants)
- `POST /api/v1/auth/switch-tenant` (inloggad OWNER/STAFF, byter tenant utan ny login)
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/sessions` (OWNER/STAFF, scope=`me|tenant`, tenant-scope endast OWNER)
- `POST /api/v1/auth/sessions/:sessionId/revoke` (OWNER/STAFF, OWNER kan revoka tenantens sessioner)
- `POST /api/v1/auth/change-password` (OWNER/STAFF, global session invalidation by default)
- `POST /api/v1/auth/logout`
- `GET /api/v1/tenants/my` (OWNER/STAFF, lista egna tenants)
- `POST /api/v1/tenants/onboard` (OWNER, skapa/onboard tenant + owner)
- `GET /api/v1/tenants/:tenantId/access-check` (tenant isolation check)
- `GET /api/v1/users/staff` (OWNER)
- `POST /api/v1/users/staff` (OWNER)
- `PATCH /api/v1/users/staff/:membershipId` (OWNER)
- `GET /api/v1/monitor/status` (OWNER/STAFF)
- `GET /api/v1/monitor/metrics` (OWNER/STAFF)
- `GET /api/v1/monitor/slo` (OWNER/STAFF, availability + incident response + restore recency + pilot report recency)
- `GET /api/v1/monitor/readiness` (OWNER/STAFF, Go/No-Go score + blocker-matris)
- `GET /api/v1/monitor/readiness/history` (OWNER/STAFF, readiness-trend från audit-events)
  - inkluderar deterministiska no-go checks för output risk/policy-gate, policy-floor bypass, L5 manual intervention, restore drill och nightly pilot report recency
  - inkluderar även `remediation` med prioriterad action-lista (P0-P3) och uppskattad score-impact för att nå `controlled_go`
- `GET /api/v1/ops/state/manifest` (OWNER)
- `GET /api/v1/ops/state/backups` (OWNER)
- `POST /api/v1/ops/state/backup` (OWNER)
- `POST /api/v1/ops/state/backups/prune` (OWNER, dry-run eller apply)
- `GET /api/v1/ops/reports` (OWNER, scheduler-genererade pilotrapporter)
- `POST /api/v1/ops/reports/prune` (OWNER, dry-run eller apply)
- `POST /api/v1/ops/state/restore` (OWNER, dry-run + restore med confirmText)
- `GET /api/v1/ops/scheduler/status` (OWNER)
- `POST /api/v1/ops/scheduler/run` (OWNER, body: `{ "jobId": "alert_probe" }` eller `{ "jobId": "required_suite" }`)
- `POST /api/v1/ops/readiness/remediate-output-gates` (OWNER, preview/apply av active-version output gate remediation)
- `POST /api/v1/ops/readiness/remediate-owner-mfa-memberships` (OWNER, preview/apply av disable-remediation för non-compliant OWNER memberships)
- `GET /api/v1/ops/secrets/status` (OWNER, rotation status/freshness)
- `POST /api/v1/ops/secrets/snapshot` (OWNER, dry-run default)
- `GET /api/v1/ops/secrets/history` (OWNER, query: `secretId`, `limit`)
- `GET /api/v1/audit/events` (OWNER/STAFF)
- `GET /api/v1/audit/integrity` (OWNER/STAFF, verifierar append-only checksumkedja)
- `GET /api/v1/incidents` (OWNER/STAFF, query: `status`, `severity`, `sinceDays`, `ownerUserId`)
- `GET /api/v1/incidents/summary` (OWNER/STAFF)
- `GET /api/v1/incidents/:incidentId` (OWNER/STAFF)

## Steg 2: Template Engine (Pilot 0.1)
Template Engine finns nu i `/api/v1` med draft/active-workflow och riskutvärdering.

Tenant-bunden template-policy stöds via `tenant-config`:
- `templateVariableAllowlistByCategory` (extra tillåtna variabler per kategori)
- `templateRequiredVariablesByCategory` (extra obligatoriska variabler per kategori)
- `templateSignaturesByChannel` (t.ex. automatisk email-signatur)

Snabbtest (rekommenderat):
`bash ./scripts/smoke-template.sh`
eller
`npm run smoke`

Stabil engångskörning (startar rätt server, stänger gamla processer på port 3000, kör smoke):
`bash ./scripts/run-smoke-local.sh`
eller
`npm run smoke:local`

Hel verifiering lokalt:
`npm run verify`

## Pilot Go-Live (sista 5%)
Kör detta i ordning:

Snabbaste vägen (allt i ett):
- `npm run preflight:pilot -- --public-url https://arcana.hairtpclinic.se`
- Snabb heal-variant: `npm run preflight:pilot:heal -- --public-url https://arcana.hairtpclinic.se`
- Snabb heal-all-variant: `npm run preflight:pilot:heal:all -- --public-url https://arcana.hairtpclinic.se`
- Om `ARCANA_OWNER_EMAIL` och `ARCANA_OWNER_PASSWORD` är satta kör preflight även `preflight:readiness:guard` + `ops:suite:strict` mot publik miljö (fail-fast på kritiska blocker-checks + no-go fail; blocker-kontroll baseras på required checks).
- Efter `ops:suite:strict` kör preflight som default en guard-verifiering med `--use-required-checks` (kan stängas av med `ARCANA_PREFLIGHT_VERIFY_REQUIRED_CHECKS=false`).
- Om `ops:suite:strict` failar kör preflight ändå verifierings-steget för diagnos och returnerar sedan samma fail-exit-kod.
- Sätt `ARCANA_PREFLIGHT_USE_HEAL=true` för att köra `ops:suite:strict:heal` i sista steget.
- Sätt `ARCANA_PREFLIGHT_USE_HEAL_ALL=true` för att köra `ops:suite:strict:heal:all` (output-gates + owner-MFA-remediation) i sista steget.
- När heal-läge är aktivt (`ARCANA_PREFLIGHT_USE_HEAL`/`ARCANA_PREFLIGHT_USE_HEAL_ALL`) fortsätter preflight efter readiness-guard `exit 2` endast om blocker-checkarna är healbara (default: `owner_mfa_enforced` via `ARCANA_PREFLIGHT_HEALABLE_GUARD_CHECKS`), kör heal-steget och verifierar guard igen efteråt.
- För att tvinga fortsatt körning i heal-läge även med ej-healbara guard-blockers: `ARCANA_PREFLIGHT_FORCE_OPS_ON_GUARD_FAIL=true`.
- Om guard blockerar på `owner_mfa_enforced`: kör `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:setup` (per aktiv OWNER).
- Emergency fallback för `owner_mfa_enforced` (disable non-compliant OWNER memberships om minst en compliant OWNER redan finns):
  - Preview: `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:remediate`
  - Apply: `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:remediate -- --apply`

Enklaste publik-körning (interaktivt lösenord, minimerar copy/paste-fel):
- `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=fazli@hairtpclinic.com npm run pilot:public`
- Lägg till mail-seeds i samma körning: `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=fazli@hairtpclinic.com npm run pilot:public -- --with-mail-seeds`
- Om OWNER kräver MFA: sätt `ARCANA_OWNER_MFA_CODE=<6-siffrig-kod>` eller `ARCANA_OWNER_MFA_SECRET=<base32-secret>` (scriptet försöker även läsa `AUTH_STORE_PATH`, default `./data/auth.json`).

1) Lokal kvalitet:
- `npm run verify`
- `npm run git:check-large`

2) Deploy (Render):
- Pusha branchen till GitHub.
- Säkerställ env i Render (se `render.yaml`, särskilt `PUBLIC_BASE_URL`, owner-credentials och Cliento-variabler).

3) Verifiera publik drift:
- `BASE_URL=https://arcana.hairtpclinic.se npm run smoke:public`
- För auth-check i samma körning:
  - `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run smoke:public`
- Om OWNER kräver MFA: lägg till `ARCANA_OWNER_MFA_CODE=<6-siffrig-kod>` eller `ARCANA_OWNER_MFA_SECRET=<base32-secret>`.
- För endast reachability (utan login), t.ex. i låst CI-miljö:
  - `BASE_URL=https://arcana.hairtpclinic.se ARCANA_SMOKE_SKIP_AUTH=true npm run smoke:public`
- `smoke:public` läser även owner-credentials från lokal `.env` om env-variabler inte skickas in.
- Om login misslyckas i public smoke: synka owner-credentials i Render och kör igen.
- För att slutföra OWNER MFA setup med samma credentials:
  - `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:setup`
  - Visa recovery-koder explicit (för säker lagring): `npm run owner:mfa:setup -- --show-recovery-codes`
  - Observera: scriptet skriver ut setup-secret (känsligt) när setupRequired=true. Kör i säker terminal, inte i öppna CI-loggar.
- För snabb OWNER remediation (disable av non-compliant owners):
  - `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run owner:mfa:remediate`
  - Lägg till `-- --apply` för faktisk disable.
- När `cors_strict` blockerar:
  - sätt `CORS_STRICT=true`, `CORS_ALLOW_NO_ORIGIN=false`, `CORS_ALLOWED_ORIGINS=<origin1,origin2>` i runtime-env och deploya om.
  - Notera: readiness räknar "effective origins" från `CORS_ALLOWED_ORIGINS` + `PUBLIC_BASE_URL` + hosts i `ARCANA_BRAND_BY_HOST`.
- Kör fail-fast readiness guard separat vid behov:
  - `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run preflight:readiness:guard`
  - Default checks: `owner_mfa_enforced,cors_strict` (fail på status `red`)
  - För att köra på alla required checks i readiness: `npm run preflight:readiness:guard -- --use-required-checks` eller `--checks required`
  - Guard kör även CORS runtime-probe när `cors_strict` är med i check-listan och `cors_strict=green` (tillåten origin måste få ACAO-header, otillåten origin måste blockeras utan ACAO-header).
  - Vid `owner_mfa_enforced` visar guard även vilka aktiva OWNER-konton som saknar `mfaRequired/mfaConfigured` (från `/api/v1/users/staff`).
  - Vid `cors_strict` visar guard även `corsStrictEnv` (rekommenderad env-rad för strict CORS).
  - Guard kan skriva JSON-rapport för automation: `--report-file /tmp/readiness-guard.json` (eller `ARCANA_PREFLIGHT_READINESS_REPORT_FILE`), inkl. `recommendations.corsStrictEnv` när `cors_strict` blockerar.
  - Konfigurering: `ARCANA_PREFLIGHT_READINESS_CHECKS`, `ARCANA_PREFLIGHT_READINESS_USE_REQUIRED_CHECKS`, `ARCANA_PREFLIGHT_READINESS_FAIL_STATUSES`, `ARCANA_PREFLIGHT_READINESS_ALLOW_MISSING`, `ARCANA_PREFLIGHT_READINESS_CORS_RUNTIME_PROBE`, `ARCANA_PREFLIGHT_READINESS_CORS_PROBE_PATH`, `ARCANA_PREFLIGHT_READINESS_REPORT_FILE`
  - CLI-flaggor: `--use-required-checks`, `--no-use-required-checks`, `--cors-runtime-probe`, `--no-cors-runtime-probe`, `--cors-probe-path /healthz`, `--report-file /tmp/readiness-guard.json`
  - Styr OWNER-gap listing: `ARCANA_PREFLIGHT_READINESS_SHOW_OWNER_MFA_GAPS=true|false`

4) Mail-baserade mallutkast (när export finns):
- `npm run ingest:mails -- --input ./mail-exports --brand hair-tp-clinic`
- `npm run mail:seeds:preview`
- `npm run mail:seeds:apply`

5) Spara pilotrapport automatiskt (utan att skapa otrackade filer i repo-root):
- `npm run report:pilot`
- Filen sparas i `data/reports/` (git-ignorerad), t.ex. `data/reports/Pilot_Baseline_14d_YYYYMMDD-HHMMSS.json`.
- Rapportfilen inkluderar `readinessSnapshot` med Go/No-Go, no-go triggers, prioriterad remediation-lista och readiness-historiktrend.
- För publik miljö: `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run report:pilot`
- Om OWNER kräver MFA: sätt `ARCANA_OWNER_MFA_CODE=<6-siffrig-kod>` eller `ARCANA_OWNER_MFA_SECRET=<base32-secret>`.
- För kompakt readiness i rapport: `npm run report:pilot -- --readiness-mode compact` (default: `full`).
- Valfritt: `npm run report:pilot -- --days 30`
- Kör required scheduler-suite + monitor snapshot i en körning: `npm run ops:suite`
- Publik variant: `BASE_URL=https://arcana.hairtpclinic.se ARCANA_OWNER_EMAIL=<email> ARCANA_OWNER_PASSWORD=<password> npm run ops:suite`
- Om OWNER kräver MFA: lägg till `ARCANA_OWNER_MFA_CODE=<6-siffrig-kod>` eller `ARCANA_OWNER_MFA_SECRET=<base32-secret>`.
- Scriptet försöker även läsa `mfaSecret` från `AUTH_STORE_PATH` (default `./data/auth.json`) om MFA-kod/secret inte skickas.
- Ops-suite-artifact inkluderar monitor status + readiness + readiness-historik + SLO-snapshot.
- Ops-suite kör som standard en tenant access-check refresh (`tenants.access_check`) före readiness snapshot för färsk tenant-isolation-evidens.
- Ops-suite kör även CORS runtime-probe som standard när `cors_strict` är grön (tillåten origin måste få ACAO-header, otillåten origin får inte få ACAO-header). Om `cors_strict` inte är grön markeras probe som `unknown/skipped` istället för separat blocker.
- Strict output visar även blockerande `triggeredNoGo` IDs och topp-P0-remediation för snabb åtgärd.
- Strict output visar även `readinessNoGoDetail` + `readinessNoGoPlaybook` med owner/playbook per trigger.
- Ops-suite visar även blocker-checks (`required` + ej green) med topplista och playbook-hints.
- Vid blockerad `cors_strict` visar ops-suite även `corsStrictEnv` (rekommenderad runtime-env-rad).
- Ops-suite visar även `categoryIssues` (icke-gröna readiness-kategorier) med top-checks för diagnos när blockerChecks är tom.
- Vid `owner_mfa_enforced` visar ops-suite även `ownerMfaGap`/`ownerMfaGapPreview` (vilka OWNER-konton som saknar MFA).
- Readiness-checkarna `auto_escalation_evidence` och `auto_assignment_evidence` blir gröna även utan incidentåtgärd om `scheduler.job.alert_probe.run` har färsk success (<=30 dagar), så länge inga öppna breached/unowned incidents kräver faktisk action.
- Heal mode (auto-fixa output-gate metadata på aktiva versioner innan gating): `npm run ops:suite:heal`
- Heal mode för OWNER MFA memberships (disable non-compliant där minst en compliant OWNER finns): `npm run ops:suite:heal:owners`
- Heal mode (output-gates + OWNER MFA memberships): `npm run ops:suite:heal:all`
- Strikt heal mode: `npm run ops:suite:strict:heal`
- Strikt heal mode (alla remediation-flaggor): `npm run ops:suite:strict:heal:all`
- Flagga direkt: `npm run ops:suite -- --remediate-output-gates --remediation-limit 50`
- Flagga direkt för OWNER MFA memberships: `npm run ops:suite -- --remediate-owner-mfa-memberships --owner-mfa-remediation-limit 50`
- Flagga direkt för tenant access-check refresh: `npm run ops:suite -- --refresh-tenant-access-check` (default på)
- Slå av tenant access-check refresh: `npm run ops:suite -- --no-refresh-tenant-access-check`
- Flagga direkt för CORS runtime-probe: `npm run ops:suite -- --cors-runtime-probe` (default på)
- Slå av CORS runtime-probe: `npm run ops:suite -- --no-cors-runtime-probe`
- Byt probe-path: `npm run ops:suite -- --cors-probe-path /healthz`
- Motsvarande env vars: `ARCANA_OPS_SUITE_REMEDIATE_OUTPUT_GATES=true`, `ARCANA_OPS_SUITE_REMEDIATION_LIMIT=50`, `ARCANA_OPS_SUITE_REMEDIATE_OWNER_MFA_MEMBERSHIPS=true`, `ARCANA_OPS_SUITE_OWNER_MFA_REMEDIATION_LIMIT=50`, `ARCANA_OPS_SUITE_REFRESH_TENANT_ACCESS_CHECK=true`, `ARCANA_OPS_SUITE_CORS_RUNTIME_PROBE=true`, `ARCANA_OPS_SUITE_CORS_PROBE_PATH=/healthz`
- Strikt driftgate (exit code 2 vid no-go): `npm run ops:suite:strict`
- Lista scheduler-genererade rapporter: `npm run report:scheduler:list`
- Förhandsvisa report-prune: `npm run report:scheduler:prune`
- Kör report-prune: `npm run report:scheduler:prune:apply`

Tips:
- Om `mail/insights` visar `ready:false` saknas ingestad maildata för tenant (det är okej tills ni kör ingest).

### Viktiga endpoints (Template Engine)
- `GET /api/v1/templates/meta`
- `GET /api/v1/templates`
- `POST /api/v1/templates`
- `GET /api/v1/templates/:templateId/versions`
- `GET /api/v1/templates/:templateId/versions/:versionId`
- `POST /api/v1/templates/:templateId/drafts/generate`
- `PATCH /api/v1/templates/:templateId/versions/:versionId`
- `POST /api/v1/templates/:templateId/versions/:versionId/evaluate`
- `POST /api/v1/templates/:templateId/versions/:versionId/activate` (OWNER)
- `POST /api/v1/templates/:templateId/versions/:versionId/archive` (OWNER)
- `POST /api/v1/templates/:templateId/versions/:versionId/clone`
- `GET /api/v1/risk/summary`
- `GET /api/v1/risk/evaluations`
- `GET /api/v1/risk/evaluations/:evaluationId`
- `POST /api/v1/risk/evaluations/:evaluationId/owner-action` (OWNER)
- `GET /api/v1/risk/precision/report` (OWNER/STAFF, gold-set confusion matrix)

Owner action `action` (endast OWNER):
- `approve_exception`
- `mark_false_positive`
- `request_revision`
- `escalate`

## Steg 3: Owner Risk Panel (web)
- Admin UI: `http://localhost:3000/admin`
- Multi-tenant i UI:
  - login hanterar `requiresTenantSelection` automatiskt
  - tenant-switcher i header (OWNER/STAFF) använder `POST /api/v1/auth/switch-tenant`
  - tenant-lista + onboarding-form (OWNER) använder `GET /api/v1/tenants/my` och `POST /api/v1/tenants/onboard`
- Dashboard API: `GET /api/v1/dashboard/owner`
- Tenant config: `GET /api/v1/tenant-config`, `PATCH /api/v1/tenant-config` (OWNER)
- Public clinic payload (for external web): `GET /api/public/clinics/:clinicId`
- Template lifecycle i UI:
  - create template
  - list templates/versions
  - generate draft (AI), save draft, evaluate
  - activate/archive/clone version
- Staff management i UI:
  - skapa/uppdatera staff (`POST /api/v1/users/staff`)
  - enable/disable staff (`PATCH /api/v1/users/staff/:membershipId`)
  - promote/demote role (`PATCH /api/v1/users/staff/:membershipId` med `role`)
- Session management i UI:
  - lista sessioner (`GET /api/v1/auth/sessions`)
  - avsluta session (`POST /api/v1/auth/sessions/:sessionId/revoke`)
- Monitor-panel i UI:
  - driftstatus, minne, datastores och tenant-KPI (`GET /api/v1/monitor/status`)
  - latency/fel-metrics (`GET /api/v1/monitor/metrics`)
  - SLO/SLI-status (`GET /api/v1/monitor/slo`)
  - readiness/Go-No-Go matris (`GET /api/v1/monitor/readiness`)
  - readiness-historik och trend (`GET /api/v1/monitor/readiness/history`)
  - aktiva No-Go blockers med evidence/detaljer (från readiness-payload)
  - output-gate remediation preview/apply (`POST /api/v1/ops/readiness/remediate-output-gates`)
  - kör required scheduler-suite (`POST /api/v1/ops/scheduler/run` med `{"jobId":"required_suite"}`)
- Ops backup-panel i UI (OWNER):
  - state manifest (`GET /api/v1/ops/state/manifest`)
  - skapa backup (`POST /api/v1/ops/state/backup`)
  - lista backups (`GET /api/v1/ops/state/backups`)
  - prune backups (`POST /api/v1/ops/state/backups/prune`)
  - lista scheduler-rapporter (`GET /api/v1/ops/reports`)
  - prune scheduler-rapporter (`POST /api/v1/ops/reports/prune`)
  - restore preview + restore (`POST /api/v1/ops/state/restore`)
 - Mail insights-panel i UI:
   - läser anonymiserad mail-kunskap per tenant
  - endpoint: `GET /api/v1/mail/insights`
   - seed preview och seed→draft:
     - `POST /api/v1/mail/template-seeds/apply` med `{"dryRun":true}`
     - `POST /api/v1/mail/template-seeds/apply` med `{"dryRun":false}` (OWNER)
 - Orchestrator-panel i UI:
   - kör intern orchestration och visa trace
 - Risk calibration-panel i UI:
   - hämta förslag och applicera owner-godkänt förslag
 - Incident-panel i UI/API:
   - lista incidents (`GET /api/v1/incidents`)
   - incidentsammanfattning (`GET /api/v1/incidents/summary`)
   - incidentdetalj (`GET /api/v1/incidents/:incidentId`)
 - Pilot report-panel i UI:
   - generera KPI-rapport per tidsfönster

### Public web payload (multi-clinic)
- Endpoint: `GET /api/public/clinics/:clinicId`
- Returnerar publik payload for kliniksajt (hero, services, trust, contact, theme, updatedAt).
- `clinicId` kan mappas till tenant via env `ARCANA_PUBLIC_CLINIC_ALIASES`.
- Alias `hair-to-clinic -> hair-tp-clinic` finns som default.

Exempel:
```bash
curl http://localhost:3000/api/public/clinics/hair-to-clinic
```

Publika webbfalt kan styras via tenant-config med PATCH (OWNER):
- Endpoint: `PATCH /api/v1/tenant-config`
- Body-falt: `publicSite` (hela eller delar av objektet)
- Exempel:

```json
{
  "publicSite": {
    "clinicName": "Hair TP Clinic",
    "city": "Goteborg",
    "heroTitle": "Hartransplantation med kliniskt fokus",
    "contactPhone": "031 88 11 66",
    "services": [
      {
        "id": "fue-core",
        "title": "FUE Bas",
        "description": "For vikande harfaste och mindre omraden.",
        "durationMinutes": 300,
        "fromPriceSek": 42000
      }
    ]
  }
}
```

## Steg 4: Risk Calibration (tenant-styrd)
- Risk settings API:
  - `GET /api/v1/risk/settings`
  - `PATCH /api/v1/risk/settings` (OWNER)
  - `GET /api/v1/risk/settings/versions` (OWNER/STAFF, query: `limit`)
  - `POST /api/v1/risk/settings/rollback` (OWNER, body: `version`, valfri `note`)
- Risk lab API:
  - `POST /api/v1/risk/preview` (OWNER/STAFF)
- Risk calibration API:
  - `GET /api/v1/risk/calibration/suggestion` (OWNER/STAFF)
  - `POST /api/v1/risk/calibration/apply-suggestion` (OWNER)
- Policy floor API:
  - `GET /api/v1/policy/floor` (OWNER/STAFF)
- Tenantens `riskSensitivityModifier` appliceras nu i template-riskutvärdering (generate/update/evaluate).
- Ändringar av `riskSensitivityModifier` versionshanteras per tenant och kan rollbackas till tidigare version.

## Risk precision benchmark (Gold Set + confusion matrix)
- Versionerat gold set finns i:
  - `docs/risk/gold-set-v1.json` (150 fall: 50 safe, 50 borderline, 50 critical)
- Generera/uppdatera gold set:
  - `npm run risk:goldset:generate`
- Kör rapport lokalt:
  - `npm run risk:goldset:report`
- API-rapport:
  - `GET /api/v1/risk/precision/report`
  - valfri query: `modifier` (override av tenantens risk modifier för rapportkörningen)

## Steg 5: Activation Gate (Owner-control)
- Om riskbeslut = `review_required` eller `blocked` krävs owner-beslut före aktivering.
- Tillåtna owner-beslut för aktivering:
  - `approve_exception`
  - `mark_false_positive`
- Annars stoppas `POST /api/v1/templates/:templateId/versions/:versionId/activate`.

## Steg 6: Arcana Orchestrator (intern)
- Orchestrator API:
  - `GET /api/v1/orchestrator/meta`
  - `POST /api/v1/orchestrator/admin-run`
- Returnerar:
  - intent + confidence

## Strategidokument (Phase 2)
- Masterplan för hardening, incident/SLA, automation, riskprecision och Go/No-Go:
  - `docs/strategy/arcana-phase-2-masterplan.md`
  - valda agenter
  - handlingsplan
  - föreslagna API-anrop
  - säkerhetsvaliderad output (risk + policy floor)

## Steg 7: Pilot Reporting
- Rapport API:
  - `GET /api/v1/reports/pilot?days=14`
- Rapporten innehåller:
  - template KPI
  - risk KPI
  - owner action coverage
  - operativa audit events

## Steg 8: UI/UX Design Pack (Pilot 0.1)
Designleverabler från UI/UX-specen finns i `docs/uiux/`:
- `docs/uiux/sitemap.md` (navigation map)
- `docs/uiux/wireframes.md` (låg-fidelitet skärmstrukturer)
- `docs/uiux/component-library.md` (komponentkatalog)
- `docs/uiux/design-tokens.json` + `docs/uiux/design-tokens.css` (design tokens)
- `docs/uiux/user-journeys.md` (Owner/Staff-flöden)
- `docs/uiux/interactions.md` (interaktionsregler)

Tips vid route-fel (`Cannot GET ...`): stoppa alla gamla processer på port 3000 och starta om `npm run dev`.

## Drift: Backup & Restore
- Skapa backupbundle:
  - `npm run backup:state`
- Lista senaste backupfiler:
  - `npm run backup:list`
- Preview prune enligt retention-regler:
  - `npm run backup:prune`
- Kör prune:
  - `npm run backup:prune:apply`
- Återställ från backupfil:
  - `npm run restore:state -- --file ./data/backups/arcana-state-YYYYMMDD-HHMMSS.json`
  - Lägg till `--yes` för icke-interaktiv restore.
- API prune preview/run (OWNER):
  - `POST /api/v1/ops/state/backups/prune` med body `{ "dryRun": true }` eller `{ "dryRun": false }`
- API report prune preview/run (OWNER):
  - `POST /api/v1/ops/reports/prune` med body `{ "dryRun": true }` eller `{ "dryRun": false }`
- API restore preview (OWNER):
  - `POST /api/v1/ops/state/restore` med body `{ "fileName": "arcana-state-YYYYMMDD-HHMMSS.json", "dryRun": true }`
- API restore run (OWNER):
  - `POST /api/v1/ops/state/restore` med body
    `{ "fileName": "...", "dryRun": false, "confirmText": "RESTORE <filnamn>" }`

Backup inkluderar:
- `AUTH_STORE_PATH`
- `TEMPLATE_STORE_PATH`
- `TENANT_CONFIG_STORE_PATH`
- `MEMORY_STORE_PATH`
- `ARCANA_SECRET_ROTATION_STORE_PATH`

## Drift: Secrets rotation runbook
- Runbook: `docs/ops/secrets-rotation-runbook.md`
- Basflöde:
  1) Roterad nyckel i plattformens secret manager (t.ex. Render env).
  2) Deploy/restart Arcana.
  3) Kör `POST /api/v1/ops/secrets/snapshot` med `{"dryRun":false,"note":"rotation ticket ..."}`
  4) Verifiera `GET /api/v1/ops/secrets/status` och att `staleRequired=0`.

Katalog styrs av:
- `ARCANA_BACKUP_DIR` (default: `./data/backups`)
- `ARCANA_BACKUP_RETENTION_MAX_FILES` (default: `50`)
- `ARCANA_BACKUP_RETENTION_MAX_AGE_DAYS` (default: `30`)
- `ARCANA_REPORTS_DIR` (default: `./data/reports`)
- `ARCANA_REPORT_RETENTION_MAX_FILES` (default: `60`, scheduler-genererade rapporter)
- `ARCANA_REPORT_RETENTION_MAX_AGE_DAYS` (default: `45`, scheduler-genererade rapporter)

## Auditkedja (append-only + checksum)
- `AUTH_AUDIT_APPEND_ONLY=true` (default) håller audit-loggen append-only och stoppar trunkering.
- Sätt `AUTH_AUDIT_APPEND_ONLY=false` endast om du uttryckligen vill tillåta trunkering via `AUTH_AUDIT_MAX_ENTRIES`.
- Verifiera kedjan via:
  - `GET /api/v1/audit/integrity`
  - Valfri query: `maxIssues` (1–500, default 25)
- Smoke-test (`npm run smoke:local`) verifierar nu också `audit/integrity`.

## Lägg in Arcana på hemsidan (WordPress)
Arcana behöver först köras på en publik **HTTPS**-adress (t.ex. `https://arcana.dindomän.se/`).

### Alternativ 1: Flytande chatt-knapp (rekommenderat)
Lägg in denna rad på er sida (t.ex. i WordPress “Anpassad HTML”-block eller i ett script-inject plugin):

```html
<script defer src="https://arcana.dindomän.se/embed.js"></script>
```

Tips:
- För att tvinga brand (om det behövs): `data-brand="hair-tp-clinic"` eller `data-brand="curatiio"`.
- För att byta knapptext: `data-button-text="Chatta med oss"`.

### Alternativ 2: Inline på en sida (iframe)
```html
<iframe
  src="https://arcana.dindomän.se/"
  style="width:100%;height:720px;border:0;border-radius:24px;overflow:hidden"
  title="Arcana chatt"
></iframe>
```

## Kunskapsbas (från hemsidan)
Fyll `knowledge/` med innehåll. För snabb import kan du testa:

`npm run ingest:hairtpclinic`

Starta om servern efter import för att indexera nya filer.

## Mail-ingest (Outlook → anonymiserad kunskap)
Om du vill träna tonalitet, FAQ och templates från gamla mailtrådar:

1) Lägg exporterade filer lokalt (rekommenderat i `./mail-exports/`), t.ex. `.eml`, `.mbox` eller `.json`.
   - Apple Mail `.mbox`-paket (mappar) stöds också; scriptet läser interna `mbox`-filer automatiskt.
2) Kör ingest:

`npm run ingest:mails -- --input ./mail-exports --brand hair-tp-clinic`

3) Output skrivs till:
`knowledge/hair-tp-clinic/mail/`
- `mail-summary.md`
- `faq-from-mails.md`
- `tone-style-from-mails.md`
- `template-seeds-from-mails.md`
- `template-seeds.json` (maskinläsbar seed-källa för draft-automation)
- `thread-samples.md`
- `inbound-intents.md` (fungerar även om du bara har Inbox-export)
- `ingest-report.json`

4) Generera template drafts från seeds (Owner API):

Preview:
`curl -X POST http://localhost:3000/api/v1/mail/template-seeds/apply -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"dryRun":true,"limit":8}'`

Skapa drafts:
`curl -X POST http://localhost:3000/api/v1/mail/template-seeds/apply -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"dryRun":false,"limit":8}'`

Snabbare via npm:
- Preview: `npm run mail:seeds:preview`
- Skapa drafts: `npm run mail:seeds:apply`
- Skapa + aktivera auto i batch (alla `allow`; review/block skippas): `npm run mail:seeds:apply-activate`
  - Scriptet säkerställer nu också risk-evaluation per version (nya + befintliga seeds) så `reports/pilot` får `evaluationsTotal` > 0.
  - Stäng av evaluations-pass vid behov: `node ./scripts/apply-activate-mail-seeds.js --all --no-ensure-evaluations`
  - Hoppa över evaluation för redan existerande templates: `node ./scripts/apply-activate-mail-seeds.js --all --skip-existing-evaluations`
- Paginering manuellt: `bash ./scripts/apply-mail-seeds.sh --apply --limit 20 --offset 20`
- Med filter: `bash ./scripts/apply-mail-seeds.sh --apply --limit 12 --category CONSULTATION --name-prefix "Mail seed HTPC"`
- Duplicering stoppas som default (`skipExisting=true`). För att tillåta dubbletter:
  - `bash ./scripts/apply-mail-seeds.sh --apply --allow-duplicates`
  - `node ./scripts/apply-activate-mail-seeds.js --all --allow-duplicates`

Viktigt:
- `.olm` läses inte direkt av scriptet. Exportera vidare till `.eml`, `.mbox` eller `.json`.
- Output anonymiserar e-post, personnummer och telefonnummer.
- Lägg inte råmail i git (se `.gitignore`).

### GitHub push-skydd (stora filer)
Kör innan push:
`npm run git:check-large`

Den checkar både:
- tracked filer i working tree
- blobbar i Git-historik

Default-gräns är 95 MB (för att ligga under GitHubs 100 MB-gräns).

## Bokningar
Bokning sker via **Cliento** i en inbyggd modal (widget).

Konfigurera i `.env`:
- `CLIENTO_ACCOUNT_IDS` (kommaseparerad lista). Om du anger två IDs kan användaren välja bolag i widgeten.
  - Om er snippet använder `widget-v3/cliento.js`: sätt `CLIENTO_WIDGET_SRC` (eller brand-variant) till den URL:en.
Alternativt (fallback):
- `CLIENTO_BOOKING_URL` (t.ex. Clientos publika “business”-länk) för att öppna/iframe:a bokningen om ni inte vill använda widget-ID.

## Två bolag (Hair TP Clinic + Curatiio)
Om du vill köra **en** Arcana-server men ha rätt innehåll/bokning per domän:
1) Sätt mapping i `.env` med `ARCANA_BRAND_BY_HOST` (host → brand)
2) Sätt brand-specifika Cliento-värden:
   - `CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC` / `CLIENTO_BOOKING_URL_HAIR_TP_CLINIC`
   - `CLIENTO_ACCOUNT_IDS_CURATIIO` / `CLIENTO_BOOKING_URL_CURATIIO`

Tips:
- Om du kör bakom en reverse proxy: sätt `TRUST_PROXY=true` så `req.hostname` blir rätt.
- Om Arcana kör på en separat domän men embed:as i en iframe så används `document.referrer` (parent-sidans URL) för att välja brand.

## QA-checklista (mobil + desktop)
Kör detta efter varje deploy:

1) Verifiera script och cache
- Kontrollera att `view-source:https://hairtpclinic.se` innehåller `https://arcana.hairtpclinic.se/embed.js`.
- Purga WordPress-cache/CDN och gör hård omladdning.

2) Verifiera chat-bubbla
- Bubblan ska synas på både `https://hairtpclinic.se` och `https://www.hairtpclinic.se`.
- Klick på bubblan ska öppna panel utan överlappande extra `X`.

3) Verifiera bokningsheader
- Loggan i bokningsheader ska vara stor och tydlig.
- `Stäng`-knappen ska inte krocka med logga eller rubrik.

4) Verifiera Cliento-tema
- `Välj`/`Fortsätt`-knappar ska följa Arcana-färger (inte blå/lila default).
- Länkar som `Visa mer` ska följa varumärkesfärgen.

5) Verifiera bolagsfiltrering
- På Hair TP ska endast Hair TP Clinic-innehåll synas i bokningen.
- Curatiio-namn/tjänster ska inte visas i Hair TP-flödet.

6) Verifiera responsivt
- Testa minst en mobilbredd (390px) och en desktopbredd (1440px).
- Kontrollera att modalen kan scrollas utan att sidans bakgrund scrollar.
