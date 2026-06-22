# V12 Customer Workspace — CANON / scope (DRAFT)

> **Status:** Scope-beslut **D1–D5 låsta av ägare 2026-06-22** (se §8) — **pending Codex-granskning**.
> **Inget bygge** sker förrän denna canon är Codex-låst. Dokumentet definierar _vad_ V12 är
> och _spelreglerna_ — inte implementation.
> **Datum:** 2026-06-22 · **Föregående spår:** V11 Rail (cutover klar, default ON i `main` @ `3b8146f`).

---

## 1. Vad V12 ÄR

**V12 Customer Workspace = en full-sida / stor kundarbetsyta (Zon 2)** — en djupvy där
personal _arbetar_ med en kund, till skillnad från V11 Rail som är en glanceable
snabböversikt (Zon 1).

- **Inte** en utökad rail. Egen ytmodell (full sida / huvudkolumn), inte en kolumn bredvid.
- **Mål:** bygga den Zon 2-djupvy som **V11 Rail kan länka in i** via sina befintliga
  deep-links (se §5).
- **Webb / iPad / mobil från start** (inga "desktop först, mobil sen").

### Zon-modell

| Zon       | Yta           | Roll                                        | Status            |
| --------- | ------------- | ------------------------------------------- | ----------------- |
| **Zon 1** | V11 Rail      | Glanceable översikt + ingångar (deep-links) | Live (default ON) |
| **Zon 2** | V12 Workspace | Djuparbete per modul, dit Zon 1 länkar      | **Detta spår**    |

---

## 2. Innehåll — hela kundresan (LÅST struktur)

V12 ska innehålla **hela kundresan i full storlek**, i denna ordning. Det ska kännas som
**V11 Rail expanderad till en riktig arbetsyta — inte en dashboard med lösa flikar.**
Flöde uppifrån och ned. **En modul i taget** byggs, var och en låst i modul-canon innan bygge.

Visuell strukturkarta: `docs/handover/MOCKUPS/v12-workspace/v12-structure-map.svg`.

| #   | Modul                             | Nyckelinnehåll                                                                                                                                                                                                | V11-källa                                                             | Status           |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------- |
| 1   | **Kundens nuläge**                | Namn · avatar · kund-ID · kontakt · tags (VIP/PRP/Botox/risk/ny/återkommande) · status (redo/blockerad/aktivt besök/uppföljning) · snabbknappar (ring/SMS/mejl/redigera/boka)                                 | A Profile + C Stats                                                   | senare           |
| 2   | **Aktivt besök** _(hero)_         | Dagens behandling · behandlare · timeline bokad→incheckad→behandling→journal→eftervård→klar · CTA fortsätt/starta journal · check-in/avsluta/anteckning/foto · blockerare (samtycke/hälsodekl/foto/betalning) | V Active Visit                                                        | senare           |
| 3   | **Kritiska varningar**            | Allergier · medicinska risker · saknat samtycke · juridik/signering · ekonomisk risk/skuld · “måste lösas innan behandling”                                                                                   | D Critical warnings                                                   | senare           |
| 4   | **Hälsa**                         | Hälsodeklaration · allergier · läkemedel · kontraindikationer · senast uppdaterad · öppna full hälsoprofil                                                                                                    | E Health (`data-kk-jump`)                                             | senare           |
| 5   | **Kundresa / steg**               | Var i resan · alla steg första kontakt→uppföljning · klart/aktuellt/nästa · koppling dok/journal/foto per steg                                                                                                | F Customer Journey                                                    | senare           |
| 6   | **Journal**                       | Dagens + tidigare journaler · draft/signerad · behandlingsprotokoll · intern anteckning · signera/skicka/spara                                                                                                | J Journals (`data-v9-section-link="journal"`)                         | **byggd (#148)** |
| 7   | **Bilder / före–efter**           | Före · efter · översikt · film · datum+behandling per bild · jämförelsevy                                                                                                                                     | M Photos                                                              | senare           |
| 8   | **Bokningar**                     | Kommande · tidigare · status (bokad/genomförd/avbokad/no-show) · personal+tjänst · bekräfta tider                                                                                                             | H Bookings + I History (`data-v9-section-link="upcoming"/"historik"`) | senare           |
| 9   | **Dokument**                      | Samtycken · behandlingsplan · eftervård · offerter · auto-genererat · PDF/DOCX/XLSX · signeringsstatus                                                                                                        | L Auto-docs + K Offers + N Files (`data-v11-doc-*`)                   | senare           |
| 10  | **Kommunikation**                 | Mejl · SMS · samtalslogg · svarstudio · viktiga kundmeddelanden · senaste kontakt                                                                                                                             | P Communication                                                       | senare           |
| 11  | **Ekonomi**                       | Total intäkt · livstidsvärde · utestående skuld · snitt/besök · offerter · fakturor/betalstatus                                                                                                               | Q Economy                                                             | senare           |
| 12  | **Insikter & nästa bästa åtgärd** | Vad personalen bör göra nu · varför · nästa rekommenderade steg · risker/möjligheter · boka uppföljning / skicka samtycke / kontakta                                                                          | G Smart Next Step + R Insights                                        | senare           |
| 13  | **Sticky arbetsbar**              | Primär åtgärd efter läge (Starta journal / Slutför besök / Skicka eftervård / Boka uppföljning) · sekundär åtgärd · mobil/iPad/webb utan att täcka innehåll                                                   | S Sticky Footer                                                       | senare           |

> **D1 LÅST (uppdaterad):** V12 = full customer workspace (Zon 2), **hela kundresan ovan** —
> inte en utökad rail och inte en dashboard. Sektionsordning 1→13 låst. Journal (6) byggd i
> #148; övriga byggs en modul/PR efter att denna canon är Codex-låst. Exakt build-ordning
> (vilken modul efter Journal) bekräftas separat.

---

## 3. Deep-link-mappning (V11 Rail → V12-modul)

Förankrat i de **faktiska** attribut V11-railen redan avger (idag graceful no-ops i
rail-only — #142:s kända V2-begränsning). V12 är målet de ska öppna.

| V11 deep-link-attribut                                           | Exempelvärden                     | Öppnar V12-modul                                    |
| ---------------------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| `data-v9-section-link`                                           | `upcoming`, `historik`, `journal` | Bokningar / Historik / Journal                      |
| `data-kk-jump`                                                   | `kk-card-halsa`, dyn. `s.jump`    | Hälsodeklaration (+ djuplänk till kort)             |
| `data-v11-doc-registry` / `-status` / `-previewable` / `-filler` | dok-metadata                      | Dokument (preview/registry)                         |
| `data-v9-quick`                                                  | snabbåtgärder                     | Modul-kontextuell quick-action (återanvänd handler) |
| `data-v11-active-visit-action`                                   | aktivt besök-CTA                  | Aktivt besök / Journal-flöde                        |

> **D2 LÅST:** V12 öppnas från V11:s deep-links/moduler men byggs bakom `?v12workspace=on`
> (default OFF). Navigeringsmodellen följer ytmodellen i §4: webb/iPad → modulen öppnas i Zon 2
> _bredvid_ Zon 1-railen; mobil → V12 öppnas som egen vy (ytbyte). Routing/back per D4.

---

## 4. Responsivitet (webb / iPad / mobil från start)

| Breakpoint    | Ytmodell (D3 LÅST)                                                                  |
| ------------- | ----------------------------------------------------------------------------------- |
| **Mobil 390** | V12 **ersätter ytan** som egen vy; en kolumn; back → kundkortet; inga h-scrollbars  |
| **iPad 820**  | Zon 1-rail + Zon 2 **sida vid sida där det får plats**, annars ytbyte (touch-först) |
| **Webb 1440** | Zon 1-rail **bredvid** V12 Zon 2 samtidigt                                          |

> **D3 LÅST:** Webb/iPad visar V11-railen (Zon 1) _bredvid_ V12 (Zon 2) där det får plats;
> mobil → V12 ersätter ytan som egen vy.

---

## 5. Feature flag & mount (additivt, som V11)

- Ny flagga: **`?v12workspace=on`** → sticky i `localStorage`, **default OFF** (opt-in),
  opt-out `?v12workspace=off`. Egen nyckel, isolerad från `v11rail`/`v9`-flaggor.
- Mount/switch **additiv & guardad** (tidig return utan flagga) — legacy + V11 oförändrade
  när flaggan är av.
- Eget rent namespace (`.v12-workspace__*`), inga legacy-override-klasser (canon §5-stil).

---

## 6. Handler-policy (parity)

- **Inga nya handlers om befintliga kan återanvändas.** V12-moduler wire:ar mot samma
  handlers som V11/V9 redan exponerar:
  - Aktivt besök / journal-CTA: `bindIntelligentJourney` / `CcoV9CustomersParity`
  - Boka nästa / bekräfta tider: befintliga boknings-handlers (ord48-flödet)
  - Dokument-preview: befintlig doc-preview-handler (`data-v11-doc-*`-konsumenten)
- Ny handler tillåts **endast** för genuint ny interaktion som saknar motsvarighet —
  dokumenteras + motiveras i modulens canon-tillägg.
- **Data/adapters (D5 LÅST):** återanvänd V11-adapters (`CcoV11RailAdapters.build*`) och
  befintliga handlers där det går; nya data-contracts införs **endast** där V12-modulen kräver
  mer data än railen — och dokumenteras i modulens canon-tillägg.

---

## 7. Byggprocess (per modul)

1. Modul-canon-tillägg (scope, data-contract, deep-link, handler-återbruk) — låses.
2. Bygg modulen bakom `?v12workspace=on`, additivt.
3. Screenshots **390 / 820 / 1440** (samma artifact-mönster som V11-rail).
4. **Codex-granskning före merge.** En modul per PR.
5. Ingen cutover (default ON) av V12 förrän separat beslut, efter att kärnmodulerna är klara.

---

## 8. Låsta beslut (ägare 2026-06-22) — pending Codex

- **D1 ✅** — V12 = full customer workspace (Zon 2) = **hela kundresan, 13 sektioner i låst ordning** (§2), inte en utökad rail och inte en dashboard. Journal (6) byggd i #148.
- **D2 ✅** — Öppnas från V11:s deep-links/moduler; byggs bakom `?v12workspace=on` (default OFF).
- **D3 ✅** — Webb/iPad: Zon 1-rail _bredvid_ Zon 2 där det får plats. Mobil: V12 ersätter ytan som egen vy.
- **D4 ✅** — URL/routing stödjer tillbaka till kundkortet + deep-link till rätt V12-modul.
- **D5 ✅** — Återanvänd V11-adapters + befintliga handlers; nya data-contracts endast där V12 behöver mer data.

---

## 9. Detta är INTE bygge

Endast canon/scope. Ingen flagga, inget scaffold, ingen kod ändras i denna PR.
Bygge startar modul-för-modul efter att canon (inkl. D1–D5) är Codex-låst.

_Relaterat: V11 Rail-canon (`V11-RAIL-CANON-DECISION-2026-06-21.md`), cutover #145,
post-cutover smoke (#146)._
