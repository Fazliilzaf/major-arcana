# Två listor att beta av — 4 sep 2026

Uppmätt i produktion samma dag. Båda listorna blir inaktuella när något ändras;
kör om dem i stället för att lita på den här filen om det gått en vecka.

    node scripts/import-cliento-framtida.js        # lista 1
    (via SSH mot prod — Cliento-filen finns bara där)

---

## 1. De 16 konsultationerna som behöver en person

De ligger på tjänstekalendrarna "Fysisk konsultation" och "Online konsultation" i
Cliento — alltså på tjänsten, inte på en behandlare. Importen vägrar gissa vem
som ska ha dem, och att blockera hela kliniken för ett trettiominuterssamtal vore
fel. Därför lämnas de åt er.

**Jag behövde inte gå in i Cliento.** Svaret låg redan i exporten — varje kund har
en bokningshistorik med behandlarens kalendernamn på. Nedan är alltså inte gissat
ur luften, utan härlett ur vem kunden faktiskt har träffat.

Fyll i sista kolumnen där jag inte kunnat avgöra, och rätta där jag har fel.

### Entydiga — historiken pekar åt ett håll

| Datum | Tid   | Kund             | Härlett      | Grund                                                       |
| ----- | ----- | ---------------- | ------------ | ----------------------------------------------------------- |
| 09-14 | 09:00 | Timmy Mellqvist  | **Clara**    | Clara ×3 (senast Fazli 05-08)                               |
| 09-16 | 11:00 | Richard Grönroos | **Clara**    | Clara ×4, senast Clara 04-16                                |
| 09-29 | 16:00 | Patric Andersson | **Egzona**   | anteckning: "Egzonas kund" + Egzona ×3, senast Egzona       |
| 10-13 | 11:30 | Alireza Adou     | **Louise**   | senast Louise 01-26, och det var just en telefonuppföljning |
| 10-13 | 11:00 | Tove Krantz      | **Egzona**   | anteckning: "Egzonas kund"                                  |
| 11-23 | 16:30 | Hampus Ivarsson  | **Veronica** | Veronica ×3, senast Veronica 05-12                          |

### Delade — flest besök säger en sak, senaste besöket en annan

Jag sätter ingen av dem. Skillnaden är inte teknisk utan en klinisk vana jag inte
känner till: följer kunden sin behandlare, eller den som såg dem sist?

| Datum | Tid   | Kund              | Flest     | Senast                | Behandlare |
| ----- | ----- | ----------------- | --------- | --------------------- | ---------- |
| 09-09 | 14:00 | Martin Hanna      | Louise ×4 | Egzona 04-28          |            |
| 09-11 | 11:30 | Robin Wilzén      | Louise ×2 | Clara 04-18           |            |
| 09-30 | 10:00 | Sofia Tibblin     | Louise ×2 | Veronica 05-05        |            |
| 10-14 | 10:00 | Andreas Lyckefors | Louise ×3 | Veronica 05-27        |            |
| 10-30 | 11:00 | Dennis Mrak       | Louise ×2 | Transplantation 02-13 |            |

### En motsägelse

| Datum | Tid   | Kund            | Behandlare |
| ----- | ----- | --------------- | ---------- |
| 10-15 | 13:00 | Dennis Särnebro |            |

Anteckningen säger _"Egonas Kund"_ — sannolikt Egzona, felstavat. Men historiken
säger Louise ×3, och det senaste besöket var hos Louise 24 jan. Anteckningen och
verkligheten pekar åt olika håll. Jag väljer inte mellan dem.

### Går inte att härleda — ingen har träffat dem än

| Datum     | Tid   | Kund             | Läge                                                                                   | Behandlare |
| --------- | ----- | ---------------- | -------------------------------------------------------------------------------------- | ---------- |
| **09-04** | 10:00 | Lucas Österlund  | 15 min telefon. Har FUE bokad 16 dec. Anteckning: "ring och fråga hur finasteride går" |            |
| **09-04** | 15:00 | Edwin Persson    | Konsultation nr 2. Enda bokningen som finns på honom                                   |            |
| 09-14     | 16:00 | Marcus Larsson   | **Har FUE bokad 21 sep** — det här är avstämningen före den                            |            |
| 09-23     | 11:00 | William Wikström | 8-månadersuppföljning efter FUE 24 jan. Bara operationskalendern i historiken          |            |

De fyra har bara legat på kalendern _Transplantation_, som inte är en person.
Marcus Larsson är enklast: samtalet gäller hans egen operation en vecka senare, så
det bör landa hos den som tar den.

### Om "E.K" i anteckningarna

Fem av de sexton har `E.K` i noteringen, och det ser ut som en signatur som skulle
kunna peka ut behandlaren. **Det gör den inte.** Uppmätt: `E.K` står på 2 389
anteckningar spridda över samtliga kalendrar — 813 på Fysisk konsultation, 564 på
Transplantation, 125 på Egzona. Det är den som _skrev_ anteckningen, förmodligen
receptionen, inte den som ska ta besöket. Samma sak gäller `AG` (871) och `VE` (359).

Det var värt att mäta innan det användes: `E.K` hade gett fem behandlare som såg
härledda ut och inte var det.

**Rad 1 och 2 är i dag.** De faller ur listan av sig själva vid midnatt —
importen hoppar över passerad tid. Om de ska in i CCO måste det ske i dag,
annars är det bara Cliento som har dem.

De övriga 348 framtida tiderna behöver ingen åtgärd: de ligger redan på en
behandlare och följer med importen.

| Resurs              | Block  |
| ------------------- | ------ |
| veronica            | 118    |
| egzona              | 94     |
| clara               | 64     |
| **transplantation** | **48** |
| wendela             | 17     |
| louise              | 17     |
| sabina              | 4      |
| arya                | 2      |

---

## 2. Tjänster utan öppna tider

13 tjänster är publikt bokningsbara. **10 av dem har noll tider.** Det syns
ingenstans som ett fel — bara som en tom kalender hos den som försöker boka.

(Tidigare rapporterat som 11 av 14. `curatiio-eyelid-surgery` togs bort i ORD-187,
och den hade noll tider. Därav båda talen ett lägre.)

### Har tider

| Tjänst                         | Regler |
| ------------------------------ | ------ |
| Fysisk konsultation            | 31     |
| Online konsultation            | 4      |
| Uppföljning hårtransplantation | 2      |

### Saknar tider — det är de här som ska fyllas

| Tjänst                             | Längd  | Klinik   |
| ---------------------------------- | ------ | -------- |
| PRP hår                            | 45 min | Hair TP  |
| PRP hud                            | 45 min | Hair TP  |
| Microneedling + PRP                | 45 min | Hair TP  |
| Konsultation estetiska injektioner | 30 min | Curatiio |
| Konsultation ögonlocksplastik      | 30 min | Curatiio |
| Konsultation ortopedi              | 30 min | Curatiio |
| Botox (rynkbehandling)             | 30 min | Curatiio |
| Fillers (hyaluronsyra)             | 45 min | Curatiio |
| Profhilo (skin booster)            | 45 min | Curatiio |
| Microneedling Curatiio             | 60 min | Curatiio |

Sju av tio är Curatiio. Det är inte en slump — Curatiios publika väg byggdes
först i ORD-177/178 och har aldrig haft ett schema.

Läggs in under **Öppna tider** i personalportalen: tjänst, behandlare, veckodagar,
starttider. En rad räcker för att tjänsten ska sluta vara osynlig.

`curatiio-microneedling` saknar dessutom publicerat pris — den ligger på 4 200 kr
internt utan rad på prislistan.

---

## 3. En anmärkning om ärrtransplantationen

Ägaren 2026-09-04: _"jag sätter tiden manuellt när kunder bokar just den."_

Det går inte som det är byggt i dag, och det bör sägas rakt ut hellre än upptäckas
vid första bokningen. **Längden sitter på tjänsten, inte på bokningen.** Ändrar
man `fue-scar` till 240 minuter gäller det alla kommande ärrbokningar, inte den
enda man höll på med. Det finns ingen väg att förlänga eller förkorta en enskild
tid — `rebookBooking` flyttar en bokning till en annan lucka, men luckans längd
kommer alltid från tjänsten.

I praktiken: eftersom `fue-scar` och `dhi-scar` är interna (inte publikt
bokningsbara) är det personalen som lägger in dem, och de kan sätta tjänstens
längd innan de bokar. Det fungerar så länge två ärrbokningar inte är olika långa
och ligger nära i tiden.

Om längden ska kunna sättas per bokning är det en egen sak att bygga — ett
`durationMinutes` på bokningsposten som slår tjänstens. Inte gjort, inte
påbörjat.
