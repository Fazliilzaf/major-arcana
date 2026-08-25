# CCO — End-to-end kundresa · Hair TP Clinic & Curatiio

> **Syfte:** hela företagets workflow för hur en kund hanteras från första kontakt till långsiktig relation.
> **Källa:** Figma "FlowChart | Leo" (nod Flow 26) + CCO-implementering (kundresans 9 steg i `cco-v11-rk.js`/`buildJourneyFromState`).
> **Körfält (ansvariga):** 🟣 Kund · 🌸 CCO (fd Meridiq) · 🟢 Personal · 🔵 Ekonomi
> **Datum:** 2026-08-25

---

## Översikt — 9 faser

| Fas | Namn                                 | Funnel-fas               |
| --- | ------------------------------------ | ------------------------ |
| 1   | Upptäckt & intresse                  | INTEREST → CONSIDERATION |
| 2   | Bokning                              | CONVERSION               |
| 3   | Konsultation                         | CONVERSION               |
| 4   | Offert & behandlingsplan             | CONVERSION               |
| 5   | Förberedelse inför behandling        | SERVICE                  |
| 6   | Behandling                           | SERVICE                  |
| 7   | Betalning & fakturering              | SERVICE                  |
| 8   | Eftervård & uppföljning              | SERVICE → LOYALTY        |
| 9   | Resultat, rekommendation & återkomst | LOYALTY → ADVOCACY       |

---

## FAS 1 — Upptäckt & intresse 🎯

**Mål:** kunden får kännedom och börjar överväga behandling.

1. Kunden kommer in via en av kanalerna:
   - **Wordpress** (webbplats hairtpclinic.com / curatiio.com)
   - **Instagram** (resultatbilder, annonser)
   - **Telefonsamtal** (direkt eller via annons)
2. **Tratten:** INTEREST → CONSIDERATION (kunden utforskar behandlingar: hårtransplantation, PRP, estetik)
3. **Första kontakt:** kund skickar formulär, ringer eller bokar direkt på webben.

**Vem:** Kund · **System:** Webb/Wordpress, Instagram · **Status:** Manuell+automatiserad (kanaler)

---

## FAS 2 — Bokning 📅

**Mål:** kunden bokar en konsultation.

1. **Boka konsultation** — val:
   - **Online konsultation**
   - **Fysisk konsultation**
2. **Slutför bokning** — kunden godkänner:
   - ✅ Personuppgiftspolicy
   - ✅ Bokningsvillkor & GDPR
   - Personuppgifter (namn, kontakt)
3. **Bokningsbekräftelse | AutoMail** skickas (innehåller: bekräftelse, hälsodeklaration-länk, tjänstespecifikation).
4. **CCO registrerar:** Bokningsportal → Bokning slutförd (CCO | BOOKING-data).

**Vem:** Kund + 🌸 CCO · **System:** CCO-bokningsmotor + AutoMail · **Status:** Auto (bekräftelse), kvar att automatisera: bokningsflödet i CCO

---

## FAS 3 — Konsultation 👩⚕️

**Mål:** utreda kundens behov och avgöra behandlingsbarhet.

1. **Hälsodeklaration** — kunden fyller i (allergier, mediciner, kontraindikationer) → `Hälsodeklaration | Reg.`
2. **Konsultation** genomförs av:
   - **Hårspecialist | Klinikchef** (TP/PRP)
   - **Sjuksköterska** / **Läkare** (estetik)
3. Beslut: behandling är möjlig / kräver mer utredning / nej.
4. **Boka behandling | Telefonsamtal** (kunden bokar behandling via telefon med personalen).

**Vem:** 🟢 Personal + Kund · **System:** CCO (kundkort, kalender) · **Status:** Fungerar i CCO (konsultation = steg 3 i kundresan)

---

## FAS 4 — Offert & behandlingsplan 📄

**Mål:** kunden får pris och plan och accepterar.

1. **Offert** skapas (per varumärke/tjänst) med:
   - Behandlingsplan
   - Tjänstespecifikation | Länk
   - Ritningar | Länk (TP)
   - _(Anpassat erbjudande | Manuell — streckad = manuellt)_
2. Kunden accepterar → `Offert | Accepterad`.
3. **Behandlingstid bokas** → `Behandlingstid | Bokad`.
4. **PåminnelseMail x4 — MANUELL HANTERING** (streckad: ska automatiseras).

**Vem:** Personal + Kund · **System:** CCO (offertmodul, commercial store) · **Status:** Offert/accepterad finns i CCO (kundresan steg 5)

---

## FAS 5 — Förberedelse inför behandling 🧾

**Mål:** alla dokument och förutsättningar klara före behandling.

1. **CCO | TP DATA** — alla godkända:
   - 🔒 TP Behandlingsavtal | Godkänd
   - Avstå ångerrätt 2 v. | Godkänd
   - Bokningsvillkor | Godkänd
   - Bildhantering | Godkänd
2. **CCO | Förkonsultation DATA:**
   - Friskförsäkran | Ifylld
   - Behandlingsplan | Bekräftad
   - Ritning Pre-OP Foto | Bildbank
   - Rakning Pre-OP Foto | Bildbank
   - Post OP Foto | Bildbank
3. **Pre-OP (klinik):**
   - ID & Friskförsäkran
   - Vitalparametrar
   - Bekräfta behandlingsplan
   - Rakning · Ritning · Pre OP Foto ×2
4. **Mail | Behandling** skickas: Behandlingsbekräftelse | AutoMail · Samtycke | Bildhantering · 🔒 TP Behandlingsavtal · Avstå ångerrätt 2 v. | Länk · Bokningsvillkor | Länk.

**Vem:** Kund + 🌸 CCO + 🟢 Personal · **Status:** Friskförsäkran = steg 8 i CCO-kundresan; dokumenthantering delvis automatiserad

---

## FAS 6 — Behandling 💉✂️

**Mål:** genomföra behandlingen.

### 6a. Hair TP Clinic — hårtransplantation (TP)

1. **OP:** Medicinsk instruktion → Lokalbedövning 1 & 2 → Extraktion → Kanaler → Implantation → **PRP 1/4** → Post OP Foto
2. **PRP-efterbehandlingar:** 2/4 → 3/4 → 4/4 (varje steg: bokning + AutoMail-bekräftelse + PåminnelseMail 24h)
3. **Ordination** (läkare) → Ordination klar

### 6b. Curatiio — estetik

1. Behandling enligt plan (Botox, fillers, profhilo, ögonlock m.fl.)
2. Journal per behandling
3. Ordination klar

**Vem:** 🟢 Personal (ssk/läkare/hårspecialist) · **System:** CCO (journal, kalender, bildbank) · **Status:** Journal + foto finns i CCO (V11-railens Besök-sektion)

---

## FAS 7 — Betalning & fakturering 💰

**Mål:** full betalning.

1. **Betala Förskott 20%** → `Förskott betald` (🔵 Ekonomi: Faktura | 20% av behandlingskostnaden → Faktura 20% | Betald)
2. **Slutfaktura | 80%** → `Slutfaktura | Betald`
3. Kunden ser: Faktura 20% | Mail → Faktura 80% | Mail

**Vem:** 🔵 Ekonomi + Kund · **System:** CCO (ekonomi) + faktura · **Status:** Ekonomi-modulen finns i V11-railen; fakturering via befintlig lösning

---

## FAS 8 — Eftervård & uppföljning 📋

**Mål:** säkra resultatet och följa upp.

1. **Journal | PRP Efterbehandling** (efter varje behandling)
2. **Före & Efter | Bildbank** (foton per tillfälle)
3. **Uppföljningar:** bokad 1/3 → 2/3 → 3/3 (AutoMail + PåminnelseMail 24h)
4. **TP-uppföljning:** 4 mån → 6 mån → 12 mån (Boka → AutoMail)
5. **Journal | 4/6/12 månaderskontroll**

**Vem:** 🌸 CCO + 🟢 Personal · **System:** CCO (besök, journaler, bildbank) · **Status:** Besök/tillfällen + journaler finns i V11-railen (renderBesokOccasion)

---

## FAS 9 — Resultat, rekommendation & återkomst ⭐

**Mål:** nöjd kund som återkommer och rekommenderar.

1. **FÖRE | EFTER | Resultat** — resultatbilder (🔒 Resultatbilder | Före & Efter; anpassat mail = manuellt)
2. **Instagram** — publicering av resultat (med samtycke) → ADVOCACY
3. **Återkomst:** nya behandlingar, uppföljningar, hänvisningar (Awareness)

**Vem:** Kund + 🌸 CCO · **Status:** Manuellt + marknadsföring

---

## Varumärkes-skillnader

| Område       | Hair TP Clinic                            | Curatiio                                                                        |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------- |
| Behandlingar | Hårtransplantation (TP), PRP-hår, hårvård | Botox, fillers, profhilo, ögonlock (bleph), estetiska injektioner               |
| Avtal        | 🔒 TP Behandlingsavtal, ångerrätt 2 v.    | Estetik-avtal (Behandlingsavtal Botox/Fillers/Ögonlock), samtycke bildhantering |
| Journaler    | TP-journal, PRP-journal                   | Estetik-journal (t.ex. ögonlocksplastik)                                        |
| Konsultation | Hårspecialist/klinikchef, läkare          | Sjuksköterska/läkare                                                            |
| Webb         | hairtpclinic.com                          | curatiio.com                                                                    |
| Uppföljning  | 4/6/12 mån (TP) + PRP 2–4                 | Enligt behandlingsplan                                                          |

**Gemensamt:** samma flöde i CCO (bokning → konsultation → offert → behandling → betalning → uppföljning) — det är poängen med workflowt.

---

## Status i CCO idag

| Del                                             | I CCO?                                |
| ----------------------------------------------- | ------------------------------------- |
| Kundresa 9 steg (bokning → före-identifikation) | ✅ `buildJourneyFromState` / V11-rail |
| Bokningsmotor (reservera/bekräfta/avboka)       | ✅ ccoBookingEngineStore              |
| Offert/accepterad                               | ✅ kommersiell store                  |
| Hälsodeklaration + friskförsäkran               | ✅ (kundresan steg 2/8)               |
| Foton + ✎ Rita                                  | ✅ (V11-rail, foto-editor)            |
| Journaler per besök                             | ✅ (Besök · tillfällen)               |
| Ekonomi (värde/skuld)                           | ✅ (V11-rail)                         |
| AutoMail påminnelser x4                         | ⚠️ Manuellt (streckad i Figma)        |
| Anpassat erbjudande/resultatmail                | ⚠️ Manuellt                           |
| Instagram-publicering                           | ⚠️ Manuellt                           |
| Fakturering 20/80                               | ⚠️ Befintlig lösning (ej CCO ännu)    |

**Nästa steg för "hela företaget i CCO":** automatisera de streckade stegen (påminnelser, anpassade mail) och flytta faktureringen in i CCO.
