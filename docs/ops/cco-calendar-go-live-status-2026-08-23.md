# CCO Kalender — go-live status (2026-08-23)

> Verifierat mot prod (`arcana.hairtpclinic.com`) 2026-08-23. Alla siffror är
> mätta, inte uppskattade. Återanvändbara skript:
>
> - `scripts/verify-calendar-readable-prod.js` — läsbar kalender + skrivbarhet
> - `scripts/check-calendar-preflight-gates-prod.js` — de 9 grindarna mot riktiga bokningar
> - `scripts/analyze-cliento-migration-prod.js` — Cliento-storen inför migrering

## Vad som är verifierat

### Läsning (Fas 1) — FUNGERAR

Vecka 2026-08-24 → 31:

- 49 bokningar (visits): 48 Cliento + 1 CCO (`cco_booking_engine`)
- 378 tillgänglighetsslots (bokningsbara tider)
- **Alla 49 har kanonisk `patientId`** — 0 utan
- Kundkort (dossier-bundle) visar historik (8 poster, varav 3 CCO-egna),
  journalEntries (3), paymentHistory, driveFiles
- Anteckningar: journal-quick stödjer `encounterId`/`treatmentEncounterId`

### Skrivgrindar (Fas 2) — CCO-egna passerar, Cliento fälls

`buildBookingSafetyPreflight` (9 grindar) mot riktiga prod-bokningar:

| Bokning                 | source               | Utfall                                                            |
| ----------------------- | -------------------- | ----------------------------------------------------------------- |
| Adam Andersson          | `cco_booking_engine` | **alla 9 pass → skrivbar**                                        |
| Sasha/Oscar/Joel/Emilio | `cliento`            | fälls på grind 8 (encounter_policy) + 9 (provider_write_contract) |

- Grind 7 (practitioner) fungerar: värdet kommer som ren sträng (inga objekt)
- Skriv-E2E via API verifierat: ny CCO-bokning skapad → bekräftad → passerade
  grindarna → avbokad. 0 aktiva reservationer kvar efter städning.
- Cliento-readonly är dokumenterat i UI:t (`cco-kalender-shell.js:611`)

### Migrering (Fas 4) — mängden, mätt

`analyze-cliento-migration-prod.js` mot `data/cco/cliento-bookings.json`:

| Mått                                     | Värde             |
| ---------------------------------------- | ----------------- |
| Totala bokningar                         | 53 316            |
| Med patientId (grind 1)                  | 42 051 (79 %)     |
| **Saknar patientId**                     | **11 265 (21 %)** |
| Med email                                | 38 887 (73 %)     |
| Med service                              | 42 639 (80 %)     |
| **Saknar service**                       | **10 677 (20 %)** |
| Med notes                                | 44 695 (84 %)     |
| **Med encounterId (grind 8)**            | **0 (0 %)**       |
| **Tjänstenamn i staff-fältet (grind 7)** | **20 428 (38 %)** |

Topp "vårdgivare": Transplantation (9 630), Clara (7 471), Fysisk konsultation
(6 295), Louise (6 045), Egzona (5 131), Online konsultation (4 503),
Veronica (3 337).

### Slutsats för migrering

En migrering som bara stämplar om `source → cco_engine` räcker INTE:

- **Grind 8 fäller alla 53 316** (0 har encounterId) — kräver encounter-hantering
  eller pre-visit-policy innan skrivning tillåts
- **Grind 1 fäller 11 265 (21 %)** — saknar patientId
- **Grind 7 släpper igenom skräp** — 38 % har tjänstenamn i vårdgivarfältet

## Beslut som väntar (blockerar driftsättning)

| #   | Beslut                                                    | Varför                                                                                                        | Vem                |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------ |
| 0.1 | Rotera prod-token (läckt i klarttext av agent 2026-08-23) | rotation=none i prod, TTL 168h — enda rotationen är change-password med revokeAllSessions                     | Fazli              |
| 0.2 | Parallell start vs migrera först                          | Parallell start är tekniskt tillgängligt (CCO-bokning passerar alla grindar); migrering kräver encounter-plan | Fazli              |
| 0.3 | Vem skapar bokningar framåt                               | Styr skriv-UI-prioritet                                                                                       | Egzona/koordinator |
| 2.3 | Personal↔resourceId-koppling                              | Byggarbete: sköterskorna har inga konton, ingen har resourceId (15/18 prod-användare är codex-testkonton)     | Fazli + arkitektur |

## PR:er

- #1512 MERGED — HTML-yta-inventering + verify-skript
- #1513 OPEN/CLEAN — booking-skript (säger vad de faktiskt kontrollerar) + tidsberoende testfix
- #1514 OPEN — Cliento-migreringsanalys
