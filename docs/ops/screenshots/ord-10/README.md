# ORD-10 prod screenshots — Kunder v9

**URL:** https://arcana.hairtpclinic.com/major-arcana-preview/?view=customers  
**Deploy:** `dep-d8ghaibtqb8s73bjotvg` · commit `17b4881d`  
**Captured:** 2026-06-04 (Playwright, utan STAFF-token)

| Fil                    | Sektion                           | DOM                                                             |
| ---------------------- | --------------------------------- | --------------------------------------------------------------- |
| `01-topnav.png`        | Top-nav (rose-pill Kunder)        | `.top-nav`                                                      |
| `02-side-shell.png`    | Segment / kundgrupper             | `.side-shell`                                                   |
| `03-story-cards.png`   | Mittkolumn (toolbar + story-host) | `.customers-surface` — story-grid fylls efter inloggning        |
| `04-filters.png`       | Filter-chips                      | `.customers-filters`                                            |
| `05-customer-list.png` | Kundlista                         | `.customers-list`                                               |
| `06-agg-shell.png`     | Höger Kundpopulation              | `.intel-booking-view` / `.agg-shell`                            |
| `07-dossier.png`       | Dossier-vy                        | `.intel-shell` (öppen dossier kräver inloggad STAFF + radklick) |

Regenerera:

```bash
node scripts/capture-kunder-v9-prod-screenshots.js
```
