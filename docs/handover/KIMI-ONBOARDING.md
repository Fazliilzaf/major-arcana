# Kimi Onboarding — Major Arcana / CCO

Version: 1.0  
Datum: 2026-08-27  
Ägare: Fazli Krasniqi  
Målgrupp: Kimi (Moonshot) som extern kod-/review-agent parallellt med Cursor och Claude

---

## 1. Syfte

Detta dokument beskriver **hur Kimi får åtkomst till projektet**, vad Kimi får göra, och vad som är förbjudet.

Kimi har **ingen automatisk koppling** till Cursor eller GitHub. Åtkomst sker via:

- lokal git-klon på samma maskin, eller
- Kimi Code med projektmapp som workspace, eller
- uppladdade filer / ORD-handover i Kimi Chat (begränsat scope)

**Sanning i kod:** repot `major-arcana`.  
**Sanning i uppdrag:** `docs/handover/ORDERS/ORD-*.md` + Notion Order Inbox.

---

## 2. Snabbstart (lokal utveckling)

### 2.1 Klona repot

```bash
git clone git@github.com:<org>/major-arcana.git
cd major-arcana
git checkout main
git pull
```

Parallellt arbete utan mapp-kopia:

```bash
git worktree add ../major-arcana-kimi feature/kimi-ord-NNN
```

**Förbjudet:** duplicera repot till `major-arcana-copy`, `*-next`, etc. Se `AGENTS.md`.

### 2.2 Miljö (offline / säker default)

```bash
cp .env.example .env
```

Minimum för lokal körning utan externa tjänster:

```env
ARCANA_AI_PROVIDER=fallback
ARCANA_DEFAULT_TENANT=hair-tp-clinic
ARCANA_OWNER_EMAIL=owner@hairtpclinic.se
ARCANA_OWNER_PASSWORD=ArcanaPilot!2026
PORT=3100
PUBLIC_BASE_URL=http://localhost:3100
ARCANA_GRAPH_READ_ENABLED=false
ARCANA_GRAPH_SEND_ENABLED=false
ARCANA_STATE_ROOT=./data
```

Starta offline:

```bash
npm ci
npm run dev:offline
```

Nyttiga URL:er lokalt:

| Yta                | URL                                           |
| ------------------ | --------------------------------------------- |
| CCO operatör       | `http://localhost:3100/major-arcana-preview/` |
| Admin / CCO iframe | `http://localhost:3100/admin#cco`             |
| Health             | `GET /healthz`, `GET /readyz`                 |

### 2.3 Obligatorisk verify efter kodändring

```bash
npm run check:syntax
npm run lint:no-bypass
npm run test:unit
ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local
```

Order-specifika verify finns i respektive ORD (t.ex. `npm run verify:ord47-prod-sticks`).

---

## 3. Hur Kimi tar emot uppdrag

### 3.1 Handover-protokoll

Se `docs/handover/README.md`:

1. Fazli ber Claude skapa order → `docs/handover/ORDERS/ORD-NNN-*.md`
2. Fazli säger till Kimi: **"Kör ORD-NNN"** (eller klistrar in ORD-filen)
3. Kimi läser order → inventerar → implementerar → rapporterar i ORD-filen
4. Fazli granskar branch/commit innan merge till `main`

Mall för nya ordrar: `docs/handover/ORDER-TEMPLATE.md`.

### 3.2 Inventering före ny kod (obligatoriskt)

Innan Kimi påstår att något "saknas" eller bygger nytt:

| Källa            | Var                                                 |
| ---------------- | --------------------------------------------------- |
| ORD / handover   | `docs/handover/ORDERS/`                             |
| Strategi / facit | `docs/strategy/`, `docs/handover/V13-*`             |
| Kod              | `src/`, `public/`, `scripts/`                       |
| Verify           | `tests/`, `npm run verify:*`, `scripts/verify-*.js` |

Rapportera kort:

| Del     | Finns?      | Var       | Gap |
| ------- | ----------- | --------- | --- |
| Backend | hel/del/nej | fil/route | …   |
| UI      | hel/del/nej | fil       | …   |
| Verify  | hel/del/nej | script    | …   |

Bygg **endast gapet** — duplicera inte parallell logik som redan finns.

### 3.3 Assignee i ORD

I `ORDER-TEMPLATE.md` står assignee som `cursor | claude | both`.  
För Kimi-uppdrag ska ordern explicit säga:

```markdown
**Assignee:** kimi
```

Om assignee säger `cursor` ska Kimi **inte** implementera utan owner-omdirigering.

---

## 4. Agent-separation (viktigt)

Flera agenter jobbar parallellt. Blanda inte scope utan explicit GO från Fazli.

| Agent        | Typiskt scope                                                 |
| ------------ | ------------------------------------------------------------- |
| **Cursor**   | Migration, import/assets, Aisia/Kamera (pausat), infra        |
| **Claude**   | CCO produkt-UI, kalender, kommunikation, ORD-skapande         |
| **Kimi**     | ORD med `Assignee: kimi`, review, avgränsade backend/UI-fixar |
| **Kimi CMO** | Marknad — separat skill, se §6                                |

**Pausade spår (ingen kod utan owner-GO):**

- Aisia/scalpanalys: kräver `APPLY AISIA TO CCO` eller `START AISIA FAS 2`
- Webb-bokning mot live Cliento/CCO: `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false` tills sign-off

---

## 5. Säkerhet och compliance (icke-förhandlingsbart)

### 5.1 Får aldrig committas till GitHub

- journaler, patientnamn, personnummer
- signerade avtal, ifyllda hälsodeklarationer
- patientbilder, råa patient-PDF:er
- mailbox-innehåll med PII, `data/reports/*` med stickprov
- `.env` med riktiga nycklar

### 5.2 Får aldrig skickas till extern AI (inkl. Kimi Chat)

- journalinnehåll
- patientidentifierande data
- patientbilder / Aisia-export från klinik

Kimi får läsa **kod, schemas, mallar och anonymiserade fixtures** — inte produktions-`data/`.

### 5.3 Prod-verify före "testa hos Fazli"

Kimi ska köra relevant `npm run verify:*-prod` eller motsvarande **själv** innan Fazli ombeds testa på prod/iPhone.

### 5.4 Brand-isolation

- **Hair TP Clinic** och **Curatiio** — separata kundresor, samtycken och kommunikation
- Blanda aldrig varumärken i samma mall

---

## 6. Viktiga kodytor (orientering)

| Område              | Startfiler                                                                             |
| ------------------- | -------------------------------------------------------------------------------------- |
| Server / routes     | `server.js`, `src/routes/`                                                             |
| CCO stores          | `src/ops/cco*.js`                                                                      |
| Staff / kundkort UI | `public/major-arcana-preview/`, `public/cco-kundkort-referens.js`                      |
| Kundkort facit      | `docs/handover/ORD-25E-P0-REFERENS-FACIT.md`, `.cursor/rules/kundkort-referens-ux.mdc` |
| Workflow V13        | `docs/workflow/cco-workflow-v13.md`, `src/ops/ccoAutomationRegistry.js`                |
| Config / flags      | `src/config.js`, `.env.example`                                                        |
| Tester              | `tests/`                                                                               |
| Agent-regler        | `AGENTS.md`, `.cursor/rules/`                                                          |

CCO operatörs-UI ligger ofta i **iframe** under `/admin#cco` — se `ORDER-TEMPLATE.md` om runtime-mätning.

---

## 7. Kimi CMO (separat spår)

Marknadsagenten är **inte** samma som utvecklings-Kimi.

Handover: `docs/strategy/marketing-agent-handover.md`  
Skill (lokal): `~/.kimi-code/skills/major-arcana-marketing-agent/SKILL.md`

CMO jobbar mot utkast och webbrepon — inte mot journal eller patientdata.

---

## 8. Kimi Code — rekommenderat arbetssätt

Om Kimi Code används lokalt:

1. Öppna mappen `~/Code/major-arcana` (eller worktree)
2. Läs `AGENTS.md` + aktuell `ORD-NNN`
3. Skapa branch: `feature/kimi-ord-NNN-kort-beskrivning`
4. Implementera minimal diff
5. Kör verify (§2.3)
6. Committa med conventional commits (t.ex. `fix(cco): …`)
7. Rapportera i ORD-filen under **Rapport** — Fazli mergar

**Push/PR:** endast när Fazli ber om det.

---

## 9. Kimi Chat (utan full repo)

När Kimi bara får filer i chat:

- Bifoga ORD + de filer ORD listar under Scope
- Ange bas-commit: `git rev-parse --short HEAD`
- Be Kimi returnera patch/diff eller exakta filändringar
- Fazli eller Cursor applicerar och kör verify

Chat-läge räcker för review och små fixar — **inte** för stora refactors utan lokal verify.

---

## 10. Första uppdrag för ny Kimi-session

Klistra detta som startprompt:

```
Du jobbar i repot major-arcana (Hair TP / Curatiio CCO).

Läs först:
1. docs/handover/KIMI-ONBOARDING.md
2. AGENTS.md
3. docs/handover/ORDERS/ORD-NNN-*.md (aktuell order)

Regler:
- Inventera innan du bygger nytt
- Minimal diff, inga mapp-kopior
- Ingen patientdata, ingen prod-aktivering utan GO
- Kör verify och rapportera PASS/FAIL

Uppdrag: [ORD-NNN eller fri text från Fazli]
Bas-branch: main
```

---

## 11. Relaterade dokument

| Dokument                                       | Syfte                 |
| ---------------------------------------------- | --------------------- |
| `docs/handover/README.md`                      | Order-protokoll       |
| `docs/handover/ORDER-TEMPLATE.md`              | Ny ORD-mall           |
| `docs/handover/developer-handover-complete.md` | Bred teknisk översikt |
| `docs/strategy/CUTOVER-PLAN-CCO-MASTER.md`     | Journal cutover P0    |
| `docs/strategy/marketing-agent-handover.md`    | Kimi CMO only         |

---

_Skapad: 2026-08-27 · Uppdatera denna fil när Kimi-workflow ändras._
