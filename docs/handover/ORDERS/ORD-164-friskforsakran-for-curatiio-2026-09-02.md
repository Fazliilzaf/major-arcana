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

## Uppgiften

### 1 · Curatiio behöver ett eget dokument

Inte en kopia med utbytt varumärke. En friskförsäkran inför ett kirurgiskt
ingrepp i ansiktet frågar om andra saker än en inför en hårtransplantation:
blodförtunnande, ögonsjukdom, tidigare ögonkirurgi, torra ögon.

**Innehållet är medicinskt och skrivs inte av en agent.** Fråga Arya Emami eller
använd det underlag kliniken redan har. Ordern bygger bärandet, inte texten.

Finns ingen text: bygg allt annat, låt dokumentet vara tomt med en tydlig
`SAKNAS_KALLA`-flagga, och stanna. Ett halvt dokument som ser komplett ut är
värre än ett som uppenbart saknas — se ORD-157:s fälla.

### 2 · Signeringskonfiguration

Följ `friskfoers_tp` (`patientDocumentSignRegistry.js:75`):

```js
friskfoers_curatiio_op: {
  ...BASE_FORM,
  formType: 'fitness_certificate',
  formVariant: 'curatiio_op',
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

1. `friskfoers_curatiio_op` pekar på en egen fil, inte på TP:s.
2. Innehållet kommer från kliniken, eller dokumentet bär `SAKNAS_KALLA` och är
   uppenbart ofullständigt.
3. Dokumentet går att signera — id:t finns i `E8_SIGN_REGISTRY_IDS` och i
   `patientDocumentSignRegistry` med `formVariant: 'curatiio_op'`.
4. Ett test som failar när två registerposter med olika klinik delar fil.
5. Mutationstesta punkt 4: peka två kliniker på samma fil och visa att det blir
   rött.
6. Grinden i ORD-163 är oförändrad i den här ordern.
7. Verifierat i prod att en `fitness_certificate` med `formVariant: 'curatiio_op'`
   går att skapa — mätt, inte antaget.

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
