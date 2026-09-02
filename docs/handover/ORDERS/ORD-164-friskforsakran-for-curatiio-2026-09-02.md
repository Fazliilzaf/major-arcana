# ORD-164 · Curatiios friskförsäkran finns inte

**Arbetsorder · 2026-09-02**
**Bas:** `main` (`f8e9c844`)
**Föregås av:** ORD-163 (operationsdagsgrinden), ORD-133 (Curatiio-dokumenten), ägarbeslut 2026-09-02
**Grind:** ORD-131 — ingen dokumenttext ändras utan beslut · `CCO_SEND_LIVE` orörd
**Prioritet:** P1 — hindret som gör ägarbeslutet i ORD-163 omöjligt att verkställa

---

## Beslutet som skapade ordern

Ägaren 2026-09-02: _"vi har inte det så idag men jag tycker vi ska ha det."_
Ögonlocksplastik ska kräva signerad friskförsäkran på behandlingsdagen.

Det går inte i dag. Den här ordern bygger bort hindret.

---

## Tre fel, i växande allvar

### 1 · Den går inte att signera

```
patientDocumentSignRegistry     friskfoers_tp            finns
                                friskfoers_curatiio_op   0 träffar
```

Samma fel som de fyra Curatiio-offerterna hade fram till i går: dokumentet
ligger i katalogen och i live-registret, men saknas i signeringsregistret.
`resolveSignConfig` ger `null`, och patienten kan inte signera.

### 2 · Den finns inte i produktion

```
/var/data/cco-journal.json · 5943 poster
  0   fitness_certificate
  0   bleph_treatment
```

Noll signerade friskförsäkringar, av något slag. Grinden i ORD-163 väntar på ett
dokument systemet aldrig producerat.

### 3 · Filen den pekar på är fel dokument

Det här är det allvarliga.

```
patientDocumentLiveRegistry.js:54   friskfoers_tp          → steg8-friskforsakran-final.html
patientDocumentLiveRegistry.js:98   friskfoers_curatiio_op → steg8-friskforsakran-final.html
```

Samma fil. Och filen är Hair TP:s:

```
"Hair TP Clinic"                    6 förekomster
"hårsäckar inte överlever"          hårtransplantationens utfall
ögonlocksplastik                    nämns inte
```

En patient som ska genomgå ögonlocksplastik skulle alltså signera en försäkran
om att hon förstår att **hårsäckar** kanske inte överlever, från **fel klinik**.

Att den inte går att signera är i dag det enda som hindrar det.

---

## RÄTTELSE 2026-09-02 · texten fanns redan, i repot

Ägaren: _"Det finns i SharePoint i Microsoft, det är vår facitkälla — gå alltid
dit innan du frågar mig."_ Jag gjorde det. Två fel i §1 nedan föll direkt.

**Fel 1 — jag påstod att texten inte var skriven.**

```
migration/meridiq/questionary-catalog.json   apiId 16389
  "Friskförsäkran | Ögonlocksplastik"   brand: Curatiio   isActive: true
  6 frågor · exporterad 2026-05-25

migration/meridiq/journal-schema-catalog.json
  schemaId  fitness_certificate:curatiio_bleph
  fieldCount 6 · emptyDefaults · meridiqFieldMap

public/major-arcana-preview/app/journal-clinical-schemas.js
  fitness_certificate → curatiio_bleph, hair_tp     ← redan skeppat till klienten
```

Formuläret var färdigt, aktivt, medicinskt skrivet och skeppat. Platshållarfilen
sa `SAKNAS_KALLA — dokumentet är medvetet ofullständigt` ovanpå det.

**Fel 2 — de fyra frågorna jag gissade på finns inte.** Jag skrev
"blodförtunnande, ögonsjukdom, tidigare ögonkirurgi, torra ögon" och lät det
stå i repot som om det vore ett krav. Blodförtunnande stämmer. De tre övriga
finns inte i Meridiq 16389, inte i klinikens hälsodeklaration för
ögonlocksplastik, och inte i något dokument i SharePoint. Jag hade hittat på
dem och skrivit ned dem som medicinsk kravspecifikation.

**Vad SharePoint faktiskt bär** (sökt 2026-09-02, 106 träffar på
"friskförsäkran", 24 på "ögonlocksplastik"): ingen fil heter *Friskförsäkran
Ögonlocksplastik*. Curatiios motsvarighet är `1. NY Hälsodeklaration
Ögonlocksplastik.docx` (2026-02-12, mappen `2. Curatiio 2026/Ögonlocksplastik/`)
plus det klinikövergripande `Samtycke & Friskförsäkran – Sammanhängande
dokument.docx` med strukturen A–G. Meridiq 16389 är dessa två satta i system.

**Fel 3 — variantnamnet var uppfunnet.** §2 nedan föreskriver
`formVariant: 'curatiio_op'`. Det namnet finns inte i något schema. Meridiq
16389 heter `curatiio_bleph`. En signering skriven mellan 09-01 och 09-02 hade
saknat formulär bakom sig; att ingen skada skedde beror bara på att prod har
noll Curatiio-rader. Rättat, och `tests/ops/signeringsvariantHarSchema.test.js`
kopplar nu ihop signeringsregistret med schemaregistret så att ett påhittat
namn inte kan bli grönt igen (mutationstestat: byt tillbaka till `curatiio_op`
och två tester faller).

**Vad detta borde ha lärt mig direkt:** jag mätte prod och jag mätte
registerfilerna, men jag mätte aldrig `migration/`. Ordern hade sitt eget svar
tre kataloger bort. Det är samma mönster som ORD-148 — ägaren sa
_"det finns underlag för detta, leta bland våra filer, vi håller på med
dubbelarbete"_ — och jag upprepade det en dag senare.

---

## Uppgiften

### 1 · Curatiio behöver ett eget dokument

~~Inte en kopia med utbytt varumärke. En friskförsäkran inför ett kirurgiskt
ingrepp i ansiktet frågar om andra saker än en inför en hårtransplantation:
blodförtunnande, ögonsjukdom, tidigare ögonkirurgi, torra ögon.~~
~~**Innehållet är medicinskt och skrivs inte av en agent.** Fråga Arya Emami.~~

**Ersatt av rättelsen ovan.** Dokumentet ska ha en egen fil — det stämmer. Men
innehållet ska varken skrivas eller efterfrågas: det byggs ur
`fitness_certificate:curatiio_bleph`, sex fält, ordagrant. Lägg inte till en
fråga som inte finns i schemat.

Byggt 2026-09-02: `steg8-friskforsakran-curatiio-op-final.html`, 21 → 584 rader,
genererad ur schemat (ingen handskriven medicinsk text), verifierad fält för
fält och alternativ för alternativ mot Meridiq 16389.

### 2 · Signeringskonfiguration

Följ `friskfoers_tp` (`patientDocumentSignRegistry.js:75`):

```js
friskfoers_curatiio_op: {
  ...BASE_FORM,
  formType: 'fitness_certificate',
  formVariant: 'curatiio_bleph',   // RÄTTAT — 'curatiio_op' fanns i inget schema
  title: 'Friskförsäkran',
},
```

`formVariant` måste skilja sig från `hair_tp`. Grinden och journaltypen delas —
varianten är det enda som skiljer de två ingreppen åt i datan.

Lägg också id:t i `E8_SIGN_REGISTRY_IDS`. Det var precis den raden som saknades
för de fyra offerterna, och testet rapporterade det korrekt i månader utan att
någon läste.

### 3 · Kontrollen som saknades

Två registerposter pekar på samma fil:

```
steg8-friskforsakran-final.html      friskfoers_tp, friskfoers_curatiio_op
steg6-betanketid-samtycke-final-demo.html   samtycke_bokning_2d, samtycke_angerratt
```

Den andra kan vara avsiktlig — samma samtyckessida för två klausuler i samma
klinik. Den första är det inte: två kliniker, ett dokument.

Skriv ett test som failar när två registerposter med **olika klinik** delar fil.
`DELAD_FIL`-flaggan finns redan i `flagLegend` — men den beskriver, den fäller
ingen.

Läs filsystemet, inte git.

### 4 · Först därefter grinden

När punkt 1–3 är klara och en friskförsäkran går att signera för Curatiio:

```js
bleph_treatment: { blocked: true, why: 'Ögonlocksplastik är kirurgi — ägarbeslut 2026-09-02.' }
```

och posten tas bort ur `VANTAR_PA_BESLUT`.

**Inte innan.** Slås grinden på medan dokumentet saknas stoppas varje
ögonlocksjournal på behandlingsdagen.

---

## Fällan

**Byt inte bara varumärke i den delade filen.** Då signerar en ögonlockspatient
fortfarande en text om hårsäckar, fast med rätt logotyp. Det ser rättat ut och
är det inte.

**Kopiera inte TP-filen som utgångspunkt för innehållet.** Frågorna är olika.
Att utgå från fel formulär gör att någon senare tror att texten är granskad.

**Slå inte på grinden i samma commit.** Punkt 4 är en egen ändring, efter att
punkt 1–3 verifierats i prod.

---

## Godkänt när

1. `friskfoers_curatiio_op` pekar på en egen fil, inte på TP:s. — **klart**
2. Innehållet kommer från kliniken. — **klart**, ur Meridiq 16389. Villkoret
   "eller bär `SAKNAS_KALLA`" faller: flaggan var satt på fel grund och är borta.
3. Dokumentet går att signera — id:t finns i `E8_SIGN_REGISTRY_IDS` och i
   `patientDocumentSignRegistry` med `formVariant: 'curatiio_bleph'`. — **klart**
4. Ett test som failar när två registerposter med olika klinik delar fil.
5. Mutationstesta punkt 4: peka två kliniker på samma fil och visa att det blir
   rött.
6. Grinden i ORD-163 är oförändrad i den här ordern.
7. Verifierat i prod att en `fitness_certificate` med `formVariant: 'curatiio_bleph'`
   går att skapa — mätt, inte antaget. **Kvar.**

**Kvar utöver punkt 4, 5 och 7:** SV/EN-språkväxlaren. Båda förlagorna har en,
men det finns ingen engelsk källa för Meridiq 16389. Att översätta medicinsk och
juridisk text själv vore uppdiktat innehåll — filen är därför enspråkigt svensk
tills kliniken levererar en översättning.

---

## Vad jag inte avgjort

**Om `samtycke_bokning_2d` och `samtycke_angerratt` ska dela fil.** Båda är Hair
TP, så det bryter inte mot klinikregeln. Men två dokument-id med samma innehåll
betyder att ett beslut om det ena tyst gäller det andra. Mät om de faktiskt ska
vara två.

**Varför TP:s friskförsäkran aldrig signerats i prod.** Noll
`fitness_certificate` med fem `tp_treatment`-journaler betyder att grinden
antingen aldrig utlösts eller kringgåtts. Det är en egen fråga, och den gäller
hårtransplantation — alltså behandlingar som faktiskt utförts.
