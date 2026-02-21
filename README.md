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

### 3) Viktiga endpoints (Foundation)
- `GET /healthz` (liveness)
- `GET /readyz` (readiness)
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/select-tenant` (om användaren har flera tenants)
- `POST /api/v1/auth/switch-tenant` (inloggad OWNER/STAFF, byter tenant utan ny login)
- `GET /api/v1/auth/me`
- `GET /api/v1/auth/sessions` (OWNER/STAFF, scope=`me|tenant`, tenant-scope endast OWNER)
- `POST /api/v1/auth/sessions/:sessionId/revoke` (OWNER/STAFF, OWNER kan revoka tenantens sessioner)
- `POST /api/v1/auth/logout`
- `GET /api/v1/tenants/my` (OWNER/STAFF, lista egna tenants)
- `POST /api/v1/tenants/onboard` (OWNER, skapa/onboard tenant + owner)
- `GET /api/v1/tenants/:tenantId/access-check` (tenant isolation check)
- `GET /api/v1/users/staff` (OWNER)
- `POST /api/v1/users/staff` (OWNER)
- `PATCH /api/v1/users/staff/:membershipId` (OWNER)
- `GET /api/v1/monitor/status` (OWNER/STAFF)
- `GET /api/v1/ops/state/manifest` (OWNER)
- `GET /api/v1/ops/state/backups` (OWNER)
- `POST /api/v1/ops/state/backup` (OWNER)
- `POST /api/v1/ops/state/backups/prune` (OWNER, dry-run eller apply)
- `POST /api/v1/ops/state/restore` (OWNER, dry-run + restore med confirmText)
- `GET /api/v1/audit/events` (OWNER/STAFF)

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
- `smoke:public` läser även owner-credentials från lokal `.env` om env-variabler inte skickas in.
- Om login misslyckas i public smoke: synka owner-credentials i Render och kör igen.

4) Mail-baserade mallutkast (när export finns):
- `npm run ingest:mails -- --input ./mail-exports --brand hair-tp-clinic`
- `npm run mail:seeds:preview`
- `npm run mail:seeds:apply`

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
- Template lifecycle i UI:
  - create template
  - list templates/versions
  - generate draft (AI), save draft, evaluate
  - activate/archive/clone version
- Staff management i UI:
  - skapa/uppdatera staff (`POST /api/v1/users/staff`)
  - enable/disable staff (`PATCH /api/v1/users/staff/:membershipId`)
- Session management i UI:
  - lista sessioner (`GET /api/v1/auth/sessions`)
  - avsluta session (`POST /api/v1/auth/sessions/:sessionId/revoke`)
- Monitor-panel i UI:
  - driftstatus, minne, datastores och tenant-KPI (`GET /api/v1/monitor/status`)
- Ops backup-panel i UI (OWNER):
  - state manifest (`GET /api/v1/ops/state/manifest`)
  - skapa backup (`POST /api/v1/ops/state/backup`)
  - lista backups (`GET /api/v1/ops/state/backups`)
  - prune backups (`POST /api/v1/ops/state/backups/prune`)
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
 - Pilot report-panel i UI:
   - generera KPI-rapport per tidsfönster

## Steg 4: Risk Calibration (tenant-styrd)
- Risk settings API:
  - `GET /api/v1/risk/settings`
  - `PATCH /api/v1/risk/settings` (OWNER)
- Risk lab API:
  - `POST /api/v1/risk/preview` (OWNER/STAFF)
- Risk calibration API:
  - `GET /api/v1/risk/calibration/suggestion` (OWNER/STAFF)
  - `POST /api/v1/risk/calibration/apply-suggestion` (OWNER)
- Policy floor API:
  - `GET /api/v1/policy/floor` (OWNER/STAFF)
- Tenantens `riskSensitivityModifier` appliceras nu i template-riskutvärdering (generate/update/evaluate).

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

Katalog styrs av:
- `ARCANA_BACKUP_DIR` (default: `./data/backups`)
- `ARCANA_BACKUP_RETENTION_MAX_FILES` (default: `50`)
- `ARCANA_BACKUP_RETENTION_MAX_AGE_DAYS` (default: `30`)

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
