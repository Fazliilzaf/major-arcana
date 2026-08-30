# Rapportregler

**Obligatoriska. Gäller varje agent, varje rapport, varje order.**
Införda 2026-08-30 efter en dag där sex av sex rapporter behövde rättas.

---

## Varför

Alla sex felen hade samma form:

| Vad som rapporterades | Vad som faktiskt gjorts |
| --------------------- | ----------------------- |
| "storet har noll import" | grep körd på `src/` och `tests/`, inte `server.js` |
| "`signatureProof` var ensamt" | whitelists **lästa**, hjälparen körd i 2 av 8 stores |
| "Cliento är connected" | raden hade status `connected`, token gick inte att läsa |
| "alla vägar flödar genom `performSend`" | fyra filer anropar mailern direkt |
| "du svarade ägare + läkare" | inget sådant svar hade getts |
| "inget av det är pushat" | två av fem regler låg på `origin/main` |

Ingen av dem var slarv. Alla var en **slutsats om helheten dragen ur en
mätning av en del.**

Ingenting nådde en patient — men bara för att `CCO_SEND_LIVE` är avstängd.
Grinden fångade varje fel. Räkna inte med att den alltid gör det.

---

## 1 · Räkna innan du täcker

Säger ordern "laga alla X" är **första leveransen antalet X**, inte den
första fixen.

```
fel:   "Spärren sitter på sista gemensamma punkten."
rätt:  "Fem sändvägar hittade. Spärren sitter på en. Fyra kvar:"
```

Hittar du fler än ordern antog: **rapportera det innan du bygger.** Ordern
kan vara skriven på fel siffra. Det har hänt.

## 2 · Visa kommandot, inte slutsatsen

Varje påstående om repots tillstånd ska bära **sökningen och dess utdata**.

```
fel:   "Alla vägar flödar genom performSend."
rätt:  git grep -n "mailer.sendEmail\|sendMail" -- src/ops/
       ccoPatientOutreach.js:78
       bookingReminderScheduler.js:92
       ccoCommercialMailDispatch.js:154
       → tre vägar utanför performSend
```

Det är billigare för alla. Läsaren ser felet direkt istället för att mäta om.

Gäller särskilt negativa påståenden — "finns inte", "anropas aldrig",
"noll träffar". De är nästan alltid en för smal sökning.

## 3 · Mutationstesta per väg, inte per fix

Ett mutationstest bevisar att skyddet sitter fast **där det sitter**.
Ingenting annat.

Täcker fixen fem vägar krävs fem mutationer. Ett grönt test på väg ett
säger noll om väg fyra.

## 4 · Citera aldrig ett svar du inte fått

Har ingen svarat på en öppen fråga: **stanna och fråga igen.** Bygg inte
vidare på en gissning, och skriv absolut inte att svaret getts.

Ett påhittat svar som råkar bli rätt är lika allvarligt som ett som blir
fel. Nästa gång pekar gissningen åt andra hållet.

## 5 · Städa efter dig

- Inga halvfärdiga filer kvar i den delade arbetskatalogen. Andra agenter
  och Fazlis git-kommandon fastnar på dem.
- Stäng flikgrupper och webbläsarsessioner du skapat.
- Temporära skript och worktrees tas bort när de gjort sitt.

---

## Rapportens form

Utöver `AGENTS.md` → *Output format*:

**Mätt** — kommandon och utdata som stödjer varje påstående om repot.
**Täckning** — antal av antal. `2/8 stores`, inte "alla".
**Kvar** — vad som inte gjordes, även när ordern inte frågade.
**Osäkert** — det du gissat. Skriv ut det. En markerad gissning är
användbar; en omärkt är en bugg.

---

## Om du hittar ett fel i en order

Säg emot. Ordrarna är skrivna av någon som mäter fel ibland — "vårdepisod"
i ORD-140 var ett begrepp som inte fanns i systemet, och tabellen i
ORD-145 räknade en skalärhjälpare som en record-normaliserare.

Båda upptäcktes av agenter som kollade istället för att lyda.
