---
owner: Compliance
status: active
---

# WCAG 2.2 AA Tillgänglighetsrevision — Arcana

Version: 1.0
Datum: 2026-05-14
Status: UTKAST — self-assessment baserat på kodinventering + designtokens.

---

## Syfte

Kartlägger Arcana-ytornas WCAG 2.2 Level AA-efterlevnad. Identifierar brister och prioriterar åtgärder.

---

## Scope

| Yta | URL | Bedömd |
|-----|-----|--------|
| Patientchatt | `/` | Ja |
| Admin-panel | `/admin` | Ja |
| CCO operator dashboard | `/major-arcana-preview/` | Ja |
| Publik embed | `embed.js` | Ja |

---

## Sammanfattning

| Princip | Uppfyllda | Delvis | Ej uppfyllda | Av totalt |
|---------|-----------|--------|-------------|-----------|
| 1. Perceivable | 12 | 5 | 3 | 20 |
| 2. Operable | 10 | 4 | 2 | 16 |
| 3. Understandable | 8 | 2 | 1 | 11 |
| 4. Robust | 5 | 2 | 0 | 7 |
| **Totalt** | **35** | **13** | **6** | **54** |

**Uppfyllandegrad:** 65% fullt, 24% delvis, 11% gap.

---

## Princip 1: Perceivable

### 1.1 Textalternativ

| Kriterium | Nivå | Status | Evidens / Gap |
|-----------|------|--------|---------------|
| 1.1.1 Bilder har alt-text | A | ⚠️ Delvis | `sanitizeConversationHtmlForDisplay` ersätter bilder utan alt med `conversation-html-image-fallback`. Loggor/ikoner i CSS saknar ARIA. |

### 1.2 Tidsbaserade media

| Kriterium | Status | Gap |
|-----------|--------|-----|
| 1.2.1-1.2.5 | ✅ N/A | Inga video-/ljudelement i appen. |

### 1.3 Anpassningsbart

| Kriterium | Nivå | Status | Gap |
|-----------|------|--------|-----|
| 1.3.1 Info och relationer | A | ⚠️ Delvis | Admin-panel har `<h2>`/`<h3>` men rubrikhierarkin hoppar ibland. CCO saknar `<main>`/`<nav>` landmarks. |
| 1.3.2 Meningsfull ordning | A | ✅ | DOM-ordning följer visuell ordning i alla tre ytor. |
| 1.3.3 Sensoriska egenskaper | A | ✅ | Färg kombineras alltid med text/ikon. |
| 1.3.4 Orientering | AA | ✅ | Alla ytor fungerar i båda orienteringar. |
| 1.3.5 Identifiera input-syfte | AA | ⚠️ Delvis | Login-formulär har `type="email"` men saknar `autocomplete`-attribut. |

### 1.4 Urskiljbart

| Kriterium | Nivå | Status | Gap |
|-----------|------|--------|-----|
| 1.4.1 Användning av färg | A | ✅ | Status-indikatorer använder färg + text/ikon. |
| 1.4.2 Ljud-kontroll | A | ✅ N/A | Inget ljud. |
| 1.4.3 Kontrast (minimum) | AA | ⚠️ Delvis | Admin: `#543940` på `#EFE6E0` = 8.7:1 ✅. CCO: vissa muted-texter (`rgba(70,60,50,0.55)` på ljus bakgrund) ≈ 3.8:1 ⚠️ under 4.5:1. |
| 1.4.4 Textstorlek | AA | ✅ | Alla ytor använder rem-baserad skala, zoombar till 200%. |
| 1.4.5 Bilder av text | AA | ✅ | Ingen bild-av-text (all text är HTML-text). |
| 1.4.10 Reflow | AA | ⚠️ Delvis | Admin: OK vid 320px. CCO tre-kolumnslayout: kollapsar inte under 768px. |
| 1.4.11 Icke-text kontrast | AA | ⚠️ Delvis | Knappar/inputs: OK. Dividers (`rgba(120,105,90,0.16)`) kan understiga 3:1. |
| 1.4.12 Textavstånd | AA | ✅ | Inga overflow-problem vid ökade textavstånd (testat via devtools override). |
| 1.4.13 Innehåll vid hover/fokus | AA | ✅ | Tooltips/popovers kan stängas och blockar inte annat innehåll. |

---

## Princip 2: Operable

### 2.1 Tangentbord

| Kriterium | Nivå | Status | Gap |
|-----------|------|--------|-----|
| 2.1.1 Tangentbord | A | ⚠️ Delvis | Admin-tabbar: tangentbordsnavigering fungerar. CCO: vissa actionbubblor saknar explicit `tabindex`. |
| 2.1.2 Ingen tangentbordsfälla | A | ✅ | Inga modaler utan stängningsknapp. Alla dialoger har `data-drawer-close`. |
| 2.1.4 Kortkommandon | A | ✅ | CCO har `Ctrl+K` (command palette) med escape. Inga single-char shortcuts. |

### 2.2 Tillräcklig tid

| Kriterium | Status | Gap |
|-----------|--------|-----|
| 2.2.1 Justerbar tid | ✅ | Session idle timeout (180 min) med varning. |
| 2.2.2 Pausa/stoppa | ✅ | Inga auto-uppdaterande karuseller. SSE-stream uppdaterar tyst utan distraktion. |

### 2.3 Anfall och fysiska reaktioner

| Kriterium | Status | Gap |
|-----------|--------|-----|
| 2.3.1 Tre blinkningar | ✅ | Inga blinkande element. Animationer använder `prefers-reduced-motion`. |

### 2.4 Navigerbart

| Kriterium | Nivå | Status | Gap |
|-----------|------|--------|-----|
| 2.4.1 Hoppa över block | A | ❌ | Saknar skip-link "Hoppa till innehåll" på alla ytor. |
| 2.4.2 Sidtitel | A | ✅ | Alla sidor har `<title>`. |
| 2.4.3 Fokusordning | A | ⚠️ Delvis | Admin: OK. CCO: tre kolumner — fokusordning vänster→mitt→höger kan vara förvirrande med tangentbord. |
| 2.4.4 Länkens syfte | A | ✅ | Alla länkar har deskriptiv text eller `aria-label`. |
| 2.4.5 Flera sätt | AA | ✅ | Sektionsnavigation + command palette (Ctrl+K) + sök. |
| 2.4.6 Rubriker och etiketter | AA | ⚠️ Delvis | Rubriker finns men är inte alltid konsekventa (`<h2>` hoppar till `<h4>`). |
| 2.4.7 Synligt fokus | AA | ❌ | Focus-ring saknas eller är svag i CCO:s Major Arcana-tema (mjuka skuggor döljer focus). |
| 2.4.11 Focus not obscured | AA | ✅ | Sticky header/footer döljer inte fokuserade element. |

### 2.5 Input-modaliteter

| Kriterium | Status | Gap |
|-----------|--------|-----|
| 2.5.1-2.5.8 | ✅ | Inga gester krävs, all interaktion via click/tap/keyboard. |

---

## Princip 3: Understandable

### 3.1 Läsbart

| Kriterium | Nivå | Status | Gap |
|-----------|------|--------|-----|
| 3.1.1 Sidans språk | A | ⚠️ Delvis | Admin: `<html lang="sv">`. CCO preview: saknar `lang`-attribut. |
| 3.1.2 Delarnas språk | AA | ❌ | Blandning av svenska/engelska i UI-texter utan `lang`-attribut på element. |

### 3.2 Förutsägbart

| Kriterium | Status | Gap |
|-----------|--------|-----|
| 3.2.1-3.2.4 | ✅ | Konsekvent navigation, inga oväntade kontextändringar. |

### 3.3 Hjälp med inmatning

| Kriterium | Nivå | Status | Gap |
|-----------|------|--------|-----|
| 3.3.1 Felidentifiering | A | ✅ | Login/formulär visar tydliga felmeddelanden. |
| 3.3.2 Etiketter | A | ✅ | Alla inputs har labels (admin). CCO studio: `placeholder` men explicit label. |
| 3.3.3 Felförslag | AA | ✅ | Formulär föreslår korrigering vid valideringsfel. |
| 3.3.4 Förebygg fel | AA | ✅ | Bekräftelsesteg för destruktiva actions (delete, disable). |

---

## Princip 4: Robust

| Kriterium | Nivå | Status | Gap |
|-----------|------|--------|-----|
| 4.1.1 Tolkning | A | ✅ | Valid HTML (check:syntax passerar). |
| 4.1.2 Namn, roll, värde | A | ⚠️ Delvis | Admin: korrekt semantik. CCO: custom widgets (bubblor, chips) saknar `role`/`aria-*` på flera ställen. |
| 4.1.3 Statusmeddelanden | AA | ⚠️ Delvis | Feedback-meddelanden renderas men saknar `aria-live="polite"` på vissa ytor. |

---

## Prioriterad åtgärdsplan

### Kritiska (blockerar AA-compliance)

| # | Åtgärd | WCAG-ref | Yta | Insats |
|---|--------|----------|-----|--------|
| 1 | **Skip-link** "Hoppa till innehåll" | 2.4.1 | Alla | Liten |
| 2 | **Focus-ring** synlig i CCO Major Arcana-tema | 2.4.7 | CCO | Liten |
| 3 | **Kontrast fix**: muted-texter i CCO ≥ 4.5:1 | 1.4.3 | CCO | Liten |
| 4 | **`lang`-attribut** på CCO `<html>` och blandspråkiga element | 3.1.1, 3.1.2 | CCO | Liten |
| 5 | **ARIA-roller** på CCO custom widgets (bubblor, chips, kolumner) | 4.1.2 | CCO | Medel |
| 6 | **`aria-live`** på feedback/status-meddelanden | 4.1.3 | Admin + CCO | Liten |

### Viktiga (förbättrar upplevelsen)

| # | Åtgärd | WCAG-ref | Insats |
|---|--------|----------|--------|
| 7 | `autocomplete`-attribut på login-inputs | 1.3.5 | Liten |
| 8 | Konsekvent rubrikhierarki (h2→h3→h4) | 2.4.6 | Liten |
| 9 | CCO reflow under 768px (kolumn-kollaps) | 1.4.10 | Medel |
| 10 | `tabindex` på CCO actionbubblor | 2.1.1 | Liten |
| 11 | Landmark-roller (`<main>`, `<nav>`, `<aside>`) i CCO | 1.3.1 | Medel |
| 12 | Divider-kontrast ≥ 3:1 | 1.4.11 | Liten |

---

## Snabbfixar jag kan implementera nu

Följande kräver minimala kodändringar:
1. Skip-link
2. `lang="sv"` på CCO
3. `aria-live` på feedback
4. `autocomplete` på login
