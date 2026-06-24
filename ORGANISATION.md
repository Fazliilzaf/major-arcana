# Major Arcana — Organisation & framdörr

> **Syfte:** en (1) startpunkt för repo:t. Är du ny eller känner att det är kaos —
> börja här. Den här filen flyttar ingenting och äger inget innehåll; den **pekar**
> till de kanoniska källorna som redan finns.

Senast strukturerad: 2026-06-24

---

## 0. Källa, regler & roller (läs detta först)

### Gemensam sanningskälla

> **Detta git-repo (`fazliilzaf/major-arcana`) är den ENDA gemensamma
> sanningskällan.** Det är det enda lagret som alla agenter når: Codex, Cloud
> Code, Cursor, Cloud/Claude web — och du.

```
            ┌─────────────────────────────────────────┐
            │   GitHub: fazliilzaf/major-arcana        │  ← ENDA delade källan
            │   📍 framdörr: ORGANISATION.md (denna)    │
            └───────────────────┬─────────────────────┘
        ┌──────────┬────────────┼────────────┬──────────┐
      Codex     Cloud Code    Cursor      Cloud/web      Du
     (lokalt)   (moln)       (lokalt)    (moln)       (GitHub+Mac)
       ~/Code/major-arcana  ─ via git push/pull ─  moln-klon
```

### Bygg-regel (gäller alla)

```
Bygg ALDRIG från iCloud.
Bygg BARA från GitHub-repot / ~/Code/major-arcana.
iCloud är arkiv/facit — inte arbetsrepo.
```

- **Aktiv kod + delat facit/spec/inventory/backlog/beslut** → här i repot.
- **Tunga/privata filer** (PPTX, gamla mockups, stora screenshots, exports,
  historik) → iCloud-arkivet. Repot **pekar** dit men bygger aldrig därifrån.
  (Cloud/Claude når inte iCloud.)

  **iCloud arkiv/facit-sökväg (endast lokalt på Mac):**
  ```
  /Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/
  ```

### Roller & ansvar

| Roll | Ansvar | Får INTE |
|------|--------|----------|
| **Du (owner)** | Beslutar verksamhet, design­riktning, data, scope. Godkänner beslutspunkter. | Behöva jaga detaljer — Codex lägger fram tydliga val. |
| **Codex** (projektledare) | Äger masterplan + CCO 100%-lista. Bryter ner mål, granskar Cloud Code/Cursor mot facit, bockar av när klart, stoppar fel. Håller källan ren. | Besluta själv — föreslår och väntar på ditt OK. |
| **Cloud Code** (bygg-agent) | Skriver kod, en sak i taget, egen branch + PR, stoppar efter PR för granskning. | Egna scope-beslut. Bygga vidare före godkänt. |
| **Cursor** (lokal kontroll) | Snabb filsökning, mapp-jämförelser, inventering, sanity checks. | Leda projektet / ta arkitektur- eller scope-beslut. |
| **Cloud / Claude web** (analys) | Sammanfattningar, presentationer, strategi, beslutsunderlag. | Styra kodflödet / vara "sanning" om repo/live utan verifiering. |

### Praktiskt flöde

1. Du säger målet.
2. **Codex** bryter ner det → exakt vad som ska göras.
3. **Cloud Code** bygger en avgränsad PR.
4. **Codex** granskar mot facit/backlog.
5. **Du** godkänner beslutspunkter.
6. **Cloud Code** mergar när godkänt.
7. **Codex** bockar av i CCO 100%-listan.

> Sammanfattat: **Codex leder · Cloud Code bygger · Cursor kontrollerar ·
> Cloud sammanfattar · Du beslutar.**

---

## 1. Börja här (läsordning)

| # | Vad | Fil |
|---|-----|-----|
| 1 | Nuläge / daglig avbockning | [`docs/strategy/PROJECT-CHECKLIST.md`](docs/strategy/PROJECT-CHECKLIST.md) |
| 2 | Samlad faslista (alla punkter) | [`docs/strategy/MASTER-TODO.md`](docs/strategy/MASTER-TODO.md) |
| 3 | Utrullning i 6 faser | [`docs/strategy/ROLLOUT-PLAN.md`](docs/strategy/ROLLOUT-PLAN.md) |
| 4 | Hela dokument-indexet | [`docs/major-arcana-index.md`](docs/major-arcana-index.md) |
| 5 | CCO (mail/operatör) aktivt index | [`docs/cco-active-index.md`](docs/cco-active-index.md) |
| 6 | Agent-/bidragsregler | [`AGENTS.md`](AGENTS.md) |
| 7 | Köra lokalt | [`LOCAL-PREVIEW.md`](LOCAL-PREVIEW.md) |

> När de här filerna säger olika saker gäller **PROJECT-CHECKLIST → MASTER-TODO**
> som sanningskälla. Resten är detaljer.

---

## 2. Var ligger saker? (repo-karta)

| Mapp | Innehåll |
|------|----------|
| `server.js` | **Legacy-monolit** (~14 000 rader, 414 routes). Ny kod ska INTE läggas här — se §4. |
| `src/` | All ny/modulär backend-kod (531 filer, 31 domäner: `routes/`, `agents/`, `billing/`, `infra/`, `ops/`, `clinic/`, `pos/`, `qms/` m.fl.). |
| `public/` | Frontend-assets och status-JSON som serveras direkt. |
| `scripts/` | Drift-, verifierings- och migreringsskript (`verify:*`, `run-*`, `sync-*`). |
| `tests/` | Test (node:test, Playwright). Konfig: `playwright*.config.js`, `stryker*.conf.json`. |
| `docs/` | All dokumentation (449 filer). Underindelning i §3. |
| `config/` | Körningskonfiguration (CCO-mallar, brand-overrides). |
| `data/`, `examples/`, `knowledge/`, `prompts/` | Referensdata, exempel, kunskaps-/promptbas. |
| `migration/`, `vendor/`, `tools/`, `bin/` | Migreringspaket, tredjepart, CLI-verktyg (`arcana-*`). |
| `artifacts/`, `uploads/` | Genererad output / uppladdningar (inte källkod). |

---

## 3. docs/ — så är den indelad

| Underkatalog | Vad |
|--------------|-----|
| `docs/strategy/` | Checklista, master-todo, rollout, masterplaner — **start här**. |
| `docs/ops/` | Drift, runbooks, aktiveringsbevis. |
| `docs/architecture/` + `docs/adr/` | Arkitektur och arkitekturbeslut (ADR). |
| `docs/handover/` | Överlämningar, order-mallar, V11/V12-rail-canon. Inkl. `developer-handover-complete.md`. |
| `docs/design-specs/`, `docs/uiux/` | Design- och UI/UX-specar. |
| `docs/security/`, `docs/risk/`, `docs/legal/` | Säkerhet, risk, juridik. |
| `docs/migration/`, `docs/schema/` | Migrering och dataschema. |
| `docs/reference/`, `docs/a11y/`, `docs/wordpress/` | Referens, tillgänglighet, WP-integration. |
| `docs/archives/` | Fryst historik — rör ej, läs bara. |

---

## 4. server.js — refaktorplan (utförs separat, inte i denna PR)

`server.js` är 14 024 rader med 414 route-definitioner. `src/routes/` finns redan
och är dit vi flyttar. **Inkrementell** plan — ingen big-bang:

1. **Frys monoliten.** Ingen ny route läggs i `server.js`. All ny route → `src/routes/`.
2. **Karaktärisera.** Säkerställ E2E/route-test täcker de stora flödena innan flytt
   (`tests/`, `playwright.config.js`) så regressions fångas.
3. **Flytta domän för domän.** Plocka en sammanhängande grupp routes (t.ex. mail,
   billing, pos), flytta till `src/routes/<domän>.js`, montera via `app.use(...)`.
   En domän = en PR = grönt test innan nästa.
4. **Dela ut hjälpare** till `src/lib/` / `src/infra/` allteftersom de flyttar.
5. **Krymp monoliten** tills `server.js` bara är bootstrap + montering av routern.

> Varje steg ska vara liten, testad och reversibel. Detta är medvetet **inte** med
> i städnings-PR:en eftersom det rör driftkritisk kod.

---

## 5. Vad denna städning gjorde

- Tog bort 4 oavsiktliga tomma skräpfiler i roten (`Mail.Read`,
  `arcana-staging.onrender.com`, `arcana.hairtpclinic.se`,
  `privaterelay.appleid.com` — råkade `>`-omdirigeringar, ej spårade).
- Flyttade `developer-handover-complete.{md,html}` → `docs/handover/`.
- Lade till den här framdörren (`ORGANISATION.md`) inkl. §0: gemensam
  sanningskälla, "bygg aldrig från iCloud"-regeln och agent-rollerna
  (Codex leder · Cloud Code bygger · Cursor kontrollerar · Cloud sammanfattar ·
  Du beslutar).

Inget innehåll skrevs om och ingen källa förstördes.
