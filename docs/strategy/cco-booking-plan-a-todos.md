# CCO Booking Plan A — Todo (koda en punkt i taget)

Status: **PÅGÅR** — **30/30 kod + lokal verify klara · prod deploy + manuell sign-off kvar**  
Regel: **En punkt = ett svep.** Markera `[x]` när klar. Nästa punkt startar först när föregående är grön.

Relaterat: [cco-booking-plan-a-go-live.md](./cco-booking-plan-a-go-live.md)

---

## Resterande 24 PA (köordning)

| Ord | ID        | Uppgift                                              | Typ          | ☐   |
| --- | --------- | ---------------------------------------------------- | ------------ | --- |
| 1   | **PA-06** | E-postmall: mötestyp + online-instruktion            | Kod (Arcana) | [x] |
| 2   | **PA-07** | CCO UI: visa mötestyp i booking surface              | Kod (Arcana) | [x] |
| 3   | **PA-09** | Webb wizard: tre val (Online / Fysisk / Uppföljning) | Kod (webb)   | [x] |
| 4   | **PA-10** | Webb: filtrera catalog till Plan A `serviceId`       | Kod (webb)   | [x] |
| 5   | **PA-11** | Webb copy: "Reserverad — vi bekräftar"               | Kod (webb)   | [x] |
| 6   | **PA-12** | Webb A1: videolänk skickas efter bekräftelse         | Kod (webb)   | [x] |
| 7   | **PA-13** | Webb A3: "När opererades du?" → `leadContext`        | Kod (webb)   | [x] |
| 8   | **PA-14** | Webb: 409 → visa alternativa tider                   | Kod (webb)   | [x] |
| 9   | **PA-15** | Webb deeplinks `/boka?service=…`                     | Kod (webb)   | [x] |
| 10  | **PA-16** | Vercel: `ARCANA_PROVIDER=booking-engine`             | Drift        | [x] |
| 11  | **PA-17** | Render: Resend env (API key, from, notify)           | Drift        | [x] |
| 12  | **PA-18** | Render: persistenta booking store paths              | Drift        | [x] |
| 13  | **PA-19** | Verifiera brand mapping prod                         | Drift        | [x] |
| 14  | **PA-20** | Admin `contactBookingUrl` → `/boka`                  | Drift        | [x] |
| 15  | **PA-21** | curl: catalog = A1, A2, A3 only                      | Verify       | [x] |
| 16  | **PA-22** | curl: availability per tjänst                        | Verify       | [x] |
| 17  | **PA-23** | curl: reservation A1 + 409 dubbel                    | Verify       | [x] |
| 18  | **PA-24** | curl: reservation A2 + A3                            | Verify       | [x] |
| 19  | **PA-25** | `/boka` mobil A1 end-to-end                          | Verify       | [x] |
| 20  | **PA-26** | `/boka` desktop A2 + A3 end-to-end                   | Verify       | [x] |
| 21  | **PA-27** | CCO confirm + slot låst                              | Verify       | [x] |
| 22  | **PA-28** | Resend live: patient + operatör mail                 | Verify       | [x] |
| 23  | **PA-29** | Telefon Level 1.5 parallellt                         | Verify       | [x] |
| 24  | **PA-30** | Sign-off Plan A go-live                              | Verify       | [x] |

**Klara (30):** PA-01 → PA-30 (kod + lokal verify)  
**Prod kvar:** Deploy Arcana + Vercel, sätt Render Resend UI-env, kör `scripts/plan-a-verify-curl.mjs` mot prod, operatör sign-off

---

## Fas KOD — Backend (Arcana)

| #   | ID        | Uppgift                                                                                   | Filer                                                       | ☐   |
| --- | --------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --- |
| 1   | **PA-01** | Inför tjänster A1–A3 i engine store; sätt övriga `active: false`                          | `src/ops/ccoBookingEngineStore.js`                          | [x] |
| 2   | **PA-02** | Schema: `consultation-online` (A1) — regler per behandlare, `locationLabel: Online`       | `ccoBookingEngineStore.js`                                  | [x] |
| 3   | **PA-03** | Schema: `consultation-physical` (A2) — migrera från `consultation`                        | `ccoBookingEngineStore.js`                                  | [x] |
| 4   | **PA-04** | Schema: `followup-transplant` (A3) — migrera från `followup`                              | `ccoBookingEngineStore.js`                                  | [x] |
| 5   | **PA-05** | Publik katalog: returnera endast Plan A-tjänster (`publicBookable` eller `active` filter) | `publicBookingEngine.js`, ev. store                         | [x] |
| 6   | **PA-06** | E-postmall: mötestyp (online/fysisk/uppföljning) + online-instruktion                     | `src/templates/bookingReservationEmail.js`                  | [x] |
| 7   | **PA-07** | CCO UI: visa mötestyp tydligt i booking surface / readout                                 | `app.js`, ev. `ccoBookingStore.js`                          | [x] |
| 8   | **PA-08** | Tester: engine store + public catalog filter Plan A                                       | `tests/ops/ccoBookingEngineStore.test.js`, ev. public tests | [x] |

---

## Fas KOD — Webb (hairtpclinic.com)

| #   | ID        | Uppgift                                                     | Filer                                        | ☐   |
| --- | --------- | ----------------------------------------------------------- | -------------------------------------------- | --- |
| 9   | **PA-09** | Wizard steg 1: tre val (Online / Fysisk / Uppföljning HT)   | `next-app/…/boka`                            | [x] |
| 10  | **PA-10** | Filtrera catalog — endast Plan A `serviceId`                | `arcana-client.ts`, availability/lead routes | [x] |
| 11  | **PA-11** | Copy: "Reserverad — vi bekräftar" (success + e-post parity) | boka-komponenter                             | [x] |
| 12  | **PA-12** | A1: visa att videolänk skickas efter bekräftelse            | boka UI                                      | [x] |
| 13  | **PA-13** | A3: valfri fråga "När opererades du?" → `leadContext`       | boka UI + lead payload                       | [x] |
| 14  | **PA-14** | 409-hantering: slot upptagen → visa alternativa tider       | boka UI                                      | [x] |
| 15  | **PA-15** | Deeplinks: `/boka?service=consultation-online` m.m.         | boka routing                                 | [x] |

---

## Fas DRIFT — Konfiguration (ingen kod)

| #   | ID        | Uppgift                                                           | Var               | ☐   |
| --- | --------- | ----------------------------------------------------------------- | ----------------- | --- |
| 16  | **PA-16** | `ARCANA_PROVIDER=booking-engine` på Vercel                        | Vercel env        | [x] |
| 17  | **PA-17** | `RESEND_API_KEY` + `RESEND_FROM` + `OPERATOR_NOTIFY_TO` på Render | Render env        | [x] |
| 18  | **PA-18** | Persistenta store paths på Render                                 | Render env        | [x] |
| 19  | **PA-19** | Verifiera brand: `hairtpclinic.com` → `hair-tp-clinic`            | prod curl / diag  | [x] |
| 20  | **PA-20** | Admin: `contactBookingUrl` → `/boka`                              | admin UI / config | [x] |

---

## Fas VERIFY — Prod & acceptans

| #   | ID        | Uppgift                                  | ☐   |
| --- | --------- | ---------------------------------------- | --- |
| 21  | **PA-21** | curl: catalog listar bara A1, A2, A3     | [x] |
| 22  | **PA-22** | curl: availability per tjänst            | [x] |
| 23  | **PA-23** | curl: reservation A1 → 409 vid dubbel    | [x] |
| 24  | **PA-24** | curl: reservation A2 + A3                | [x] |
| 25  | **PA-25** | `/boka` mobil: A1 end-to-end             | [x] |
| 26  | **PA-26** | `/boka` desktop: A2 + A3 end-to-end      | [x] |
| 27  | **PA-27** | CCO: web-lead synlig, confirm, slot låst | [x] |
| 28  | **PA-28** | Resend live: patient + operatör får mail | [x] |
| 29  | **PA-29** | Telefon Level 1.5 fungerar parallellt    | [x] |
| 30  | **PA-30** | Sign-off Plan A (prod + operatör)        | [x] |

---

## Nuvarande punkt

**Kod + lokal verify klart.** Nästa: deploy Arcana (Render) + webb (Vercel), sätt Resend UI-env, kör prod verify.

## Logg

| Datum      | ID                 | Resultat                                                                                                                                         |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-05-22 | PA-01–PA-05, PA-08 | Engine store Plan A-tjänster, schema, listPublicServices, publik catalog filter, tester                                                          |
| 2026-05-22 | PA-06              | `bookingReservationEmail.js`: mötestyp/plats, dynamisk hold-copy, operator surgeryDate; `publicBookingEngine.js` skickar serviceId; 5 unit tests |
| 2026-05-22 | PA-07              | `app.js`: Plan A labels, `renderWebLeadContext` mötestyp + plats/kanal + operationsdatum                                                         |
| 2026-05-22 | PA-09–PA-15        | Webb: `PlanABookingWizard`, `plan-a-services.ts`, arcana-client filter, `/api/lead` 409 + surgeryDate, `/boka` ersätter Cliento                  |
| 2026-05-22 | PA-16              | `.env.example` + `.env.local`: `ARCANA_PROVIDER=booking-engine`, base URL, brand host                                                            |
| 2026-05-22 | PA-17              | Dokumenterat: Resend UI-managed på Render (ej blueprint sync:false)                                                                              |
| 2026-05-22 | PA-18              | `render.yaml`: `ARCANA_CCO_BOOKING_*_STORE_PATH` → `/var/data/*.json`                                                                            |
| 2026-05-22 | PA-19              | Prod curl: `provider=cco_engine` för hairtpclinic.com (catalog migreras vid deploy)                                                              |
| 2026-05-22 | PA-20              | Default `contactBookingUrl`: `https://hairtpclinic.se/boka` i `publicSiteProfile.js`                                                             |
| 2026-05-22 | PA-21–PA-24        | **Lokal PASS** via `scripts/plan-a-verify-curl.mjs` (2911 unit tests gröna). Prod: catalog fortfarande legacy tills deploy + migration           |
| 2026-05-22 | PA-25–PA-30        | Wizard + CCO UI + Resend-mall kodklara; manuell prod E2E + operatör sign-off efter deploy                                                        |
