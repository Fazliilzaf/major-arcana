# ORD-152 · Öppningen räknas bara med BankID

**Arbetsorder · 2026-08-30**
**Bas:** `main` (`55891c3b`)
**Föregås av:** ORD-151 (betänketiden från öppningen), ORD-144 (BankID), ORD-42 (öppningsspårningen)
**Grind:** ORD-131 — inga personnummer i klartext · `CCO_SEND_LIVE` orörd

---

## Beslutet

Fazli, 2026-08-30, på frågan om en portalöppning räcker som bevis på att
kunden mottagit underlaget:

> **"Så länge den har identifierat sig med BankID."**

Det skärper ORD-151. Där startade betänketiden vid **vilken öppning som
helst**. Nu ska den starta vid den första **BankID-identifierade**
öppningen.

---

## Varför skärpningen behövs

```js
ccoCommercialStore.js   normalizeQuoteOpen(input)
                        →  { ts, source }
```

En öppningspost bär tidpunkt och källa. **Ingen identitet.**

En vidarebefordrad länk, en delad dator, en nyfiken anhörig — allt
registreras som en öppning, och sedan börjar en rättslig frist löpa som
avtalet påstår vilar på att *kunden* mottagit underlaget.

Det är samma sorts fiktion som ORD-151 lagade, ett steg in.

---

## Läs det här först — två saker finns, en sak saknas

### BankID finns, och ger rätt sak

```
ccoPortalBankIdSession.js:249
return { status: 'verified', patientId: match.patientId, session, live };
```

Sessionen returnerar **`patientId`, inte personnumret**. Det är precis vad
öppningsposten ska bära. ORD-131 gäller: inga personnummer i klartext,
någonstans.

`pnrEquals` och `owner_mismatch` (rad 244) ser redan till att en annan
persons BankID inte kan öppna någons offert.

### Öppningsspårningen finns

`quoteOpens`, `quoteOpenedAt`, `quoteOpenCount` — ORD-42, juni 2026. Bygg
inget nytt fält vid sidan av.

### Det som saknas är kopplingen

`recordQuoteOpen` anropas från `ccoCommercial.js:513` med `tenantId`,
`patientId` och `source`. Den vet inte om anroparen är BankID-verifierad.

---

## Konsekvensen du måste förstå innan du bygger

```
render.yaml:391   PORTAL_BANKID_LIVE   "false" tills Fazli tänder den
```

**BankID är avstängt i produktion.** Kopplas betänketiden till en
BankID-verifierad öppning kan ingen frist starta förrän den flaggan
tänds — och därmed kan ingen signera.

Det är inte ett fel i ordern. Det är en kedja Fazli ska se hela:

```
PORTAL_BANKID_LIVE av  →  ingen verifierad öppning
                       →  ingen betänketid startar
                       →  ingen signering
```

Bygg ändå. Grinden ska hålla den dagen flaggan tänds, inte upptäckas då.
Men **skriv i rapporten** att det här är vad som händer, så ingen blir
förvånad.

---

## Uppgiften

### 1 · Öppningsposten bär identiteten

```
normalizeQuoteOpen  →  { ts, source, patientId, verified }
```

`patientId` från BankID-sessionen. `verified: true` bara när sessionen
sagt `status: 'verified'`.

**Aldrig personnumret.** ORD-131. Inte i posten, inte i loggen, inte i
tidslinjen.

### 2 · Oidentifierade öppningar registreras — men startar ingenting

Fazlis avgörande: en öppning utan BankID **syns i historiken** men startar
inte fristen.

```
öppning utan BankID   →  registreras, verified: false, ingen coolingOff
öppning med BankID    →  registreras, verified: true, fristen startar
```

Att kunden tittat är värt att veta även när hon inte legitimerat sig. Men
det är inte ett bevis på mottagande.

### 3 · Fristen startar vid första **verifierade** öppningen

Inte den första öppningen. Den första verifierade.

Har kunden öppnat fem gånger anonymt och sedan en gång med BankID är det
den sjätte som gäller.

### 4 · Befintliga poster skrivs inte om

Det här är orderns fälla.

Alla `quoteOpens` som finns i dag saknar `verified`. Tolkas ett saknat
fält som `false` skulle varje pågående ärende få sin betänketid nollställd
— och ärenden där fristen redan löpt ut skulle plötsligt inte ha någon.

```
lagrad coolingOffEndsAt finns   →  rör den inte
signerat eller arkiverat        →  rör det inte
```

Samma guard som ORD-151 använde (`!coolingOffEndsAt`). Ändra bara framåt.

### 5 · Ytan säger vilket som gäller

Kunden ska kunna se skillnaden:

```
"Du öppnade underlaget 2026-08-28, men betänketiden startar när du
 legitimerat dig med BankID."

"Betänketiden löper från 2026-08-28, då du legitimerade dig med BankID.
 Du kan signera från och med 2026-08-30."
```

En kund som undrar varför hon inte kan signera ska få veta det, inte gissa.

---

## Godkänt när

1. `normalizeQuoteOpen` bär `patientId` och `verified`. **Inget
   personnummer.** Sök på `pnr` i öppningsvägen och visa noll.
2. Oidentifierad öppning registreras men startar **ingen** frist. Ett test.
3. Fristen startar vid första **verifierade** öppningen, inte den första.
   Ett test med fem anonyma följt av en verifierad.
4. **Befintliga poster byte-identiska.** Ett test som tar ett ärende med
   lagrad `coolingOffEndsAt`, kör en öppning, och jämför. Det här är
   punkten som skyddar redan pågående ärenden — och den ORD-151 lämnade
   otestad.
5. Ytan skiljer "öppnad men ej legitimerad" från "fristen löper". Ett test
   på texten.
6. Mutationstesta: låt `verified: false` starta fristen och visa att
   testet i punkt 2 blir rött.
7. `PORTAL_BANKID_LIVE`-konsekvensen står i rapporten. Ingen ändrar
   flaggan.
8. `CCO_SEND_LIVE` orörd.

## Vad jag inte avgjort

**Hur BankID-sessionen når `recordQuoteOpen`.** Den kallas från
`ccoCommercial.js:513`. Om sessionen inte finns i den kontexten är det en
kopplingsfråga — lös den, men bygg ingen andra sessionsmodell.

**Om `owner_mismatch` ska registreras som öppning.** Någon försökte öppna
med fel BankID. Det är inte ett mottagande, men det är värt att veta.
Föreslå, bygg inte i tysthet.

**Om Nordbro ska bekräfta.** Fazli har svarat, och svaret är strängare än
vad som fanns förut — det gör systemet säkrare, inte lösare. Men
formuleringen i avtalet säger fortfarande *"mottagits"*, inte
*"legitimerat sig och öppnat"*. Frågan om texten ska följa efter är kvar,
och den är Fazlis och Nordbros.
