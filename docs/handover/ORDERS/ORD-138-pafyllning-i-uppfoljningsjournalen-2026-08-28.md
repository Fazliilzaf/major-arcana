# ORD-138 · Påfyllning som valfri del av uppföljningsjournalen

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`849ff1d7`)
**Föregås av:** ORD-137 §5 och §7

---

## Beslutet

Fazli, 2026-08-28:

> "vi kan addera på att det valmöjligheten finns i uppföljningen om man har
> fyllt på att man kan skriva in det"

Behandling och uppföljning är **två olika tillfällen** och journalförs var
för sig. Men om personalen fyller på vid uppföljningen ska det kunna
skrivas in **i uppföljningsjournalen** — inte i en separat
behandlingsjournal.

## Uppgiften

### 1 · De tre uppföljningarna slutar ärva

`8952 Uppföljning: Botox` · `8953 Uppföljning: Filler` ·
`8954 Uppföljning: Profhilo`

Alla tre pekar i dag på **behandlingsjournalen** via `inheritsFrom`. Det
ger fel dokument: en behandlingsjournal på ett besök som är en kontroll.

De ska peka på `journal_estetik_follow_4/8/12`, som redan finns sedan
ORD-137 §5 och redan bär `botox`, `filler` och `profhilo` i
`flowApplies`.

Ta ut alla tre ur `inheritsFrom`. Uppdatera `_judgments` — 8954 är inte
längre obesvarad.

### 2 · Påfyllningsdelen i uppföljningsjournalen

Ett valfritt avsnitt: **"Påfyllning gjord vid detta besök"**.

Lämnas det tomt är besöket en kontroll och inget mer krävs. Fylls det i
är det en behandling — och då gäller punkt 3.

### 3 · Fylls det i måste det bära spårbarhet

Här är det viktiga. En påfyllning är en behandling med läkemedel, oavsett
att den skrivs i en uppföljningsjournal. Ett fritextfält räcker inte.

Avsnittet ska bära **samma fält som behandlingsjournalen** — de finns
redan i `steg8-journal-botox-curatiio-final-demo.html`:

```
Preparat · Enheter per område (IE) · Total dos (IE)
Spädning / utspädning · Nål / teknik · Utförare
```

Återanvänd fältnycklarna från behandlingsjournalen. Hitta inte på nya
namn för samma sak — annars går dosen inte att summera över en patients
behandlingar.

### 4 · Batchnummer saknas — och borde inte göra det

Jag läste igenom botox-journalens fält. Den har `Preparat`, dos, spädning
och teknik. Den har **inget batch-/LOT-nummer**.

Botulinumtoxin och fillers är spårbara produkter. Utan batchnummer går det
inte att svara på vilken sats en patient fick när en biverkning ska
utredas eller en sats återkallas.

**Detta är inte en del av beslutet ovan** — Fazli har inte fått frågan.
Bygg det inte på eget initiativ. Men bygg påfyllningsavsnittet så att ett
batchfält kan läggas till utan att strukturen görs om, och ta upp frågan i
rapporten.

---

## Godkänt när

1. 8952, 8953 och 8954 är ute ur `inheritsFrom` och pekar på
   `journal_estetik_follow_*`.
2. `_judgments` uppdaterad — ingen rad står kvar som obesvarad.
3. Uppföljningsjournalen har ett **valfritt** påfyllningsavsnitt.
4. Fylls det i krävs preparat, dos och utförare. Ett test som sparar en
   påfyllning utan dessa ska misslyckas.
5. Fältnycklarna är **samma** som i behandlingsjournalen — visa det med en
   jämförelse, påstå det inte.
6. Lämnas avsnittet tomt går uppföljningen att signera som vanligt.
7. Arbetsbladets radantal stämmer efter ändringen. Räkna om och skriv
   siffran.

## Vad jag inte avgjort

**Batchnummer.** Se punkt 4 — frågan går till Fazli, inte till koden.

**Om en påfyllning ska starta en egen uppföljningskadens.** Fyller ni på
vid 4 veckor, ska det bli nya 4 · 8 · 12 från den dagen? Klinisk fråga.
Fråga, anta inte.
