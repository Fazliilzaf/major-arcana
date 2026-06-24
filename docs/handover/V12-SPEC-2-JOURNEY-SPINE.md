# V12 SPEC 2 — JOURNEY-SPINE (layout-/arbetsprincip)

**Källa:** `~/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/V12-WORKSPACE-JOURNEY-SPINE-2026-06-21.html`
**Roll i triaden:** Definierar **HUR** stora kundvyn organiseras — kundresan som ryggrad, operativ data inline på rätt steg. (Spec 1 = VAD/innehåll; Spec 3 = konkret instans.)
**Referenskund:** Anna Karlsson, steg 4 av 9, Konsultation pågår (aktivt besök).

---

## 1. Bärande princip

> **"Stora kundvyn = expanderad V11 Rail som FÖLJER kundresan, inte dashboard."**

- Samma 9-stegs-kundresa som V11-railen, fast i full storlek.
- **Varje steg får sin egen expansion** med operativ data **INLINE**.
- **Navigationskontrakt:** klick på steg N i V11-railen → land på steg N i V12, **expanderat**.
- Inga admin-flikar, inga separata sidor — **EN spine** som visar var kunden är NU, vad som hänt FÖRR, vad som krävs FRAMÅT.
- Aktivt besök, journaler, foton, dokument, ekonomi-händelser **hänger på sitt steg**, inte i parallell tab-meny.

## 2. Layout

- **2 kolumner:** `main` (1fr, spine) + `rail` (360px, sticky kontext).
- **Main-ordning:** Hero → Stats (4) → Spine (9 steg) → Uppföljning → Historik.
- Skiljer sig från CONTENT-CANON: där 13 parallella sektioner; här **9 steg + 2 efterföljande sektioner** (uppföljning/historik) och resten inbäddat i stegen.

## 3. Steg-kort — de fyra lägena (kärnan)

`.step` med `.step-head` (grid: badge 44px · titel/sub · meta · toggle) + valfri `.step-body`.

| Läge          | Klass           | Visuellt                                     | Badge                                | Beteende                                                    |
| ------------- | --------------- | -------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| **Klart**     | `step--done`    | grön vänster-stripe, vellum                  | grön ✓                               | klickbar → expanderar **historik** (vad som dokumenterades) |
| **Aktiv**     | `step--active`  | amber gradient-bg, amber-stripe, lyft skugga | förstorad amber-badge (44px) + pulse | **alltid expanderad**, all operativ data inline             |
| **Kommande**  | `step--future`  | dämpad vellum-soft                           | streckad grå badge                   | kollapsad, förhandsvisning vid expansion                    |
| **Blockerad** | `step--blocked` | röd-stripe, röd bg                           | streckad röd badge                   | expanderar **gate-list** ("krävs för att låsa upp")         |

- **Toggle:** `.step-toggle` `▾` (kollapsad) / `▴` (öppen). `.step-head { cursor:pointer }` → hela huvudet är klickytan.
- **Hover:** `.step:hover` → `--card-shadow-lift`.

## 4. Steg-expansion — vad som hänger inline

### `.step-body` byggstenar

- **`.step-body-grid`** (2 kol) med `.subcard` (rubrik + `.subcard-row` what/when/chip). Används för "dokumenterade svar", "kvar att göra", "risker", "genererade dokument".
- **`.active-visit`** (full bredd, amber-tonad) — AKTIVT BESÖK inbäddat i det aktiva steget:
  - `.av-head`: pulse + "Aktivt besök · pågår" + tid sedan check-in.
  - `.av-row`: protokoll (PRP 2/3, scalp, version) + behandlare/rum.
  - **`.av-timeline`:** noder `done/active/todo` (`.av-tnode .dot`) med connector-lines `.av-tline` (grön→amber) / `.av-tline.todo` (amber→grå). todo-prick = streckad ring.
  - **`.av-actions`:** `📝 Starta journal` (hero amber) · `📷 Ta bild` (sec) · `✏️ Anteckning` (sec) · `✓ Avsluta besök` (tert grön).
- **`.gate-list`** (röd) — för blockerade steg: "Krävs för att låsa upp" + `.gate-row` (krav + chip danger/warn).

### Exempel på inline-fördelning (Anna, steg 4 aktiv)

- Steg 3 (done, Hälsodeklaration) → expanderar dokumenterade svar + genererade dokument.
- Steg 4 (active, Konsultation) → active-visit-kort + "kvar att göra" + "risker".
- Steg 7 (blocked, Avtal) → gate-list (offert/plan/betänketid saknas).

## 5. Hero, stats, efter-sektioner

- **Hero:** XL-avatar, kicker "VIP · Aktiv steg 4 av 9", namn, meta, tags (vip/info/success/warning), `Steg 4 av 9`-pill + `Ändra profil` (ghost).
- **Stats (4):** Besök i år · Värde totalt · Skuld · Nästa besök (hero-cellen större).
- **Uppföljning** (efter avslutad resa): Recall-schema (3/6/12 mån) + Retention-signaler.
- **Historik** (tidigare resor): kompakta rader, "klicka för full historia".

## 6. Höger-rail (kontext)

- **`.rail-hero-action`** (amber) — "Smart nästa steg · nu" + titel + sub + **CTA** ("📝 Starta journal nu").
- **Kommande bokningar** — `.booking-row` (datum-block + titel + meta + chip Bokad/Boka).
- **Snabb-åtgärder** — grid: `📷 Ta bild·spara` (dark, full) · `✏️ Anteckna` · `💬 Svarstudio` · `✓ Bekräfta incheckning` (green, full).
- **Senaste händelser** — mini-feed.

## 7. Responsivt (uttryckligt i specen)

| Viewport          | Layout                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Webb ≥1280**    | 2-kol (spine + sticky rail). Hela resan synlig, aktivt steg alltid expanderat, done klickbara.                                                                   |
| **iPad 768–1023** | 1-kol spine; rail → floating bottom-sheet / toggleable side-sheet. Kompakt typografi (step-title 16→14). Sticky: Smart nästa steg + 1 quick-action-rad i botten. |
| **Mobil 320–767** | 1-kol full-bredd. Aktivt steg alltid öppet, done collapsible, future = compact pills. Sticky-botten: hjälte-CTA + 1 quick-action, övrigt bakom `+`-meny.         |

## 8. UI-system

Identisk token-palett som Spec 1 (LOUD amber + green/red/info + vellum). Tillägg: `--vip-ink #bb4779` / `--vip-grad` (rosa VIP-tag), `--green-soft #5fa37e`, stripe-varianter, pulse.

## 9. Skillnad mot CONTENT-CANON (Spec 1) — beslutsunderlag

|                    | CONTENT-CANON (live nu)     | JOURNEY-SPINE                     |
| ------------------ | --------------------------- | --------------------------------- |
| Grundenhet         | 13 sektioner i fast ordning | 9 kundresa-steg                   |
| Aktivt besök       | egen sektion #2             | inline i aktivt steg              |
| Bilder/Journal/Dok | egna sektioner #6–9         | hänger på relevant steg           |
| Done-steg          | rad i Kundresa #5           | expanderbart historik-kort        |
| Blockerare         | sektion #3 + #2-lista       | gate-list på blockerat steg       |
| Navigation         | jump-meny till sektion      | steg N i rail → steg N expanderat |

**Implikation:** JOURNEY-SPINE är en omkomponering, inte en stil-tweak. Kräver att Kundresa-modulen blir värd för övrig moduldata. Detta är "V12 layout-beslutet" (canon-nivå) — kräver owner/Codex-beslut innan bygge.

## 10. Relation till de andra två

- Bygger på **Spec 1**:s innehåll (samma 13 datatyper) men i spine-form.
- **Spec 3 (JAMA)** är denna princip applicerad på en tidig-journey-kund (steg 3 aktiv, gles data) — visar hur spinen ser ut innan aktivt besök finns.
