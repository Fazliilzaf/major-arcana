# ORD-153 · Portalen är leveransplatsen — BankID vid ingången

**Arbetsorder · 2026-08-30**
**Bas:** `main` (`327f7e40`)
**Ersätter:** ORD-152 (som beskrev BankID vid öppningen utan att veta var i portalen det satt)
**Föregås av:** ORD-151 (betänketiden från öppningen), ORD-144 (BankID), ORD-147 (sändgränsen)
**Grind:** ORD-131 — inga personnummer i klartext · `CCO_SEND_LIVE` orörd

---

## Beslutet

Fazli, 2026-08-30:

> *"Då kommer vi också följa alla patientlagar. Inget skickas online, och
> vi kan ge kunden all info utan att vara rädda att patientdata skickas
> hej vilt. Kunden ser var han befinner sig i sin resa — all information
> är samlad på ett ställe för oss båda."*

**BankID sitter vid ingången till portalen, inte vid signeringsknappen.**

Det är ett arkitekturbeslut, inte en detalj i betänketiden. Det ändrar vad
"skicka" betyder i hela CCO.

---

## Cirkeln som tvingade fram beslutet

Portalen har i dag BankID på **signeringen**:

```
cco-patient-offer-portal-v3.html:3615   <button id="bankidBtn" onclick="startBankID()">
                              :3622     "Signera med Mobilt BankID"
                              :3563     "…sedan signerar du med Mobilt BankID."
```

Ingen legitimering innan offerten visas. Åtkomsten är **token-skyddad** —
en länk.

Kombinerat med ORD-151 och ORD-152 gav det en omöjlighet:

```
betänketiden startar vid BankID-verifierad öppning
BankID sker bara vid signering
signering kräver att betänketiden löpt ut
```

Kunden kan inte legitimera sig utan att signera. Legitimerar hon sig inte
startar aldrig fristen. Startar fristen inte får hon aldrig signera.

Flyttas BankID till ingången löser sig cirkeln av sig själv: hon
legitimerar sig, fristen startar, och signeringen är en andra BankID
senare.

---

## Vad beslutet betyder i övrigt

Det här är den viktiga delen, och den är större än betänketiden.

### "Skicka" betyder något annat nu

I dag finns sexton patientvända sändvägar (ORD-147). De skickar
**innehåll** — offert, avtal, instruktioner.

Med portalen som leveransplats skickar de i stället en **avisering**:

```
i dag    "Här är din offert"        + patientdata i mejlet
sedan    "Du har något nytt i portalen"  + en länk, ingen patientdata
```

**Aviseringen innehåller ingen patientdata.** Det förenklar hela den
juridiska bilden — och det är precis vad Fazli menar med *"inget skickas
online"*.

**Kartlägg vad de sexton faktiskt skickar** innan något byggs om. Rör dem
inte i den här ordern. Räkna dem.

### Portalen bär hela resan

Rubrikerna i portalen visar det redan:

```
Min trygga resa
Läs igenom din offert
Inför operationsdagen
Eftervård och uppföljning
```

Det är inte en offertsida. Det är patientens vy av hela kundresan — och
därför ska den ligga bakom legitimering, inte bakom en länk.

---

## Uppgiften

### 1 · BankID före innehållet

Portalen får en legitimeringsgrind. Utan verifierad session visas
**ingenting** av innehållet — inte offerten, inte journalen, inte
eftervården.

`ccoPortalBankIdSession.js` finns och gör redan rätt:

```
:249   return { status: 'verified', patientId, session, live }
:244   owner_mismatch — annans BankID stoppas
```

Sessionen ger `patientId`, **aldrig personnumret**. ORD-131 gäller.

### 2 · Token blir ingång, inte nyckel

Länken kunden får ska leda **till legitimeringen**, inte till innehållet.
En läckt eller vidarebefordrad länk ska inte ge någon åtkomst.

`tokenExpiresAt` finns redan. Behåll den — en länk ska både kräva BankID
och ha en livslängd.

### 3 · Fristen startar vid första verifierade inloggningen

Det ORD-152 ville, men nu med en plats där det kan ske:

```
inloggning med BankID   →  quoteOpen { ts, patientId, verified: true }
                        →  betänketiden startar
```

Öppningsposten bär `patientId` och `verified`. Aldrig personnumret.

### 4 · Befintliga poster skrivs inte om

Orderns fälla, oförändrad från ORD-152 §4.

Alla `quoteOpens` som finns i dag saknar `verified`. Tolkas det som `false`
nollställs varje pågående ärendes betänketid, och ärenden där fristen redan
löpt ut får plötsligt ingen.

```
lagrad coolingOffEndsAt finns   →  rör den inte
signerat eller arkiverat        →  rör det inte
```

### 5 · Personalportalen visar samma sanning

Fazli, 2026-08-30: *"Vi i personalen kommer att jobba här ifrån så vi har
koll på kunderna."*

Personalportalen visar redan betänketiden — och med den här ordern blir
raden felaktig:

```
staff-portal.html:5178
"Offert: ${belopp} · Skickad ${sentAt} · Betänketid till ${coolingAt}"
                    ^^^^^^^^^^^^^^^^^
                    inte längre det fristen räknas från
```

En medarbetare som svarar i telefon läser den raden. Säger den "skickad
28 augusti, betänketid till 30 augusti" medan fristen i själva verket
inte börjat — för att kunden aldrig loggat in — så säger vi fel sak till
en patient.

**Raden ska visa vad fristen faktiskt räknas från**, och skilja de två
lägena:

```
"Skickad 28 aug · kunden har inte loggat in — betänketiden har inte börjat"
"Skickad 28 aug · inloggad 29 aug · betänketid till 31 aug"
```

Det är samma krav som portalen får i punkt 3, sett från andra hållet. **De
två ytorna får inte visa olika sanningar om samma ärende.**

### 6 · Räkna de sexton — bygg inte om dem

Ordern **rör inte** sändvägarna. Men den ändrar vad de ska göra, och det
ska mätas innan någon bygger.

Leverera en lista: för var och en av de sexton, **vad skickas i dag** —
innehåll eller avisering? Vilka bär patientdata i själva meddelandet?

Det blir en egen order. Här bara siffran.

---

## Konsekvensen du måste skriva ut

```
render.yaml:391   PORTAL_BANKID_LIVE = "false"
```

BankID är avstängt. Med den här ordern byggd betyder det:

```
BankID av  →  ingen kommer in i portalen
           →  ingen betänketid startar
           →  ingen signering
```

Bygg ändå. Grinden ska hålla den dagen flaggan tänds. Men **skriv i
rapporten** att portalen är stängd tills Fazli tänder den, så ingen blir
förvånad.

---

## Godkänt när

1. Portalens innehåll är otillgängligt utan verifierad BankID-session. Ett
   test som hämtar utan session och visar att **ingenting** av
   patientinnehållet returneras.
2. **Mutationstesta punkt 1.** Ta bort grinden och visa att testet blir
   rött. Det här är den viktigaste punkten — den skyddar patientdata.
3. En giltig token utan BankID ger **ingen** åtkomst. Ett test.
4. `owner_mismatch` — annans BankID på någons portal — nekas. Ett test.
5. Öppningsposten bär `patientId` och `verified`. **Sök på `pnr` i
   portalvägen och visa noll.**
6. Fristen startar vid första verifierade inloggningen. Ett test.
7. **Befintliga ärenden byte-identiska.** Ett test som tar ett ärende med
   lagrad `coolingOffEndsAt`, kör en inloggning, och jämför.
8. **Personalportalen visar vad fristen räknas från**, och skiljer "inte
   inloggad" från "fristen löper". Ett test på `staff-portal.html:5178`.
9. **Kundens vy och personalens vy säger samma sak om samma ärende.** Ett
   test som bygger båda ur samma ärende och jämför datumen.
10. Lista över de sexton sändvägarna: innehåll eller avisering. Ingen
    ändrad.
11. `PORTAL_BANKID_LIVE`-konsekvensen står i rapporten. Ingen ändrar
    flaggan.
12. `CCO_SEND_LIVE` orörd.

## Vad jag inte avgjort

**Hur en kund utan BankID hanteras.** Alla har inte Mobilt BankID. Fråga
Fazli innan du bygger ett undantag — ett undantag i en åtkomstgrind är
det farligaste som finns.

**Om aviseringen ska innehålla behandlingens namn.** *"Du har en ny offert"*
är neutralt. *"Du har en ny offert för hårtransplantation"* är
patientdata i ett mejl. Det är en fråga för Fazli och Nordbro.

**ORD-152 är ersatt av den här.** Den beskrev rätt princip på fel plats i
flödet — den visste inte att BankID satt på signeringsknappen. Lämna den
kvar med en hänvisning hit; radera den inte.
