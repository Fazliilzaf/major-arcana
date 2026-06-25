# V11 Rail — Post-cutover smoke-checklista

Manuell smoke/visuell kontroll efter cutover (PR #145, default ON i `main` @ `3b8146f`).
Körs på riktiga kundkort i skarpt/inloggat läge på **web 1440 / iPad 820 / mobil 390**.

> **Default ON gäller nu** — utan query-param ska V11 Rail visas.
> Sticky-beteende: `?v11rail=off` sätter `localStorage='0'` och **fastnar** — återställ med `?v11rail=on` innan nästa test.

## 0. Pre-flight (en gång)

- [ ] Bekräfta att prod kör commit `3b8146f` (eller senare).
- [ ] Hård-refresh (töm cache) första gången pga flagg-`?v=`-busten.
- [ ] Öppna ett riktigt kundkort **utan** query-param → V11 Rail renderas (default ON).
- [ ] DevTools-konsol öppen genom hela passet.
- [ ] Testa på tre breakpoints: web 1440, iPad 820, mobil 390 (verifiera minst mobil på riktig enhet om möjligt).

## 1. Default ON + opt-out (alla tre viewporterna)

- [ ] Utan param → V11 Rail (`<html data-v11-rail="on">`).
- [ ] `?v11rail=off` → **legacy/off-läget** visas (gammal kkref-rail), V11 borta.
- [ ] Tillbaka med `?v11rail=on` → V11 Rail igen (sticky återställd).
- [ ] Kund som tidigare valt off (localStorage `'0'`) förblir off utan param.

## 2. Render-ordning (D→…→S) — uppifrån och ned

Bocka att sektionerna kommer i exakt denna ordning och att tomma sektioner döljs/empty-state (ingen fejkdata):

- [ ] **D** Critical warnings → **A** Profile → **V** Active visit → **B** Smart info → **C** Stats →
      **E** Health → **F** Journey → **G** Smart next step → **H** Bookings → **I** History →
      **J** Journals → **K** Offers → **L** Auto-docs → **M** Photos → **N** Files → **O** Notes →
      **P** Communication → **Q** Economy → **R** Insights → **S** Sticky footer (sist/fäst).

## 3. Hero / Active visit CTA (V)

- [ ] Aktivt besök: hero visar timeline (incheckad/pågår/klart) korrekt för besöksstate.
- [ ] CTA-knappar klickbara och triggar **befintlig** handler (ingen ny/dubbel åtgärd, inga JS-fel).
- [ ] Inget aktivt besök → ingen trasig hero (graceful).

## 4. Sticky footer (S)

- [ ] Footern fäst i nederkant, täcker inte sista sektionens innehåll vid scroll-botten.
- [ ] **Mobil 390:** krockar inte med safe-area/hemknapp; knappar nåbara med tumme.
- [ ] iPad/web: full bredd, centrerad, inga avhuggna knappar.

## 5. Console (alla viewporter)

- [ ] **Inga** `error`/uncaught exceptions vid render.
- [ ] Inga 404 på `cco-v11-rail*.{js,css}` (rätt `?v=`/bundle-hash laddas).
- [ ] CSP-varningar: endast den tillåtna inline `onerror` (foto-fallback) — inget annat.

## 6. Layout / overflow / text (per viewport)

- [ ] **390:** inga horisontella scrollbars; långa namn/e-post/adress wrappar; stat-celler & EKONOMI-grid bryter snyggt; FILM-tile + foton i 3-kolumn.
- [ ] **820:** kort fyller bredd utan glapp; pills/badges wrappar.
- [ ] **1440:** rail-bredd rimlig, inget uttänjt; tonade cream/amber-toner balanserade (inte för varma).
- [ ] Anteckningar: allergi=röd, påminnelse=amber, default=cream-neutral (kontrast bibehållen).

## 7. Viktigaste actions (funktionell smoke)

Kör i V11-läge på alla tre viewporter (minst en full genomkörning + spot-check övriga):

- [ ] **Journal** — öppna/skapa journalanteckning; sparar utan fel.
- [ ] **Boka nästa** — `Boka nästa`-flödet (ord48) startar rätt bokning.
- [ ] **Bekräfta tider** — bekräfta-tid-action uppdaterar status korrekt.
- [ ] **Svarstudio** — öppnas och kan skicka/utkast utan JS-fel.
- [ ] Generellt: inga åtgärder ger dubbla/uteblivna anrop (handlers wire:ade en gång).

## 8. KEEP deep-links (känd V2-begränsning)

- [ ] `data-v9-section-link` / `data-kk-jump` / `data-v11-doc-*` i ren rail-only är **harmlösa no-ops** (inget krasch) — förväntat, ej blocker.

---

## Resultat & severity

Notera per rad PASS/FAIL + viewport + ev. screenshot.

| Område                                            | Severity vid FAIL                            |
| ------------------------------------------------- | -------------------------------------------- |
| §3 Hero/CTA, §4 Sticky footer, §7 Actions         | **Blocker** — åtgärda före vidare utrullning |
| §1 Default/opt-out, §2 Render-ordning, §5 Console | **Blocker**                                  |
| §6 Layout/overflow                                | Kosmetik — ticket                            |
| §8 KEEP deep-links                                | Förväntat — ingen action (defer V2)          |

_Pre-existing CI (npm audit / smoke-timeout / unit-hang) hanteras separat i CI-hygien-passet och ingår inte i denna manuella smoke._
