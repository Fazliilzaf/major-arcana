# V12 SPEC 3 — ABDIRAHMAN JAMA PREVIEW (konkret instans)

**Källa:** `~/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/V12-ABDIRAHMAN-JAMA-PREVIEW-2026-06-21.html`
**Roll i triaden:** **BEVIS/INSTANS** — JOURNEY-SPINE-principen (Spec 2) applicerad på en **riktig, tidig-journey-kund** med gles data. Visar hur spinen beter sig innan aktivt besök finns och hur historisk media hänger på ett framtida steg.
**Referenskund:** Abdirahman Jama, **steg 3 av 9**, Hälsodeklaration pågår, 6 bilder från 27 sep 2024, inga bokningar, inget signerat värde.

> Specens egna ord: _"Exakt samma kund som live-vyn du skickade — men reorganiserad enligt V12-spine-principen. Tab-raden borta. DÖLJ-paneler borta. Allt operativt material hänger på det STEG i kundresan det hör hemma."_

---

## 1. Varför denna instans behövs (kontrast mot Anna Karlsson)

|             | Anna (Spec 1/2)                      | Abdirahman Jama (Spec 3)                                                |
| ----------- | ------------------------------------ | ----------------------------------------------------------------------- |
| Position    | steg 4, aktivt besök pågår           | steg 3, **inget aktivt besök**                                          |
| Aktivt steg | Konsultation (active-visit-kort)     | **Hälsodeklaration** (blockerare + utkast inline)                       |
| Data        | rik (12 besök, 38 400 kr, journaler) | **gles** (1 besök, inget värde, 6 bilder)                               |
| Media       | spridd                               | **6 bilder hänger på steg 4 (future!)** trots att steget inte är aktivt |
| Smart nästa | Starta journal                       | **Skicka hälsodeklaration för signering**                               |

→ Bevisar att spinen funkar för **både** mitt-i-besök och tidig-onboarding, och att **media kan hänga på ett framtida steg** (bilder tagna 27 sep hör till Konsultation steg 4 även om steget ännu inte är "klart").

## 2. Hero & arbetsfunktioner

- XL-avatar "AJ", kicker "Aktiv steg 3 av 9 · Hälsodeklaration pågår", namn, meta (tel · mejl · Stockholm).
- **Tags:** `Hair TP` (info) · `Hälsodekl. saknas` (warning) · `Ny kund` (neutral).
- **Hero-actions:** `⚡ Förbered besök` (gold-CTA `.btn-gold`) · `Åtgärder ▾` (`.btn-ghost`) · `Steg 3 av 9`-pill.
- **Stats (4):** Besök i år = 1 (Konsultation 27 sep) · Värde totalt = — (inget signerat) · Skuld = 0 · Nästa besök = — (Inga bokningar, warn).
- **Arbetsfunktion:** onboarding-läge — fokus på att få igång hälsodeklaration + förbereda första besök.

## 3. Spine (9 steg) — instansens states

- **Progress:** "2 klara · 1 pågår · 6 kommande" · 22%.
- Steg 1–2 **done** (bokning, bekräftelse · 20 sep 2024).
- **Steg 3 ACTIVE — Hälsodeklaration** (expanderad), innehåller:
  - **`.smart-row`** (röd-stripe): "Hälsodeklaration saknas · utkast genererat 21 jun · ej skickat" + knappar **Granska utkast** / **Skicka för signering** (primär). → detta är "Smart nästa steg" inbäddat i steget.
  - **`.step-body-grid`:** subcard "Vad krävs för signering" (9 medicinska frågor / Allergier·läkemedel / Tidigare ingrepp / Patient-signatur — alla `chip danger Saknas`) + subcard "När detta är klart" (Riskbedömning auto / Konsultation låses upp / Allergi-flagga — `chip info`).
- **Steg 4 FUTURE men har media — Konsultation** (expanderad):
  - **`.visit-card`** (27 sep 2024, "6 bilder · 0 anteckningar · 0 dokument").
  - **`.photo-grid`** (3-kol): 6 tiles märkta "Översikt".
  - **`.photo-actions`:** **Välj i Foto** / **Ta/rita bild** / **Slutför konsultation** (primär).
  - Meta = "Förberett" (inte done) — media finns men steget slutförs först efter HD-signering.
- Steg 5–6 **future** (Offert "Väntar steg 4"; Betänketid "Efter steg 5").
- **Steg 7 BLOCKED — Avtal + behandlingssamtycke** (expanderad `.gate-list`): "Konsultation slutförd → Steg 4 ej klart", "Offert accepterad → Steg 5 ej startat", "Betänketid 2d → räknas från steg 5".
- Steg 8–9 **future** (Friskförsäkran/Foto-samtycke · Op-dag).

## 4. Foto-dokumentation (tvärsnitts-sektion) — viktig egen funktion

Egen `.section` UNDER spinen ("Foto-dokumentation · alla besök", "6 bilder · 1 besök · nyast först"):

- **`.foto-strip`** (6-kol): alla bilder taggade "27 sep".
- **`.before-after-bar`:** "Före/efter-par föreslaget: **Översikt 27 sep 2024** ↔ **27 sep 2024**" + **Jämför**-knapp (primär).
- **`.gap-notice`** (amber): "⚠ Hårlinje & Krona-vy saknas för fullständig dokumentation" + **Begär foto**.
- **Arbetsfunktion:** sammanställning + jämför + gap-varning på tvärs över besök. _(Detta = backlogens "Foto jämför/gap" — kräver foto-metadata som live saknar; därför uppskjuten i live.)_

## 5. Höger-rail (instans-anpassad)

- **`.rail-hero-action` (RÖD här, inte amber):** "Smart nästa steg · nu — Skicka hälsodeklaration för signering" + **Granska** / **Skicka**. (Röd ton = blockerande karaktär; jämför Annas amber.)
- **Kommande bokningar:** badge `0` + empty-state "Inga kommande bokningar — kontakta kunden för återbesök så hen inte tappas."
- **Snabb-åtgärder:** `📷 Ta bild·spara i journal` (dark, full) · `✏️ Anteckna` · `💬 Svarstudio` · `📅 Boka återbesök` (full).
- **Senaste händelser:** HD-utkast genererat (idag 09:14) · 6 bilder uppladdade (27 sep) · Bokningsbekräftelse (20 sep).

## 6. Designinslag unika/tydliga i instansen

- **Tom-data hanteras explicit** (Värde —, Nästa besök —, bokningar empty-state med uppmaning) — ingen fejk.
- **Röd hero-CTA-variant** i railen (vs amber hos Anna) = ton speglar om nästa steg är blockerande.
- **Media-på-framtida-steg** = nyckelmönster: data hänger på sitt journey-hem oavsett stegets state.
- `⚡ Förbered besök` gold-CTA = samma hero-CTA som CONTENT-CANON #s1 (backlogens "Nuläge-CTA").

## 7. UI-system

Samma token-palett som Spec 1/2. Foto-tiles använder gradient-placeholders (`.p1`–`.p6`) med `.lbl`-tagg (datum/kategori). `.smart-btn` (+`.primary`) för inline-stegåtgärder.

## 8. Relation till de andra två

- **Konsumerar Spec 2:**s spine-princip (steg-states, inline-expansion, gate-list, höger-rail).
- **Visar Spec 1:**s innehåll i tidig-journey-form (hälsodeklaration-fokus, gles ekonomi/journal).
- Tillsammans: Spec 1 = innehållskatalog · Spec 2 = arbets-/layoutprincip · **Spec 3 = acceptanskriterium** (så här ska en riktig kund se ut renderad). Använd JAMA som referensbild vid bygge/verifiering av spine-läget.
