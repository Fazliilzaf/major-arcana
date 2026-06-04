# ORD-19 — Avveckling av `/kunder.html` (301 redirect + filradering)

**Skapad:** 2026-06-04
**Owner-spår:** Cursor (write)
**Claude-spår:** UAT efter Cursor-deploy
**Blockerad av:** ORD-18 (Smart Nästa Steg + Capability-matrix måste vara porterade till SPA först)
**Prio:** P2
**Status:** BLOCKED (väntar ORD-18 done)

---

## Bakgrund

`/kunder.html` (8 969 rader) är ett separat v9-experiment som ersatts av preview-SPA's v9-port (ORD-16, alla 10 steg LIVE 2026-06-04, commit `94c32886`).

Före radering måste:
- ORD-18 ha portat `CcoKunderSmartNextStep` + `CcoKunderActions` till SPA (de sista 2 features kvar)
- `node scripts/inventory-kunder-html-features.js` rapportera "Safe to delete YES"

---

## Scope (strikt)

### B.2 — Server-side 301 redirect

I `server.js`, lägg till FÖRE static-routes (`app.use(express.static('public'))`):

```js
// ORD-19: /kunder.html → SPA (legacy v9-experiment avvecklad)
app.get('/kunder.html', (req, res) => {
  const v9Param = req.query.v9 || 'on';
  res.redirect(301, `/major-arcana-preview/?view=customers&v9=${v9Param}`);
});
```

### B.3 — Filradering

Säkra-att-radera-listan (refereras BARA från `/kunder.html`):

```bash
git rm public/kunder.html
git rm public/cco-kunder-real.js          # ~88 KB — bara /kunder.html använder
git rm public/cco-kunder-v9-mock-seed.js  # 28 KB — bara /kunder.html använder
```

### BEVARA (refereras från andra platser)

| Fil | Användare | Anledning |
|---|---|---|
| `cco-kunder-mobil-real.js` | `/m-kunder.html` | Mobil-shell, OUT OF SCOPE för ORD-17 |
| `cco-kunder-staff-owner.js` | SPA `index.html` + `/m-kunder.html` | Owner-roll-logik, refereras brett |
| `cco-kunder-smart-next-step.js` | ORD-18 portar till SPA bundle | Behåll källfilen |
| `cco-kunder-actions.js` | ORD-18 portar till SPA bundle | Behåll källfilen |

### Bundle-manifest cleanup (efter radering)

Om `bin/bundle-manifest.json` listar någon av de raderade `.js`-filerna, ta bort dessa entries.

### OUT OF SCOPE

- `/m-kunder.html` radering (separat ORD-18b — mobil-paritet)
- Feature-flag default ON (det är ORD-20)
- Smart Next + Capability port (det är ORD-18, ovan)

---

## Pre-flight check (Cursor kör FÖRE radering)

```bash
# 1. ORD-18 måste vara LIVE
curl -s https://arcana.hairtpclinic.com/api/v1/_diag/version

# 2. Verify-script måste vara 13/13 PASS
node scripts/verify-ord16-progress.js

# 3. Inventory MUST rapportera Safe to delete YES
node scripts/inventory-kunder-html-features.js

# 4. Grep-check att inga refs till /kunder.html finns kvar i klickbara länkar
grep -rE "href=['\"]\/kunder\.html" public/ --include="*.html"
# Förväntat: 0 hits (alla 250 refs cleanade i commit 94c32886)
```

Om något steg failar: **STOPP**, rapportera till owner, kör inte git rm.

---

## Acceptance Criteria

- [ ] ORD-18 är LIVE (Smart Next + Capability i SPA-bundle)
- [ ] Inventory-script: Safe to delete YES
- [ ] `curl -I https://arcana.hairtpclinic.com/kunder.html` → 301 till SPA
- [ ] `curl -s https://arcana.hairtpclinic.com/kunder.html` → 404 efter file-removal är väntat (fångas av redirect FÖRE static)
- [ ] `git log --oneline | head -5` visar radering-commit
- [ ] SPA `?view=customers&v9=on` fortsätter fungera 100%
- [ ] `/m-kunder.html` fortsätter fungera (orörd)

---

## Risker + Mitigation

| Risk | Mitigation |
|---|---|
| Bokmärken / externa länkar pekar på /kunder.html | 301 redirect bevarar URL — inga 404 |
| `cco-kunder-real.js` används av andra ställen vi missat | Pre-flight grep-check FÖRE git rm |
| `bin/bundle-manifest.json` bryts om någon av filerna listas | Verify build:bundle efter cleanup |
| ORD-18 inte 100% klart → kunder förlorar Smart Next / Capability | Pre-flight `inventory-script` är hard gate |
| Test failure pga referensbrist | Kör `npm test` efter radering |

---

## När Cursor klar — Claude UAT

1. `curl -I https://arcana.hairtpclinic.com/kunder.html` → förvänta 301 Location: /major-arcana-preview/?view=customers&v9=on
2. Browser-test via Chrome MCP: navigera till /kunder.html, se att SPA öppnas
3. Verify inga dead links i nav: grep prod-HTML för `/kunder.html` href
4. Console-check inga errors på SPA efter ändring

---

_Skapad av Claude · 2026-06-04 · BLOCKED på ORD-18_
