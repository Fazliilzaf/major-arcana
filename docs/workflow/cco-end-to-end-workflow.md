# CCO — Hela kliniken end-to-end · Kundresa + Personalresa

> **Syfte:** en gemensam workflow för hela Hair TP Clinic (och Curatiio) där kundresan och personalresan hänger ihop steg för steg. Varje fas visar vad kunden gör, vad personalen gör, och vilket CCO-dokument/verktyg som binder ihop dem.
> **Bas:** `cco-end-to-end-kundresa.md` (kundresan) + CCO-kundresan 9 steg (`buildJourneyFromState`).
> **Roller:** 🟣 Kund · 🌸 CCO-system · 🟢 Personal · 🔵 Ekonomi
> **Datum:** 2026-08-25

---

## Hur det hänger ihop

En kundresa och en personalresa är två sidor av samma förlopp. För varje fas gäller samma CCO-data: kunden lämnar den, personalen använder den, systemet sparar den. Målet är att inget ska behöva skrivas in två gånger.

| Fas             | Kund gör                             | Personal gör                     | CCO-dokument / verktyg           |
| --------------- | ------------------------------------ | -------------------------------- | -------------------------------- |
| 1. Upptäckt     | Kommer in via webb/Instagram/telefon | —                                | Webb, kanaler                    |
| 2. Bokning      | Bokar + godkänner policy             | — (auto)                         | Bokningsmotor, AutoMail          |
| 3. Konsultation | Fyller hälsodeklaration              | Utreder, avgör behandlingsbarhet | Kundkort, kalender               |
| 4. Offert       | Får offert, accepterar               | Tar fram offert + plan           | Offertmodul                      |
| 5. Förberedelse | Skriver på avtal, fyller i           | Kontrollerar ID, plan, bilder    | Behandlingsavtal, friskförsäkran |
| 6. Behandling   | Genomgår behandling                  | Utför, ordinerar, journalför     | Journal, ordination              |
| 7. Betalning    | Betalar förskott + slutbetalning     | (fakturering)                    | Ekonomi, faktura 20/80           |
| 8. Eftervård    | Följer upp                           | Bokar uppföljningar              | Journal, bildbank                |
| 9. Resultat     | Nöjd, återkommer                     | Publicerar resultat              | Resultatbilder, Instagram        |

---

## FAS 1 — Upptäckt

**Kunden** kommer in via hairtpclinic.com / curatiio.com, Instagram eller telefonsamtal. Kunden utforskar behandlingar (hårtransplantation, PRP, estetik).

**Personalen** är inte inblandad här — kanalerna sköts av marknad (WordPress, Instagram).

**CCO-dokument:** webbformulär → in i CCO som potentiell kund.

---

## FAS 2 — Bokning

**Kunden** bokar en konsultation (online eller fysisk) och godkänner personuppgiftspolicy, bokningsvillkor & GDPR.

**Personalen** behöver inte göra något — bokningsmotorn reserverar tid och skickar en AutoMail-bekräftelse med länk till hälsodeklaration och tjänstespecifikation.

**Knytpunkt:** kunden → CCO (bokningsmotor) → personalens kalender + lista över inbokade.

---

## FAS 3 — Konsultation

**Kunden** fyller i hälsodeklarationen (allergier, mediciner, kontraindikationer) före besöket.

**Personalen** (hårspecialist/klinikchef för TP, sjuksköterska/läkare för estetik) genomför konsultationen, stämmer av hälsodeklarationen och avgör om behandling är möjlig. Personalen dokumenterar i kundkortet och bokar eventuell behandlingstid med kunden (vanligen per telefon).

**Knytpunkt:** kundens hälsodeklaration → personalens bedömning → beslut i kundkortet.

---

## FAS 4 — Offert & behandlingsplan

**Kunden** får offerten, läser igenom och accepterar.

**Personalen** tar fram offerten (per varumärke/tjänst): behandlingsplan, länk till tjänstespecifikation, ev. ritningar (TP). När kunden accepterar markerar personalen `Offert | Accepterad` och bokar behandlingstid.

**Knytpunkt:** `Offert | Accepterad` → `Behandlingstid | Bokad` → påminnelser (i dag manuella).

---

## FAS 5 — Förberedelse inför behandling

**Kunden** skriver på behandlingsavtal (eller avstår ångerrätt 2 v.) och godkänner bokningsvillkor och bildhantering. Fyller i friskförsäkran.

**Personalen** kontrollerar vid pre-OP: ID, friskförsäkran, vitalparametrar, bekräftar behandlingsplan, rakning/ritning/pre-OP-foto (TP), och säkerställer att alla dokument är godkända.

**Knytpunkt:** alla dokument (avtal, friskförsäkran, bildhantering) måste vara godkända innan behandling.

---

## FAS 6 — Behandling

**Kunden** genomgår behandlingen.

**Personalen**:

- **TP:** med. instruktion → lokalbedövning → extraktion → kanaler → implantation → PRP 1/4 → post-OP-foto. Läkare ordinerar.
- **Curatiio:** behandling enligt plan (Botox, fillers, profhilo, ögonlock m.fl.), journal per behandling, ordination.

**Knytpunkt:** behandlingsplan + ordination + journal är samma data som kunden har godkänt i fas 4–5.

---

## FAS 7 — Betalning & fakturering

**Kunden** betalar förskott 20 % och därefter slutbetalning 80 %.

**Personalen/ekonomin** fakturerar (20 % → 80 %). Kunden får mail med fakturauppgifter.

**Knytpunkt:** `Förskott betald` + `Slutfaktura betald` kopplas till behandlingen i CCO (i dag via befintlig fakturalösning).

---

## FAS 8 — Eftervård & uppföljning

**Kunden** följer eftervårdsråd och kommer på uppföljningar.

**Personalen** bokar uppföljningar (PRP-efterbehandlingar, TP 4/6/12 mån, estetik enligt plan), journalför, och lägger före/efter-bilder i bildbanken. AutoMail + påminnelse skickas.

**Knytpunkt:** journal + efterbilder per tillfälle.

---

## FAS 9 — Resultat, rekommendation & återkomst

**Kunden** är nöjd och återkommer eller rekommenderar.

**Personalen** (marknad) publicerar resultatbilder på Instagram (med samtycke).

**Knytpunkt:** resultatbilder + samtycke → marknadsföring → återkomst.

---

## Varumärkes-skillnader (vilka dokument som hör till vilken klinik)

|              | Hair TP Clinic                      | Curatiio                                                  |
| ------------ | ----------------------------------- | --------------------------------------------------------- |
| Behandlingar | Hårtransplantation (TP), PRP-hår    | Botox, fillers, profhilo, ögonlock, estetiska injektioner |
| Avtal        | TP Behandlingsavtal, ångerrätt 2 v. | Estetik-avtal (Botox/Fillers/Ögonlock), bildsamtycke      |
| Journal      | TP-journal, PRP-journal             | Estetik-journal                                           |
| Konsultation | Hårspecialist/klinikchef, läkare    | Sjuksköterska/läkare                                      |
| Uppföljning  | 4/6/12 mån + PRP 2–4                | Enligt behandlingsplan                                    |

**Gemensamt:** samma flöde och samma CCO-verktyg — det är poängen. Båda varumärkena går igenom bokning → konsultation → offert → behandling → betalning → uppföljning.

---

## Vad som är automatiserat vs manuellt i CCO

| Del                                             | Status                                |
| ----------------------------------------------- | ------------------------------------- |
| Kundresa 9 steg (bokning → före-identifikation) | ✅ `buildJourneyFromState` / V11-rail |
| Bokningsmotor (reservera/bekräfta/avboka)       | ✅ ccoBookingEngineStore              |
| Offert / accepterad                             | ✅ kommersiell store                  |
| Hälsodeklaration + friskförsäkran               | ✅ (kundresan steg 2/8)               |
| Dokument (avtal, samtycken)                     | ✅ (ok/avstå-ångerrätt)               |
| Journaler per besök                             | ✅ (Besök · tillfällen)               |
| Ekonomi (värde/skuld)                           | ✅ V11-rail                           |
| AutoMail-påminnelser ×4                         | ⚠️ Manuellt (ska automatiseras)       |
| Anpassat erbjudande / resultatmail              | ⚠️ Manuellt                           |
| Instagram-publicering                           | ⚠️ Manuellt                           |
| Fakturering 20/80                               | ⚠️ Befintlig lösning (ej i CCO ännu)  |

**Nästa steg för hela företaget i CCO:** automatisera de streckade stegen (påminnelser, anpassade mail) och flytta faktureringen in i CCO, så att kund- och personalresan ligger i samma system utan dubbel registrering.
