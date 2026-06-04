# ORD-16 · Cosmetic polish-backlog

**Skapad:** 2026-06-04
**Status:** ACTIVE — fyll på medan ORD-16 steg 7-10 byggs
**Mål:** Samla små UI/copy-issues så vi inte glömmer dem inför ORD-17 cleanup

---

## Hur den används

Lägg till items här när du ser något smått. Klassificera:

- **[P2]** = stör pilot-personal vid daglig användning
- **[P3]** = nice-to-have, kan vänta till efter pilot
- **[Done]** = redan fixad (med datum + commit)

Cursor läser denna fil när han kör polish-sprint. Claude verifierar fixar.

---

## Aktiva items

### [P2] Drive-only kunder visar JPEG-filename istället för "Namn saknas"

**Var:** Customer-list rader för kunder importerade från Drive utan kund-namn
**Exempel:** `4A61-A14D-766A3C251538_1_105_c.jpeg` syns som "namn"
**Fix:** `displayNameForList()` i `app/patient-master-ui.js` — Cursor fixade delvis i steg 4 polish. Verifiera att ALL rader matchar:

```js
function displayNameForList(card) {
  if (!card.name || /\.(jpe?g|png|pdf|docx?)$/i.test(card.name)) {
    return 'Namn saknas';
  }
  return card.name;
}
```

**Status:** Partiellt fixad i steg 4 commit, men 2026-06-04 UAT visade fortfarande filnamn i rad 2-3. Behöver verifiering.

---

### [P2] Story-list i agg-cards: hardcoded "Anna Karlsson" / "Karl Lindberg" / "Eva K." (på `/major-arcana-preview/?view=customers` v9-experiment)

**Var:** `/major-arcana-preview/?view=customers` (ej preview-SPA)
**Exempel:** RISKER-card visar `Anna Karlsson — friskförsäkran saknas` hårdkodat
**Fix:** Ingen — `/major-arcana-preview/?view=customers` ska avvecklas i ORD-17 (301 redirect till preview-SPA)
**Status:** Ej blocker (sidan är inte produktion). ORD-17 raderar filen.

---

### [P3] "Behöver granskning 0" chip ser tom ut

**Var:** Filter-chip-rad när `count = 0`
**Fix:** Antingen göm chip helt eller visa "—" istället för `0`
**Status:** Cosmetic, inget block

---

### [P3] Status-pill "Endast Drive 541" pillen wrappar på smala skärmar

**Var:** Mockup-mobile-version (375px viewport)
**Fix:** `flex-wrap: wrap` + `min-width: 0` på pill-container
**Status:** Inte testat ännu på mobil — gör i steg 10

---

### [P3] Default ON av v9-flag (efter 2 veckor stabilitet)

**Var:** `app/cco-v9-flag.js`
**Fix:** Ändra `var enabled = false` → `true`, behåll `?v9=off` kill-switch
**Status:** Vänta tills ORD-16 alla 10 steg klara + 2 veckor i prod utan rollback

---

### [Done] Filfnamn-fix i `displayNameForList()`

**Datum:** 2026-06-04 (steg 4 polish)
**Commit:** 0abf64ea
**Detalj:** Cursor lade till regex-check för filnamn

---

### [Done] Mobile-shell — chips wrap på 767px

**Datum:** 2026-06-04 (steg 2)
**Commit:** e17a59f2
**Detalj:** Status-pills får horisontell scroll på smal skärm

---

## Backlog för ORD-17 (post-pilot)

Inga aktiva items än — fyll på när vi tänker på fler. Sannolika kandidater:

- Agg-cards "Visa alla" CTA aktiv/inaktiv baserat på count
- ⚠ Risk-card behåller röd-bakgrund även vid tom-state
- Tabell-header sortable per kolumn
- Keyboard-nav: ↑↓ navigera, Return öppna dossier, Esc stäng
- Bulk-actions (välj flera kunder → action-bar dyker upp)
- Search-overlay "⌘K" mer prominent

---

## Process

1. **Hitta** något småaktigt — lägg till HÄR (inte i ORD-15/16 docs)
2. **Klassificera** P2/P3/Done
3. **Status uppdateras** av Cursor när fix landar
4. **ORD-17 review** sopar upp aktiva items innan pilot

---

_Auto-genererad av Claude · 2026-06-04 · uppdateras kontinuerligt_
