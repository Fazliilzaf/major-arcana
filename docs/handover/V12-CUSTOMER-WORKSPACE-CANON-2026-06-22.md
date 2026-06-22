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

## 2. Arbetsflöden (moduler)

Moduler härleds från V11-railens sektioner men på **arbetsnivå** (göra, inte bara se).
**En modul i taget** byggs, var och en låst i canon innan bygge.

> **D1 LÅST:** V12 = full customer workspace (Zon 2), **inte** utökad rail. v1-modulset enligt
> tabellen nedan (Journal + Bokningar must-have; Historik/Hälsodeklaration/Dokument v1; övriga
> later). Exakt modulordning bekräftas per modul-canon.

| Modul (kandidat)                                                  | Zon 1-källa                       | v1?           | Not                          |
| ----------------------------------------------------------------- | --------------------------------- | ------------- | ---------------------------- |
| Journal                                                           | `data-v9-section-link="journal"`  | **must-have** | Skriv/läs journal, signering |
| Bokningar                                                         | `data-v9-section-link="upcoming"` | must-have     | Boka nästa, bekräfta tider   |
| Historik                                                          | `data-v9-section-link="historik"` | v1            | Tidslinje besök/åtgärder     |
| Hälsodeklaration                                                  | `data-kk-jump="kk-card-halsa"`    | v1            | Signera/förbered TP          |
| Dokument                                                          | `data-v11-doc-*`                  | v1            | Preview/registry/auto-docs   |
| Ekonomi / Offerter / Foton / Filer / Kommunikation / Anteckningar | resp. section-link                | later         | Efter v1-kärnan              |

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

- **D1 ✅** — V12 = full customer workspace (Zon 2), inte en utökad rail. v1-modulset enligt §2.
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
