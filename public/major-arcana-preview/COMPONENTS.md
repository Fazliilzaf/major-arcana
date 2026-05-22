# CCO Preview — CSS-arkitektur

*Sista uppdatering: 2026-05-08 (Fas 3 Steg A)*

## Aktuellt läge

### Filer som laddas (i `index.html`)

| Fil | Roll | Layer (planerad) |
|---|---|---|
| `design-tokens.css` | CSS-variabler (färger, spacing, shadows, typografi) | — |
| `styles.css` | Legacy: alla v3/v4/v5-regler från tidigare designgenerationer | `legacy` |
| `cco-polish.css` | Modern: warm-row + warm-* komponenter | `components` |

### Layer-deklaration (i `design-tokens.css`)

```css
@layer reset, base, legacy, components, utilities, overrides;
```

**Senare layer vinner över tidigare.** Detta är intentionen, men ingen fil är wrappad i layer ännu — så cascade fungerar fortfarande på vanligt specificity-sätt.

---

## Tokens

Alla färg-/spacing-/typografi-konstanter ska gå via CSS-variabler från `design-tokens.css`, inte hårdkodas.

### Warm-row palett (för CCO-inkorg)

```css
/* Ändra HÄR för att uppdatera hela inkorgens utseende */
--warm-bg-soft:    #FFF8F1;
--warm-bg-warmer:  #FFF6ED;
--warm-card:       #FBF6F0;
--warm-hover:      #F4ECE3;
--warm-border:     #F1E5DB;

--warm-violet: #7C3AED;  /* Oklart */
--warm-orange: #F97316;  /* Miss-risk */
--warm-indigo: #4F46E5;  /* Behöver svar */
--warm-red:    #EF4444;  /* Behöver åtgärd */
--warm-green:  #16A34A;  /* Klar */

--warm-text:    #0F172A;
--warm-text-2:  #1F2937;
--warm-text-3:  #4B5563;
```

Använd som `var(--warm-violet)`. Aldrig hårdkoda hex i komponentfiler.

---

## Komponentbibliotek (warm-row)

### Article struktur

```html
<article class="thread-card unified-queue-card warm-row" data-lane="oklart">
  <span class="warm-rail" aria-hidden="true"></span>
  <div class="warm-top">
    <span class="lane-badge" data-lane="oklart">Oklart</span>
    <div class="warm-top-meta">
      <time class="meta-date">6 maj</time>
      <span class="meta-sep">·</span>
      <span class="meta-status unowned">Ej tilldelad</span>
    </div>
  </div>
  <div class="warm-mid">
    <div class="warm-avatar avatar-wrap">
      <span class="avatar queue-history-avatar">MB</span>
      <span class="status-dot"></span>
    </div>
    <div class="warm-content">
      <div class="warm-line-1">
        <span class="warm-sender">Sender Name</span>
        <span class="warm-sep">·</span>
        <span class="warm-subject signal-what">Subject text</span>
        <span class="warm-file-icons">📎</span>
      </div>
      <div class="warm-preview">2-line body excerpt...</div>
      <div class="warm-why" data-why-kind="alert">
        <span class="warm-why-icon"><svg>...</svg></span>
        <span class="why-reason">Hög risk</span>
      </div>
    </div>
    <div class="warm-actions action-cluster">
      <!-- 5 cirkulära action-icons + primary-action pill -->
    </div>
  </div>
</article>
```

### Lane-koder (för `data-lane`)

| Kod | Färg | Visningsnamn |
|---|---|---|
| `oklart` / `unclear` | lila `#7C3AED` | Oklart |
| `act-now` / `urgent` | röd `#EF4444` | Behöver åtgärd |
| `granska` / `review` | indigo `#4F46E5` | Behöver svar |
| `senare` / `later` | orange `#F97316` | Miss-risk |
| `bokning` / `bookable` | grön `#16A34A` | Bokning |

`data-lane`-attributet sätts på `<article>`, `<span class="lane-badge">`, och `.warm-rail` ärver färg automatiskt.

### Why-kinds (för `.warm-why[data-why-kind]`)

| Kind | Ikon | Färg-token | Användning |
|---|---|---|---|
| `alert` | ⚠ | `--warm-orange` | Miss-risk, deadline |
| `refresh` | ↻ | `--warm-indigo` | Behöver svar, fråga |
| `info` | ⓘ | `--warm-red` | Behöver åtgärd, brådskande |
| `check` | ✓ | `--warm-green` | Klar, slutfört |

Detekteras automatiskt från `whyText` i `runtime-queue-renderers.js`.

---

## Renderingspath

```
worklist-API → app.js (buildUnifiedCardMarkup) → DOM (warm-row markup)
                ↓
                runtime-fix-shims.js (P0/P1 patches via setInterval polling)
                runtime-sentiment-badges.js (data-quick-sentiment via polling)
                runtime-i18n.js (text-translation via observer)
                runtime-a11y.js (auto-aria-label via observer)

worklist-API failar → runtime-demo-fixture-name-patch.js
                       → buildFix14CardHtml (warm-row markup direkt)
                       → injicerar i .queue-history-list
```

---

## Konventioner

### Specificity-strategi

- Komponentregler i `cco-polish.css` ska ha specificitet (0,0,3,0) eller högre — t.ex. `.thread-card.unified-queue-card.warm-row .warm-sender`
- Eftersom legacy `styles.css` har många `!important`, behåller vi `!important` i `cco-polish.css` tills hela legacy är layered
- Ny komponentkod ska INTE använda `!important` utan istället förlita sig på selector-kedjor

### Filnamn

- `warm-*` prefix för alla CCO-inkorg-specifika klasser
- `cco-*` prefix för CCO-globala tokens i design-tokens.css
- `runtime-*` prefix för app-runtime-helper-skript (i18n, a11y, virtual-scroll)

### Cache-busters

`index.html` har 29 `?v=...` som synkas via:

```bash
npm run sync-cache-busters    # uppdatera till git short-hash
npm run check-cache-busters   # CI-check att alla är synkade
```

Kör `sync-cache-busters` innan `git push`.

---

## Framtida arbete (Fas 3 fortsättning)

1. **Wrap `styles.css` i `@layer legacy`** via `@import url(...) layer(legacy)` i en wrapper-fil
2. **Wrap `cco-polish.css` i `@layer components`**
3. **Ta bort `!important`** från cco-polish.css när layer-ordning garanterar vinst
4. **Refactor app.js render-pipeline** — render(state) → DOM, ingen direct DOM-mutation
5. **Migrera `runtime-fix-shims.js` shims** in i app.js där de hör hemma

Se `CCO-POSTMORTEM.md` för full plan.
