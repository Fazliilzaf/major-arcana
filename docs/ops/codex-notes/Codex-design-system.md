# Codex Design System

## Stor kundvy ovanpå kunddossiér

Den här "Stor kundvy"-rutan är byggd som ett extra lager ovanpå kunddossiér, inte som en ersättning för högerpanelen.

### Koddelarna

1. Expand- och deep-link-knappar binds via `data-v9-open-deep` i:

   `public/major-arcana-preview/app/cco-v9-customers-parity.js`

   ```js
   root.querySelectorAll('[data-v9-open-deep]').forEach((node) => {
     if (node.dataset.bound === '1') return;
     node.dataset.bound = '1';
     node.addEventListener('click', () => {
       const mode = node.getAttribute('data-v9-open-deep') || 'filer';
       handlers.openDeep?.(mode);
     });
   });
   ```

2. Själva stor-vy-shellen skapas i patient master-UI:t:

   `public/major-arcana-preview/app/patient-master-ui.js`

   ```js
   <div class="v9-dossier-deep" data-v9-dossier-deep hidden aria-hidden="true">
     <div class="v9-dossier-deep__head">
       <strong data-v9-deep-title>Dossier</strong>
       <button type="button" class="v9-dossier-deep__close" data-v9-deep-close>
         Stäng
       </button>
     </div>
     <div class="v9-dossier-deep__body" data-v9-deep-body></div>
   </div>
   ```

3. Öppning och stängning av stor-vyn styrs i:

   `public/major-arcana-preview/app/patient-master-ui.js`

   ```js
   function closeV9DossierDeepPanel() {
     const deep = document.querySelector('[data-v9-dossier-deep]');
     if (!deep) return;
     deep.hidden = true;
     deep.setAttribute('aria-hidden', 'true');
     const body = deep.querySelector('[data-v9-deep-body]');
     if (body) body.innerHTML = '';
   }

   function openV9DossierDeepPanel(mode, ctx) {
     const deep = document.querySelector('[data-v9-dossier-deep]');
     const body = deep?.querySelector('[data-v9-deep-body]');
     const title = deep?.querySelector('[data-v9-deep-title]');
     if (!deep || !body) return;
     ...
   }
   ```

4. Det finns även en blueprint-variant av samma shell i:

   `public/major-arcana-preview/app/cco-kundkort-blueprint.js`

   Den använder samma `data-v9-dossier-deep`, `data-v9-deep-title`, `data-v9-deep-close` och `data-v9-deep-body`-kontrakt.

5. CSS-layouten för rutan ligger i:

   `public/major-arcana-preview/cco-v9-customers.css`

   och blueprint-specifik styling ligger i:

   `public/major-arcana-preview/cco-kundkort-blueprint.css`

### Hur det är tänkt att funka

När användaren trycker på en expand- eller deep-link-knapp öppnas samma stora kundvy. Den ska starta i valt läge eller segment, till exempel filer, profil, tidslinje eller ett dossiersegment.

Designprincipen är att stora kundvyn återanvänder kunddossiérens redan renderade pipeline och UI-kontrakt. Den ska alltså inte bygga en ny parallell dataväg för kundinformationen om det inte finns ett tydligt produktbeslut om det.

Det önskade framtida mönstret är:

```html
<section class="v9-deep-workspace">
  <aside class="v9-deep-workspace__nav">
    kundinfo alla dossiersegment som knappar
  </aside>

  <article class="v9-deep-workspace__panel">
    aktivt segment med all info
  </article>
</section>
```

I vänsterspalten ska alla segment från kunddossiér vara navigerbara, så användaren kan hoppa mellan exempelvis hälsodeklaration, kundresa, foton, ekonomi och dokument utan att lämna stora vyn.

### Viktig implementationston

- Bevara högerdossiér som primär källa för segmenten.
- Låt stor-vyn vara ett workspace-lager som läser från samma renderade eller sammanställda kundkontext.
- Undvik att duplicera patient-, journal-, Cliento-, Drive- eller Fortnox-logik i stor-vyn.
- Om segmentnav läggs tillbaka ska det kopplas till befintliga `data-v9-section`-segment där det är möjligt.
