# V13-facit · kundvyn

Två fristående HTML-filer som visar hur kundvyn ska se ut. De renderar i en
webbläsare utan server — öppna dem direkt.

| Fil                                     | Vad den visar                               |
| --------------------------------------- | ------------------------------------------- |
| `V13-WORKSPACE-CONTENT-2026-08-24.html` | Huvudkolumnen, elva sektioner               |
| `V13-HOGERSPALT-2026-08-24.html`        | Högerspalten, samma sektioner plus fem egna |

Skapade 2026-08-24 av Fazli. Lagda i repot 2026-08-25 så att den som
arbetar med ORD-106 kommer åt dem utan att be om filer.

## Huvudkolumnens sektioner, i ordning

| Bokstav | Id          | Rubrik                   |
| ------- | ----------- | ------------------------ |
| ◐       | `s-visit`   | Aktivt besök             |
| A       | `s-warn`    | Kritiska varningar       |
| B       | `s-resa`    | Kundresa                 |
| C       | `s-journal` | Journal                  |
| D       | `s-foto`    | Foto-dokumentation       |
| E       | `s-plan`    | Behandlingsplan / Offert |
| F       | `s-dok`     | Dokument                 |
| G       | `s-komm`    | Kommunikation            |
| H       | `s-eko`     | Ekonomi                  |
| I       | `s-uppf`    | Uppföljning              |
| J       | `s-hist`    | Historik                 |

Plus `s-hero` överst, och undersektionerna `s-visit-shell`,
`s-visit-sub-lbl` och `s-visit-collapse-btn`.

## Högerspaltens fem extra

`s-next`, `s-insights`, `s-book`, `s-doc-latest`, `s-visits-hist`.

Ingen av dem fanns i någon `app/*.js` när facit lades in.

## Läs det här innan du jämför

Kundvyn i produktion är **V11**, inte V12. Kontrollerat i den körande
sidan 2026-08-25: `__ARCANA_V11_RAIL_ENABLED__` är `true`,
`__ARCANA_V12_WORKSPACE_ENABLED__` är `false`, och det öppna kundkortet
har klassen `patient-master-card v11-rail`.

V12 är inte trasig — den är `default OFF, opt-in` och har aldrig slagits
på. Se `app/cco-v12-workspace-flag.js`.

V13:s sektions-id förekommer redan i `app/cco-v12-canon.js`, men den
filen renderar sex rubriker varav bara två finns i facit. Någon har alltså
börjat porta strukturen utan att byta innehållet.

Arbetsordern är `docs/handover/ORDERS/ORD-106-v13-kundvy-2026-08-25.md`.
