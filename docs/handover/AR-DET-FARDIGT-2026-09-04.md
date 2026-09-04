# Är det färdigt? — fem frågor, mätta 4 sep 2026

**Andra versionen.** Den första var fel på två punkter och är omskriven här:

1. Jag mätte `cco-workflow-v13.html` — en statisk ritning — och trodde att det
   var V13. Det var det inte. V13 i kundvyn är levande kod.
2. Jag läste `tenantId` som "tillhör kliniken" och drog slutsatsen att Curatiio
   inte finns i CCO. Ägaren rättade: **patienterna är gemensamma**, det är
   behandlingen och tjänsten som skiljer klinikerna åt.

Båda felen hade samma form: jag mätte något verkligt och drog fel slutsats av
det. Siffrorna stämde, frågan var fel.

---

## Först: det finns TVÅ personalytor

Det här har inte sagts tydligt förut, och det förklarar varför frågan "är
staff-portalen färdig" är svår att svara på.

|              | `/staff-portal`            | `/staff?view=customers`              |
| ------------ | -------------------------- | ------------------------------------ |
| Fil          | `public/staff-portal.html` | `major-arcana-preview`-appen         |
| Storlek      | ~7 000 rader, en fil       | v9+v11+v12+v13 ≈ 8 000 rader i lager |
| Innehåll     | 24 rollvyer, arbetsköer    | Kundregistret, kundkortet, V13       |
| Kunder i dag | 0 (ärenden saknas)         | **7 674**                            |
| Status       | fungerar sedan i dag       | i drift                              |

De delar server och behörigheter men är två olika gränssnitt. Den jag lagade i
dag (ORD-196) var `/staff-portal`. Den du visar skärmbilder från är den andra.

---

## 1. Är staff-portalen färdig? **Nej — men de två ytorna är olika långt komna.**

### `/staff?view=customers` — den du använder

Den **är i drift och bär riktig data**: 7 674 kunder, segment, lanes (Agera nu
794, Bokningsbar 1 433, Operation 45), status (VIP 636, Risk 163, Inaktiv
4 834), snitt-LTV 5 401 kr.

Det som inte stämmer, mätt i dina egna skärmbilder:

**Samma kund visar olika steg i två fönster.**

| Vy              | Steg    | Kritisk varning                        |
| --------------- | ------- | -------------------------------------- |
| Lådan i listan  | 1 av 13 | Journal saknas                         |
| Hela kundkortet | 4 av 13 | Dokument saknas för avtal och samtycke |

Lådan är dessutom osams med sig själv: steg 3 Hälsodeklaration står
**SIGNERAD**, men sammanfattningen säger "1 klara" och aktuellt steg 1.

Båda läser `journey.cur` ur samma kedja, så det borde inte kunna skilja. Trolig
orsak: lådan räknar på listans lättare payload, kortet på hela kortets. **Det är
en gissning — jag har inte bevisat den.**

### `/staff-portal` — den andra

| Läge                                    |                                         Antal |
| --------------------------------------- | --------------------------------------------: |
| Fungerar med data                       |                                             3 |
| Fungerar, tomma (väntar på ärenden)     |                                             7 |
| Kulisser — hårdkodad HTML utan endpoint |                                             5 |
| Video                                   | obyggd (`RTCPeerConnection` = 0 i hela repot) |

Den gick inte att logga in i alls före i dag. Alla 28 anrop svarade 401.

---

## 2. Är kundportalen färdig? **Nej. Den är den svagaste delen av hela CCO.**

Tre kundvända sidor, uppmätt:

| Sida                       | Rader | API-anrop |
| -------------------------- | ----: | --------: |
| `patient-portal.html`      | 1 028 |     **2** |
| `patient-portal-chat.html` |   346 |     **2** |
| `patient-hub.html`         |   102 |     **0** |

Båda portalerna pratar bara med `/api/patient-portal/…`. Till jämförelse har
personalportalen 28 anrop och kundregistret betydligt fler.

**Kunden kan i praktiken skriva ett meddelande och läsa svar.** Inte se sina
tider, inte omboka, inte se dokument, inte signera, inte ladda upp bilder, inte
se sin behandlingsplan.

Ombokningslänken finns (ORD-190) men leder till en separat sida, inte in i
portalen.

---

## 3. Är V13 kopplad för Curatiio och Hair TP? **Ja — kopplad och byggd för båda.**

Det här var frågan jag svarade fel på. V13 i kundvyn är inte en ritning:

```
cco-v9-customers-parity.js   4 778 rader   listan + lådan
cco-v13-render.js            1 429 rader   kundresa mini + stora vyn
cco-kundkort-kkx.js          1 062 rader   de 13 stegen och grindarna
+ v11- och v12-lagren som bygger journey{cur, total}
```

Stegen är **data-drivna**. Renderingslagren gör noll egna API-anrop — de får ett
`card` och räknar ut allt ur det. V13 läser bland annat:

```
hasJournal · missingJournal · hasAgreement · agreementSigned
hasHealthDeclaration · healthDeclaration.signedAt
hasFitnessCertificate · missingFitnessCertificate
missingPhotoConsent · depositPaid · depositStatus
bookingHistory · upcomingBookings · followUpDue · automationSignals
```

Så "Journal saknas · Konsultation (steg 4) kräver encounter och journal" är en
**beräkning**, inte en text någon skrivit.

### Båda klinikerna, med spärrar som är genomtänkta

`STEP_VARIANTS` har `hairTP` (kanonisk), `nonSurgical` och `minorSurgery`, och
behandlingstypen väljer väg automatiskt. Tre spärrar står inskrivna med skäl:

- **ORD-129** — ögonlocksplastik är kirurgi och utförs på Curatiio. Den får
  `minorSurgery`, aldrig `nonSurgical`, så steg 8 friskförsäkran inte hoppas
  över. _"Curatiio är inte synonymt med icke-kirurgiskt."_
- **ORD-122** — bildsamtycke hoppas ALDRIG över (GDPR). Varianten byter bara
  titeln.
- **ORD-159** — betänketiden hoppas inte över. Den bar tidigare `skip: true`,
  vilket gjorde att avtalet lovade sju dagars betänketid (lag 2021:363) medan
  flödet inte visade steget alls.

Den `cco-workflow-v13.html` jag mätte förra gången är en separat ritning med
noll API-anrop. Den och koden beskriver samma sak utan att känna varandra, och
kan glida isär utan att något går sönder. Det är en svaghet, men en annan än den
jag rapporterade.

---

## 4. Är lilla och stora V13 kopplade till workflow, kundresa och alla dokument? **Ja — men de matas av en datakälla med hål i.**

Kopplingen finns och är gemensam: lilla och stora vyn läser samma
`journey{cur, total}` och samma `card`. Dokumentsektionen (`s-dok`) finns i
renderaren och länkar till v9 och v12.

**Men vägen genom de 13 stegen väljs ur behandlingstypen**, och där finns hålet:

```
BOKNINGAR UTAN serviceLabel:  12 110 av 39 686  (30,5 %)
  har serviceId ändå:              0
  har behandlare:             12 110
  har anteckning:              8 168
  per år: 2021:166  2022:859  2023:1358  2024:2475  2025:4577  2026:2675
```

Var tredje bokning saknar tjänst helt — varken etikett eller id. Det är inte
gammalt skräp: det växer varje år, och 2025 är värst.

Ingen tjänst → ingen variant → kunden faller på kanoniska `hairTP` oavsett vad
hon faktiskt gjort. En PRP-kund kan få betänketid och friskförsäkran hon inte
behöver; en ögonlocksoperation kan hamna fel åt andra hållet.

Bara **11** av de 12 110 är framtida, så cutovern påverkas inte. Historiken gör
det — och det är historiken V13 bygger kundresan på.

Behandlare finns på alla 12 110 och anteckning på 8 168, så tjänsten går
troligen att härleda. **Det är en hypotes jag inte har mätt.**

---

## 5. Är alla kunder med kund-ID kopplade genom hela CCO? **Nej — men bilden är bättre än jag först sa.**

### Klinikerna delar kundstock

|                              |   Antal |
| ---------------------------- | ------: |
| Kunder med Curatiio-historik |     705 |
| Kunder med Hair TP-historik  |   7 611 |
| **Kunder i BÅDA**            | **688** |

688 av 705 Curatiio-kunder är också Hair TP-kunder. Bara 17 är enbart Curatiio.
Det är en och samma kundstock — precis som ägaren sa, och det gör `tenantId`
till fel mått på "vilken klinik".

Volym: ~225 rena Curatiio-bokningar plus 818 som rör båda, mot 24 610 Hair TP.

### Kopplingen Cliento → patient

|                                    |      Antal |
| ---------------------------------- | ---------: |
| Bokningar totalt                   |     39 686 |
| Unika kunder                       |      7 972 |
| Bokningar länkade till `patientId` |     26 814 |
| **Bokningar UTAN `patientId`**     | **12 872** |
| Unika kunder som är länkade        |      6 845 |

**Var tredje bokning saknar patientkoppling.** 1 127 kunder av 7 972 har ingen
länk alls.

### Patientregistret

7 894 patienter, varav **3 194 har personnummer** — alltså 4 700 utan.

---

## Sammanfattat

| Fråga                                             | Svar                                                                                            |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Staff-portalen färdig?                            | Nej. Kundregistret är i drift med 7 674 kunder; `/staff-portal` har 5 kulisser och 7 tomma vyer |
| Kundportalen färdig?                              | **Nej — 2 API-anrop per sida. Svagaste delen av CCO**                                           |
| V13 kopplad för båda klinikerna?                  | **Ja.** Data-driven, med tre dokumenterade kliniska spärrar                                     |
| Lilla + stora V13 → workflow, kundresa, dokument? | **Ja** — men 30 % av bokningarna saknar tjänst, vilket väljer fel väg                           |
| Alla kund-ID kopplade?                            | Nej. 12 872 bokningar utan `patientId`, 4 700 patienter utan personnummer                       |

### De tre hålen, i storleksordning

1. **12 110 bokningar utan tjänst** (30 %) → V13 väljer fel väg genom stegen
2. **12 872 bokningar utan patientId** (32 %) → kundresan saknar delar av historiken
3. **Kundportalen** → kunden kan bara chatta

### Vad som ÄR färdigt

Kalendermotorn, behörigheterna, utskicksspärrarna, ordinationskedjan, de
juridiska avtalen, Cliento-importen (380 block i prod), V13:s stegmotor med
kliniska spärrar för båda klinikerna, och sedan i dag en personalportal som går
att logga in i.

Grunden är byggd. Det som saknas är data som är hel, och ytor mot kunden.
