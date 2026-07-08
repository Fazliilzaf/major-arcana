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
  **inte** live per öppning — schemalagd (auto) sync uppdaterar spegeln — ingen manuell knapp.
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
  läses ändå in; auto-syncen försöker igen.
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

Auto-sync: UI:t läser spegeln på schema (var ~2:a min) + en schemalagd backend-
spegel-uppdatering. Ingen manuell knapp, ingen live-fetch per öppning. En valfri
`POST …/mailboxes/sync` kan trigga en spegel-uppdatering vid behov.

## Koppling till inkorgs-hämtningen (följd-PR)

Väljaren dispatchar redan `cco:mailbox-selection-change` (`{ mailboxIds, folder,
windowDays }`) och sparar valet i `localStorage['cco_mailbox_valjare_v1']`. Idag
driver den **inte** inkorgen — det kopplas i en liten följd-PR när endpointen finns.

Inkorgs-hämtningen i `public/konversationer.html` ser i dag ut så här:

```js
// rad ~2851–2855 — konstant URL byggd EN gång vid load, bara mailboxIds + limit
const LIVE_MAILBOX_IDS = ['kons@hairtpclinic.com'];
const LIVE_WORKLIST_URL =
  '/api/v1/cco/runtime/worklist/consumer?mailboxIds=' +
  encodeURIComponent(LIVE_MAILBOX_IDS.join(',')) + '&limit=50';

// rad ~4348 — loadLiveInbox() fetch:ar konstanten
const response = await fetch(LIVE_WORKLIST_URL, { … });
```

Tre hook-punkter:

**① Gör URL:en dynamisk** (ersätt `const LIVE_WORKLIST_URL`, ~rad 2852):

```js
function currentMailboxSelection() {
  try {
    return JSON.parse(localStorage.getItem('cco_mailbox_valjare_v1')) || {};
  } catch {
    return {};
  }
}
function buildWorklistUrl() {
  const s = currentMailboxSelection();
  const ids =
    s.mailboxIds && s.mailboxIds.length ? s.mailboxIds : LIVE_MAILBOX_IDS;
  const p = new URLSearchParams({
    mailboxIds: ids.join(','),
    folder: s.folder || 'inbox', // NY param
    days: String(s.windowDays || 90), // NY param
    limit: '50',
  });
  return '/api/v1/cco/runtime/worklist/consumer?' + p.toString();
}
```

**② Använd den i fetchen** (~rad 4348): `fetch(buildWorklistUrl(), …)` i stället för
konstanten.

**③ Ladda om inkorgen vid val-ändring** (nära `loadLiveInbox`-definitionen, ~rad 4340):

```js
document.addEventListener('cco:mailbox-selection-change', () =>
  loadLiveInbox()
);
```

`LIVE_MAILBOX_IDS` behålls som fallback (refereras på ~8 ställen för avatar/mailbox-
etikett — rörs inte).

### Nya query-params på worklist-endpointen (Codex)

`GET /api/v1/cco/runtime/worklist/consumer` tar i dag bara `mailboxIds` + `limit`.
Kopplingen kräver två till:

| Param        | Värden                    | Idag   |
| ------------ | ------------------------- | ------ |
| `mailboxIds` | komma-lista               | finns  |
| `folder`     | `inbox \| sent \| drafts` | **ny** |
| `days`       | `30 \| 90 \| 365`         | **ny** |

Lokal Mac Mail-modell bevaras: hämtningen sker vid val-ändring / auto-sync, inte per trådöppning. Ingen live-send påverkas.
