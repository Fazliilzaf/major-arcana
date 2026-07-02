---
name: human
description: >-
  Skriv om eller producera text så den läser som skriven av en människa — utan
  AI-tells. Aktivera med /human. Tar bort de mönster som får text att låta
  AI-genererad (Wikipedias "Signs of AI writing", 24 mönster i 4 kategorier),
  behåller konkreta fakta/siffror, och skriver på svenska som standard. Använd
  för webbcopy (Hair TP, Curatiio), UI-text och all publik text.
---

# /human — skriv som en människa, inte som en AI

Mål: text som **genuint** låter mänsklig — konkret, rak, med ojämn rytm — inte
detektor-trickande. (Läser den naturligt för en människa passerar den de flesta
detektorer ändå.) Behåll informationen; byt struktur, ordval och rytm.

## Grundregler

- **Svenska som standard** (se `.cursor/rules/svenska-sprak.mdc`). Behåll språk om källan är annat.
- **Behåll konkreta fakta och siffror** — de är styrkan ("Max 2 patienter per dag", "0 kr konsultation", "Fastpris"). Ta bort flum, inte fakta.
- **Burstiness:** blanda meningslängd medvetet. Några korta. Några längre med bisatser. Aldrig jämn takt.
- **Perplexity:** undvik det mest förutsägbara ordvalet och AI-vokabulären nedan.

## Mönster att ALDRIG använda (Wikipedia "Signs of AI writing")

### Innehåll

- **Uppblåst betydelse:** "utgör ett bevis på…", "en avgörande milstolpe i…" → säg bara vad det är.
- **Onödiga notabilitetsanspråk:** "omskriven i X, Y och Z" → en källa med en konkret detalj.
- **-ande/-ende-radder:** "framhäver… understryker… betonar…" → avsluta meningen, börja en ny.
- **Reklamspråk:** "pulserande", "inbäddad", "hisnande", "banbrytande" → vanlig, specifik beskrivning.
- **Vaga attributioner:** "experter säger…", "man menar…" → namnge källan eller släng påståendet.
- **Utmaningar-men-ljus-framtid:** "trots utmaningar ser framtiden ljus ut" → konkreta fakta, hoppa optimismen.

### Språk

- **AI-vokabulär:** delve/"dyka ner i", "avgörande", "landskap", "väv/tapestry", "främja/foster", "leverage", "utilisera" → normala ord ("titta på", "viktig", "använda").
- **Kopula-undvikande:** "utgör", "står som", "ståtar med", "erbjuder" i stället för **är/har** → säg _är_ eller _har_.
- **Negativa parallellismer:** "inte bara X, utan Y", "inte enbart… utan även…" → säg poängen rakt.
- **Trepunkts-tvång:** "innovation, inspiration och insikt" → tvinga inte tre. Två eller fyra går bra.
- **Synonym-rullning:** "protagonisten… huvudpersonen… den centrala figuren…" → välj ett namn och håll dig till det.
- **Falska spann:** "från X till Y" där X och Y inte ligger på en riktig skala → lista sakerna.

### Stil

- **Em-dash-överanvändning** för dramatik → komma, punkt eller parentes.
- **Överdriven fetstil** (varannan fras i fet) → fet sparsamt eller inte alls.
- **Inline-rubriklistor:** "**Snabbhet:** snabbheten har…" → skriv i prosa.
- **Title Case-rubriker** → mening-case ("Strategiska förhandlingar").
- **Emoji-dekoration** på punktlistor → ta bort om målgruppen inte förväntar sig det.
- **Krulliga citattecken** i plain text → raka citattecken.

### Kommunikation

- **Chatt-artefakter:** "Hoppas det hjälper!", "Säg till om…", "Absolut!" → bort.
- **Cutoff-brasklappar:** "per min senaste uppdatering…" → säg fakta rakt.
- **Inställsam ton:** "Bra fråga!", "Du har helt rätt!" → hoppa valideringen.
- **Utfyllnad:** "i syfte att", "på grund av det faktum att", "vid denna tidpunkt" → "för att", "eftersom", "nu".
- **Överdriven gardering:** "skulle potentiellt möjligen kunna hävdas…" → ta ställning: "Policyn kan påverka X."
- **Generiska avslut:** "framtiden ser ljus ut", "spännande tider väntar" → avsluta med konkret fakta eller nästa steg.

## Ord att undvika (snabblista)

Betydelse: pivotal, testament, bevis på, milstolpe, transformativ, banbrytande ·
Reklam: banbrytande, pulserande, hisnande, fantastisk, inbäddad ·
AI-vokab: delve/dyka ner, avgörande, landskap, väv, främja, leverage, utilisera ·
Utfyllnad: dessutom, vidare, i syfte att, det är viktigt att notera ·
Gardering: potentiellt, möjligen, det skulle kunna hävdas ·
Kopula-byten: utgör, står som, ståtar med, erbjuder (i stället för är/har).

## KRITISK guardrail — vård/estetik (Hair TP, Curatiio)

Byt **inte** en tom floskel mot ett ospecifikt/obelagt effektpåstående. Konkreta
medicinska påståenden ("95 % graftöverlevnad", "ökar kollagenproduktionen")
måste kunna **beläggas** (marknadsföringslagen + lag 2021:363 om estetiska
behandlingar). Kan siffran/effekten inte styrkas → beskriv metoden neutralt
(vad den _gör_) i stället för att sätta ett tal. Verifiera injicerade fakta
(årtal, plats, antal) innan publicering — gissa aldrig.

## Arbetssätt

1. **Skriva nytt:** följ reglerna direkt.
2. **Skriva om (rewrite):** behåll informationen, byt struktur/ordval/rytm, ta bort varje mönster ovan.
3. **Self-audit före leverans:** läs igenom, lista varje AI-tell du hittar med exakt fras, och fixa. Ett mönster slinker alltid igenom.
4. **Röst-match:** om användaren klistrar in 2–3 stycken egen text — matcha rytm, ordförråd och nivå.
