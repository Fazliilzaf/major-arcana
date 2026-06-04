# ORD-20 — V9 feature-flag default ON

**Skapad:** 2026-06-04
**Owner-spår:** Cursor (write)
**Claude-spår:** UAT efter Cursor-deploy
**Blockerad av:** 2 veckors stabilitet på ORD-16 (idag = 2026-06-04, GO-datum tidigast = **2026-06-18**)
**Prio:** P2
**Status:** BLOCKED (väntar stabilitets-fönster)

---

## Bakgrund

ORD-16 v9-portering blev LIVE 2026-06-04 (commit `94c32886`, 12/12 verify PASS). Feature-flag default är `OFF` — användare måste tillägga `?v9=on` i URL för att se v9-design.

Per ORD-17 plan DEL C: **efter 2 veckor i prod utan rollback**, sätt default till `ON`. Behåll `?v9=off` som kill-switch i 4 ytterligare veckor.

---

## STABILITETSGATE (Cursor MÅSTE verifiera FÖRE ändring)

```bash
# 1. ORD-16 har varit live i ≥14 dagar
# (ORD-16 commit-datum = 2026-06-04; GO-datum = 2026-06-18)
TODAY=$(date +%Y-%m-%d)
[ "$TODAY" \>= "2026-06-18" ] || { echo "BLOCKED: $TODAY < 2026-06-18"; exit 1; }

# 2. Inga rollbacks i Render historik för srv-d8b3i3tckfvc73clgeng
render deploys list srv-d8b3i3tckfvc73clgeng | head -20

# 3. Verify-script stabilt PASS senaste 14 dagar
node scripts/verify-ord16-progress.js
```

Om gate failar: **STOPP**, rapportera blocker till owner, ändra inte flag.

---

## Scope (strikt)

### C.1 Default ON i `cco-v9-flag.js`

I `public/major-arcana-preview/app/cco-v9-flag.js`:

```js
// FÖRE:
var enabled = false;
try {
  enabled = localStorage.getItem(KEY) === '1';
} catch (_) {}

// EFTER:
var enabled = true; // ORD-20: default ON efter 2v stabilitet (2026-06-18)
try {
  // Bara avstängd om explicit ?v9=off → localStorage = '0'
  enabled = localStorage.getItem(KEY) !== '0';
} catch (_) {}
```

### C.2 Behåll `?v9=off` kill-switch

URL-flag-läsaren ska fortsätta sätta `localStorage` när `?v9=off` används, så användare kan tvångs-avstänga utan rollback.

### C.3 Update verify-script

`scripts/verify-ord16-progress.js` step 1 ("flag default off") ska byta till "flag default on".

### OUT OF SCOPE

- Radera flag-fil eller tokens-scoping (det är ORD-21 efter ytterligare 4 veckor)
- Mobile-shell flag-byte (cco-mobile-shell.js är separat)
- Memory-fil-update (Claude gör post-deploy)

---

## Acceptance Criteria

- [ ] Datum ≥ 2026-06-18
- [ ] cco-v9-flag.js default = true
- [ ] `?v9=off` fortfarande fungerar (verifierat manuellt)
- [ ] Verify-script uppdaterad + PASS
- [ ] UAT: öppna prod utan URL-parameter → v9-design syns
- [ ] UAT: öppna prod med `?v9=off` → legacy-design syns
- [ ] UAT: efter `?v9=off` → reload utan param → fortsatt OFF (localStorage sticky)
- [ ] Memory `project_v9_port_progress_2026_06.md` uppdaterad till "default ON"

---

## Risker + Mitigation

| Risk | Mitigation |
|---|---|
| Personal är vana vid legacy-design och blir förvirrade | Kommunicera change i Slack/email FÖRE deploy |
| Hidden bug bara upptäckt under default-ON-trafik | Kill-switch (`?v9=off`) finns; rollback via revert-commit |
| Personal-pilot pågår och kan störas av visuell ändring | **HARD GATE**: pilot-frys-status måste vara "no pilot active" |
| LocalStorage-sticky gör att avstängda användare missar fix-deploys | Dokumentera "rensa localStorage för att återgå till default" |

---

## När Cursor klar — Claude UAT

1. `curl -s https://arcana.hairtpclinic.com/major-arcana-preview/app/cco-v9-flag.js | grep "var enabled"` → förvänta `= true`
2. Browser-test: öppna prod utan `?v9` → v9-customer-rows syns
3. Browser-test: `?v9=off` → legacy syns; reload utan param → fortfarande legacy (sticky)
4. Browser-test: `?v9=on` → v9 + reload utan param → fortfarande v9 (sticky)
5. Console-check no errors
6. Update memory `project_v9_port_progress_2026_06.md`: default = ON, datum

---

## Förutsättningar checklist (Cursor verifierar)

- [ ] Datum ≥ 2026-06-18
- [ ] Pilot är INTE i aktivt go-live-fönster (kontrollera med Fazli)
- [ ] Render har inga reverts senaste 14 dagar
- [ ] `verify-ord16-progress.js` PASS stabilt
- [ ] Owner GO explicit

---

_Skapad av Claude · 2026-06-04 · BLOCKED på stabilitets-fönster (2026-06-18)_
