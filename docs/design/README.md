# Designfacit

Två mockuper som visar hur CCO:s kalender och kundvy är tänkta att se ut.

| Fil                       | Motsvarar                                 | Skapad     |
| ------------------------- | ----------------------------------------- | ---------- |
| `kalender-mockup-v8.html` | `public/kalender.html`                    | 2026-05-29 |
| `kunder-mockup-v9.html`   | preview-SPA:ts kundvy (`?view=customers`) | 2026-05-29 |

## Läs det här först

**Mockuperna har noll API-anrop.** All data är påhittad — Anna Karlsson,
Karl Lindberg, "12 bokningar", "86 % schema-säkerhet". De visar hur något ska
se ut, inte hur det ska fungera.

De ligger i `docs/` och inte i `public/` med flit. Servern servar bara
`public/`, så de kan inte nås som en sida av misstag.

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
