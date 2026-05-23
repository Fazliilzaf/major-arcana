# Juristflöde — Gabrielle Handler (Nordbro)

Tillägg till `INNEHALL-OCH-NYCKELPUNKTER.md`. Sparat 2026-05-23.

**Jurist:** Gabrielle Handler, Nordbro — gabrielle.handler@nordbro.com

## Gällande avtalsversion

| Dokument | Fil i mappen | Roll |
|---|---|---|
| Behandlingsavtal DHI | `251203_Behandlingsavtal…docx` | **Primär mall** (nyare) |
| Behandlingsavtal DHI (äldre) | `251010_Behandlingsavtal…docx` | Arkiverad version |
| Patientinformation | `251030_KLARSPRÅK Patientinformation & Tjänstespecifikation…docx` | **Bilaga 1** till behandlingsavtalet |

## Lagkrav (sammanfattning)

- **Lagen (2021:363)** om estetiska kirurgiska ingrepp — IVO bedömer att **DHI inte omfattas** idag, men följ lagens krav ändå (kravnivån kan ändras).
- **Distansavtalslagen (2005:59)** — gäller **endast** om avtalet ingås **utanför** lokaler. På plats: **ingen** 14-dagars ångerrätt.
- **Betänketid** — krävs inte för DHI i dagsläget enligt estetiklagen, men processen below följer ändå säker ordning.

## Processordning (ska speglas i Major Arcana)

1. Konsultation bokas
2. **Patientinformation** skickas skriftligt + muntligt (ev. lämnas vid konsultation)
3. Konsultation genomförs
4. **Offert** + **behandlingsavtal** skickas (moms ska finnas i offerten)
5. Behandlingsavtal undertecknas **efter** eventuell betänketid
6. **Bilagor till avtal:** patientinformation (bilaga 1) + behandlingsplan (om finns)
7. **Först därefter** — kunden kan boka behandlingstid
8. Av-/ombokning regleras i behandlingsavtalet

## Bilagor

| Bilaga | Innehåll | Källa |
|---|---|---|
| **Bilaga 1** | Patientinformation & tjänstespecifikation | `251030_KLARSPRÅK Patientinformation…docx` / MA HTML-route `/patientinformation/hartransplantation-dhi-prp` |
| **Bilaga 3 (ångerblankett)** | Standardformulär | **Extern** — [Konsumentverkets ångerblankett](https://www.konsumentverket.se/for-foretag/konsumentratt-for-foretagare/om-konsumentratt/om-konsumentratt/angerblankett/) — finns **inte** som egen fil från juristen |

### Ångerrätt (distansavtal)

Text i avtalsutkastet refererar till bilaga 3. Juristen bekräftar: använd Konsumentverkets standardformulär, inte en egen bilaga från Nordbro.

**Särskilt samtycke** krävs om kunden vill påbörja behandling / boka tid **innan** ångerfristen löpt ut.

## Mapping till Major Arcana (mål)

| Steg | MA-modul idag | Fas |
|---|---|---|
| Patientinfo skickas | HTML/PDF-route + mail | C — logg utskick |
| Konsultation + plan | Journal `consultation_plan` | ✅ Live |
| Offert | `ccoCommercial` + offer-from-plan | ✅ Live |
| Behandlingsavtal | GetAccept / Word | **C — ny modul** |
| Betänketid | `coolingOffDays` på offert | C — koppla till avtal + distans/på-plats |
| Bokning | Cliento / Plan A booking | **Fas 6** — gate efter signerat avtal |
| TP-journal | `tp_treatment` formulär | ✅ Live |

Se `major-arcana/docs/strategy/ma-document-placement-plan.md`.
