# ORD-38 — Strukturerade hälsodeklaration-svar (halso@ → Ja/Nej + riskflaggor)

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Codex (backend — halso@/Meridiq-parsning)
**Claude-spår:** frontend renderar redan HD Q&A; UAT efter
**Prio:** P1 · HD-sektionen ska matcha facit (8 rader Ja/Nej + riskflaggor)
**Relaterat:** ORD-36 (journal-metadata), Meridiq `migration/meridiq/questionary-catalog.json`

---

## Mål / bakgrund

HD-sektionen i kundkortet renderar redan facit-designen (riskflagg-banner, Q&A-rader, grön Nej / amber Ja / ⚠ Ja, footer) — MEN strukturerade svar saknas i datan. Verifierat: Abdulaziz `card.hasHealthDeclaration: false`, `healthDeclaration` tom. Så det renderas "Att fylla i" i stället för de 8 raderna.

HD kommer från **halso@** (mejl-import) + Meridiq-frågeformulär (`questionary-catalog.json`). Svaren är inte parsade till strukturerade fält.

## Scope (Codex — backend)

1. **Parsa patientens HD-inlämning** (halso@-mejl / Meridiq-questionary-svar) → strukturerat per patient:
   `healthDeclaration: { signed, signedAt, source, answers: [{ key, label, value ("ja"/"nej"), risk ("flag"/"amber"/""), detail }], riskFlags: [{label, note}] }`.
2. **Frågeuppsättning + ordning** från `migration/meridiq/questionary-catalog.json` (Allergier, Blodförtunnande, Pågående mediciner, Hjärt-/kärl, Blödnings-, Keloid, Rökning/nikotin, Graviditet … = facit-raderna). Mappa patientens svar mot katalogen.
3. **Riskflaggor** härleds ur svaren (t.ex. Rökning=Ja → riskflagga "Rökning — verifiera före ingrepp").
4. **Exponera** i dossier-readout/bundle som `healthDeclaration` (formen ovan) + sätt `card.hasHealthDeclaration: true` när svar finns. Frontend (`mapHdAnswers` i cco-kundkort-referens.js) konsumerar redan `answers`/`risk`/`detail`.

## FÖRBJUDET

- Medicinsk data: **ingen extern AI** (parsa lokalt/regelbaserat). Read-only mot källan.
- Hitta inte på svar — saknas en fråga → utelämna raden (ej gissa Nej).
- Ingen mock-data. Rör ej andra flöden.

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Test: patient med HD-inlämning → answers[] + riskFlags[]; patient utan → tom (hasHealthDeclaration false); riskflagga härleds rätt.
- Commit refererar ORD-38.

## Rapport till Claude (UAT)

Commit + filer + (a) patient med HD → 8 rader Ja/Nej + riskflagg-banner renderas som facit, (b) täckningsgrad (hur många patienter har parsbara HD-svar), (c) källa (halso@-mejl vs Meridiq-questionary). Claude UAT i /staff.

## Status

| Fas                            | Status          |
| ------------------------------ | --------------- |
| Order skapad (repo + Notion)   | KLAR 2026-06-08 |
| Codex: parsa HD → strukturerat | Väntar          |
| Claude UAT (/staff)            | Väntar          |
