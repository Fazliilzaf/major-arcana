# ORD-144 · BankID — koppla färdigt

**Arbetsorder · 2026-08-29**
**Bas:** `origin/main` (`8a087c54`)
**Beslut:** Fazli har stämt av med juristerna — **en verifiering räcker.**
Efter BankID-inloggning är personen verifierad, och efterföljande
signeringar behöver ingen ny BankID-underskrift.

---

## Nuläget — mätt, inte antaget

BankID är inte en skiss. Det är byggt och monterat.

|                            | Var                                                                            |
| -------------------------- | ------------------------------------------------------------------------------ |
| Router, 5 endpoints        | `src/routes/ccoPortalBankId.js`, 455 rader                                     |
| Monterad                   | `server.js:13146`                                                              |
| BankID via Criipto OIDC    | `src/ops/ccoCriiptoIdToken.js`                                                 |
| QR + same-device           | `ccoPortalBankIdSession.js:55–57`                                              |
| Personnummer mot journalen | `pnrEquals` → nekar med `owner_mismatch`                                       |
| CSRF-skydd på callbacken   | nekar med `state_mismatch`                                                     |
| Nivå-2-session             | signerad cookie, `httpOnly`, `secure`, `sameSite: lax`                         |
| Sessionens livslängd       | **30 min inaktivitet**                                                         |
| Dokument i portalen        | `buildLevelTwoDocuments` — läser dokumentinstanser, slår upp typen i katalogen |
| Tester                     | `tests/public/ccoPortalLevel2.test.js`, 15 st                                  |

**Följden av att dokumenten går via katalogen:** patientinformationen som
lades in i går — sju Curatiio-rader i steg 4 — syns i portalen så snart
patienten har en instans av dem. Ingen ny kod behövs för det.

---

## Fyra saker stoppar den

### 1 · Flaggorna finns inte i blueprinten

`isBankIdLive` kräver båda:

```js
Boolean(env.BANKID_API_KEY) && env.PORTAL_BANKID_LIVE === '1';
```

Ingen av dem finns i `render.yaml`. Jag sökte.

Sätts de i Render-panelen utan att blueprinten ändras **går de tillbaka vid
nästa deploy**. Samma fälla som ORD-134 tog tag i.

Nycklarna själva rör du inte — de är Fazlis. Blueprinten ska ha
_platserna_, inte värdena.

### 2 · Offerten syns först efter att kunden accepterat den

`ccoPortalBankId.js:434`:

```js
if (quoteStatus !== 'accepted' || !documentId) return 404;
```

Kunden kan alltså inte läsa offerten i portalen **innan** hon accepterar
den. Hon accepterar någon annanstans, och först då blir den synlig i
portalen.

Fazlis krav är det omvända: **patientinformationen ska synas samtidigt som
offerten**, i portalen, som underlag för beslutet.

Vänd på grinden. Sessionen — att rätt person är inloggad — är skyddet.
`quoteStatus` är inte ett behörighetsvillkor, det är ett tillstånd i
affären.

Behåll däremot 404 när det inte finns någon offert alls.

### 3 · Underskriften är fortfarande ett inskrivet namn

`ccoTreatmentAgreement.js:583`:

```js
const signer = customerSignedName || 'Kund';
```

Skriver kunden inget blir undertecknaren strängen **`'Kund'`**.

Identiteten är verifierad med BankID. Signaturen vet inget om det. Koppla
ihop dem: signeringen ska ske i en giltig nivå-2-session och bära
sessionens `patientId`, inte ett fritextnamn.

**Ta bort `|| 'Kund'`.** En underskrift utan undertecknare ska vara ett fel,
inte ett förval.

### 4 · Ingenting registrerar vad som signerades

Med en verifiering och många signeringar är det **per dokument** beviset
måste finnas. Varje signering ska bära:

- vilken **BankID-session** (id, inte personnummer)
- **när**
- vilket **dokument och vilken version**

Det är samma versionsfält som ORD-136 kräver på biverkningsgenomgången och
ORD-143 på tjänstespecifikationen. **Ett fält, tre användningar.** Bygg det
inte tre gånger — sök i repot först.

---

## Uppgiften, i ordning

1. Platser för `BANKID_API_KEY` och `PORTAL_BANKID_LIVE` i `render.yaml`.
   Inga värden.
2. Vänd offertgrinden — sessionen skyddar, inte `quoteStatus`.
3. Bind signeringen till nivå-2-sessionen. `|| 'Kund'` bort.
4. Signeringsbeviset: session, tid, dokument, version.
5. Verifiera i en riktigt körande server, inte bara i test. Samma krav som
   ORD-139 fick: koden såg rätt ut i tre varv och gjorde ändå ingenting i
   produktion.

## Godkänt när

1. Blueprinten bär båda flaggorna. Inga hemligheter i git — visa det.
2. En inloggad kund ser offerten **och** patientinformationen innan hon
   accepterat. Ett test.
3. Ingen offert alls ger fortfarande 404. Ett test.
4. Signering utan giltig session **misslyckas**. Ett test.
5. `'Kund'` förekommer inte längre som undertecknare. Sök och visa noll
   träffar.
6. Varje signering bär session, tid, dokument och version. Ett test som
   misslyckas när något av de fyra saknas.
7. Versionsfältet är **samma** som ORD-136 och ORD-143 använder.
8. Mutationstesta: ta bort sessionskontrollen på dokumentendpointen och
   visa att ett test blir rött.
9. `CCO_SEND_LIVE` orörd.

## Gränser

- **Rör inga nycklar.** `BANKID_API_KEY` är Fazlis och sätts av honom, i
  Render. Be inte om den, logga den inte, skriv den inte i en fil.
- **Slå inte på `PORTAL_BANKID_LIVE`.** Ordern förbereder. Fazli tänder.
- Personnummer loggas aldrig. Sessionen identifieras med sitt `sessionId`.

## Vad jag inte avgjort

**30 minuters inaktivitet** står som "beslutat" i koden. Med en
verifiering och flera signeringar i följd kan det bli för kort — loggas
kunden ut mitt i får hon göra om BankID. Mät hur lång en normal
signeringsomgång är innan någon ändrar siffran.

**Bokningsfrågan är besvarad 2026-08-29** och ägs av **ORD-146**: tiden
reserveras vid offertaccept, bekräftas vid signerat avtal. Rör ingen
bokningskod härifrån — den här ordern handlar om identitet, inte om
ordningsföljd.
