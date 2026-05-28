---
owner: Ops
status: active
---

# Handoff: Codex ↔ GitHub ↔ Cursor/ChatGPT

Praktisk referens när arbetet flyttas mellan Codex (Mac Studio), GitHub och andra agenter.

## Source of truth

| | |
|---|---|
| **Repo** | `~/Code/major-arcana` |
| **Remote** | https://github.com/Fazliilzaf/major-arcana |
| **Branch** | `main` |
| **Prod** | https://arcana.hairtpclinic.se (Render auto-deploy efter push) |
| **CI** | GitHub Actions — workflow `arcana-ci` |
| **Post-deploy** | `arcana-post-deploy-heal` (kräver GitHub secret `RENDER_API_KEY`) |

**Deploy-drift:** Blueprint-sync-lag eller prod-commit mismatch är **icke-blockerande** — `wait-for-render-blueprint-sync.sh` och deploy-wait avslutar med `::warning::` och heal fortsätter med env-restore + `readyz`. Hard fail endast vid blueprint sync `failed` eller `readyz` timeout efter heal.

**Använd inte** iCloud-sökvägen `~/Library/Mobile Documents/.../Major Arcana 2.0` för git, npm eller Stryker. Den stör sync och mutation-tester.

Rensa iCloud-kopior (`file 2.ext`): `npm run clean:icloud-duplicates -- "/path/to/iCloud/major-arcana"` (torrkörning: `DRY_RUN=1`).

Arkiv utanför repo: `~/Code/MA-Archive/` — kör `bash scripts/sync-sharepoint-archive.sh` (CODE-only, inga iCloud-sökvägar).

## Codex — starta session

```bash
cd ~/Code/major-arcana
git pull origin main
git status
```

Lokal server (CCO/CMO admin):

```bash
./start-cco-local.sh
# eller: bash ~/start-arcana.sh
```

| URL | Syfte |
|-----|--------|
| http://127.0.0.1:3100/major-arcana-preview/ | CCO preview |
| http://127.0.0.1:3100/admin | Admin (CMO, drift, …) |
| http://127.0.0.1:3100/admin#cmo-connectors | CMO connectors |

Port **3100** (inte 3000). Hård reload: `Cmd+Shift+R`.

## Commit och deploy

```bash
git add <filer>
git commit -m "kort varför-beskrivning"
git push origin main
```

Efter push:

1. Vänta på grön **arcana-ci** på GitHub
2. Render deployar prod automatiskt (~1–2 min)
3. **arcana-post-deploy-heal** återställer Render env från `render.yaml` (kräver secret `RENDER_API_KEY`)
4. Vid behov manuellt: `bash scripts/post-deploy-prod-heal.sh`

## Vad du ska skriva i handoff till nästa agent

Kopiera ungefär detta när du byter verktyg eller tråd:

```
Repo: ~/Code/major-arcana (GitHub main)
Senaste commit: <hash> — <meddelande>
Branch: main, synkad med origin
Lokal: port 3100, ./start-cco-local.sh
Prod: medvetet AV för CMO live connectors + live publish
Nästa: <konkret uppgift>
Blocker: <om något>
```

## CMO rollout (kort status)

| Fas | Status | Not |
|-----|--------|-----|
| N — CI | Klar | arcana-ci smoke grön |
| O — prod connectors | Pausad | fixture i prod; inga live tokens |
| P — sandbox publish | Kod + E2E klar | `npm run demo:cmo-sandbox-publish:e2e` |
| Q/R | Delvis i kod | tenant config, health job, mutation |

Flaggor som ska vara **false** i prod tills go-live:

- `ARCANA_MARKETING_CONNECTORS_LIVE_FETCH=false`
- `ARCANA_MARKETING_PUBLISH_LIVE_ENABLED=false`

## Relaterade docs

- [`README.md`](../../README.md) — workspace + Codex-sektion
- [`LOCAL-PREVIEW.md`](../../LOCAL-PREVIEW.md) — snabb CCO-iteration
- [`cmo-v3-rollout-plan.md`](../strategy/cmo-v3-rollout-plan.md) — Fas N→R
- [`cmo-marketing-copilot-runbook.md`](cmo-marketing-copilot-runbook.md) — drift
- [`mac-studio-setup-sv.md`](mac-studio-setup-sv.md) — Mac Studio + Codex CLI

## Mac Studio / remote Codex

Om Codex körs på Mac Studio via SSH:

```bash
arcana-studio          # sync + Codex i repo på Studio
arcana-studio-doctor   # kontrollera repo, node, codex
```

Repo-sökväg på remote styrs av `ARCANA_MAC_STUDIO_REPO_PATH` (ska peka på `~/Code/major-arcana`).
