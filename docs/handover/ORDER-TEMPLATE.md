# ORDER #NNN · {Kort titel}

**Created:** YYYY-MM-DD
**Assignee:** cursor | claude | both
**Priority:** P0 | P1 | P2 | P3
**Status:** pending | cursor-in-progress | awaiting-fazli | done | blocked
**Notion:** https://app.notion.com/p/{row-id}

---

## Uppdrag

{En mening}

## Scope (får röras)

- paths

## Förbjudet (rörs ej)

- server.js (om ej explicit i order)
- Nytt kundkort-skUI utanför `.kkref` (v11-rail som default, nya staff-flikar i referens-läge, parallell render-path)
- `switchDetailTab` som enda journal/antecknings-CTA i referens — använd KKX / `data-sek`

---

## Kundkort UX (obligatoriskt om ordern rör kundkort / staff kunder)

Facit: **ORD-47 referens** — samma UI som live (`.kkref .doss`). Se `.cursor/rules/kundkort-referens-ux.mdc`.

### Tre frågor (fylls innan kod)

1. **Visuell förebild:** Vilken befintlig sektion? (t.ex. "Journaler · personal", "Besök", `.kkref-active-visit`)
2. **Vy-nivå:** sektion (scroll) | storvy (`#kkx-ov` / KKX) | aktivt besök | slide-over (ORD-26)
3. **CTA → landning:** Scroll till `data-sek=…` / `mountKkxJournalBig` / `journeyHandlers` — **inte** ny modal eller flik

**Screenshot-krav:** Prod eller lokal referens — nytt ska se ut som **samma kort**, inte ny layout.

### PR-checklista (kundkort)

- [ ] Vy-nivå + förebild dokumenterad ovan
- [ ] Markup i `cco-kundkort-referens.js` (eller parity endast om aktivt besök/v11 opt-in)
- [ ] CSS under `.kkref` / `kkref-*` i `cco-kundkort-referens.css` eller scoped i `cco-v9-customers.css`
- [ ] `data-sek` + `orderDossierHtml` om ny sektion
- [ ] Handlers via `bindKkxReferensPanel` / `journeyHandlers` — inte parallell bind
- [ ] `node scripts/verify-v11-paritet.js` PASS
- [ ] Prod-screenshot bifogad i rapport

---

## Gates

```bash
npm run check:syntax
npm run lint:no-bypass
npm run test:unit
node scripts/verify-v11-paritet.js
# Kundkort:
npm run verify:ord47-prod-sticks
# Journal-yta om relevant:
npm run verify:kkx-journal-workspace-prod
```

## Rapport (fylls av Cursor)

- filer ändrade
- gates PASS/FAIL
- kundkort: vy-nivå, förebild-sektion, screenshot (om UI)
- nästa beslut
