# ORD-17 · Post ORD-16 cleanup + paritet-complete

**Skapad:** 2026-06-04
**Status:** PENDING — väntar ORD-16 steg 7-10 deploy
**Mål:** Slutföra v9-porteringen så preview-SPA är 100% mockup-parity och `/kunder.html` kan avvecklas

---

## Förutsättningar

ORD-17 startar när ORD-16 steg 1-10 är LIVE + UAT PASS. Krav:

- Steg 1-6: ✅ LIVE
- Steg 7 (dossier-hero): pending
- Steg 8 (dossier-body): pending
- Steg 9 (höger aggregat-vy): pending
- Steg 10 (watch-frame + mobile): pending

---

## DEL A — Slutpolish av v9-porteringen

### A.1 Drive-only kund-namn (P2)

Filer som visas som namn i listan ska bytas till "Namn saknas". Cursor fixade detta delvis i step 4 polish, men verifiera att alla rader matchar:

```js
// public/major-arcana-preview/app/patient-master-ui.js
function displayNameForList(card) {
  // Om name matchar JPEG/PDF-pattern → "Namn saknas"
  if (!card.name || /\.(jpe?g|png|pdf|docx?)$/i.test(card.name)) {
    return 'Namn saknas';
  }
  return card.name;
}
```

### A.2 Tom-state polish (P2)

Alla 4 agg-cards har "Inga X..."-text när data saknas. Kontrollera att de följer mockupens copy-stil:

- Mockup: "Visa alla" CTA disabled när 0 items
- Mockup: ⚠ Risk har röd-bakgrund även vid tom-state

### A.3 Filter-chips ↔ segment-sidebar interaktion

När segment ≠ "all" är chips inaktiva (Cursor implementerade detta i steg 5). Verifiera att tomma chips ser disabled ut (grayscale, inte hidden).

---

## DEL B — Avveckling av `/kunder.html`

`/kunder.html` är en separat v9-experimentsida som blev ersatt av preview-SPA's v9-port. Den måste avvecklas:

### B.1 Inventering av unika features i /kunder.html

Innan radering, verifiera att inga unika features går förlorade:

- Smart Nästa Steg (cco-kunder-smart-next-step.js) — porterat till SPA dossier?
- 4 agg-cards (Idag/Möjlighet/Trend/Risk) — porterat ✅ (steg 6)
- Watch-frame "NÄSTA" — porteras i steg 10
- Capability-matrix (cco-kunder-actions.js) — porterat?

### B.2 Server-side redirect

I `server.js`:

```js
// Permanent redirect: /kunder.html → preview-SPA customer-view med v9 default på
app.get('/kunder.html', (req, res) => {
  res.redirect(301, '/major-arcana-preview/?view=customers&v9=on');
});
```

### B.3 Filradering

```bash
git rm public/kunder.html
git rm public/cco-kunder-real.js
git rm public/cco-kunder-actions.js  # om inte refererad från SPA
git rm public/cco-kunder-v9-mock-seed.js
git rm public/cco-kunder-staff-owner.js  # om inte refererad
```

Behåll `cco-kunder-smart-next-step.js` om SPA dossier importerar den.

### B.4 Bundle-manifest cleanup

Ta bort kunder-relaterade entries från `bin/bundle-manifest.json` om de inte längre används.

---

## DEL C — Förenkla feature-flag

Efter ORD-16 är 100% klar och stabilt i 2 veckor:

### C.1 Default ON

I `app/cco-v9-flag.js`:

```js
var enabled = true; // Default ON
try {
  enabled = localStorage.getItem(KEY) !== '0'; // Bara avstängd med ?v9=off
} catch (_) {}
```

### C.2 Behåll `?v9=off` kill-switch i 4 veckor

Ifall en bug upptäcks. Sen kan flag-fil och tokens-scoping tas bort helt.

### C.3 Final cleanup

- Ta bort `[data-v9-enabled="on"]` CSS-scoping → bara `.customer-row` etc.
- Ta bort `cco-v9-flag.js` script
- Behåll `cco-v9-tokens.css` + `cco-v9-customers.css` (är nu default-design)

---

## DEL D — Dokumentation

### D.1 Uppdatera docs/

- `docs/strategy/CCO-SOURCE-OF-TRUTH-LOCAL-SHEETS-2026-06-03.md` → markera /kunder.html som "deprecated"
- Markera v9-mockupen som "implementerad i preview-SPA"

### D.2 Memory-fil

Uppdatera `feedback_arcana_handover_protocol_2026_06.md` med nya principer som vi lärt:

- Cursor + Claude jobbar bättre med Render CLI för manuella deploys
- Frankfurt är den enda prod-servicen (Oregon ignoreras)
- `transformPreviewHtml` strippar saknade asset-refs → alltid commit både fil OCH index-html-referens

---

## DEL E — Mobile-paritet

(Kan vara separat ORD-18 om scope växer)

### E.1 Mobile-shell

Verifiera att `cco-mobile-shell.js` + `cco-mobile-shell.css` har samma v9-look som desktop.

### E.2 Touch-targets

Status-pills, chips, segment-sidebar — alla touch-targets ≥ 44px höjd för mobile.

### E.3 Watch-frame mobile-version

Watch-frame i mockupen är mobil-optimerad. Verifiera att den syns korrekt på telefon.

---

## DEL F — Performance

### F.1 Bundle-storlek

Mät att v9-tillägg inte ökar bundle med mer än 50 KB:

```bash
ls -lh public/major-arcana-preview/cco-v9-*.css
ls -lh public/major-arcana-preview/app/cco-v9-flag.js
```

### F.2 First Paint

Cursor's `adaptive-runtime.js` skulle inte få långsammare första rendering. Mät via DevTools Lighthouse.

---

## Acceptance Criteria för ORD-17

- [ ] Alla 4 agg-cards har tom-states som matchar mockupens copy
- [ ] Drive-only kunder visar "Namn saknas" (inte filename)
- [ ] `/kunder.html` redirectar 301 till preview-SPA
- [ ] Inga refs till `/kunder.html` i HTML-länkar
- [ ] cco-kunder-\*.js-filer raderade (utom smart-next-step om porterad)
- [ ] Mobile-vyn matchar v9 på alla 4 viewports (375/767/1024/1440)
- [ ] Feature-flag förenklad (efter 2 veckor stabilitet)
- [ ] `npm run cco:verify-ord16-progress` PASS 8/8

---

## Risker

| Risk                                                        | Mitigation                                             |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| /kunder.html refereras från externa länkar (mail, dokument) | 301 redirect bevarar URL — inga 404                    |
| Mobile-shell-CSS krockar med v9-tokens                      | Scoped under [data-v9-enabled="on"] tills C.3 cleanup  |
| Cursor jobbar parallellt med ORD-17                         | Splittra ORD-17 i mindre delar (A, B, C, D, E separat) |

---

_Auto-genererad av Claude · 2026-06-04 · pending ORD-16 steg 10 LIVE_
