# Encounter-link manuell disambiguering — 2026-08-06

12 kvarvarande grupper i `encounter-link-review-queue` som inte kan auto-lankas.
Path-bevis ar HYPOTES, inte facit — bekrafta mot Cliento/journal fore beslut.

## Monster (8 av 9 tvetydiga)

Varje "Fornamn"-kandidat ar en kort stub-post. En "Fornamn Efternamn"-kandidat
har fullstandigt namn + personnummer i sokvagen. Samma dubblett-monster som
PR #1308 fixade (tva poster, samma person). Trolig atgard: koppla asset till
fullnamnsposten, kontrollera om stub-posten ar en verklig dubblett (samma
personnummer) — om ja, samma flode som de 33 tidigare mergade dubbletterna.

| Grupp (maskerat) | Assets | Kandidater                                                | Path pekar mot                                                                                            | Datum                                          |
| ---------------- | ------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| clie\*\*\*d39a   | 23     | Andreas x3 (kort) vs **Andreas Paulsen Ernek** (da3f6180) | da3f6180 — men 3 korta "Andreas" kan vara distinkta patienter, inte bara en dubblett. Extra forsiktighet. | 2022-12-13, 2023-01-28, 2023-06-27, 2023-08-16 |
| clie\*\*\*30dc   | 20     | Sebastian (kort) vs **Sebastian Levin** (daead4ca)        | daead4ca                                                                                                  | 2024-12-21, 2025-04-26, 2025-08-02             |
| clie\*\*\*7a28   | 24     | Christopher (kort) vs **Christopher Kolemo** (65099236)   | 65099236                                                                                                  | 2024-07-11, 2025-07-11, 2025-11-20             |
| clie\*\*\*0528   | 6      | Tomas (kort) vs **Tomas Willmam** (7a86989b)              | 7a86989b                                                                                                  | 2024-04-01                                     |
| clie\*\*\*5bf1   | 12     | Sandra (kort) vs **Sandra Marchini** (9e723a06)           | 9e723a06                                                                                                  | (datum saknas i path)                          |
| clie\*\*\*d178   | 8      | Simon x2 (kort) vs **Simon de Woul** (0d81e71f)           | 0d81e71f — 2 korta "Simon" kan vara distinkta. Extra forsiktighet.                                        | 2024-03-04                                     |
| clie\*\*\*9208   | 7      | Mattias (kort) vs **Mattias Karlsson** (c91a5fc3)         | c91a5fc3                                                                                                  | 2023-11-22                                     |
| clie\*\*\*3d0a   | 5      | Emil x2 (kort) vs **Emil Davik** (1e7ca6d8)               | 1e7ca6d8 — 2 korta "Emil" kan vara distinkta. Extra forsiktighet.                                         | 2023-11-26                                     |
| clie\*\*\*31c9   | 5      | Ivan (kort) vs **Ivan Issa** (ce908fae)                   | ce908fae                                                                                                  | 2024-09-24                                     |

## Ovriga 3

| Grupp                                          | Assets | Lage                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| clie\*\*\*8e74 (unresolved_path_identity)      | 2      | 0 kandidater. Path: `Hair TP Clinic 2020/Januari TP 2020/Conny/...` — bara fornamn "Conny", ingen matchning alls. Kraver manuell sokning i Cliento pa namn/datum jan 2020.                                                                                            |
| dc00\*\*\*47ba (Dan Oraham, direct_patient_id) | 2      | Ratt patient (candidates=1), men ingen encounter matchar datumet 2025-06-30 med tillrackligt hog confidence. Antingen saknas journalforing for det besoket, eller sa finns encountern men matchas inte automatiskt — kontrollera Dan Orahams besokshistorik manuellt. |
| 7bb3\*\*\*70ba (Johan Oden, direct_patient_id) | 1      | Samma lage som Dan Oraham, datum 2025-04-03.                                                                                                                                                                                                                          |

## Nasta steg

1. Bekrafta/avfarda de 8 monster-grupperna en och en (kolla personnummer i Cliento).
2. For bekraftade: kor `repair-encounter-links` for den patienten EFTER identitet ar satt
   (ratt canonicalPatientId maste kopplas forst — se `resolutionRequires` i review-queue-svaret).
3. Conny-gruppen och Dan Oraham/Johan Oden kraver manuell sokning, inget skript hjalper.
