# CCO — Vad systemet ska innehålla

**Status:** ✅ KOMPLETT — alla moduler byggda  
**Senast uppdaterad:** 2026-05-25  
**Prod:** `https://arcana.hairtpclinic.se`

Detta dokument är **innehållslistan** — vad Major Arcana/CCO ska kunna göra när Cliento och Meridiq är ersatta.

| Dokument                                                   | Innehåll                                           |
| ---------------------------------------------------------- | -------------------------------------------------- |
| [CLIENTO-INVENTORY.md](./CLIENTO-INVENTORY.md)             | Allt som finns i Cliento idag (Hair TP + Curatiio) |
| [MERIDIQ-INVENTORY.md](./MERIDIQ-INVENTORY.md)             | Allt som finns i Meridiq idag (Hair TP + Curatiio) |
| [CCO-UNIFIED-SYSTEM-PLAN.md](./CCO-UNIFIED-SYSTEM-PLAN.md) | Migrering, formulärmatris, fasplan                 |

**Legend:** ✅ byggt (delvis eller helt) · 🔲 ska byggas · ⚠️ byggt men ej live i prod

---

## 1. Kundmaster

- ✅ Unikt patientregister (personnummer, kontakt, flaggor)
- ✅ Importerade Cliento-kunder (~7 349) + Drive-filkoppling
- ✅ Kundlista: sök, filter, profil/journal/filer-flikar
- ✅ Sammanfoga dubblettpatienter (granskningsgrupper, merge, ignorera grupp — Identitet-vyn)
- ✅ Exportera kunddata (GDPR-utdrag JSON: profil + journal + filindex, knapp i kundkort)
- ✅ Spärra journal / begränsa åtkomst per patient (`journalBlocked` + API-spärr vid skriv)
- ✅ Importerad vs ny patient — etiketter Importerad / Webbokning / Ny i Arcana

---

## 2. Bokning

### 2.1 Publik bokning (webb + widget)

- ✅ Egen bokningsmotor (Plan A) — tjänster, resurser, tillgängliga tider
- ✅ Online konsultation + fysisk konsultation (publikt)
- ✅ Full katalog: FUE, DHI, skägg, ögonbryn, PRP hår/hud, microneedling, uppföljning
- ✅ VIP-länk / token-bokning för icke-självbokbara tjänster (t.ex. uppföljning)
- ✅ Webb → Arcana reservation (kontakt, slot, hälsodeklarationsflagga)
- ✅ Curatiio som separat bokningsflöde (brand-taggning per tjänst, filtrering via host)

### 2.2 Intern bokning (personal)

- ✅ Bokningsärende i CCO med kandidat-tider, validering, status
- ✅ Kalendervy per behandlare och resurs
- ✅ Smart slots: min-notice, max 180 dagar, kväll/helg-prisregler (per service config)
- ✅ Koppling bokning → behandlingstillfälle (encounter) automatiskt

### 2.3 Regler & resurser

- ✅ Virtuella bokningsbanor (online / fysisk) + läkare som publika resurser
- ✅ Scheman per resurs och per tjänst (availabilityRules med weekdays + startTimes per resurs/tjänst)
- ✅ Avbokningspolicy per tjänst (cancellationHours per service)

---

## 3. Behandlingstillfälle (encounter)

- ✅ Encounter-store kopplad till bokning
- ✅ Tidslinje (TL-B): gruppering per encounter i journal
- ✅ TL-C: alla journaltyper + foton + avtal + betalning under samma encounter
- ✅ Encounter-typer: konsultation, transplant, PRP, microneedling, uppföljning, ögonlocksplastik, Curatiio-estetik

---

## 4. Journal & formulär

### 4.1 Patientformulär (fylls av patient)

- ✅ Hälsodeklaration Hair TP (schema `health_declaration:hair_tp` + signering + patientportal)
- ✅ Hälsodeklaration Curatiio (ögonlock, ortopedi, estetiska injektioner — 3 varianter i katalog)
- ✅ Hälsodeklaration engelska (`health_declaration:eng`)
- ✅ Friskförsäkran TP (patient + personal, `fitness_certificate:hair_tp`)
- ✅ Friskförsäkran ögonlocksplastik (`fitness_certificate:curatiio_bleph`)
- ✅ Patientportal / länk för att fylla i före besök (token-baserad, synkar till journal)
- ✅ Webbformulär `/screen` och `/friskforsakran` — synkas via patientportal till journal

### 4.2 Personalformulär (klinisk journalföring)

- ✅ TP behandlingsjournal (~38 fält, signering, låsning)
- ✅ Full paritet mot Meridiq TP-journal (`tp_treatment:hair_tp` schema i katalog)
- ✅ PRP / PRF / microneedling journal (`prp_treatment:prp_skin`)
- ✅ TP efterbehandling PRP (post-op) (`prp_treatment:tp_post_op`)
- ✅ Uppföljning 4 / 6 / 12 månader (`follow_up:4/6/12_manader`)
- ✅ Ögonlocksplastik journal Curatiio (`bleph_treatment:curatiio_bleph`)
- ✅ Behandlingsplan (`consultation_plan`) — kopplad till bokning och foton
- ✅ Historisk import (PDF från Drive/Meridiq)

### 4.3 Journalfunktioner

- ✅ Signering, låsning, rättelse som ny post (patientdatalagen)
- ✅ Auditlogg på läsning och skrivning
- ✅ PDF genereras och arkiveras vid signering (renderHtmlToPdfBuffer via Playwright)
- ✅ Foto flöde (Ta bild, HEIC, mobil) kopplat till encounter
- ✅ Före/efter-bilder som egen sektion på patientkort (journal-photos + encounter-tidslinje)
- ✅ NRS-smärtskala (valfritt i behandlingsjournal — fält i TP-schema)
- ✅ Journaltextmallar (konsultation, ordination, signatur — templates i katalog)

---

## 5. Samtycken & behandlingsavtal

- ✅ Behandlingsavtal från accepterad offert (distans + på plats)
- ✅ Betänketid / 14-dagars ånger vid distansbokning
- ✅ Publik signeringssida (token)
- ✅ Behandlingsavtal per tjänst: TP, PRP hår, PRP hud, microneedling (14 offer-templates)
- ✅ Curatiio-avtal: Botox, fillers, Profhilo, ögonlocksplastik, ortopedi (brand-separation + templates)
- ✅ Samtycke bokning inom 14 dagar + samtycke behandling under ångerfrist (cooling-off i avtal-store)
- ✅ Foto-publiceringssamtycke (före/efter) (consent-fält i patientportal)
- ✅ Importerade signerade samtycken från Meridiq (historik) (manuell export genomförd)

---

## 6. Offerter & commercial

- ✅ Offertmallar och offertflöde
- ✅ Offert accepterad → behandlingsavtal
- ✅ Offert skickad → accepterad / avvisad / utgången (QUOTE_STATUSES: missing→draft→sent→accepted)
- ✅ Patientinformation bilaga 1 (PDF) loggad vid utskick (offerDocumentStore + PDF-render)
- ✅ Medical Finance / betalningsinfo i offertmejl (offert-email template)

---

## 7. Kommunikation

### 7.1 Transaktionellt (kring bokning & vård)

- ✅ Bokningsbekräftelse e-post (Resend — live med RESEND_API_KEY)
- ✅ Bokningsbekräftelse Graph (intern/mechanism live)
- ✅ Bokningspåminnelse SMS (46elks / Twilio — multi-provider)
- ✅ Bokningspåminnelse e-post + ICS-kalenderinbjudan (iCal VEVENT + HTML-mall)
- ✅ Avbokningsbekräftelse SMS + e-post
- ✅ "Fyll i begärd information" före besök (patientportal + SMS-länk)
- ✅ Skicka formulär / samtycke / fil till patient (patientportal token)

### 7.2 Mallar

- ✅ SMS-mallar Hair TP + Curatiio (merge-fält: namn, datum, tid, tjänst, behandlare)
- ✅ E-postmallar: offert, behandlingsplan, bokning, avbokning (HTML-templates)
- ✅ Intern notis till personal vid bokning/avbokning (operatör e-post vid publik bokning)
- ✅ WebRTC videosamtal (egen signaling, token-baserad patient-länk, TURN-stöd)
- ✅ AI mötesanteckningar (Whisper transkribering + GPT sammanfattning, online + fysisk)

### 7.3 Marknadsföring

- ✅ CMO Marketing Copilot (sociala medier, kampanjer — separat spår)
- ✅ Marknads-SMS med segmentering (kampanjer, opt-out, merge-fält, 8 segmenttyper)

---

## 8. Kassa / POS

- ✅ Kassa vid/efter behandlingstillfälle (POS-modul med ordrar per encounter)
- ✅ Betalning tjänst (pris, moms, kväll/helg) — Nets Easy kortbetalning
- ✅ Produktkatalog och lager (produkter i POS-store)
- ✅ Kvitto (genererat receiptId per order)
- ✅ Fakturor — Fortnox integration (skapa + skicka faktura)
- ✅ Presentkort (köp + inlösen + saldo + stats)
- ✅ P-liggare / utestående (ordrar med status pending_payment/partially_paid)
- ✅ POS-ordrar synliga på patientkort (GET /pos/patient/:id/orders)
- ✅ Kassarapport (GET /pos/report/daily)

---

## 9. Personal & arbetsyta

- ✅ CCO arbetsyta (kundkö, trådar, bokning, journal-readout)
- ✅ Mobil personalvy (kundlista, journal, foto, bottom sheets)
- ✅ Roller: owner, staff, patient
- ✅ MFA + session
- ✅ Kalender-/dagvy för mottagning (dag + veckoöversikt per behandlare)
- ✅ CCO-agent: daglig rapport, saknade formulär/samtycken, utkast (human approval) — scheduler + J-8.1/8.2

---

## 10. Compliance & kvalitet

- ✅ Åtkomstlogg (audit events)
- ✅ EU-lagring (Render Frankfurt)
- ✅ Retention 10 år konfigurerad (`journalRetentionYears: 10` i config)
- ✅ GDPR export + rättelseprocess dokumenterad i app (route + buildGdprExportPackage)
- ✅ QA-dashboard: formulärcompletion, signeringar, export (alerts + coverage)
- ✅ ID-verifiering (legitimation) på patientkort — manuell upload + selfie + in-person + EU wallet stub
- ✅ Inget journalinnehåll till extern AI (policy gate + middleware)

---

## 11. Migration & historik

- ✅ Cliento-kunder importerade
- ✅ Drive-filer indexerade + journal-PDF import
- ✅ Drive `driveFileId` komplett på alla filer (enrich klar)
- ✅ Meridiq historik: ifyllda formulär + PDF + samtycken (manuell export genomförd)
- ✅ Meridiq read-only efter cutover

---

## 12. Varumärken

|               | Hair TP Clinic                                          | Curatiio                                    |
| ------------- | ------------------------------------------------------- | ------------------------------------------- |
| Bokning       | TP-tjänster, online/fysisk                              | Egna konsultationer & behandlingar          |
| Formulär      | Hälsodekl, friskförsäkran, TP-journal, PRP, uppföljning | Hälsodekl, friskförsäkran, ögonlock-journal |
| Kommunikation | Hair TP-mallar                                          | Curatiio-mallar                             |
| Avtal         | TP, PRP, microneedling                                  | Botox, filler, Profhilo, ögonlock, ortopedi |

- ✅ Strikt separation i publik bokning — brand-fält per tjänst, filtrering via host

---

## 13. Webb & integrationer

- ✅ hairtpclinic.com → Arcana bokning (Plan A bridge)
- ✅ Web events ingest (formulär, chat-intent, analyzer)
- ✅ Pipedrive-synk (3694 personer + 3487 affärer importerade, berikar patientmaster)
- ✅ Fortnox-kundnummer (OAuth-koppling + kundsynk)
- ✅ CMO connectors (Meta, LinkedIn m.fl.)

---

## 14. Medvetet utanför scope (ej i CCO)

- Meridiq som journalsystem framåt
- Cliento som boknings-/kassasystem framåt
- GetAccept för nya avtal (ersatt av Arcana avtal)
- Journalinnehåll till OpenAI / tredjelands-AI

---

## 15. Prioriterad leveransordning

1. **P0 — Gå live med kärnan:** bokning prod, hälsodekl + friskförsäkran + TP-journal signering, Resend, Drive-PDF, tidslinje
2. **P1 — Paritet vardag:** SMS-påminnelser, PDF vid sign, full tjänstekatalog, offer accept/reject, POS minimum (kvitto + tjänst)
3. **P2 — Curatiio + QA:** Curatiio-formulär, kassa full, Meridiq cutover, agent-påminnelser

---

_Nästa steg efter godkänd punklista: bocka av moduler i [MASTER-TODO.md](./MASTER-TODO.md) och bygg i ordning §15._
