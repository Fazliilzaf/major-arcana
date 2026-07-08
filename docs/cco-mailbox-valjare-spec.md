# Brevlåde-väljare — CCO Konversationer (UI-spec + datakontrakt)

Status: **UI (design) byggt i denna PR** (`public/konversationer-mailbox-valjare.js`),
design-först och icke-brytande. **Datakontraktet implementerar Codex** enligt nedan —
UI:t läser `GET /api/v1/cco/runtime/mailboxes` när den finns och visar annars en ren
"väntar på data"-status.

Mål: operatören väljer vilka brevlådor som läses in i Konversationer, ser status per
brevlåda, och styr folder-scope och läsfönster — allt i CCO:s **befintliga** design.

## Ramar (icke förhandlingsbara)

- **Ingen omdesign.** Återanvänd befintlig layout, klasser och tokens i
  `public/konversationer.html`. Inga nya färger införs.
- **Lokal Mac Mail-modell.** Vyn läser den lokala speglingen. Räknare/trådar hämtas
  **inte** live per öppning — schemalagd sync + manuell "↻ Synka nu" uppdaterar spegeln.
- **Ingen live-send ändras.** Väljaren styr bara vad som läses/visas. Utskickskedjan
  och grindarna (`CCO_SEND_LIVE`, `CCO_COMPOSE_SEND_LIVE`, m.fl.) är orörda.
- **Nytt mail** använder redan Svarstudions accent `--accent-studio: #bb4779`
  (send-knapp, fokusring, signaturpiller). Väljaren delar samma token.

## Placering (3-panelslayouten: lanes · inkorg · tråd)

Brevlåde-scope är en nivå **ovanför** lanes.

- **A — Brevlåde-väljaren:** överst i vänsterrälen, ovanför lane-listan.
- **B — Folder-scope + läsfönster:** segmenterade kontroller i inkorg-headern
  (bredvid `.inbox-kicker` / `.inbox-tabs`).
- **C — Status per brevlåda:** inline i varje brevlåderad (senaste sync, ink/skick,
  fel) — synligt utan att öppna något.

## Brevlådor + rälsfärger (alla ur befintlig palett)

Fler-val med kryssrutor. **Alla** överst = select-all (blandat urval → delvis-läge, streck i stället för bock).

| Brevlåda | id (illustrativt)          | Rälsfärg (befintlig token/hex) |
| -------- | -------------------------- | ------------------------------ |
| Alla     | `*` (aggregat)             | `--rail-info` `#84756b`        |
| Kons     | `kons@hairtpclinic.com`    | `#9c2c62`                      |
| Contact  | `contact@hairtpclinic.com` | `--rail-contact` `#2596a8`     |
| Egzona   | `egzona@hairtpclinic.com`  | `--rail-egzona` `#a37433`      |
| Fazli    | `fazli@hairtpclinic.com`   | `--rail-fazli` `#7c3aed`       |
| Marknad  | `marknad@hairtpclinic.com` | `#9c6210`                      |
| Kvitto   | `kvitto@hairtpclinic.com`  | `#3d6e58`                      |
| Hälso    | `halso@hairtpclinic.com`   | `--rail-info` `#4a7ba8`        |

`--rail-fazli/egzona/contact/info` finns redan i `konversationer.html :root`. Övriga
hex är redan definierade i samma fils tab-färgspalett (inga nya färger).

## Kontroller

- **Folder-scope:** segmenterad kontroll `Inkorg · Skickat · Utkast` (samma mönster/hex
  som Svarstudions flikar; aktiv flik = vit bakgrund + `#bb4779`).
- **Läsfönster:** segmenterad kontroll `30 · 90 · 365 dagar`.

## Beteende & regler

- **Val är sticky per operatör** — valda brevlådor, folder-scope och läsfönster sparas
  och gäller nästa gång vyn öppnas.
- **Fel blockerar inte** — en brevlåda med sync-fel visas rött (`#b94a4a`), men övriga
  läses ändå in; "Synka nu" försöker igen.
- **Status i klartext** — "Synkad X sedan"; äldre än ett tröskelvärde tonas i warning
  (`#c8821e`).
- Väljaren driver den befintliga inkorgs-/worklist-hämtningen (`mailboxIds`-parametern
  finns redan i `konversationer.html`).

## Datakontrakt (Codex)

Föreslagen endpoint: `GET /api/v1/cco/runtime/mailboxes` (läsning, RBAC likt övriga
CCO-runtime-endpoints). Per brevlåda:

| Fält         | Typ                                  | Beskrivning                                            |
| ------------ | ------------------------------------ | ------------------------------------------------------ |
| `id`         | string                               | Brevlåde-id, t.ex. `kons@hairtpclinic.com`             |
| `label`      | string                               | Visningsnamn: Kons, Contact, Egzona, Fazli, Marknad, … |
| `railColor`  | string                               | Token-nyckel eller befintlig hex (ingen ny färg)       |
| `counts`     | `{ inbox:int, sent:int, draft:int }` | Räknare per folder, för valt läsfönster                |
| `lastSyncAt` | ISO-8601 string \| null              | Senaste lyckade sync → "Synkad X sedan"                |
| `error`      | `{ message, lastAttemptAt } \| null` | Sync-fel → röd fel-pill                                |

Vy-nivå:

| Fält          | Typ                                     | Beskrivning                   |
| ------------- | --------------------------------------- | ----------------------------- |
| `folderScope` | enum `inbox \| sent \| drafts`          | Stödda folders                |
| `window`      | enum `30 \| 90 \| 365`                  | Läsfönster i dagar            |
| `selection`   | `{ mailboxIds:[], folder, windowDays }` | Sparat operatörs-val (sticky) |

"Synka nu" bör ha en egen åtgärd (t.ex. `POST …/mailboxes/sync`) som triggar en
spegel-uppdatering utan att bli live-fetch per öppning.
