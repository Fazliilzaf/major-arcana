# ORDER #NNN · {Kort titel}

**Created:** YYYY-MM-DD
**Assignee:** cursor | claude | both
**Priority:** P0 | P1 | P2 | P3
**Status:** pending | cursor-in-progress | awaiting-fazli | done | blocked
**Notion:** https://app.notion.com/p/{row-id}

---

## Bas och observation (obligatoriskt — fylls INNAN något påstående görs)

**Bas-commit:** {hash} ({gren}) · verifiera med `git rev-parse --short HEAD`
**Miljö:** {prod-URL | lokal port | worktree — ange om `npm ci` kördes och om `.env` fanns}

### Regel: ett stickprov är inte ett tillstånd

Felen som kostat oss mest tid har alla haft samma form — någon rapporterade ett
stickprov som ett tillstånd. Två axlar:

- **Stickprov i kod** — läst fel bas, eller antagit orsak utan att mäta.
  Motmedel: bas-commit ovan.
- **Stickprov i tid** — mätt mitt i boot, mitt i ett blockerande pass, eller
  före att data hunnit fram. Motmedel: observationsfönstret nedan.

> En observation av ett tidsvarierande system är inte ett tillståndspåstående
> förrän man vet att systemet var stabilt när man tittade.

Det räcker alltså inte att ange *när* man mätte. Skriv ut *fönstret* och om
systemet var stabilt i det.

### Runtime-observationer (en rad per påstående)

| Påstående | Fönster (från–till efter load) | Stabilt? | Belägg |
|---|---|---|---|
| _ex:_ `#cco-conv-v2-root` saknas | 8–40 s | **NEJ** — boot + longtask pågick | indraget, felaktigt |
| _ex:_ V2 monterad, äger ytan | 163,5 s, efter sista longtask | ja | mount-recorder + DOM-kedja |

**Stabilt = NEJ** om något av detta pågick i fönstret: boot, en longtask, eller
en inflight-fetch som påverkar ytan. Vid NEJ får observationen inte formuleras
som ett tillstånd — den får formuleras som "vid tidpunkt X gällde Y".

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
