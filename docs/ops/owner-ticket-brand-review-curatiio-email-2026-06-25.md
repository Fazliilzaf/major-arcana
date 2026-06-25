# Owner-ticket — Brand review: `contact@curatiio.com` i Hair TP-avtal

_Skapad: 2026-06-25 · Status: **ÖPPEN** · Väntar owner + Nordbro/jurist_

## Titel

Brand review — Curatiio-kontakt i Hair TP-behandlingsavtal (Nordbro facit 251203)

## Prioritet

**P1** — blockerar inte P0 PASS / SharePoint-resync (`d73a8fd7`), blockerar “ren Hair TP”-signering i prod utan eskalering.

## Bakgrund

SharePoint-resync 2026-06-25 har uppdaterat facit-metadata + `revisions[]` mot Nordbro Word **251203**. Juridisk text följer advokat-facit — CCO har **inte** auto-ändrat kontaktuppgifter.

## Problem

Nordbro 251203 Word innehåller **`contact@curatiio.com`** i avsnitt som visas för **Hair TP Clinic**-patienter (Tjänsteutövare = Hair TP i brödtext, men kontakt pekar Curatiio).

CCO-regel: **blanda aldrig varumärken** i samma patient-facing mall.

## Berörda dokument

| Scope            | Meridiq                     | Facit Word                                | Träff                                                              |
| ---------------- | --------------------------- | ----------------------------------------- | ------------------------------------------------------------------ |
| **P1 PRP**       | 170944, 170945              | `251203-behandlingsavtal-prp.docx`        | Ångerrätt → `contact@curatiio.com`                                 |
| **P0 DHI (ev.)** | 170917 (+ relaterat 170955) | `251203-behandlingsavtal-dhi-2dagar.docx` | Ombokning, avbokning, ångerrätt → samma e-post (3 ställen i facit) |

## Status i repo

| Spår   | Diff                                                                           | Brand-flagga                                                                                |
| ------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| P1 PRP | `docs/implementation/patient-documents-live/diffs/NORDINSATT-P1-2026-06-25.md` | **NEEDS_BRAND_REVIEW**                                                                      |
| P0 DHI | `docs/implementation/patient-documents-live/diffs/NORDINSATT-P0-2026-06-25.md` | P0_PASS (ankare OK) — samma e-post i `steg7-tp-dhi-agreement-facit.json`, ej eskalad i diff |

## Beslut som behövs (owner + Nordbro/jurist)

1. Ska Hair TP-avtal använda **`contact@hairtpclinic.com`** (eller annan godkänd Hair TP-adress) i ombokning / avbokning / ångerrätt?
2. Ska Curatiio-adress **behållas** med explicit motivering (t.ex. gemensam kundtjänst)?
3. Om ändring: **ny Nordbro Word-version** (inte ad hoc i CCO) → ny resync → uppdatera `revisions[]` + diff P0/P1.

## Rekommenderat default (CCO — ej juridisk slutsats)

Ersätt med `contact@hairtpclinic.com` i Hair TP-bindningar efter skriftligt OK från Nordbro.

## Acceptanskriterier

- [ ] Skriftligt beslut dokumenterat (Nordbro/owner)
- [ ] Uppdaterat facit i SharePoint + lokal Word om ny version
- [ ] `npm run resync:sharepoint-nordbro-facit:apply` → PASS
- [ ] `npm run diff:nordbro-p0` / `npm run diff:nordbro-p1` utan `NEEDS_BRAND_REVIEW`
- [ ] Facit JSON + consent-catalog + bundle uppdaterade i samma commit

## Referenser

- `config/nordbro-insatt-facit-set.json`
- `docs/implementation/patient-documents-live/diffs/SHAREPOINT-NORDINSATT-RESYNC-2026-06-25.md`
- `migration/meridiq/prp-behandling-agreement-facit.json`
- `migration/meridiq/steg7-tp-dhi-agreement-facit.json`
- `scripts/ops/diff-nordbro-p1-prp.js` (flaggar `NEEDS_BRAND_REVIEW`)

## Oförändrat medvetet (samma resync-batch)

| Punkt                               | Beslut                                               |
| ----------------------------------- | ---------------------------------------------------- |
| INSATT Graph 404 på TP Avtal.docx   | Dokumenterad i outside-registry — facit **SKIP_OLD** |
| iCloud EACCES vid Graph-nedladdning | Lokal DHI-Word + SHA används — miljö/behörighet      |
| Brand `contact@curatiio.com`        | Denna ticket — väntar jurist/owner                   |
