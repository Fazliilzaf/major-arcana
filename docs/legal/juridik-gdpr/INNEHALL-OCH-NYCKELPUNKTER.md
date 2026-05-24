# Juridik & GDPR, Hair TP Clinic, dokumentindex + nyckelpunkter

Sparat 2026-05-21. Samma uppsättning ligger även i mappen "Hairtpclinic webb/Juridik-GDPR".

## Dokument i mappen

| Fil | Vad det är |
| --- | --- |
| Nulägesanalys och åtgärdsförslag.pdf | GDPR/patientdata-gapanalys från **Insatt AB**. Lista över åtgärder under patientdatalagen + HSLF-FS 2016:40. **Detta är kravspecen.** |
| Artikel 30-register - färdig version .xlsx | Registerförteckning över alla personuppgiftsbehandlingar, system, biträden, lagringstider. **Detta är nulägeskartan.** |
| Intern Integritetspolicy.docx | Intern policy: GDPR-organisation, principer, ansvar (Kvalitetsansvarig). |
| GDPR-information till anställda.docx | Info till personal om personuppgiftshantering. |
| GDPR-information till hemsida.docx | Integritetspolicy avsedd för publicering på hemsidan. |
| IT-Policy.docx | Informationssäkerhetspolicy. |
| Underbilaga 1 - Instruktion.docx | Instruktion (biträdes-/behandlingsinstruktion). |
| Logg för personuppgiftsincidenter.xlsx | Tom mall för incidentlogg (IMY-anmälan). |
| 251010 / 251203 Behandlingsavtal (DHI).docx | Patientavtal för DHI-hårtransplantation (2 versioner). |
| 251030 KLARSPRÅK Patientinformation & Tjänstespecifikation (DHI).docx | Patientinformation/tjänstespec, klarspråksversion med kommentarer. |
| Forsbrev-296988.pdf | Folksam Praktik-/Patientförsäkring (Hälso- och sjukvårdsinrättning, medlem Läkarförbundet). |

## Nuläge enligt Artikel 30-registret (var datan ligger idag)

- **Journalföring:** Google Drive (loggkontroll görs MANUELLT). Laglig grund: rättslig förpliktelse (3 kap. patientdatalagen + 5 kap. 5 § HSLF-FS 2016:40). Gallring 10 år.
- **Hälsodeklaration + Friskförsäkran:** Pipedrive.
- **Bokning:** Cliento. **CRM/konsultation:** Pipedrive + Mailchimp.
- **Avtalssignering:** GetAccept. **Lön/bokföring:** Fortnox. **Försäkring:** Folksam/Fora.
- **Gemensam lagring:** Google Drive + Microsoft 365.
- Tredjelandsöverföring (USA) hanteras via Data Privacy Framework + SCC för flera system.

## Krav som journalmodulen MÅSTE uppfylla (från Nulägesanalys + intern policy)

1. **Behörighetsstyrning** per roll, 4 kap. 1-3 §§ patientdatalagen.
2. **Åtkomstloggning + loggkontroll** per 4 kap. 3 + 9-12 §§ (idag manuellt i Drive, en inbyggd logg löser detta).
3. Data inom **EU/EES** — Render **Frankfurt (eu-central)** verifierad i Dashboard (2026-05-24).
4. **Inga känsliga hälsouppgifter via webbformulär eller mejl** (validerar att vi ersätter /screen + halso@-flödet).
5. **Kryptering** systematiskt.
6. **Risk- och sårbarhetsanalys per system** (3 kap. 5 §), driftdokumentation (3 kap. 8 §), regelbunden **säkerhetskopiering** (12 §).
7. **10 års bevarande** (patientdatalagen).
8. **Personuppgiftsbiträdesavtal (PUB-avtal)** med alla biträden.
9. Process för **registrerades rättigheter** (radering, registerutdrag).
10. Utsedd ansvarig = **Kvalitetsansvarig**; årlig sammanställning (3 kap. 6 §).

## Koppling till journal-projektet

Den nya journalmodulen i `major-arcana` bör flytta journalföring från Google Drive till en
åtkomststyrd, EU-hostad modul med inbyggd åtkomstlogg, vilket direkt åtgärdar de manuella
loggkontrollerna och mejl-/webbformulärsriskerna som Insatt flaggade. Del A (återtagning av
halso@-underlag) gäller den gamla flödet som nu ska bort.

## Juristprocess — Gabrielle Handler (Nordbro)

**Jurist:** Gabrielle Handler — gabrielle.handler@nordbro.com  
**Detaljer:** se [JURIST-FLODE-GABRIELLE-HANDLER.md](./JURIST-FLODE-GABRIELLE-HANDLER.md)

### Gällande avtalsversion

| Dokument | Fil | Roll |
| --- | --- | --- |
| Behandlingsavtal DHI | `251203_Behandlingsavtal…docx` | **Primär mall** (nyare) |
| Behandlingsavtal DHI (äldre) | `251010_Behandlingsavtal…docx` | Arkiverad version |
| Patientinformation | `251030_KLARSPRÅK Patientinformation…docx` | **Bilaga 1** till behandlingsavtalet |

### Processordning (ska speglas i Major Arcana)

1. Konsultation bokas
2. **Patientinformation** skickas skriftligt + muntligt (ev. lämnas vid konsultation)
3. Konsultation genomförs
4. **Offert** + **behandlingsavtal** skickas (moms ska finnas i offerten)
5. Behandlingsavtal undertecknas **efter** eventuell betänketid
6. Bilagor: patientinformation (bilaga 1) + behandlingsplan (om finns)
7. **Först därefter** — kunden kan boka behandlingstid
8. Av-/ombokning regleras i behandlingsavtalet

### Bilagor och distans vs på-plats

| Bilaga | Innehåll | Källa |
| --- | --- | --- |
| **Bilaga 1** | Patientinformation & tjänstespecifikation | `251030_KLARSPRÅK Patientinformation…docx` / MA-route `/patientinformation/hartransplantation-dhi-prp` |
| **Bilaga 3 (ångerblankett)** | Standardformulär | **Extern** — [Konsumentverkets ångerblankett](https://www.konsumentverket.se/for-foretag/konsumentratt-for-foretagare/om-konsumentratt/om-konsumentratt/angerblankett/) |

- **Distansavtalslagen (2005:59)** gäller endast om avtalet ingås **utanför** lokaler. På plats: **ingen** 14-dagars ångerrätt.
- **Betänketid** följer distans/på-plats; särskilt samtycke krävs om behandling/bokning påbörjas innan ångerfristen löpt ut.

### MA-status (2026-05-23)

| Steg | Modul | Status |
| --- | --- | --- |
| Patientinfo | HTML/PDF-route + logg utskick | Live |
| Konsultation + plan | Journal `consultation_plan` | Live |
| Hälsodekl + friskförsäkran | `journal-pre-treatment-forms.js` | Live (ersätter Pipedrive) |
| Offert | `ccoCommercial` | Live |
| Behandlingsavtal | `ccoTreatmentAgreement` | Live (ersätter GetAccept för nya kunder) |
| Bokning behandling | `ccoTreatmentBookingGate` | Live — gate tills `bookable` |
