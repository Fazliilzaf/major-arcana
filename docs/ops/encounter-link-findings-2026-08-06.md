# Encounter-link — fynd fran Cliento-genomgangen 2026-08-06

Komplement till `encounter-link-disambiguation-2026-08-06.md`. **Las den har forst.**
Den andra filens rekommendation ar overspelad — se "Merge-hypotesen haller inte".

Inga personuppgifter i denna fil med flit. Utfall, inte varden.

## Merge-hypotesen haller inte — merga ingenting

Den andra filen foreslar: koppla asset till fullnamnsposten, kontrollera om
stub-posten ar en dubblett, och om ja kor samma merge-flode som de 33 tidigare.

**Gor inte det.** Grupp `clie***0528` (Tomas) motbevisar den. Den korta
"Tomas"-posten i Cliento har eget telefonnummer OCH egen mailadress, bada
skilda fran Tomas Willmams. Det ar tva olika manniskor, inte en dubblett.

En merge dar hade flyttat en patients journalanteckningar in i en annan
patients journal. `/cco-patient-master/merge` har varken dry-run eller
bekraftelsesparr och accepterar ROLE_STAFF — det finns ingen broms som
hade fangat misstaget.

## Mekanismen bakom tvetydigheten (reproducerad)

Tvetydigheten kommer INTE av konkurrerande identiteter. Den kommer av
blandad mappnamngivning inom samma asset-grupp.

`resolveCanonicalPatientsForAssetAliases` slar ihop alla assets sokvagar i
gruppen till en gemensam haystack. Ligger nagra bilder i en mapp med
fullstandigt namn och andra i en mapp med bara fornamnet, far bada
patientposterna exakt traff — pa var sitt segment. Tva kandidater, tvetydigt.

Reproducerat lokalt: en grupp med `2024/Christopher Kolemo/` plus
`2025/Christopher/` ger `ambiguous_path_identity` med bada som kandidater.
Var och en for sig loses korrekt.

Diakriter ar INTE problemet — `normalizeName` hanterar o/NFD/NFC likvardigt.
Testat.

## Eragrans: Cliento borjar mellan 2023-11-26 och 2024-04-01

Sokning pa sokvagsdatumen i Cliento:

| Datum i path            | Grupp       | I Cliento |
| ----------------------- | ----------- | --------- |
| 2022-12-13 → 2023-08-16 | Andreas     | nej       |
| 2023-11-22              | Mattias     | nej       |
| 2023-11-26              | Emil        | nej       |
| 2024-03-04              | Simon       | nej (\*)  |
| 2024-04-01              | Tomas       | ja        |
| 2024-07-11 → 2025-11-20 | Christopher | ja        |
| 2024-09-24              | Ivan        | ja        |
| 2024-12-21 → 2025-08-02 | Sebastian   | ja        |

(\*) Simon de Woul finns inte som Cliento-kund alls — inte en era-fraga.

**Foljd:** Andreas (23 assets), Mattias (7) och Emil (5) kan aldrig losas via
Cliento. De ar Pipedrive-era. Anvand `scripts/migration/resolvePipedriveAmbiguous.js`,
som matchar pa telefon och mail fran Pipedrive-CSV — lagg exporten i
`migration/pipedrive/` (bara en README dar nu).

## Foreslagen regel — INTE implementerad

Villkora automatik pa om stub-posten har kontaktuppgifter:

| Stub-postens lage      | Tolkning           | Atgard                    |
| ---------------------- | ------------------ | ------------------------- |
| inga kontaktuppgifter  | mappnamns-artefakt | vag fullnamnsposten, los  |
| har telefon eller mail | verklig person     | forbli tvetydig, manuellt |

Bygger pa en objektiv egenskap i datan, inte pa namnform. En tidigare
variant — "vag alltid det flerledade namnet tyngre" — forkastades eftersom
den hade tilldelat Tomas bilder fel.

**Blockerad:** kraver kolumnen "har stub-posten telefon/mail" for alla tolv
grupperna. Kor `scripts/review-encounter-link-queue-prod.js --include-details --json`
fran Mac:en.

## Kodfix pa branch (ej mergad)

Branch `fix/asset-alias-name-prefix-precedence`, commit `82927c7c`.

`resolveCanonicalPatientsForAssetAliases` etiketterade fornamnsprefix-traffar
som `exact_name_path`, vilket ligger i bade `SAFE_REASONS`
(`ccoCanonicalAssetPatientRepair.js`) och `STRONG_IDENTITY_REASONS`
(`ccoEncounterLinkReviewQueue.js`). En prefixgissning passerade darmed som
auto-reparerbar identitet.

Konkret utfall: en mapp stavad `Sebastian Lewin` mot patientposten
`Sebastian Levin` loses till den korta stub-posten — och rakandes som stark
identitet. En bokstav. Nu far den `name_prefix_path` och faller utanfor bada
listorna, alltsa manuell granskning i stallet for auto-reparation.

Loser INTE de 12 grupperna — review-kon byggs av systerfunktionen
`resolveCanonicalPatientsForAssets`, som redan hade ratt precedens.

## Prod-atkomst saknas fran VPS:en

Alla fyra vagar stangda har: owner-API (fel losenord + `ARCANA_OWNER_MFA_SECRET`
saknas), Render-SSH (inga `RENDER_*`-nycklar), Pipedrive-CSV (bara README),
lokal state (`./data` saknar patientregister och asset-lager).

Lagg INTE MFA-hemligheten i `.env` pa VPS:en. Servern ar CI-runner och
behover inte owner-atkomst till produktion.
