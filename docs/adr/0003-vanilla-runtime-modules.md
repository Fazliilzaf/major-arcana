# ADR-0003: Vanilla JS runtime-moduler (ej React/Vue) i preview-vyn

- Status: accepted
- Datum: 2026-02-10
- Beslutsfattare: CCO-arkitektur
- Berörda: public/major-arcana-preview/runtime-\*.js

## Kontext

Preview-vyn (operativsystemet för CCO-personal) består av många små, oberoende moduler:

- Command palette (Cmd+K)
- Saved views
- Unified search
- Keyboard shortcuts
- Skeleton loaders
- Optimistic UI
- Real-time stream (SSE)
- PWA + offline cache
- i18n + a11y
- 2FA setup
- Tenant admin / onboarding wizard
- Toast / animations / dark mode

Drivande krafter:

- Snabb iteration utan build-step (deploy = git push).
- Låg cold-start på Render (free tier).
- Få beroenden för säkerhet (mindre attack-yta).
- En operatör kan läsa en runtime-fil och förstå hela modulen.

## Alternativ

1. **Vanilla JS i IIFE-moduler exporterade på `window.MajorArcanaPreview*`** — den valda.
2. **React/Vue + bundler** — mer ekosystem men kräver build-pipeline + node_modules transit.
3. **Web Components** — närmare standard men IE-stöd är ändå inte krav, och DOM-manipulation är enkelt nog.

## Beslut

Varje feature är en runtime-`<feature>`.js-fil:

```js
(() => {
  'use strict';
  // private state, helpers, init...
  if (typeof window !== 'undefined') {
    window.MajorArcanaPreview<Feature> = Object.freeze({
      mount,
      ...publicAPI,
    });
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
```

Index.html laddar dem som `<script src="./runtime-X.js"></script>` i deterministisk ordning.

## Konsekvenser

- **Positiva**: Ingen build-step. Lätt att inspektera/debugga i browsern. Filer är självständiga och kan tas bort utan att resten kraschar.
- **Negativa**: Globalt namespace (mitigated av `MajorArcanaPreview*` prefix). Ingen typkontroll vid kompilering (mitigated av jsconfig + checkJs incrementally).
- **Risker**: Skript-ordning kan skapa subtila beroenden. Mitigation: varje modul antar att den kan saknas och kollar `typeof window.MajorArcanaPreview*` innan användning.

## Uppföljning

- Om en runtime-fil överstiger ~500 rader → splitta i mindre moduler.
- Om vi behöver komplex state mellan moduler → överväg en lättviktig event-bus istället för React.
- Utvärdera Preact/Solid som ev. tillägg för specifikt komplexa nya vyer (ej refactor av existerande).
