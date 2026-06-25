# CCO · Source of truth · mappar · 2026-06-24

**Syfte:** En enda utgångskälla för kod, PR och deploy. Facit och arkiv är separata — inget byggs från iCloud-arkiv.

**Status:** Låst handover-regel. Inget i detta dokument innebär flytt eller radering av filer på disk.

---

## Regel (Cloud / Cursor / Claude Code / Codex)

```text
Bygg aldrig från iCloud-arkivmapparna.

All kod, PR, commit, deploy och live-CCO ska ske från:
  ~/Code/major-arcana

Facit och design-spec får läsas från:
  ~/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0

Arkivmappar (_ARKIV-*): rör ej, bygg inte, öppna inte som Cursor workspace.
```

---

## 1 · Aktiv kod (enda sanningen)

|                |                                                                                       |
| -------------- | ------------------------------------------------------------------------------------- |
| **Sökväg**     | `/Users/fazlikrasniqi/Code/major-arcana`                                              |
| **Git**        | `origin` → GitHub (`Fazliilzaf/major-arcana`)                                         |
| **Användning** | Commits, branches, PR, CI, `npm run dev:offline`, live-CCO på `http://127.0.0.1:3100` |
| **Cursor**     | Öppna **endast** denna mapp som workspace                                             |

**Live preview (lokal):**

```bash
cd ~/Code/major-arcana
PORT=3100 npm run dev:offline
```

**Kundkort / högerspalt (exempel-URL):**

```text
http://127.0.0.1:3100/staff?view=customers&v9=on&demo=on&patientId=<uuid>
```

Relevant kod ligger under `public/major-arcana-preview/`.

---

## 2 · Facit / design / spec (referens — inte byggbas)

|                |                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------- |
| **Sökväg**     | `/Users/fazlikrasniqi/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0`        |
| **Storlek**    | ~35 MB                                                                                      |
| **Användning** | Visuellt facit, HTML-mockups, design-spec. **Läs** för paritet — **commita inte härifrån**. |
| **Exempel**    | `HOGERSPALT-v11-komplett-2026-06-18.html`                                                   |

**Regel:** När facit behövs i repo (t.ex. för handover) — **kopiera en gång** till `docs/` under aktiv kod och committa där, istället för att utveckla i iCloud-mappen.

---

## 3 · Arkiv · rör ej · bygg inte

### `_ARKIV-iCloud-Major-Arcana-2.0`

|                |                                                                                 |
| -------------- | ------------------------------------------------------------------------------- |
| **Sökväg**     | `~/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-iCloud-Major-Arcana-2.0` |
| **Storlek**    | ~27 GB                                                                          |
| **Innehåll**   | Gamla repo-kopior, gamla `public/`, mockups, många demo-HTML                    |
| **Användning** | Kallhistorik / backup. **Ingen** dev, **ingen** PR, **ingen** deploy.           |

### `_ARKIV-Major-Arcana-2.0-cco-extract`

|                |                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| **Sökväg**     | `~/Library/Mobile Documents/com~apple~CloudDocs/_ARKIV-Major-Arcana-2.0-cco-extract`                    |
| **Storlek**    | ~72 MB                                                                                                  |
| **Innehåll**   | Gammal `major-arcana` + `cco-server` (extract). Listade demo-filer från aktiv facit finns **inte** här. |
| **Användning** | Arkiv. **Ingen** dev.                                                                                   |

**Regel:** Flytta eller radera inte utan explicit beslut och inventering (unika commits / filer som saknas på GitHub).

---

## Snabböversikt

```text
AKTIV KOD:
  ~/Code/major-arcana

FACIT / DESIGN:
  iCloud/Major Arcana 2.0

ARKIV / RÖR EJ:
  _ARKIV-iCloud-Major-Arcana-2.0
  _ARKIV-Major-Arcana-2.0-cco-extract
```

---

## Vanliga misstag (orsak till «67 commits»-kaos)

| Misstag                                                | Konsekvens                                |
| ------------------------------------------------------ | ----------------------------------------- |
| Cursor workspace = `Major Arcana 2.0` eller `_ARKIV-*` | Patchar gammal bas; paritet «landar» inte |
| `git pull` bara i iCloud-kopia                         | Drift mot `origin/main`                   |
| Facit-HTML redigeras i arkiv istället för i repo       | Dubbla sanningar                          |
| Bundle/cache från gammal `public/`                     | Live ser fel trots «grön» mätning         |

---

## Relaterat i repo

- ORD-handover: `docs/handover/ORDERS/`
- Open-flow (V12 dossier): PR mot `main` från `~/Code/major-arcana` (t.ex. `#179`)

---

_Skapad 2026-06-24 efter Codex-inventering av iCloud-mappar. Owner: Hair TP / Major Arcana CCO._
