# CCO Surface Map (canonical)

**Status:** Låst karta · dokumentation · ingen funktionell ändring
**Syfte:** Låsa vilken vy/fil som hör till varje CCO-flik så att arbete inte sker i fel yta.

## Enda riktiga CCO-ytan

```
https://arcana.hairtpclinic.com/admin#cco
```

Allt CCO-operatörsarbete sker här. Inga andra sidor är produktionsmål.
`file://`-länkar får **endast** användas som lokal designreferens — **aldrig** som mål-länk eller produktionsyta.

## Flikkarta

| Flik (admin#cco)   | Design/vy                    | Fil                                                           | Datakälla                                                                     |
| ------------------ | ---------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Konversationer** | operatörens svarsyta         | `public/konversationer.html`                                  | `GET /api/v1/cco/runtime/worklist/consumer` (+ `/conversation/:key/messages`) |
| **Kalender**       | boknings-/kalendervy         | `public/kalender.html`                                        | bokningsdata (kalender-API)                                                   |
| **Kunder**         | stora kundvyn (7 337 kunder) | `major-arcana-preview` customers-vy (`?view=customers&v9=on`) | kundregister / patient-master                                                 |

## Verifierad routing (idag)

`admin#cco` renderar CCO-ytan via en embed vars källa är låst till Konversationer:

- `public/admin.js:52` — `CCO_PREVIEW_PRIMARY_PATH = '/konversationer.html'`
- `public/admin.js:53` — `CCO_PREVIEW_EMBED_SRC = '/konversationer.html'`
- Embed:en laddas när `#cco` är aktiv **och** användaren har giltig owner-session (`admin.js` — `if (!state.token) return`).

Fliknavigeringen till Kalender och Kunder ligger i `public/konversationer.html`:

- `public/konversationer.html:1864` — `<a href="/kalender.html">Kalender</a>` → **Kalender = `public/kalender.html`**
- `public/konversationer.html:1865` — `<a href="/major-arcana-preview/?view=customers&v9=on">Kunder</a>` → **Kunder = 7 337-kundvyn**

Slutsats: den faktiska routingen är **konsistent** med kartan ovan. Ingen omkoppling krävs i PR 1.

## Regler (gäller allt CCO-arbete)

- Bygg **inte** nya visuella spår — koppla rätt befintlig design till rätt flik.
- `file://` = endast designreferens, aldrig mål/produktion.
- **Ingen live-send** utan owner-GO (den ligger sist).
- **Ingen demo** som ersätter live-data när live finns.
- Små PR:er, en flik i taget. Codex granskar innan merge.

## PR-ordning

1. **CCO Surface Map** (detta dokument) — låsa kartan + verifiera routing. Inga funktionella ändringar.
2. **Konversationer** — `admin#cco → Konversationer` använder `konversationer.html`-designen · live-data från `/worklist/consumer` · Svarstudio öppnas från vald tråd · **Till** från riktig kundmail · **Från** = exakt en mailbox · **Skicka** låst om mottagare saknas · ingen live-send.
3. **Kalender** — koppla `kalender.html`-designen under fliken. Ingen ny design.
4. **Kunder** — säkerställ 7 337-vyn under fliken med kundkort/dokument/offertstatus.
