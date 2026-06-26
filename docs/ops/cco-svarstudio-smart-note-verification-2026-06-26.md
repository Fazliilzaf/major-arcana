# Verifiering — Svarstudio + Smart anteckning (daglig motor)

Datum: 2026-06-26
Yta: `public/major-arcana-preview/cco-svarstudio-v3.html`
Branch: `claude/exciting-bohr-htbrwm`

Verifiering enligt den 15-punktslista som beställdes innan vi går vidare till
Senare/Skickat. Allt grönt. Bevis nedan: backend via `node --test`, UI via
Playwright (Chromium, `file://`, overflow = `documentElement.scrollWidth -
clientWidth`).

## Sammanfattning

- Backend: **36/36 pass** över 5 sviter (inkl. ny synlighets-rejektionstest).
- UI: **27/27 pass** över 390 / 768 / 1024 / 1440.
- Live-utskick är **hårt blockerat** (owner-mandat) i både backend och UI.

## Checklista → bevis

| # | Punkt | Lager | Bevis |
|---|-------|-------|-------|
| 1 | Snabbmall ändrar utkast | UI | `1 snabbmall ändrar utkast` — send_pricing skriver om editor (DHI-text) |
| 2 | Responsspår ändrar utkast | UI | `2 responsspår ändrar utkast` — medical-spår → "behandlare"-text |
| 3 | Tonfilter skriver om | UI | `3 tonfilter skriver om` — warm → "så fint att höra" |
| 4 | Finjustering (Kortare/Skarpare) | UI | `4a finjustera kortare ändrar utkast`, `4b finjustera skarpare` (lägger "Åtgärd krävs") |
| 5 | Policy block / varning / ok | UI | `5 policy block (tomt)`, `5 policy warn (bokning utan tid)`, `5 policy ok`, `5 policy review (medicinsk hälsodata)` |
| 6 | Skapa utkast (status draft) | Backend | ccoCommDraft: `utkast: skapa → patch → needs_approval → approved → queued` |
| 7 | Draft state-machine | Backend | ccoCommDraft state-transitions pass |
| 8 | Godkännande / segregation of duties | Backend | ccoCommDraft RBAC/approval pass |
| 9 | Live-send 403 (owner-mandat) | Backend + UI | Backend: `LIVE-utskick (→ sent) är hårt blockerat`; UI: `LIVE-utskick hårt blockerat` (notice: "owner-mandat") |
| 10 | reply-later / handled | Backend | ccoConversationAction(Gateway): `actionState='reply_later'`, `handled sätter needsReplyStatus handled` |
| 11 | Smart anteckning mode-picker öppnas | UI | `11 smart anteckning mode-picker öppnas` — 4 lägeskort |
| 12 | Mode-picker → arbetsyta (prefill) | UI | `12 mode→shell (ai-summary prefill)` |
| 13 | Note-store upsert/normalisering | Backend | ccoNoteStore 8/8 |
| 14 | Synlighet: medicinsk/intern/betalning ≠ all_operators | Backend + UI | Backend: `note-visibility: medicinsk/intern/betalning kan inte bli all_operators`; UI: `medicinsk saknar all_operators` + `kundprofil har all_operators` |
| 15 | UI overflow = 0 (desktop + surfplatta + mobil) | UI | `15a–15g` overflow=0 på 390/768/1024/1440 för inbox, studio, mode-picker, note-shell |

## Extra grönt (utöver listan)

- `medical-tråd inferrar track=medical` — spår härleds från trådens taggar.
- `medical → REK medicinsk dest` — rekommenderad sparplats följer spåret.
- `note spara → ok` — DEMO-spar bekräftar synlighetsvalidering före POST.

## Körningar

```
node --test tests/routes/ccoCommDraft.test.js tests/ops/ccoNoteStore.test.js \
  tests/routes/ccoWorkspace.test.js tests/routes/ccoConversationAction.test.js \
  tests/routes/ccoConversationActionGateway.test.js
# tests 36 / pass 36 / fail 0

node scratchpad/verify-svarstudio.mjs   # Playwright
# ===== 27/27 PASS =====
```

## DEMO-läge / dataflagga

Ytan kör med `DEMO`-flagga PÅ som default (toggle i toppbaren). I DEMO fejkas
svaren från de riktiga endpoints utan nätverk; live-utskick är ändå hårt
blockerat. Med flaggan AV anropas de verkliga kontrakten:
`/cco-comm/drafts`, `/cco-comm/drafts/:id/transition`,
`/cco-comm/drafts/generate-reply`, `/cco-workspace/notes`,
`/cco-workspace/notes/validate-visibility`. Datakoppling ligger alltså bakom
flagga enligt beslut 5.
