# ORD-154 · En utfärdad signeringslänk går inte att återkalla

**Arbetsorder · 2026-08-31**
**Bas:** `main` (`d12deff5`)
**Föregås av:** ORD-153 §2 (token är ingången till legitimering), ORD-152 (öppningen räknas bara med BankID), ORD-144 (BankID)
**Grind:** ORD-131 — inga personnummer i klartext · `CCO_SEND_LIVE` orörd

---

## Hur det upptäcktes

Under prod-verifieringen av ORD-153 §6 skapades en testoffert på UAT-patienten
`cco-uat-fazli-iphone-20260619` och skickades för signering. Efteråt skulle
spåren städas.

Fallet gick att återställa till utkast. **Token gick inte att ta bort.**

Fazli, 2026-08-31, på frågan om det förtjänar en egen order:

> **"absolut jag håller"**

---

## Vad som saknas

```
grep -rniE "revokeOffer|cancelOffer|offer-revoke|esignStatus: *'revoked'" src/
→ tomt
```

Det finns ingen väg att ogiltigförklara en utfärdad signeringstoken. Inte i
API:t, inte i portalen, inte i personalytan. En token som lämnat huset lever
tills fallet råkar skrivas över av något annat.

Och den kan inte skrivas över med avsikt:

```js
ccoCommercialStore.js:647
esignToken: normalizeText(safe.esignToken || previous.esignToken),
```

`safe.esignToken` tom sträng → `||` faller igenom → **förra token tillbaka.**
Fältet är strukturellt oraderbart. Skriver man tomt tror man att man rensat,
och har inte gjort det.

Samma rad, samma fälla, i avtalen:

```js
ccoTreatmentAgreementStore.js:292
esignToken: normalizeText(safe.esignToken || previous.esignToken),
```

### Token har ingen livslängd

```js
ccoOfferEsign.js:23
function buildEsignToken() {
  return crypto.randomBytes(24).toString('hex');
}
```

48 hex-tecken slumpat. Kryptografiskt fin. Men den bär **ingen utgångstid, inget
utfärdandedatum, ingen koppling till den offertversion den skapades för**.
Uppslaget är en likhetsjämförelse mot en lista:

```js
ccoCommercialStore.js:753
async function findCaseByEsignToken(token) { … item.esignToken === normalized … }
```

En token utfärdad i dag fungerar om tre år.

---

## Varför det spelar roll — och varför det inte är panik

ORD-153 §2 gjorde token till **ingången till BankID-grinden, inte nyckeln till
innehållet**. Den som har länken kommer till legitimering, inte till offerten.
ORD-152 skärpte det ytterligare: `owner_mismatch` stoppar fel persons BankID.

Så en läckt länk ger ingen obehörig tillgång i dag. Det är därför den här ordern
är P2 och inte P0.

Men tre saker följer ändå av att länken inte går att stänga:

```
kunden ångrar sig            →  länken hon fick lever vidare
offerten gick till fel adress →  ingen kan dra tillbaka den
priset ändras, ny offert skickas →  gamla länken pekar på samma fall
```

Den tredje är den obehagliga. Token är knuten till **fallet**, inte till
offertversionen. Skickas en reviderad offert leder den gamla länken kunden till
samma BankID-grind och därefter till fallets nuvarande innehåll — som nu är en
annan offert än den hon fick. Ingen har gjort något fel, och ändå kan kunden
signera något hon inte blev erbjuden.

---

## Uppgiften

### 1 · `esignToken` ska gå att rensa

```js
// nu — tom sträng återställer förra värdet
esignToken: normalizeText(safe.esignToken || previous.esignToken),

// ska — explicit tomt betyder tomt
esignToken: safe.esignToken === undefined
  ? normalizeText(previous.esignToken)
  : normalizeText(safe.esignToken),
```

Skilj **"fältet skickades inte med"** från **"fältet skickades som tomt"**. Det
är hela buggen. Samma rättelse i `ccoTreatmentAgreementStore.js:292`.

Sök igenom `upsertCase` efter fler `safe.X || previous.X` på fält som borde gå
att nollställa. Rapportera vilka du hittade, även de du lät vara.

### 2 · En återkallningsväg

```
POST /cco-commercial/offer-revoke   { patientId, reason }
→ esignToken rensas, esignStatus: 'revoked', händelse i tidslinjen
```

`requireAuth` + `requireRole(ROLE_OWNER, ROLE_STAFF)`, som resten av
`ccoCommercial.js`. Skäl obligatoriskt — en återkallelse utan motivering är
värdelös när någon läser tidslinjen ett halvår senare.

**`revoked` är inte samma sak som `draft`.** Ett utkast har aldrig skickats. En
återkallad offert har varit ute hos kunden. Historiken ska kunna skilja dem åt.

### 3 · En återkallad token ska ge ett begripligt nej

`ccoPortalBankId.js:210` svarar i dag `401 invalid_token` på allt som inte
matchar. Kunden som klickar på en återkallad länk ska inte mötas av samma svar
som en trasig länk.

```
"Den här offerten är inte längre aktuell. Kontakta kliniken."
```

Inte varför, inte av vem. Bara att den inte gäller.

### 4 · Ny offert på samma fall ogiltigar den gamla länken

```js
ccoCommercial.js:1190
esignToken: existing.esignToken || buildEsignToken(),
```

Genereras en ny offert från plan behålls token i dag. Efter den här ordern ska
en **ny offertversion ge en ny token** och den gamla sluta fungera — annars är
punkt 1 och 2 ett skydd som förbigås av den vanligaste handlingen i flödet.

Det här är ändringen som rör pågående ärenden. Se fällan nedan.

---

## Fällan

**Befintliga fall har token som kunder kan sitta med öppna just nu.**

Rullar punkt 4 ut utan guard byts token på varje fall som råkar regenereras, och
länken i kundens inkorg dör mitt i ett pågående ärende. Kunden ser
`invalid_token` och tror att systemet är trasigt.

```
esignStatus: 'sent' och ingen ny offert genererad  →  rör inte token
ny offertversion genereras                          →  ny token, gammal dör
återkallelse begärd uttryckligen                    →  token rensas
```

Samma disciplin som ORD-151 och ORD-152: **ändra bara framåt.** Ett test som tar
ett fall med `esignStatus: 'sent'`, kör en orelaterad uppdatering, och jämför
token byte-identiskt.

---

## Godkänt när

1. Tom sträng rensar `esignToken`. Ett test som skriver `''` och läser tillbaka
   tomt — inte förra värdet. Både `ccoCommercialStore` och
   `ccoTreatmentAgreementStore`.
2. `offer-revoke` rensar token, sätter `revoked`, kräver skäl, loggar händelse.
3. Återkallad token ger eget svar i portalen, skilt från `invalid_token`.
4. Ny offertversion ger ny token; den gamla slutar lösa upp.
5. **Befintliga fall byte-identiska.** Ett fall med `esignStatus: 'sent'`,
   orelaterad uppdatering, token oförändrad. Det här är punkten som skyddar
   pågående ärenden.
6. Mutationstesta punkt 1: återinför `|| previous.esignToken` och visa att testet
   blir rött. Utan det vet vi bara att testet är grönt, inte att det mäter något.
7. Inga personnummer i återkallelsehändelsen. ORD-131.
8. `CCO_SEND_LIVE` orörd. Den här ordern rör inte sändgrinden.

---

## Vad jag inte avgjort

**Om token ska ha en utgångstid.** Att den lever för evigt är en andra brist,
skild från att den inte går att återkalla. En frist väcker frågor den här ordern
inte svarar på: vad händer med en kund som öppnar dag 91, och vem förlänger?
Föreslå, bygg inte i tysthet.

**Om avtalen ska följa med i samma svep.** `ccoTreatmentAgreementStore` har
identisk kod och sannolikt identiskt problem, men avtalsflödet är inte
inventerat. Punkt 1 gäller båda eftersom rättelsen är densamma. Återkallelsen
(punkt 2–4) lämnar jag till offerterna tills någon läst avtalsvägen.

**Om återkallelsen ska nå kunden.** En återkallad offert som kunden inte får veta
om är en länk som slutar fungera utan förklaring. Men ett mail om det är ett
utskick, och `CCO_SEND_LIVE` är stängd. Frågan hör ihop med när frysen lyfts, och
den är Fazlis.

**Hur det upptäcktes hör till bilden.** Ingen letade efter det här. Det syntes
för att en testoffert skulle städas bort och inte gick att städa. Det är värt att
notera nästa gång någon frågar varför verifieringar ska köras skarpt.
