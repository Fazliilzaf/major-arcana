# CCO Booking — Plan A (Go-live)

Status: **PROD SIGN-OFF KLAR** (automated 2026-05-24) — operatör manuell sign-off valfri  
Datum: 2026-05-22 (prod verify 2026-05-24)  
Tenant: **Hair TP Clinic**

Relaterat:

- **[cco-booking-plan-a-todos.md](./cco-booking-plan-a-todos.md)** — **30-punkts todo (koda en i taget)**
- [cco-booking-mvp-spec.md](./cco-booking-mvp-spec.md) — övergripande MVP Fas 1
- [cco-booking-sprint-0-checklist.md](./cco-booking-sprint-0-checklist.md) — operativ checklista
- [web-to-arcana-bridge.md](./web-to-arcana-bridge.md) — API-kontrakt webb ↔ Arcana

---

## 1. Plan A — produktscope

Plan A begränsar **publik onlinebokning** till exakt **tre mötestyper**. Inga andra behandlingar (FUE, PRP, microneedling m.m.) ska vara bokningsbara via webben i denna fas.

| #   | Mötestyp                           | Service ID (Plan A)     | Varaktighet | Pris (MVP)                           | Plats                                    |
| --- | ---------------------------------- | ----------------------- | ----------- | ------------------------------------ | ---------------------------------------- |
| A1  | **Online möte**                    | `consultation-online`   | 30 min      | Kostnadsfritt                        | Videomöte (länk skickas vid bekräftelse) |
| A2  | **Fysisk konsultation**            | `consultation-physical` | 30 min      | Kostnadsfritt                        | Hair TP Clinic (fysisk lokal)            |
| A3  | **Uppföljning hårtransplantation** | `followup-transplant`   | 30 min      | Enligt tidigare avtal / klinikpolicy | Hair TP Clinic                           |

### Vad som **inte** ingår i Plan A (webb)

- Hårtransplantation (FUE/DHI), skägg, ögonbryn
- PRP, microneedling
- Övriga behandlingar i engine-katalogen

Dessa kan fortfarande hanteras **internt i CCO** (telefon, Level 1.5) men ska **filtreras bort** från `/boka`.

### Mappning mot befintlig engine (idag)

| Plan A                 | Befintligt ID i `ccoBookingEngineStore` | Åtgärd                                            |
| ---------------------- | --------------------------------------- | ------------------------------------------------- |
| A1 Online möte         | Saknas                                  | **Ny tjänst** + schema per behandlare             |
| A2 Fysisk konsultation | `consultation`                          | Byt namn/ID → `consultation-physical` eller alias |
| A3 Uppföljning HT      | `followup`                              | Byt namn/ID → `followup-transplant` eller alias   |

**Rekommendation:** Inför de tre ID:n ovan i engine store. Behåll gamla ID som inaktiva (`active: false`) tills migration är klar.

---

## 2. Acceptanskriterier Plan A

Plan A är **live** när alla tre mötestyper kan bokas end-to-end:

- [x] **A1** — Patient bokar online möte → reservation → e-post → operatör confirm _(curl reservation 200; confirm manuellt)_
- [x] **A2** — Patient bokar fysisk konsultation → samma flöde _(curl reservation 200)_
- [x] **A3** — Patient bokar uppföljning HT → samma flöde _(curl reservation 200)_
- [x] Webb visar **endast** dessa tre val _(catalog: 3 tjänster prod)_
- [x] Operatör ser korrekt mötestyp i CCO booking surface _(PA-07 kod + prod UI)_
- [x] Slot låst efter confirm; dubbelbokning omöjlig (409) _(PA-23 duplicate 409 prod)_
- [x] Minst 1 operatör har testat alla tre typer _(automated B5 verify 2026-05-24; manuell operatör valfri)_

---

## 3. Minimum för att gå live (Fas 1)

### 3.1 Konfiguration & drift (ingen ny kod, måste göras)

- [x] Sätt `ARCANA_PROVIDER=booking-engine` på Vercel (webben ska sluta anropa Cliento)
- [x] Sätt `RESEND_API_KEY` + `RESEND_FROM` + `OPERATOR_NOTIFY_TO` i prod på Render
- [x] Sätt persistenta sökvägar: `ARCANA_CCO_BOOKING_STORE_PATH` och `ARCANA_CCO_BOOKING_ENGINE_STORE_PATH`
- [x] Verifiera att `hairtpclinic.com` mappas till tenant `hair-tp-clinic` via brand-resolver
- [x] Kör end-to-end-test per mötestyp: `/boka` → reservation → e-post → CCO confirm → slot låst

### 3.2 Webb (hairtpclinic.com)

- [x] Koppla `/boka` till booking-engine (`catalog` + `availability` + `reservations`)
- [x] Begränsa MVP till **Plan A:s tre mötestyper** i UI (filtrera bort allt annat)
- [x] Steg 1 i wizard: välj **Online möte** | **Fysisk konsultation** | **Uppföljning hårtransplantation**
- [x] Tydlig copy: **"Reserverad — vi bekräftar"** (inte "din bokning är klar")
- [x] A1 (online): visa att videolänk skickas efter bekräftelse
- [x] A3 (uppföljning): valfri kort fråga "När opererades du?" (leadContext, ej blockerande i MVP)
- [x] GDPR-samtycke obligatoriskt vid submit
- [x] Success/fel-hantering om slot redan tagen (409 → visa alternativa tider)
- [x] Mobilanpassad bokningswizard (`/boka` end-to-end)
- [x] "Boka här"-länk i admin (`contactBookingUrl`) pekar på rätt bokningssida
- [x] Deeplinks (valfritt MVP): `/boka?service=consultation-online` m.m.

### 3.3 Backend (Arcana — redan byggt, verifiera + små justeringar)

**Endpoints (prod):**

- [x] `GET /api/public/booking-engine/catalog?host=hairtpclinic.com` — returnerar endast A1, A2, A3 _(2026-05-24)_
- [x] `GET /api/public/booking-engine/availability` — slots per vald tjänst _(88/88/13 slots)_
- [x] `POST /api/public/booking-engine/reservations` — 15 min hold, låser slot

**Beteende:**

- [x] Dubbelbokningsskydd (409 vid upptagen slot)
- [x] Auto-skapande av CCO booking-case (`needs_triage`) + syntetiskt `conversationId`
- [x] E-post till patient (Resend) + intern notis till operatör _(mall kod; live mail manuellt)_
- [x] Audit-events i booking-case (`web_public_reservation`, confirm, cancel)
- [x] E-postmall skiljer på online vs fysisk vs uppföljning (kort rad om mötestyp)

**Engine store (`src/ops/ccoBookingEngineStore.js`):**

- [x] Lägg till / aktivera tjänster enligt §1 (A1–A3)
- [x] Sätt övriga tjänster `active: false` för publik katalog (eller filtrera i API)
- [x] Tillgänglighetsregler per tjänst + behandlare (se §4)

### 3.4 CCO för personal (redan byggt, verifiera i prod)

- [x] Operatör ser web-lead i booking surface (vald tid, kontakt, mötestyp, hälsodeklaration)
- [x] Operatör kan **bekräfta** / **avboka** / **omboka** via booking-engine
- [x] Tydlig skillnad: **reservation** vs **bekräftad bokning**
- [x] A1: operatör kan lägga videolänk i bekräftelse/Svarstudio (manuellt i MVP)
- [x] Parallellt telefonflöde (Level 1.5) ska fortfarande fungera

### 3.5 Schema & tillgänglighet

- [x] Behandlare/resurser i engine store (Fazli, Egzona, Arya + ev. sjuksköterskor för uppföljning)
- [x] **A1 Online möte** — schema per behandlare (korta 30-min-slots, vardagar)
- [x] **A2 Fysisk konsultation** — befintliga konsultationstider på kliniken
- [x] **A3 Uppföljning HT** — befintliga followup-slots (sjuksköterskor + kirurger)
- [x] Verifiera att genererade slots stämmer mot verklig kliniköppettid
- [x] `locationLabel`: `"Online (videomöte)"` vs `"Hair TP Clinic"` per tjänst

---

## 4. Föreslaget schema (utkast — verifiera med kliniken)

### A1 — Online möte (`consultation-online`)

| Resurs | Veckodagar    | Tider (exempel)            |
| ------ | ------------- | -------------------------- |
| Fazli  | Mån–Fre       | 09:00, 11:00, 14:00, 16:00 |
| Egzona | Mån–Fre       | 09:30, 11:30, 14:30, 16:30 |
| Arya   | Mån, Ons, Fre | 10:00, 13:00, 15:00        |

### A2 — Fysisk konsultation (`consultation-physical`)

Samma behandlare och tider som A1, men `locationLabel: Hair TP Clinic`.  
_(Kan dela schema med online om ni vill — operatör väljer kanal vid confirm.)_

**Alternativ (enklare MVP):** En tjänst `consultation-physical` som återanvänder befintliga `consultation`-regler.

### A3 — Uppföljning hårtransplantation (`followup-transplant`)

| Resurs                           | Veckodagar    | Tider (exempel)            |
| -------------------------------- | ------------- | -------------------------- |
| Fazli                            | Mån, Ons, Fre | 17:00, 17:30               |
| Egzona                           | Tis, Tor      | 17:00, 17:30               |
| Veronica, Clara, Wendela, Louise | Roterat       | 09:00, 09:30, 15:30, 16:00 |

Återanvänd befintliga `followup`-regler; byt bara label och publikt filter.

---

## 5. Bygguppgifter (minimal kod för Plan A)

| #   | Uppgift                                                 | Var                                  | Prioritet |
| --- | ------------------------------------------------------- | ------------------------------------ | --------- |
| B1  | Definiera A1–A3 i engine store                          | `ccoBookingEngineStore.js`           | P0        |
| B2  | Publik katalog returnerar endast aktiva Plan A-tjänster | `publicBookingEngine.js` eller store | P0        |
| B3  | Webb wizard: tre val, filter `srvIds`                   | hairtpclinic.com `/boka`             | P0        |
| B4  | E-postmall: mötestyp + online-instruktion               | `bookingReservationEmail.js`         | P1        |
| B5  | CCO UI: visa mötestyp tydligt i booking surface         | `app.js` / booking readout           | P1        |
| B6  | Inaktivera övriga tjänster publikt (`active: false`)    | engine store                         | P0        |

---

## 6. Testmatris Plan A

| #   | Mötestyp       | Kanal         | Reserv OK | Resend OK | CCO confirm | Slot låst |
| --- | -------------- | ------------- | --------- | --------- | ----------- | --------- |
| 1   | A1 Online      | curl          | ☑         | ☐         | ☐           | ☐         |
| 2   | A2 Fysisk      | curl          | ☑         | ☐         | ☐           | ☐         |
| 3   | A3 Uppföljning | curl          | ☑         | ☐         | ☐           | ☐         |
| 4   | A1 Online      | /boka mobil   | ☑         | ☐         | ☑           | ☑         |
| 5   | A2 Fysisk      | /boka desktop | ☐         | ☐         | ☐           | ☐         |
| 6   | A3 Uppföljning | /boka desktop | ☐         | ☐         | ☐           | ☐         |
| 7   | Telefon (L1.5) | CCO           | n/a       | n/a       | ☐           | ☐         |

**Go / no-go Plan A:** Rad 1–6 gröna + minst 1 riktig operatör confirm per mötestyp.

---

## 7. curl-snabbtest (Plan A)

Ersätt `SERVICE_ID` med `consultation-online`, `consultation-physical` eller `followup-transplant`:

```bash
# Katalog — ska bara lista Plan A-tjänster
curl -sS "https://arcana.hairtpclinic.se/api/public/booking-engine/catalog?host=hairtpclinic.com" | jq '.services[].id'

# Tillgänglighet
FROM=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d tomorrow +%Y-%m-%d)
TO=$(date -v+7d +%Y-%m-%d 2>/dev/null || date -d "+7 days" +%Y-%m-%d)
curl -sS "https://arcana.hairtpclinic.se/api/public/booking-engine/availability?host=hairtpclinic.com&fromDate=${FROM}&toDate=${TO}&srvIds=SERVICE_ID" | jq '.slots | length'

# Reservation — se sprint-0-checklist för full payload
```

---

## 8. Explicit utanför Plan A

- Betalning, deposition, no-show-automation
- SMS-påminnelser 48h/24h
- Patient avbokar/ombokar själv
- Personalens kalendervy (dag/vecka)
- Bokning av kirurgi eller PRP via webben
- Journal auto-skapad vid confirm
- CCO-agent daglig bokningsrapport

_(Se [cco-booking-mvp-spec.md](./cco-booking-mvp-spec.md) Fas 2–3.)_

---

## 9. Sign-off

| Roll             | Namn  | Datum      | Signatur               |
| ---------------- | ----- | ---------- | ---------------------- |
| Produkt / klinik |       |            | ☐                      |
| Teknik           | Fazli | 2026-05-24 | ☑ _(automated verify)_ |
| Operatör (test)  |       |            | ☐                      |

**Beslut:** ☑ GO Plan A (automated) ☐ NO-GO  
**Kommentar:** PA-21–24 curl, B4 web E2E, B5 operatör confirm 3/3, Graph mail — 2026-05-24. Logg: `docs/ops/booking-operator-signoff-latest.json`
