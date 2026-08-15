# VAR LIGGER ALLT — karta för agenter (repo + externa ytor)

> Syfte: en agent som bara ser detta repo (VS Code/Cursor/Claude/annan) ska
> härifrån hitta ALLT projektet består av. Spegel av iCloud-dokumentet med
> samma namn. Inga hemligheter i denna fil — bara VAR saker ligger.

## 1. Koden (detta repo)

- GitHub: `Fazliilzaf/major-arcana` · main = sanningen, squash-merges via PR.
- Lokalt: `~/Code/major-arcana` (delad arbetskopia — kolla `git status -sb`
  före commit; parallellt arbete i `git worktree`, aldrig mappkopior).
- Nyckelytor: `server.js` (monolit, FRYST — nya routes i `src/routes/`),
  `src/routes/cfo.js` (CFO/utgifts-API: dashboard, receipts, expenses, rules,
  suppliers, VAT, recurring, review exports, reports, periods),
  `src/routes/cm.js` (mail-/kvittointag: dashboard, inbox, promote → CFO),
  `src/cm/` (mail-sync, AI-extraktion, handoff till CFO),
  `src/cfo/` (utgiftslivscykel, regler, Fortnox, rapporter),
  `src/security/` (auth/RBAC), `src/ops/` (scheduler, diskguard, stores),
  `public/finance.html` (CFO-ytan), `public/admin` (ägar-UI).
- Regler och arbetssätt: `AGENTS.md`, `ORGANISATION.md`,
  `docs/agent-koordinering.md`, `.cursor/rules/`.

## 1b. CM ↔ CFO gränssnitt (viktigt att inte duplicera)

- CM (`src/routes/cm.js`) äger **intag**: mail-sync, OCR, AI-extraktion,
  klassificering, dubblettdetektion. CM kan **promota** en kandidat till CFO
  via `POST /api/v1/cm/expense-records/:id/promote`.
- CFO (`src/routes/cfo.js`) äger **livscykeln därefter**: godkännande,
  avvisande, kategorisering, leverantörslänkning, momsregler, export,
  bokföringsperioder, revisorgranskning, Fortnox-voucher-sync.
- CM har **inte** längre egna approve/reject/export-endpoints för
  expense-records — det finns nu enbart i CFO. CM kan fortfarande bulk-rejecta
  icke-promoterade kandidater (`POST /api/v1/cm/bulk` med `action: 'reject'`)
  och markerar för-bokförda mail (`markExported`) internt.
- UI: `public/finance.html` pratar med både `/api/v1/cm/*` (intag/promote) och
  `/api/v1/cco-cf/*` (CFO-arbetsyta).

## 2. Ordersystemet (vad som beställts, byggts, återstår)

- `docs/handover/ORDERS/` — ORD-N-filer = kanoniska beställningar/leveranser.
  Kolla ALLTID högsta befintliga nummer + Notion innan nytt nummer tas
  (kollisioner har hänt; webbordrar har egen WEB-N-serie).
- Notion: databasen **Order Inbox** (status pending/cursor-in-progress/
  claude-in-progress/awaiting-fazli/done). Åtkomst via Notion-MCP
  (Claude/Cowork) eller Notion-appen — INTE nåbar från repo-lokala agenter;
  spegla beslut hit som ORD-filer.
- Beslut/strategi: `docs/strategy/` (t.ex. `CFO-CM-NULAGE-OCH-PLAN-*.md`,
  `AI-OCR-POLICY-BESLUT-*.md`, `CF9-KONTOPLAN-FORSLAG-*.md`), MASTER-TODO.

## 3. Design och underlag (iCloud — nås EJ från repo-agenter)

- iCloud Drive-mappen **"Major Arcana 2.0/"** — AKTIV designmapp (rör ej
  strukturen). Börja i `00-VAR-LIGGER-ALLT.md`; CFO-underlag i `04 · CFO`,
  CM-underlag i `06 · CM`.
- Kanoniska UI-facit ligger dock I repot: `public/major-arcana-preview/`
  (t.ex. `cco-demo.html` = Välkommen-mallen, v9/v10-facit för Kunder-vyn).
- Behöver en repo-agent något ur iCloud: be ägaren/Claude-agenten kopiera in
  det till `docs/reference/`.

## 4. Drift (Render)

- Prod: **arcana.hairtpclinic.com** — Render-tjänst `arcana`,
  `srv-d8b3i3tckfvc73clgeng`, Frankfurt. Persistent disk: `/var/data`
  (stateRoot — alla JSON-stores). Hälsa: `/readyz`.
- CEO-agenten: separat tjänst `arcana-ceo-agent`
  (`srv-d8k8l71kh4rs73bb031g`) — CEO-nycklar dit, lätt att ta fel tjänst.
- Env-variabler: ENDAST i Render dashboard → Environment (ägaren lägger in
  hemligheter; agenter refererar bara namn). Env-ändring kräver DEPLOY,
  inte restart. Blueprint-autoSync är PAUSAD (render.yaml).
- Deploy: push till main → auto-deploy (~5–8 min). Verifiera att deployen
  är LIVE innan prod-test — instans-churn ger gamla svar.

## 5. Externa integrationer (var kopplingarna bor)

- **Fortnox**: OAuth service-konto (Client ID i Render env `FORTNOX_*`);
  status: `GET /api/v1/cco-fortnox/status`. Skarp voucher-sync gated bakom
  `ARCANA_CFO_FORTNOX_VOUCHER_SYNC_ENABLED` + revisor-dryRun.
- **Microsoft Graph** (M365-tenanten hairtpclinic.com): mail-läsning för
  kvitto@/kons@/fazli@ via `src/infra/microsoftGraphReadConnector.js`.
  OBS: normaliserade meddelanden bär `graphMessageId` (inte `id`) och
  imid lagras UTAN vinkelparenteser.
- **one.com IMAP** (info@fazli.se — UTANFÖR M365): `src/cm/cmImapSync.js`,
  env `CM_IMAP_*` (ORD-73).
- **Pipedrive**: kund/LTV-koppling (`renderPipedriveSection`, ORD-serien).
- **OpenAI**: kvitto-extraktion (gpt-4o-mini). Policy: leverantörsunderlag
  OK — patientdata går ALDRIG till extern AI.

## 6. Vem gör vad

- **Cursor**: primär write-agent (egna grenar, Bugbot-review på PR).
- **Claude (Cowork)**: write + prod-verifiering + UAT + browser-styrning +
  incidenthantering; bär projektminne mellan sessioner (Cowork-utrymmet).
- **Fazli (ägare)**: alla beslut, allt som rör lösenord/inloggningar,
  godkännanden (promote→godkänn→export är alltid mänskligt).
- Handover-protokoll: "skapa order" = ORD-fil + Notion Order Inbox +
  kort copy-paste till mottagande agent.

## 7. Snabbstart för en NY agent

1. Läs `AGENTS.md` + `ORGANISATION.md` + denna fil.
2. `git log --oneline -20` — main rör sig fort; det du tänker bygga kan
   redan vara byggt (kolla ORDERS + `docs/strategy/` + grep i `src/`).
3. Jobba på egen gren via worktree, committa tidigt, PR med tester.
4. Rör aldrig: journal/feed/forms-routes i `server.js`, andras WIP-filer,
   `~/Code`-strukturen, hemligheter.
