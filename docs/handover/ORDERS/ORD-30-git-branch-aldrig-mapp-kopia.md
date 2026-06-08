# ORD-30 — Agentregel: git branch/worktree, aldrig mapp-kopia

**Skapad:** 2026-06-07 (Claude · mappstädningen)
**Assignee:** Cursor (write — AGENTS.md i alla tre aktiva repon)
**Claude-spår:** Verifiering efter commit (regel på plats + lint av befintliga kopior)
**Prio:** P1

---

## Bakgrund

Mappstädningen 2026-06-05–07 hittade **fyra** versionslösa repo-kopior i `~/Code` skapade av agenter: `major-arcana-cco-next`, `major-arcana-hydration`, `hairtpclinic-web-capi`, `hairtp-garanti`. En av dem (`-capi`) innehöll omergeat produktionsarbete (Meta CAPI-route, seo.ts, assets) som höll på att gå förlorat — det krävdes manuell diff-forensik och en handover (`HANDOVER-meta-capi-merge.md`) för att rädda det. `hairtp-garanti` föddes **två dagar efter** städningen — mönstret återskapar sig självt utan en regel.

## Uppgift

Lägg till följande block i `AGENTS.md` (förslagsvis direkt efter **## Preservation rule**) i:

1. `major-arcana`
2. `hairtpclinic-web`
3. `curatiio-web`

(Saknar repot `AGENTS.md` — skapa en minimal fil med enbart detta block.)

```markdown
## Working-copy rule (no folder forks)

- NEVER duplicate this repo, or any part of it, into a sibling folder
  (`*-copy`, `*-next`, `*-hydration`, feature-named folders) to do work.
- All work happens on a git branch. Need a parallel checkout? Use
  `git worktree add` — never `cp -r`. If it is not in git, it does not exist.
- Scratch experiments live in `git stash`, a branch, or `/tmp` — never as
  an untracked folder copy in `~/Code`.
- If you encounter an untracked folder copy: STOP. Report it, merge anything
  unique back via branch + PR, then move the folder to `~/Code/_archive/`.
```

## Acceptans (Claude UAT)

- [x] Blocket finns ordagrant i `AGENTS.md` i alla tre repon — md5-identiskt med ordern (`8c3655d5…`) ✅
- [x] Commit refererar ORD-30: `7564976d` (major-arcana) · `650a4d9` (hairtpclinic-web) · `bb88764` (curatiio-web), endast AGENTS.md rörd, allt pushat ✅
- [x] `ls ~/Code` rent: bara de tre repona + `_archive/` ✅

## Status

| Fas                          | Status                 |
| ---------------------------- | ---------------------- |
| Order skapad (repo + Notion) | KLAR 2026-06-07        |
| Cursor: regel incheckad ×3   | KLAR 2026-06-07        |
| Claude UAT                   | **GODKÄND 2026-06-07** |

**ORDER STÄNGD.**
