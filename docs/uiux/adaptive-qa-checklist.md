# CCO Adaptive QA Checklist

Kör vid varje UI-ändring. Verifiera per breakpoint.

---

## 320px (liten mobil)

- [ ] Inga kort överlappar
- [ ] Ingen horisontell scroll
- [ ] All text synlig (ÅÄÖ ej klippt)
- [ ] Sticky actions synliga
- [ ] Sidan scrollar ända ner
- [ ] Bottom nav synlig och klickbar
- [ ] Touch targets ≥ 44px
- [ ] Status chips wrappas rent
- [ ] Modaler visas som bottom sheets
- [ ] Tabeller scrollbar horisontellt eller konverterade till kort

## 390px (iPhone)

- [ ] Kort proportionella
- [ ] Chips wrappas korrekt
- [ ] Bottom sheets användbara
- [ ] Formulär användbara med keyboard öppen
- [ ] Bokningsflöde fungerar steg-för-steg
- [ ] Kalender visar dagvy/lista

## 768px (iPad portrait)

- [ ] Inga uppblåsta mobilkort
- [ ] Split view där det förbättrar (kundlista + profil)
- [ ] Navigation lämplig (rail eller bottom)
- [ ] Modaler centrerade, ej full-width
- [ ] Bokning: sida-vid-sida kandidater + detalj

## 1024px (iPad landscape / liten desktop)

- [ ] Inte för tomt
- [ ] Inte full desktop-overload
- [ ] Två-panel-workflows fungerar
- [ ] Sidebar synlig
- [ ] Kalender: dag + veckoöversikt

## 1440px+ (desktop)

- [ ] Full workspace
- [ ] Sidebar med navigering
- [ ] Tabell/kalender-vyer användbara
- [ ] Multi-column dashboard
- [ ] Inga onödigt stora tomrum

---

## Per vy — snabbcheck

| Vy | 320px | 390px | 768px | 1024px | 1440px |
|----|:-----:|:-----:|:-----:|:------:|:------:|
| Dashboard | ☐ | ☐ | ☐ | ☐ | ☐ |
| Arbetskö | ☐ | ☐ | ☐ | ☐ | ☐ |
| Bokning | ☐ | ☐ | ☐ | ☐ | ☐ |
| Kalender | ☐ | ☐ | ☐ | ☐ | ☐ |
| Kundkort | ☐ | ☐ | ☐ | ☐ | ☐ |
| Journal | ☐ | ☐ | ☐ | ☐ | ☐ |
| Hälsodeklaration | ☐ | ☐ | ☐ | ☐ | ☐ |
| Samtycke/Avtal | ☐ | ☐ | ☐ | ☐ | ☐ |
| Offert | ☐ | ☐ | ☐ | ☐ | ☐ |
| Kommunikation | ☐ | ☐ | ☐ | ☐ | ☐ |
| POS | ☐ | ☐ | ☐ | ☐ | ☐ |
| Personalvy | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## Kända problem (fixade i adaptive-overrides.css)

| Problem | Fix |
|---------|-----|
| Kort överlappar på mobil | `flex-direction: column` + `gap` |
| Scroll stoppar | `overflow-y: auto` + `max-height: none` |
| Chips hamnar i kanten | `flex-wrap: wrap` + `max-width` |
| ÅÄÖ klipps | `overflow-wrap: break-word` |
| Tabeller för breda | Horisontell scroll eller card-transformation |
| Modaler blockar | → Bottom sheet på mobil |
| iPad stretchar mobilkort | Grid 2-col + split view |
| Desktop-panels på mobil | Reset: `position: relative`, `width: 100%` |
| Touch targets < 44px | `min-height: 44px` globalt under 1024px |
| Horisontell scroll | `overflow-x: hidden` på body/page/canvas |
