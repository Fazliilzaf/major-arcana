# ORD-57 — HELA CEO:n till v8-mockupens design (FACIT: clinicperformancev8.html)

**Datum:** 2026-07-11 · **Ägare:** Fazli (owner-direktiv: "hela CEO, alla kategorier, alla flikar ska ha den designen") · **Byggare: CODEX** · **Byggrepo:** arcana-ceo-agent · **Status:** FRI ATT STARTA

## FACIT (bindande)

`docs/handover/MOCKUPS/CEO-DESIGN-FACIT-clinicperformancev8.html` (major-arcana-repot) = Fazlis vision. Designspråket däri gäller ALLA ytor:
**Kommandoruta (/) · Studio (/studio) · Agenter (/agents) · Chief of Staff (/orchestrate) · Översikt (/dashboard) · Clinic Performance (/clinic-performance) · Uppdragsvyn (/jobs/[id])**

## Läget (verifierat i kod): tokens finns, kompositionen saknas

globals.css bär redan facit-DNA:t (bg #faf6f2, --serif Iowan/Palatino, accent #bb4779/#e0729d, sage/amber/blå status, panel-gradienter/skuggor). Det som SKILJER är kompositionen per yta. Facit-mönstren som ska genomsyra allt:

1. **Narrativ hero** per yta: stor serif-rubrik + mänsklig lägesrad (mönster: "Din klinik, just nu" / "Juli går bra").
2. **Pulse-tiles**: nyckeltal som stora serif-siffror i glas-gradientkort med jämförelseband (nu vs föregående period) — ALDRIG fejkade värden; saknad källa visas som ärligt "—/saknas" i samma tile-design.
3. **Rådgivande modul** "Vad jag skulle göra" med åtgärdslänkar (→) som skapar uppdrag via vanliga flödet.
4. **Glaskort-hierarki**: gradientkort (panel-card-tokens), radier 11–26px, djupa mjuka skuggor, luft.
5. **Sidebar + owner-kort** exakt som facit (Arbetsyta/Klinik-grupper, Fazli · Ägare-kort, side-status).

## Per yta (funktion behålls, komposition lyfts)

- **Clinic Performance**: närmast facit redan — lyft till 1:1 (pulse-tiles med serif-siffror + jämförelseband, "Vad jag skulle göra", "Varifrån bokningarna kom" = befintlig Kanalfördelning i facit-tile-form).
- **Översikt**: behåll det operativa innehållet (Att göra nu → Uppdrag → Status) men presentera i facit-språket: hero-narrativ, uppdragen som facit-kort, statuskorten som pulse-tiles.
- **Kommandoruta**: hero + kommandofältet i facit-glaskort; resultatkortet som facit-tile med "Uppdrag dirigerat / Öppna i cockpit →" (finns i facit).
- **Studio**: paletten är redan gemensam — justera kort/typografi till exakta facit-mått där de avviker; INGEN funktionsändring (feedback_studio_v2_keep_palette_shadings gäller).
- **Agenter + Chief of Staff**: roster/konsol i facit-kort och serif-rubriker.
- **Uppdragsvyn (jobs)**: artefaktkorten i facit-glaskort-stil, godkännandepanelen som facit-band.

## Arbetssätt

- **Fasade PR:ar, en yta per PR** (review-first, merge efter Fazlis "kör #NN"): PR-ordning: 1) Clinic Performance 2) Översikt 3) Kommandoruta 4) Jobs 5) Agenter+CoS 6) Studio-finjustering.
- Varje PR: screenshot yta-vs-FACIT sida vid sida. Ingen funktions-/dataändring, ingen ny palett, inga nya komponentmönster utanför facit.
- Ärlighetsprincipen är ABSOLUT: facit-kompositionen får aldrig tvinga fram fejksiffror — saknad data visas ärligt i facit-designen.

## Acceptans

1. Alla 7 ytor bär facit-kompositionen (hero, pulse-tiles, glaskort, rådgivande moduler där relevant).
2. Sida-vid-sida-screenshots per yta godkända av Fazli.
3. Inga funktionella regressioner: full testsvit 0 FAIL, tsc rent, build grön per PR.

## Forbidden

Ingen ny palett/typografi utanför facit. Inga fejk-värden. Studions funktioner orörda. Frysta arcana-tjänsten. Aldrig git add -A.

## ✅ SLUTFÖRD 2026-07-11

Alla 6 ytor i v8 FACIT-design, 6 PR:ar squash-mergade efter Fazlis "kör" per yta:

- PR #75 Clinic Performance · #76 Översikt (inkl. statuskort/uppdragsrader/chips) · #77 Kommandorutan (tvåkolumnig hero, arbetsytan dominerar, ärlig statusrad) · #78 Jobs (flikar för resultat, facit-rapportkort, Kopiera brief, accenttonade bubblor, Så tänkte CEO + tidslinjelogg) · #79 Agenter + Chief of Staff · #80 Studio (scen-styrt upplägg: brief-scen före kampanj → paket + granskningsspalt efter; brief-förslag, textarea-brief, 1400px innehållsspalt appvid).
  Byggare: Claude (design-rollen per Fazlis direktiv). Varje PR: tester 0 FAIL, tsc rent, lokal visuell verifiering mot facit.
