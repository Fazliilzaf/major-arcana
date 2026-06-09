# ORD-39 — Header-pills i dossiern (VIP / PRP-kur / engagemang / friskförs)

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Codex (backend — dossier-readout-paritet)
**Claude-spår:** frontend renderar redan pills när fälten finns; UAT efter
**Prio:** P1 · header ska matcha facit (pills under namnet)

---

## Mål / bakgrund

Facit-headern har pills under namnet: **VIP · PRP-kur 4/6 · 92% engagemang · ⚠ Friskförs. saknas**. Frontend renderar redan dem (`dtag vip/cure/eng` i cco-kundkort-referens.js) — MEN bara om fälten finns på `card`. Verifierat: dossier-card (`buildPatientCardReadout`) saknar `vip`, `segment/dormant`, `treatmentTypes`, `engagement`. **Listraderna HAR dem** (via `ccoKunderEnrichment`), men dossier-readouten är magrare → pills-raden blir tom (Abdulaziz visas som VIP i listan men har inga pills i kortet).

## Scope (Codex — backend)

1. **Berika dossier-readouten** (`buildPatientCardReadout` i `ccoPatientMasterStore.js`, eller där dossier-`card` byggs) med samma fält som listraderna får från `ccoKunderEnrichment`:
   - `vip` (bool) / `segment` (t.ex. "dormant"/"aktiv")
   - `treatmentTypes` (t.ex. ["PRP","DHI"]) → driver "PRP-kur"-pill
   - `engagement` (0–100) → "X% engagemang"-pill
   - `friskforsakranMissing` (bool, ur signal `missing_operation_day_insurance`) → "⚠ Friskförs. saknas"-pill
2. **Återanvänd** enrichment-beräkningen som redan finns för listan — ingen ny dataväg, ingen ny källa. Exponera fälten på dossier-`card`.

## Frontend-not (Claude)

Render läser idag `bcard.vip || bcard.tags.vip`, `bcard.treatmentTypes`, `bcard.engagement`. Friskförs-pill finns ej i render än — Claude lägger till den (från `friskforsakranMissing` eller gate-signal) när fältet exponeras. Övriga pills tänds automatiskt när fälten finns.

## FÖRBJUDET

- Ingen ny dataväg/mock — återanvänd befintlig enrichment.
- Hitta inte på VIP/engagemang — bara verklig beräkning.

## Gates

- check:syntax · lint:no-bypass · test:unit (dossier-card har vip/segment/treatmentTypes/engagement; tom-fall). Commit refererar ORD-39.

## Rapport till Claude (UAT)

Commit + filer + (a) VIP-patient → VIP-pill i dossier-headern, (b) PRP-patient → "PRP-kur"-pill, (c) engagemang/friskförs. Claude UAT + lägg ev. friskförs-pill i render.

## Status

| Fas                           | Status          |
| ----------------------------- | --------------- |
| Order skapad (repo + Notion)  | KLAR 2026-06-08 |
| Codex: berika dossier-readout | Väntar          |
| Claude UAT + friskförs-pill   | Väntar          |
