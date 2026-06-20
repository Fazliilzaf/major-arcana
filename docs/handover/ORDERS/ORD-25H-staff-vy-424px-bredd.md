# ORD-25H · Staff-vy-bredd 424px för live-rendering

**Status:** Pending · efter pilot-start
**Föregångare:** ORD-25F (facit-preview 400→424) · ORD-25G (V11-DNA-lyft) #119
**Blockerande?** Nej · icke-blockerande för pilot

## Bakgrund

ORD-25F (samma som ORD-25G Pass 5) bumpade `--v9-layout-col-intel` och relaterade grid-deklarationer från 400px till 424px i `cco-v10-skin.css` rad 1337–1352. Vid UAT under ORD-25G upptäcktes att den befintliga CSS-regeln endast aktiveras inom `.preview-canvas[data-app-shell-view="customers"]`-context (facit-mockup-rendering), inte i den ordinarie `/staff?view=customers`-vyn.

I `/staff`-vyn är `.customers-rail` faktiskt 498–995px beroende på layout-state (aggregate vs. detail), inte 424px.

## Önskat utfall

Live-staff-vyn på arcana.hairtpclinic.com och hairtpclinic.com (CCO) ska ge högerspalten 424px-bredd även utan facit-preview-context.

## Implementation-skiss

Identifiera vilken selektor i `cco-v10-skin.css` (eller `cco-v9-customers.css`) styr `.customers-rail.intel-shell[data-context="customer"]`-bredden i staff-context. Sannolikt en grid-template-columns-deklaration på `.customers-layout` UTAN `[data-v10-facit-app-grid="on"]`-villkor.

Bumpa motsvarande grid-cols från `... 400px` (eller dynamisk) till `... 424px`.

## Hänsyn

- Pilot-frys-läge: får inte landa förrän efter pilot-start (P2-prio)
- Klippnings-risk: 24px extra på rail kan komprimera mitten-kolumnen (kalender/timeline). Kontrollera att inget event-kort eller liknande klipps på 1280px/1366px-viewports
- Mobil-shell: säkerställ att `[data-cco-mobile-shell="on"]` exkluderar regeln

## Referens

PR [#119](https://github.com/Fazliilzaf/major-arcana/pull/119) sub-rapport
