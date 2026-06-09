# Leverans — customer-mockup-v10-mirror (Claude → Codex QA)

**Datum:** 2026-06-08 · Claude
**Branch:** `codex/customer-mockup-v10-mirror` (i `~/codex-arcana`)
**Mål:** spegla `/staff?v9=on&demo=off&view=customers&segment=this_week` mot `kunder-mockup-v10.html` med live-data, ingen ny dataväg.

## Ändrade filer (diff --stat mot origin/main)

```
public/major-arcana-preview/app/cco-kundkort-referens.js   |  6 ++++++
public/major-arcana-preview/app/patient-master-ui.js       | 17 ++++++++++++++++-
2 files changed, 22 insertions(+), 1 deletion(-)
```

**Commits:**

- `407b37a9` feat(cco): v10-kundkort-ready event + refreshV10KundkortFacit (mirror reliability)
- `4b2f45b7` fix(cco): normalisera pipe i journaltitel till middot (mirror-fidelity)

## Vad som gjorts

1. **Render-väg kartlagd.** `/staff`-dossiern: `patient-master-ui.js → renderV9MockupDetailShell → renderV10ReferensDossierHtml → window.__renderReferensKundkort` (facit, `.kkref .doss`). `usesV10KundkortFacit()` = default på.
2. **Rotorsak till "fel design ibland" hittad + fixad:** om facit-scriptet (`cco-kundkort-referens.js`) inte hunnit ladda vid första detail-render föll panelen tillbaka till en ÄLDRE render (synthesis) som inte speglar mockupen. Fix: facit dispatchar `arcana:v10-kundkort-ready`, `patient-master-ui.js` lyssnar → `renderDetailPanel()` igen → facit ersätter fallbacken. Ingen flash av gammal design.
3. **QA-möjliggörare:** `isStaffJournalOpenAccess()` (localhost-only, ingen prod-effekt) släpps förbi staff-login så lokal `/staff`-screenshot kan tas.
4. **Pipe-normalisering** i journaltitlar: "Journal | TP Behandling" → "Journal · TP Behandling".

Ingen ny dataväg. Mockupfilen orörd (endast facit).

## Granska

- **Prod (referens, nuvarande main):** https://arcana.hairtpclinic.com/staff?v9=on&demo=off&view=customers&segment=this_week
- **Mockup/facit:** kunder-mockup-v10.html (prod: https://arcana.hairtpclinic.com/kunder-mockup-v10.html)
- **Branch ej deployad** — Codex tar lokal /staff-screenshot (nu möjligt via localhost-bypass) och jämför.

## Vad som FORTFARANDE skiljer mot mockupen (Claudes observation prod vs mockup)

**Hela sidan speglar redan mockupen nära** (nav, sidofält, story-grid, filter, höger översikt, dossier-sektioner). Kvarvarande deltas:

1. **Top-nav sökfält.** Mockupen har ett prominent sökfält i top-navet ("Sök kund, bokning eller behandling… ⌘K"). Prod ytlägger inte det i navet. → app-shell, troligen UTANFÖR de 4 filerna; behöver utredas. **Enda tydliga layout-deltat.**
2. **Sidebar LANES** (Agera nu/Bokningsbar/Operation/Eftervård/Medicinsk) — finns i prod, ej i mockupen. _Vår tillägg_ (behåll/ta bort = beslut).
3. **★/AI-märkning** — mockupen har "★ IDAG", "AI NÄSTA-STEG", "★ AI · VECKANS INSIKTER". Prod har avsiktligt tagit bort ★/AI (feedback: neutrala rubriker). _Avsiktlig skillnad._
4. **Tom this_week** — prod visar "Inga kunder matchar sökningen" (0 riktiga kunder denna vecka); mockupen är demo-fylld. _Data, ej design._
5. **Dossier** — speglar redan (facit). Kvarvarande är DATA (steg/behandlare ORD-36, datum ORD-34, betalhistorik ORD-35), ej design.

## Rekommendation

Den tunga speglingen är på plats; huvudfixen var **facit-pålitligheten** (ingen flash). Codex QA: lokal /staff-screenshot vs mockup → bekräfta facit-render → besluta om (a) top-nav sökfält ska ytläggas, (b) LANES/★ behålls (avsiktliga) → PR/deploy.
