---
owner: CCO
status: active
---

# Cliento — Fullständig inventering (Hair TP Clinic + Curatiio)

**Status:** Legacy-system (referens tills Arcana ersätter)  
**Senast uppdaterad:** 2026-05-25  
**Källa:** Live admin-genomgång `https://app.cliento.com/hair-tp-clinic/hair-tp-clinic/admin/` + kod (`cliento-plan-a-bridge.ts`)

**Relaterat:** [MERIDIQ-INVENTORY.md](./MERIDIQ-INVENTORY.md) · [CCO-SYSTEM-SCOPE.md](./CCO-SYSTEM-SCOPE.md) · [CCO-UNIFIED-SYSTEM-PLAN.md](./CCO-UNIFIED-SYSTEM-PLAN.md)

---

## 0. Konto & varumärken

| | Hair TP Clinic | Curatiio |
|---|----------------|----------|
| **Tenant** | Ett Cliento-konto (`hair-tp-clinic`) — båda varumärken | Samma konto |
| **Separation** | `serviceFilter: ["Hair TP Clinic"]` i widget | Egna tjänstnamn `{Kategori} \| Konsultation` |
| **Publik bokning** | `https://cliento.com/business/hair-tp-clinic-1650/` | Ej i Hair TP-widget (filtreras bort) |
| **Juridisk enhet (presentkort)** | Hair TP Clinic Gbg AB (`entityId=60`) | *(sannolikt samma enhet — verifiera)* |
| **Arcana-migrering** | Plan A live (`consultation-online/physical`) | Ej i publik Hair TP-webb än |

| Nyckel | Värde |
|--------|-------|
| Widget partner ID | `4yPQXQy6WMgoZnCAOylVjx` |
| API partner ID | `1650` |
| Prod Arcana | `ARCANA_CLIENTO_INTEGRATION_ENABLED=false` (Cliento avstängt i prod) |

---

## 1. Navigationskarta (hela Cliento)

### 1.1 Drift (huvudmeny)

| Modul | Funktion | Hair TP | Curatiio |
|-------|----------|---------|----------|
| **Kalender** | Dag/veckovy, bokningar, drag-drop | ✅ | ✅ |
| **Kassa** | Checkout från kalender/bokning | ✅ | ✅ |
| **P-liggare** | Utestående betalningar | ✅ | ✅ |
| **Kunder** | Kundregister kopplat till bokning + försäljning | ✅ | ✅ |
| **Utskick** | Massutskick / kampanjer | ✅ | ✅ |
| **Rapporter** | Bokning, försäljning, statistik | ✅ | ✅ |
| **Admin** | Konfiguration (se §2) | ✅ | ✅ |
| **Konto** | Abonnemang, GDPR, villkor | ✅ | ✅ |

### 1.2 Admin → Bokning

| Sida | Innehåll |
|------|----------|
| **Tjänster** | Hela tjänstekatalog (~55 tjänster) |
| **Tilläggstjänster** | Extra bokningsbara tillägg |
| **Resurser** | Personal, rum, utrustning, virtuella bokningsbanor |
| **Användare** | Inloggning + behörigheter |
| **Scheman** | Kontonivå arbetstider |
| **Onlinebokning → Bokningssida/Widget** | Publik widget + partner-embed |
| **Onlinebokning → Kontaktuppgifter** | Kontaktinfo på bokningssida |
| **Onlinebokning → Inställningar** | Globala online-regler |

### 1.3 Admin → Kommunikation

| Sida | Innehåll |
|------|----------|
| **SMS** | Avsändare `HairTP`, bekräftelse/avbokning, påminnelser |
| **Mejl** | Hair TP Clinic avsändare, ICS, merge-taggar |
| **Notiser** | Interna personalnotiser vid bokning/avbokning |

### 1.4 Admin → Kassa

| Sida | Innehåll |
|------|----------|
| **Kassaregister** | Svensk kassalag-compliance |
| **Inställningar** | POS-konfiguration |
| **Presentkort** | Köp/inlösen, import |
| **Presentkortsmallar** | Utskriftsmallar |
| **Fakturor** | Fakturahantering |
| **Lager → Produkter** | Produktkatalog |
| **Lager → Inleverans** | Mottagning av varor |
| **Lager → Inventering** | Lagerinventering |

---

## 2. Bokning — datamodell per tjänst

Varje tjänst (`/admin/services/{srvId}/`) har:

| Flik | Funktion |
|------|----------|
| **Inställningar** | Namn, beskrivning, tid, pris (bas/kväll/helg), moms, online-flaggor |
| **Tillval** | Add-ons till tjänsten |
| **Egna fält** | Custom fields vid bokning |
| **Schema** | Tjänstspecifikt schema |
| **SMS NY** | Tjänstspecifika SMS-mallar |

**Inställningar (fält):**
- Tidsåtgång (min), paus efter, total tid
- Pris bas/kväll/helg, moms 25/12/6/0 %, "från-pris"
- Online: visa i onlinebokning, visa tid, visa pris, **tillåt bokning**
- Kalenderfärg
- Resurskoppling (M:N) + prisoverride per resurs

---

## 3. Resurser

### 3.1 Virtuella bokningsbanor (Hair TP — Plan A)

| resId | Namn | srvId (typisk) | VIP-länk | Min-notice | Påminnelse SMS |
|-------|------|----------------|----------|------------|----------------|
| **9259** | Online konsultation | 44939 | `cliento.com/vip/Q988J3` | 120 min | 4 h |
| **7533** | Fysisk konsultation | 31779 | `cliento.com/vip/QGPV83` | 60 min | 24 h |
| **11458** | Fazli | 63017 (uppföljning VIP) | — | — | — |
| **10326** | Egzona | 63017 (uppföljning VIP) | — | — | — |

### 3.2 Personal / operativa resurser

| Resurs | Varumärke | Roll |
|--------|-----------|------|
| Fazli | Hair TP | Läkare/konsult |
| Egzona | Hair TP (+ Curatiio-tag `[Curatiio]`) | Läkare/konsult |
| Arya Emami | Hair TP | Läkare/konsult |
| Wendela, Louise, Clara, Veronica, Andrea, Bittan | Hair TP | Personal |
| Sabina Nordvall, Jessicka Bakhtiari | Curatiio | Personal |
| Transplantation | Hair TP | Rum/utrustning |

**Resursinställningar:** anställningstyp (anställd/frilans), egen adress, smart slots, bokningsfönster max 180 dagar, mejl/SMS per resurs, kalendersync, underflik **Tjänster**.

### 3.3 Fullständig resurslista (16 st, API 2026-05-25)

Maskinläsbar export: [`migration/cliento/resource-catalog.json`](../../migration/cliento/resource-catalog.json)

| resId | Namn | Resursgrupp | Tjänster | Online-bokbara (resursnivå) |
|-------|------|-------------|----------|----------------------------|
| **6677** | Transplantation | Hair TP Clinic | 24 | — |
| **7339** | Arya Emami | Curatiio | 8 | 36607 Ögonlocksplastik | Konsu |
| **7533** | Fysisk konsultation | Hair TP Clinic | 10 | 31779 Fysisk konsultation |
| **7534** | Clara | Hair TP Clinic | 31 | — |
| **8173** | Jessicka Bakhtiari | Curatiio | 0 | — |
| **9122** | Egzona [Curatiio] | Curatiio | 5 | 36607 Ögonlocksplastik | Konsu |
| **9259** | Online konsultation | Hair TP Clinic | 4 | 44939 Online konsultation |
| **9893** | Louise | Hair TP Clinic | 23 | — |
| **10300** | Sabina Nordvall | Curatiio | 5 | 50767 Ortopedisk PRP/PRF | Kon |
| **10326** | Egzona | Hair TP Clinic | 17 | 36607 Ögonlocksplastik | Konsu, 63017 Uppföljning (VIP) |
| **11329** | Andrea | Hair TP Clinic | 1 | — |
| **11414** | Konsultation (rum) | Rum | 0 | — |
| **11458** | Fazli | Hair TP Clinic | 7 | 63017 Uppföljning (VIP) |
| **11501** | Wendela | Hair TP Clinic | 18 | — |
| **11702** | Bittan | Hair TP Clinic | 0 | — |
| **11727** | Veronica | Hair TP Clinic | 22 | 50767 Ortopedisk PRP/PRF | Kon |

### 3.4 Tilläggstjänster

Maskinläsbar export: [`migration/cliento/addon-catalog.json`](../../migration/cliento/addon-catalog.json)

| Grupp | groupId | Antal tjänster | Status |
|-------|---------|----------------|--------|
| Tilläggstjänster | **8504** | **0** | Grupp finns men `serviceIds` tom 2026-05-25 |


---

## 4. Tjänstekatalog — fullständig (API 2026-05-25)

**Källa:** `GET /api/locations/hair-tp-clinic/hair-tp-clinic/services/` (inloggad admin-session). **55/55** tjänster. Maskinläsbar katalog: [`migration/cliento-service-catalog.json`](../../migration/cliento-service-catalog.json).

**Tidigare saknade (53→55):** **31776** (PRP · Ansikte, legacy-dubblett), **60041** (Uppföljning via telefon, Hair TP).

### 4.1 Hair TP Clinic (39 tjänster)

| srvId | Namn | Tid | Pris | Online synlig | Självbokbar | Arcana ID | Not |
|-------|------|-----|------|---------------|-------------|-----------|-----|
| **50555** | Biofillers | 1 tim | 0 kr | Nej | Nej | — |  |
| **64399** | Botox · Behandling | 30 min | 0 kr | Nej | Nej | — |  |
| **64401** | Botox · Konsultation | 30 min | 0 kr | Nej | Nej | — |  |
| **64400** | Botox · Återbesök | 30 min | 0 kr | Nej | Nej | — |  |
| **60199** | Content · Andrea | 30 min | 0 kr | Nej | Nej | — |  |
| **31779** | Fysisk konsultation | 45 min | 0 kr | Ja | Ja | `consultation-physical` |  |
| **64814** | Injektionsbehandling · Konsultation | 15 min | 0 kr | Nej | Nej | — |  |
| **50487** | Konsultation · Inkl. AI | 30 min | 0 kr | Nej | Nej | — |  |
| **45119** | Konsultation · Ögonbryn | 30 min | 0 kr | Nej | Nej | — |  |
| **42176** | Microneedling konsultation | 30 min | 0 kr | Nej | Nej | — |  |
| **44939** | Online konsultation | 45 min | 0 kr | Ja | Ja | `consultation-online` |  |
| **59990** | Online uppföljning | 30 min | 0 kr | Nej | Nej | — |  |
| **50560** | PDO - (beroende på område) | 1 tim | 0 kr | Nej | Nej | — |  |
| **50553** | PRF Microneedling | 1 tim | 2 500 kr | Nej | Nej | — |  |
| **50558** | PRP + Microneedling · Ansikte | 1 tim, 30 min | 5 800 kr | Nej | Nej | — |  |
| **31782** | PRP efter TP | 1 tim | 0 kr | Nej | Nej | — |  |
| **31775** | PRP Hår Standard | 1 tim | 4 300 kr | Nej | Nej | `prp-hair-standard` |  |
| **31784** | PRP Mini | 40 min | 2 500 kr | Nej | Nej | — |  |
| **31781** | PRP Skägg | 40 min | 0 kr | Nej | Nej | — |  |
| **50561** | PRP TP ögonbryn | 30 min | 0 kr | Nej | Nej | — |  |
| **31787** | PRP uppföljning | 30 min | 0 kr | Nej | Nej | — |  |
| **31776** | PRP · Ansikte | 1 tim | 4 300 kr | Nej | Nej | — | Legacy-dubblett av 50556 |
| **50556** | PRP · Ansikte | 1 tim | 4 300 kr | Nej | Nej | — |  |
| **50554** | PRP · Mini | 45 min | 2 500 kr | Nej | Nej | — |  |
| **61695** | PRP · OP-dagen | 15 min | 0 kr | Nej | Nej | — |  |
| **50559** | PRP · Skägg | 45 min | 2 500 kr | Nej | Nej | — |  |
| **50562** | PRP · Underhåll efter TP | 1 tim | 2 500 kr | Nej | Nej | — |  |
| **50557** | PRP · XL | 1 tim, 15 min | 4 800 kr | Nej | Nej | — |  |
| **51630** | Samarbete | 1 tim | 0 kr | Nej | Nej | — |  |
| **41930** | Skägg konsultation | 30 min | 0 kr | Nej | Nej | — |  |
| **58638** | Special | 1 tim | 0 kr | Nej | Nej | — |  |
| **38382** | Stygn borttagning | 30 min | 0 kr | Nej | Nej | — |  |
| **31788** | TP uppföljning | 30 min | 0 kr | Nej | Nej | — | Intern kalender; ej online — ej Plan A bridge |
| **47778** | Transplantation  DHI | 6 tim | 0 kr | Nej | Nej | `transplant-dhi` |  |
| **31785** | Transplantation FUE | 6 tim | 0 kr | Nej | Nej | `transplant-fue` |  |
| **51522** | Transplantation · Skägg | 3 tim | 0 kr | Nej | Nej | — |  |
| **63017** | Uppföljning (VIP) | 30 min | 0 kr | Ja | Nej | `followup-transplant` | Plan A bridge; res 11458+10326 (Fazli/Egzona) |
| **60041** | Uppföljning via telefon | 15 min | 0 kr | Nej | Nej | — | Hair TP telefonuppföljning (ej Curatiio 60223) |
| **41931** | Ögonbryn konsultation | 30 min | 0 kr | Nej | Nej | — |  |

### 4.2 Curatiio (16 tjänster)

| srvId | Namn | Tid | Pris | Online synlig | Självbokbar | Arcana ID | Not |
|-------|------|-----|------|---------------|-------------|-----------|-----|
| **60340** | Konsultation · Telefon | 15 min | 0 kr | Nej | Nej | — |  |
| **62138** | Ortopedi · Telefonuppföljning | 15 min | 0 kr | Nej | Nej | — |  |
| **62137** | Ortopedi · Uppföljning | 15 min | 0 kr | Nej | Nej | — |  |
| **50766** | Ortopedisk PRP/PRF · Behandling | 30 min | 0 kr | Nej | Nej | — |  |
| **50767** | Ortopedisk PRP/PRF · Konsultation | 15 min | 0 kr | Ja | Ja | — |  |
| **62135** | Ortopedisk PRP/PRF · Konsultation via telefon | 15 min | 0 kr | Nej | Nej | — |  |
| **38377** | Stygnborttagning | 30 min | 0 kr | Nej | Nej | — |  |
| **58285** | Uppföljning | 30 min | 0 kr | Nej | Nej | — |  |
| **60223** | Uppföljning via telefon | 15 min | 0 kr | Nej | Nej | — |  |
| **36607** | Ögonlocksplastik · Konsultation | 30 min | 0 kr | Ja | Ja | `consultation-physical` |  |
| **58000** | Ögonlocksplastik · Total | 3 tim | 48 000 kr | Nej | Nej | — |  |
| **62134** | Ögonplastik · Digital konsultation | 30 min | 0 kr | Nej | Nej | — |  |
| **62139** | Ögonplastik · Digital uppföljning | 15 min | 0 kr | Nej | Nej | — |  |
| **57998** | Ögonplastik · Nedre Ögonlock | 2 tim | 0 kr | Nej | Nej | — |  |
| **62136** | Ögonplastik · Uppföljning | 30 min | 0 kr | Nej | Nej | — |  |
| **38376** | Ögonplastik · Övre Ögonlock | 2 tim | 0 kr | Nej | Nej | — |  |

### 4.3 Plan A bridge (Arcana ↔ Cliento)

| Cliento srvId | Cliento namn | Arcana service ID | resId (slots) | Status |
|---------------|--------------|-------------------|---------------|--------|
| 44939 | Online konsultation | `consultation-online` | **9259** | ✅ live |
| 31779 | Fysisk konsultation | `consultation-physical` | **7533** | ✅ live |
| 63017 | Uppföljning (VIP) | `followup-transplant` | **11458, 10326** (Fazli, Egzona) | ✅ korrigerad 2026-05-25 |
| 31788 | TP uppföljning | — | 7533 m.fl. (alla offline) | ❌ ej bridge — saknar onlinebokning |
| 31775 | PRP Hår Standard | `prp-hair-standard` | — | 🔲 publik katalog |
| 31785 | Transplantation FUE | `transplant-fue` | — | 🔲 publik katalog |
| 47778 | Transplantation DHI | `transplant-dhi` | — | 🔲 publik katalog |

**Beslut 31788 vs 63017:** Behåll **63017** som `followup-transplant`. **31788** är korrekt namn för intern journal/kalender men har `webShowInBooking=false` överallt. **63017** är synlig online och har `webAllowBooking=true` på resurserna **Fazli (11458)** och **Egzona (10326)** — inte på virtuella **7533** (där bridge tidigare pekade fel).

---

## 5. Kommunikation (detalj)

### 5.1 SMS — kontonivå

| Inställning | Värde |
|-------------|-------|
| Avsändare | `HairTP` (max 11 tecken) |
| Bokning online SMS | På (0,79 kr) |
| Avbokning online SMS | På (0,79 kr) |
| Manuell kalender SMS | Av |
| Påminnelse | 48 h före, fönster 08:00–20:00 |

**Merge-taggar (mejl):** `#TIDPUNKT`, `#TJänst`, `#FÖRETAG`

### 5.2 Mallar per varumärke

| Mall | Hair TP | Curatiio |
|------|---------|----------|
| Bokningsbekräftelse SMS/mejl | ✅ Hair TP Clinic | *(egna mallar om konfigurerade)* |
| Bokningspåminnelse | ✅ 4h/24h per resurs | — |
| Avbokningsbekräftelse | ✅ | — |
| ICS kalenderinbjudan | ✅ På | — |
| Hälsodekl-länk i mejl | ✅ Online resurs | — |

---

## 6. Kassa / POS

| Funktion | Hair TP | Curatiio | Arcana-status |
|----------|---------|----------|---------------|
| Betalning tjänst från kalender | ✅ | ✅ | 🔲 ej byggt |
| Produkter + lager | ✅ | ✅ | 🔲 |
| Kvitton | ✅ | ✅ | 🔲 |
| Fakturor | ✅ | ✅ | 🔲 |
| Presentkort | ✅ (entity 60) | ✅ | 🔲 |
| P-liggare | ✅ | ✅ | 🔲 |
| Kassarapport | ✅ | ✅ | 🔲 |

**Koppling:** Tjänstpris + moms + tillval → POS-rad. Kväll/helg-pris från tjänstinställning.

---

## 7. API (Partner API — Arcana integration)

| Endpoint | Syfte |
|----------|-------|
| `GET /ref-data/` | Katalog services + resources |
| `GET /resources/slots?fromDate&toDate&resIds&srvIds` | Tillgängliga tider |
| `GET /settings/` | Kontoinställningar |

**Slot-format:**
```json
{
  "resourceId": 9259,
  "serviceIds": [44939],
  "date": "2026-05-15",
  "time": "14:00:00",
  "length": 45
}
```

**Kod:** `~/Code/major-arcana/src/infra/clientoApi.js`  
**Webb-bridge:** `~/Code/hairtpclinic-web/lib/cliento-plan-a-bridge.ts`

---

## 8. Hair TP vs Curatiio — sammanfattning

| Område | Hair TP Clinic | Curatiio |
|--------|----------------|----------|
| **Publik widget** | Online + Fysisk konsultation | Exkluderad från Hair TP widget |
| **Tjänster (~)** | TP, FUE, DHI, PRP, skägg, uppföljning | Ögonlock, botox, filler, ortopedi |
| **Resurser** | Fazli, Egzona, Arya m.fl. | Egzona [Curatiio], Sabina, Jessicka |
| **Kommunikation** | HairTP avsändare, svenska mallar | Egna mallar *(om konfigurerade)* |
| **Kassa** | Delad POS | Delad POS |
| **Arcana mål** | Plan A + full katalog | Separat bokningsflöde + formulär |

---

## 9. Vad Arcana måste replikera (per varumärke)

| Cliento-funktion | Hair TP prioritet | Curatiio prioritet |
|------------------|-------------------|---------------------|
| Online/fysisk bokning | **P0** ✅ | **P1** |
| Smart slots + VIP | **P0** | **P2** |
| SMS/mejl/ICS | **P0** | **P1** |
| Full tjänstekatalog | **P1** | **P1** |
| Kassa + kvitto | **P1** | **P1** |
| Presentkort/faktura | **P2** | **P2** |
| Utskick/marknads-SMS | **P3** (CMO) | **P3** |

---

## 10. Komplettera denna inventering

1. ✅ **§4 tjänstekatalog** — 55/55 via locations API (2026-05-25); JSON: `migration/cliento-service-catalog.json`
2. ✅ **Online-flaggor** — kolumner *Online synlig* / *Självbokbar* i §4
3. ✅ **Uppföljning bridge** — behåll **63017**; resId **11458+10326** (ej 7533); **31788** = intern only
4. ✅ **Trippel-mapping** — [`migration/service-triple-map.json`](../../migration/service-triple-map.json)
5. ✅ **Resurser + tillägg** — [`migration/cliento/resource-catalog.json`](../../migration/cliento/resource-catalog.json)
6. 🔲 Curatiio Botox-tjänster (64399–64814) ligger under `groupName: Hair TP Clinic` i Cliento — verifiera avsikt

*Senast verifierad live: 2026-05-25. Uppdatera vid Cliento-ändringar.*
