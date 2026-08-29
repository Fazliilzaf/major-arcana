# ORD-146 · Reserverad vid accept, bekräftad vid signering

**Arbetsorder · 2026-08-29**
**Bas:** `origin/main` (`117ec9a9`)
**Beslut:** Fazli, 2026-08-29.
**Löser:** motsägelsen mellan `offerAutoFlow` och readiness-grinden.

---

## Beslutet

| När                                    | Vad händer med tiden                        |
| -------------------------------------- | ------------------------------------------- |
| Kunden **accepterar offerten**         | tiden **reserveras** — hon håller sin plats |
| Kunden **signerar behandlingsavtalet** | bokningen blir **bekräftad**                |

Det är inte en kompromiss. Er kundresa har betänketiden i **steg 6**,
mellan offerten (5/7) och behandlingen (8). En reservation som blir
bekräftad vid signering **är** betänketiden, uttryckt i bokningen.

Juristen får rätt — ingen bekräftad bokning före undertecknat avtal. Och
kunden tappar inte sin tid medan betänketiden löper.

## Orden finns redan

Bygg ingen ny modell:

```js
ccoTreatmentEncounterStore.js:6
ENCOUNTER_STATUSES = ['reserved', 'confirmed', 'checked_in', …]
```

Bokningsmotorn har `reservationId` (rad 1111), `renewReservations`
(rad 1890) och ett workflow-läge som redan skiljer på `reserved`.

Det som saknas är inte begreppet. Det är att **accepten sätter fel läge**.

---

## Motsägelsen som ska bort

```
offerAutoFlow.js:44    upsertAgreement({ status: 'sent' })    ← osignerat
offerAutoFlow.js:71    createVipToken(...)                    ← bokning ändå
ccoPatientCareOps.js:69  !['bookable','signed'] → missing     ← kräver signerat
```

Auto-flow bokar vid steg A. Grinden kräver steg B. Två sanningar om samma
sak.

### Och grinden är fail-open

```js
if (agreement && agreementStatus && !['bookable', 'signed'].includes(agreementStatus))
```

Den går bara igång **om ett avtal finns**. Finns inget avtal alls flaggas
ingenting — en patient utan avtal passerar readiness-kontrollen, medan en
med osignerat avtal stoppas.

**Det är en bugg oavsett beslutet ovan.** Inget avtal ska vara minst lika
blockerande som ett osignerat.

### Och portalen säger fel sak till kunden

```js
ccoPortalCustomerPayload.js   accepted → 'signed'
```

En konsument ser ordet **signerad** om ett behandlingsavtal hon inte har
skrivit under. Offertaccept och avtalssignering är två olika besked och får
inte heta samma sak.

---

## Uppgiften

### 1 · Accepten reserverar

`offerAutoFlow` ska ge kunden en **reservation**, inte en bekräftad
bokning. VIP-token får finnas — den är hur hon når bokningsvyn — men det
den skapar är `reserved`.

Reservationen ska ha en livslängd. `renewReservations` finns redan; använd
den, hitta inte på en egen.

### 2 · Signeringen bekräftar

När `agreementStatus` blir `bookable` eller `signed` går reservationen till
`confirmed`. Det är det enda stället en bokning får bli bekräftad.

### 3 · Grinden stängs

`if (agreement && …)` → saknat avtal blockerar också. Ett test för vardera:
inget avtal, osignerat avtal, signerat avtal.

### 4 · Portalen slutar säga "signerad" om en accept

Offertaccept och avtalssignering ska ha **olika ord** i kundens vy. Vilka
ord är Fazlis val — föreslå två och fråga.

### 5 · Vad som händer när betänketiden går ut osignerad

Reservationen ska inte ligga kvar för evigt och blockera en tid ni kan
sälja. Men den ska inte heller försvinna tyst för kunden.

**Bestäm inte det här själv.** Föreslå, och fråga Fazli. Det är hans
kapacitet.

---

## Godkänt när

1. Offertaccept ger `reserved`, aldrig `confirmed`. Ett test.
2. Signerat avtal ger `confirmed`. Ett test.
3. Ingen annan väg kan sätta `confirmed`. Sök och visa.
4. Saknat avtal blockerar lika hårt som osignerat. Tre tester.
5. Portalen säger inte "signerad" om en accepterad offert.
6. `offerAutoFlow` och `ccoPatientCareOps` säger samma sak. Ett test som
   kör hela kedjan accept → reservation → signering → bekräftad.
7. Mutationstesta: låt accepten sätta `confirmed` och visa att ett test
   blir rött.
8. Verifiera i en körande server, inte bara i test.
9. `CCO_SEND_LIVE` orörd.

## Gränser

- **Rör inte identiteten.** ORD-144 äger `signatureProof` och BankID.
  Den här ordern ändrar ordningsföljd, inte vem som signerat.
- **Radera ingen bokning.** En reservation som löper ut ska stängas med
  orsak, inte försvinna. Samma grind som ORD-140.

## Vad jag inte avgjort

**Reservationens livslängd.** Betänketiden är två dagar enligt lag, men en
transplantationstid bokas långt fram. Hur länge en reservation får hålla en
tid är en affärsfråga — Fazlis.

**Vad kunden ser när reservationen löper ut.** Se punkt 5.
