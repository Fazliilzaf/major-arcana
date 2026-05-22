# Behandlingsavtal — spec (Fas C)

Baserat på Gabrielle Handler / Nordbro (`JURIST-FLODE-GABRIELLE-HANDLER.md`).

## Mål

Digital kedja i Major Arcana: **konsultation → patientinfo → offert → behandlingsavtal → bokning**.

Ersätter GetAccept för nya kunder. Gällande Word-mall: `251203_Behandlingsavtal…docx`.

## Leveransläge

| Läge                   | `deliveryMode` | Betänketid         | Ångerrätt                                                                                                                                                       |
| ---------------------- | -------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| På plats (klinik)      | `plats`        | Nej                | Nej (Distansavtalslagen gäller ej)                                                                                                                              |
| Distans (hemma/online) | `distans`      | 14 dagar (default) | Ja — [Konsumentverkets ångerblankett](https://www.konsumentverket.se/for-foretag/konsumentratt-for-foretagare/om-konsumentratt/om-konsumentratt/angerblankett/) |

## Processordning (MA)

1. Konsultation + behandlingsplan (`consultation_plan` journal) — ✅
2. **Skicka patientinformation** (bilaga 1) — loggas med datum/kanal/version
3. Offert från plan — ✅ commercial
4. Offert accepterad — ✅ commercial `quoteStatus=accepted`
5. **Skapa behandlingsavtal** från accepterad offert
6. **Skicka avtal för signering** — startar betänketid vid distans
7. Kund signerar — status `signed` / `bookable`
8. Bokning — Fas 6 gate

## Bilagor

| Bilaga          | Innehåll                   | MA-källa                                                     |
| --------------- | -------------------------- | ------------------------------------------------------------ |
| Bilaga 1        | Patientinformation DHI/PRP | `/patientinformation/hartransplantation-dhi-prp-minimal.pdf` |
| Behandlingsplan | Om finns                   | Journal `consultation_plan`                                  |
| Bilaga 3        | Ångerblankett              | Extern länk (Konsumentverket) — visas i avtal vid distans    |

## API

| Metod | Path                                                       | Syfte                               |
| ----- | ---------------------------------------------------------- | ----------------------------------- |
| GET   | `/cco-treatment-agreement/patient-agreement?patientId=`    | Hämta avtal + readout               |
| POST  | `/cco-treatment-agreement/from-offer`                      | Skapa utkast från accepterad offert |
| POST  | `/cco-treatment-agreement/send-patient-info`               | Logga utskick bilaga 1              |
| POST  | `/cco-treatment-agreement/send-for-sign`                   | Skicka för signering                |
| POST  | `/cco-treatment-agreement/accept`                          | Staff-signering / force             |
| GET   | `/cco-treatment-agreement/sign-page?token=`                | Publik signeringssida               |
| POST  | `/cco-treatment-agreement/accept-public?token=`            | Publik signering                    |
| GET   | `/cco-treatment-agreement/document?patientId=&documentId=` | HTML/PDF avtal                      |

## Statusfaser (readout)

`draft` → `patient_info_sent` → `sent` / `cooling_off` → `signed` → `bookable`

## Data

Store: `data/cco-treatment-agreements.json` (prod: `/var/data/`).

Dokument: återanvänder `offer-documents/` via `ccoOfferDocumentStore`.
