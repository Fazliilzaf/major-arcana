# Designfacit

Mockuper som visar hur CCO:s ytor är tänkta att se ut.

| Fil                           | Motsvarar                                 | Skapad     |
| ----------------------------- | ----------------------------------------- | ---------- |
| `kalender-mockup-v8.html`     | `public/kalender.html`                    | 2026-05-29 |
| `kunder-mockup-v9.html`       | preview-SPA:ts kundvy (`?view=customers`) | 2026-05-29 |
| `mobil-kalender-ritning.html` | finns inte — `/m-kalender.html` ger 404   | 2026-05-29 |
| `mobil-kunder-ritning.html`   | `public/m-kunder.html`, som är en stump   | 2026-05-29 |

## Läs det här först

**Mockuperna har noll API-anrop.** All data är påhittad — Anna Karlsson,
Karl Lindberg, "12 bokningar", "86 % schema-säkerhet". De visar hur något ska
se ut, inte hur det ska fungera.

De ligger i `docs/` och inte i `public/` med flit. Servern servar bara
`public/`, så de kan inte nås som en sida av misstag.

## De två mobilritningarna

Hämtade ur iCloud-arkivet `major-arcana-pr96/public/` 2026-08-22, efter en
genomgång av alla 26 sidor i det arkivet. Bara dessa två saknade motsvarighet
i repot — resten var antingen redan byggda i v3-familjen, eller tomma.

- **`mobil-kalender-ritning.html`** (63 kB) — bottom-sheet, dagswipe, FAB-mic,
  vibe-väder. Det finns ingen mobilkalender alls i dag; `/m-kalender.html` ger
  404 i prod.
- **`mobil-kunder-ritning.html`** (61 kB) — sökbara kort, AI-aggregat, dossié,
  kamera. Repots `public/m-kunder.html` är en stump på 11 kB som bara visar
  rubriken "Kunder" och en knapp "Ladda fler". Ritningen är den ursprungliga
  avsikten.

Kontrollera mot `cco-installningar-v3-2.html` och `cco-analytics-v3.html` innan
du hämtar fler sidor ur arkivet — flera arkivsidor har nyare och större
v3-syskon i `public/major-arcana-preview/` som är lätta att missa om man bara
söker på filnamnet.

## Inställningssidan i arkivet — hämta den inte

`_ARKIV-iCloud-Major-Arcana-2.0/major-arcana-pr96/public/installningar.html`,
68 kB. Tre oberoende granskare kom fram till samma sak: bygg inte på den.
Öppettidsblocket saknar `id` och sparar ingenting, "Personal & roller" är bara
en menyrad utan panel.

Det som är värt att veta om den, så att filen inte behöver hämtas:

- **Kategorierna den föreslår:** Klinikinfo · Öppettider · Personal & roller ·
  Behandlingar & priser · Mejl & SMS-mallar · Brand & utseende · Integrationer ·
  AI & automation · Säkerhet & GDPR · Fakturering.
- **Den delen som faktiskt var kopplad** gick mot `cco-policies`, `cco-users`,
  `cco-mailboxes`, `cco-brands`, compliance-scan och notifieringar — de
  endpointsen finns kvar och är det man bygger mot i stället.
- Klinikuppgifterna i filen är demodata ("Sveavägen 42", org.nr 559123-4567).

## Kalendern: designen finns redan

Alla 188 klassnamn i `public/kalender.html` finns också i
`kalender-mockup-v8.html`. Mockupen har 264 — de 76 extra är sådant som ännu
inte byggts: kunddossié i sidopanelen, kamera för före/efter-bilder, ombokning.

Det är alltså inte en omdesign. Det är att fortsätta där någon slutade.

## Det mockuperna inte vet

Mockupen har bara namngivna patienter, ett bokningssystem och kompletta
siffror. Verkligheten är rörig, och den befintliga kalendern hanterar det:

- **okopplad eller tvetydig identitet** — kundkortet öppnas inte när det är
  osäkert vem bokningen gäller. Under Cliento-migreringen är det skyddet mot
  att koppla fel journal till fel person.
- **två bokningssystem** — varje bokning visar om den kommer från CCO eller
  Cliento.
- **data som saknas** — den befintliga säger _varför_ något är tomt
  ("saknar verifierat write-kontrakt", "Canonical bokningsfördelning, inte
  kapacitetsprocent"). Mockupen fyller samma ytor med gissningar.

Bygg efter mockupens form, men behåll den befintliga ärligheten. En kalender
som ser säker ut men gissar är sämre än en som säger att den inte vet.

## Versionshistorik

Fler mockuper finns i iCloud under `_ARKIV-iCloud-Major-Arcana-2.0/MOCKUPER/`
— kalendern har elva versioner, v1 till v8. Bara de senaste två är kopierade
hit. Notera att kundmockupen v9 är **nyare** än v10; numren följer inte
datumen.

Där finns också fyra designdokument från maj 2026 med analys och en
implementeringsplan. Värt att veta om dem: **de är förslag, inte beslut.**
Alla fyra slutar med en fråga om godkännande som aldrig besvarades. Att
kodbasen har flera halvfärdiga kalenderförsök är förenligt med just det.
