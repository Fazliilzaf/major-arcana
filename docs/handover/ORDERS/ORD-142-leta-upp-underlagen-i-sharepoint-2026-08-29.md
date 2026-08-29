# ORD-142 · Leta upp för- och eftervårdsunderlagen i SharePoint

**Arbetsorder · 2026-08-29**
**Bas:** `main` (`6bc3924a`)
**Ersätter inte** ORD-141 — den beskriver vad kundkortet ska visa. Den här
handlar om att hitta materialet den ska visa status för.

---

## Varför

Fazli: underlagen ligger i SharePoint, bland de övriga kunddokumenten.

Jag har gått igenom GetAccept i båda entiteterna. Läget där:

|                        | Hair TP Clinic                            | Curatiio   |
| ---------------------- | ----------------------------------------- | ---------- |
| Material i biblioteket | 7                                         | **1**      |
| Eftervård              | "Skötselråd", **apr 2022**, använd 10 ggr | **saknas** |
| Förberedelse           | **saknas**                                | **saknas** |
| Bilagor på dokument    | **noll**                                  | **noll**   |

Behandlingsavtalet för FUE har skickats 1 539 gånger. Skötselrådet 10.
Ingen patient i någon klinik får för- eller eftervård som bilaga.

Materialet finns alltså — men inte där det skickas ifrån.

---

## Var du ska leta

Repot bär redan 55 `sharepoint://`-referenser. Två distinkta sökvägar,
båda på site `hairtpclinic1`:

```
sharepoint://hairtpclinic1/Ledning/General/1. Kunddokument - KVALITETSSAKRA/
sharepoint://hairtpclinic1/Ledning/General/1. Kunddokument - KVALITETSSAKRA/97. Versioner fran advokat/
```

De finns i `config/cco-treatment-document-requirements.json` (rad 648, 788, 790) och `data/cco-templates.json` (rad 4804, 4825).

**Börja i `1. Kunddokument - KVALITETSSAKRA`.** Numreringen antyder att det
finns fler mappar än `97.` — kartlägg dem.

## Vad du letar efter

**Förberedelse och eftervård, per behandling och per klinik.**

Kända filnamn att matcha mot (Fazli har dem lokalt, samma material bör
finnas i SharePoint):

```
[SE] Guide-För&Eftervård-TP.pdf        8 sidor
Eftervård HTP.docx.pdf
TP. Postoperativa instruktioner.pdf
```

Och det som saknas helt i dag:

- **Curatiios eftervård** — botox, filler, profhilo, ortopedi, PRP hud,
  microneedling, PRF, ögonlocksplastik
- **Förberedelse** för samtliga behandlingar, båda klinikerna

---

## Uppgiften

### 1 · Kartlägg, ändra ingenting

Det här är ett **läs-uppdrag**. Flytta inget, döp om inget, ladda upp inget
till SharePoint. Rör inte GetAccept — jag var nära att öppna en mall i
redigeringsläge där, och den sparar automatiskt.

### 2 · Leverera en förteckning

En markdown-fil i `docs/handover/`, en rad per hittat dokument:

| Kolumn        | Innehåll                        |
| ------------- | ------------------------------- |
| Filnamn       | exakt, med ändelse              |
| Full sökväg   | hela `sharepoint://`-strängen   |
| Typ           | förberedelse · eftervård · båda |
| Behandling    | vilken, eller "generell"        |
| Klinik        | hairtp · curatiio · båda        |
| Senast ändrad | datum                           |
| Format        | text-PDF · inskannad · docx     |

### 3 · Säg vad som **inte** finns

Lika viktigt som listan. Vilka behandlingar saknar för- eller eftervård
helt? Den luckan är det ORD-141 ska visa på kundkortet.

### 4 · Flagga dubbletter och versioner

`97. Versioner fran advokat` antyder att samma dokument finns i flera
versioner. Vilken som är gällande är **inte** ditt beslut — lista dem,
märk vilken som är senast ändrad, och lämna valet till Fazli.

---

## Gränser

- **Läs, ändra inte.** Varken i SharePoint eller GetAccept.
- **Öppna inga patientdokument.** Du är ute efter mallar och underlag, inte
  signerade kundavtal. Ligger de i samma mapp: hoppa över dem och skriv att
  du gjorde det.
- **Inga personnummer** i förteckningen.
- Hittar du inget på en sökväg: skriv det. Gissa inte fram en annan mapp.

## Godkänt när

1. Förteckningen finns, med full sökväg per dokument.
2. Luckorna är namngivna — vilka behandlingar som saknar underlag.
3. Versionsdubbletter är listade, inte valda.
4. Ingenting är ändrat, flyttat eller uppladdat. Bekräfta det.

## Efter det här

Först när förteckningen finns går det att avgöra ordningen i ORD-141: om
guiderna ska in i GetAccept-biblioteket som bilagor, in i katalogen som
dokumenttyper, eller båda. Det beslutet tas när vi vet vad som finns.
