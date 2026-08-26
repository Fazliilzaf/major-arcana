# ORD-113 · Bygg den stora V13 — läge A

**Arbetsorder till DeepSeek · 2026-08-26**
**Bas:** `main`
**Föregås av:** ORD-109 uppgift 3, `docs/handover/V13-STORA-VYN-UTREDNING-2026-08-26.md`

Din utredning ställde fyra frågor. **Alla fyra är avgjorda enligt din
rekommendation.** Bygg.

---

## Besluten

| Fråga                      | Beslut                                                     |
| -------------------------- | ---------------------------------------------------------- |
| Hur öppnas den?            | **Läge A** — göm listan via data-attribut, ingen ny route  |
| Vilket klick?              | **Egen "Öppna fullvy"-knapp** i den lilla vyn              |
| Ärver `?v13=on`?           | **Ja.** Ingen egen flagga.                                 |
| Var kommer 1 280 px ifrån? | `max-width: 1280px; margin: 0 auto` på arbetsytecontainern |

Skälen står i din utredning och jag håller med om alla. Läge A ger
facits fristående sidkänsla utan ny route eller nytt dataflöde, och
mönstret finns redan i `data-v9-dossier-open`. En explicit knapp gör
övergången förutsägbar och rör inga befintliga hanterare.

---

## Vad som ska byggas

**Den stora vyn renderar WORKSPACE-facit** — `.workspace` med
`<main class="main">` och `<aside class="rail">`, scopead under
`.v13-workspace-shell`. Den stilmallen finns redan:
`cco-v13-workspace.css`, 255 regler, byggd i ORD-109 uppgift 2 och
oanvänd sedan dess.

**Knappen** placeras där den syns utan att konkurrera med
"Ändra profil". Ditt val var av var — men den ska säga vad den gör.

**Tillbaka till listan** måste finnas. En användare som öppnat fullvyn
ska kunna stänga den utan att ladda om sidan.

**Sektionslänkarna.** Facit sätter `data-v12-scroll-module` och
`data-v12-open-module` på sektionerna i den lilla vyn. Klick där ska
scrolla eller öppna motsvarande sektion i den stora. Hanterarna finns
redan i sex filer — koppla in dem, bygg dem inte om.

---

## Gränser

- **V11 och V12 orörda.** `?v13=off` ska fortsätta ge
  `patient-master-card v11-rail`. Det har hållit genom sju ordrar; det
  ska hålla nu också.
- **Den lilla vyn får inte försämras.** Den är i facit-skick sedan
  ORD-112 — verifierat i produktion. Bryter något där är det en
  regression, inte en avvägning.
- Rör inte `--v11-rk-live-rail-width`.
- En gren. Svenska commit-meddelanden som förklarar _varför_.

## Verifiering

Med `?v13=on` på ett kundkort:

```js
// lilla vyn — oförändrad
({
  shell: !!document.querySelector('#v13-rail'), // true
  sektioner: document.querySelectorAll('#v13-rail [id^="s-"]').length, // 17
  öppnaKnapp: !!document.querySelector('[data-v13-open-full]'), // true
});

// efter klick på öppna-knappen
({
  workspace: !!document.querySelector('.v13-workspace-shell .workspace'), // true
  bredd: document.querySelector('.workspace').offsetWidth, // 1280
  kvot: (main.offsetWidth / rail.offsetWidth).toFixed(2), // ~2.49
  listanGömd: getComputedStyle(document.querySelector('.customers-layout'))
    .gridTemplateColumns,
});
```

Kvoten 2,49 är facits proportion — main 896, rail 360. Den mätte jag i
`V13-WORKSPACE-CONTENT-2026-08-24.html`.

**Du kan inte se bilder.** Mät det mätbara, skriv ut vad du inte kunnat
kontrollera, och lämna ögat till mig.

## Validering

- `npm run check:syntax`
- `npm run lint:no-bypass`
- `npm run test:unit`
- `ARCANA_AI_PROVIDER=fallback ARCANA_GRAPH_READ_ENABLED=false ARCANA_GRAPH_SEND_ENABLED=false npm run smoke:local`

Rapportera det verkliga testtalet.
