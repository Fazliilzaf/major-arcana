# ONBOARDING — karta för en ny agent

> Syfte: låt en ny agent (eller människa) förstå **var allt finns** och **hur man
> sätter sig in** utan att försöka läsa hela kodbasen. Major Arcana är inte
> längre ett repo — det är en produkt utspridd över flera repos.

---

## 1. Repo-kartan (hela Major Arcana)

| Repo                                     | Vad det är                                                                                                                                                                         | Stack           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **Fazliilzaf/major-arcana** (detta repo) | **Kärnan** — CCO staff-/klinik-operativa appen: konversationer, kundkort, kalender (v8), finans/CFO-segment, säkerhet/RBAC. Preview-appen ligger i `public/major-arcana-preview/`. | Node/JS         |
| **Fazliilzaf/hairtpclinic-web**          | Publika marknadswebben **hairtpclinic.com** + AI-chat + Hair Analyzer                                                                                                              | Next.js 15 / TS |
| **Fazliilzaf/curatiio-web**              | Andra klinikens publika webb — **Curatiio**, Göteborg                                                                                                                              | Next.js 15 / TS |
| **Fazliilzaf/arcana-ceo-agent**          | **CEO-agenten** (Studio, agent-roster, Chief of Staff). Live på Render. Default-branch `master`.                                                                                   | TS              |
| **Fazliilzaf/major-arcana-clinic-chat**  | Liten/gammal klinik-chat-komponent (ej rörd sedan april) — troligen extraherad/utfasad                                                                                             | JS              |

> `Fazliilzaf/Alison` är **inte** en del av Major Arcana (separat blogg-/Medium-projekt).

**Viktigt om sessioner:** en Claude Code-webbsession är scope:ad till **ett**
repo. För att täcka flera → en session per repo, eller klona alla lokalt och
kör Claude Code i en förälder-mapp.

---

## 2. Läs INTE allt — läs kanon-dokumenten

Detta repo är ~2 000+ kod/doc-filer. Att läsa "all text" sekventiellt ryms inte
i kontext och är slöseri. Onboarda via dokumenten nedan + **riktad sökning**
(Grep/Glob) mot din faktiska uppgift.

### Läsordning för `major-arcana`

1. `README.md` — vad appen är + hur den körs.
2. `AGENTS.md` — arbetsregler för agenter i detta repo (läs FÖRST innan du ändrar).
3. `ORGANISATION.md` — kodens organisation (var saker bor, t.ex. `src/routes/`, `src/cfo/`).
4. `CCO-STATUS.md` — aktuell status för CCO-appen.
5. `docs/cco-active-index.md` — index över aktiva CCO-spår.
6. `docs/handover/` — färska handoffs (t.ex. `CCO-CALENDAR-V8-HANDOFF.md`, `ORD-25E-P0-REFERENS-FACIT.md`).
7. `docs/architecture/` + `docs/adr/` — arkitektur och beslutslogg.
8. `.cursor/rules/*.mdc` — **bindande regler** (18 st). Särskilt:
   - `svenska-sprak.mdc` — all UI-text på svenska.
   - `prod-verify-before-user.mdc` — verifiera mot prod innan du säger "klart".
   - `cco-no-drive-links-import-only.mdc` — Drive/Meridiq är källor, inte destinationer.
   - `cco-performance.mdc`, `cco-adaptive-layout.mdc`, `cco-mobile-app-shell.mdc`.

### Sök i stället för att läsa

- Hitta en funktion/komponent: `Grep` på symbol/sträng (t.ex. en UI-etikett).
- Frontend-appen: `public/major-arcana-preview/app/*.js` (stora IIFE-moduler).
- Server/API: `src/routes/*.js`, stores i `src/ops/*.js`, finans i `src/cfo/*.js`,
  säkerhet i `src/security/*.js`.

---

## 3. Kör & verifiera lokalt (major-arcana)

```bash
npm ci
npm run dev:offline        # startar utan externa beroenden (fallback-AI, ingen graph)
npm test                   # = test:unit, node --test över tests/**
npm run check:syntax       # syntaxkoll av src/scripts/public
npm run check:requires     # inga trasiga require/import-sökvägar
node ./bin/build-bundle.js && node ./bin/inject-bundle.js   # bygg om preview-bundlen
node ./bin/check-bundle-fresh.js                            # verifiera bundle-fräsch
```

> Bundlade JS-artefakter (`public/major-arcana-preview/app.bundle.*.min.js`) är
> **gitignorerade** och byggs av CI/`ensure-bundle`. `index.html` innehåller
> content-hash-referenser — bygg om bundlen efter ändring i `public/.../app/`.

> Kundvyn/CCO-workspace renderar **inte** meningsfullt offline utan autentiserad
> data (workspace-API svarar 503). Full live-verifiering kräver staging/prod.

---

## 4. Onboarding per övrigt repo

De tre web-/agent-repona (Next.js/TS) och CEO-agenten följer samma princip:
öppna repo-roten och läs `README.md`, ev. `AGENTS.md`/`CLAUDE.md` och
`.cursor/rules/` först — sedan riktad sökning. CEO-agenten (`arcana-ceo-agent`)
körs live på Render; verifiering av providers (OpenAI/Anthropic) i Studio görs i
den appen efter inloggning + via Render-loggar, inte härifrån.
</content>
