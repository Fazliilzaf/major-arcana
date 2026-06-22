# V12 Customer Workspace — CANON / scope (DRAFT)

> **Status:** DRAFT-canon, scope-underlag. **Inget bygge** sker förrän denna canon är
> Codex-granskad och låst. Detta dokument definierar _vad_ V12 är och _spelreglerna_ —
> inte implementation.
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

> **ÖPPET BESLUT (D1):** exakt v1-modulset + ordning. Förslag nedan — låses av dig/Codex.

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

> **ÖPPET BESLUT (D2):** navigeringsmodell — öppnar deep-link V12 som (a) ny route/URL,
> (b) overlay/panel ovanpå nuvarande vy, eller (c) byte av huvudyta? Påverkar back-knapp,
> djuplänkning och mobil. Låses innan bygge.

---

## 4. Responsivitet (webb / iPad / mobil från start)

| Breakpoint    | Princip (utkast)                                                     |
| ------------- | -------------------------------------------------------------------- |
| **Mobil 390** | En kolumn, modul-navigering top/botten, inga horisontella scrollbars |
| **iPad 820**  | Två zoner möjliga (lista + detalj) eller staplat, touch-först        |
| **Webb 1440** | Full workspace, ev. Zon 1-rail + Zon 2-workspace samtidigt           |

> **ÖPPET BESLUT (D3):** ska Zon 1 (rail) vara synlig _bredvid_ Zon 2 på webb/iPad, eller
> ersätter V12 hela ytan? Avgör layout-grid per breakpoint.

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

---

## 7. Byggprocess (per modul)

1. Modul-canon-tillägg (scope, data-contract, deep-link, handler-återbruk) — låses.
2. Bygg modulen bakom `?v12workspace=on`, additivt.
3. Screenshots **390 / 820 / 1440** (samma artifact-mönster som V11-rail).
4. **Codex-granskning före merge.** En modul per PR.
5. Ingen cutover (default ON) av V12 förrän separat beslut, efter att kärnmodulerna är klara.

---

## 8. Öppna beslut att låsa före bygge

- **D1** — v1-modulset + ordning (§2).
- **D2** — navigeringsmodell för deep-links: route / overlay / ytbyte (§3).
- **D3** — samexisterar Zon 1-rail med Zon 2 på webb/iPad, eller ersätter? (§4).
- **D4** — URL/routing-strategi & back-beteende (följer av D2).
- **D5** — data-contracts per modul (återanvänd V11-adapters där möjligt?).

---

## 9. Detta är INTE bygge

Endast canon/scope. Ingen flagga, inget scaffold, ingen kod ändras i denna PR.
Bygge startar modul-för-modul efter att canon (inkl. D1–D5) är Codex-låst.

_Relaterat: V11 Rail-canon (`V11-RAIL-CANON-DECISION-2026-06-21.md`), cutover #145,
post-cutover smoke (#146)._
