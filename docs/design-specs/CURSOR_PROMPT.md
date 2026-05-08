# 🎯 Cursor-prompt: Historik-kort för CCO-appen

## Kontext till Cursor

Jag har designat om historik-korten i arbetskö-vyn för CCO-appen (`arcana-cco.onrender.com/major-arcana-preview/`, repo `Fazliilzaf/major-arcana`). Nuvarande implementation har två problem:

1. Historik-korten har inkonsekvent layout jämfört med Alla-vyns kort
2. Historik-korten saknar "Kontaktformulär"-information och gruppering via mailboxspår

Jag har byggt en färdig design-prototyp. Din uppgift: **integrera designen i den befintliga React-kodbasen.**

Referens-HTML finns i filen `historik_kort_fix_v3.html` (bifogad till denna prompt).

---

## Kort-struktur (viktig!)

Varje historik-kort har **fyra zoner** uppifrån och ner:

```
┌─────────────────────────────────────────────────┐
│ ZON 1: Kort-top (vit, upphöjd yta)              │
│  [Avatar+status] [Namn] [Subtitel]  [Tid/status]│
│                  [Preview-text på andra raden]  │
├─────────────────────────────────────────────────┤
│ ZON 2: Footer-chips (ljus insänkt zon)          │
│  [Kons] [Samma kund] [Behöver upp.] [Fortsätt]  │
├─────────────────────────────────────────────────┤
│ ZON 3: MAILBOXSPÅR (djupare insänkt zon)        │
│  | 📬 MAILBOXSPÅR  Fazli · Contact · +5 till    │
└─────────────────────────────────────────────────┘

(Rosa vänsterkant längs hela kortet)
```

---

## Props-struktur

```typescript
interface HistorikCard {
  id: string;
  customer: {
    name: string;           // "Morten Bak Kristoffersen"
    initials: string;       // "MB" (beräknas från name om saknas)
    status: 'urgent' | 'active' | 'waiting';  // Styr status-prickens färg
  };
  subtitle: string;         // "Samma kund har skrivit från flera mailboxar"
  preview: string;          // Preview av senaste meddelandet
  timestamp: string;        // "16:07" eller "2026-04-21 13:31"
  assignmentStatus: string; // "Ej tilldelad" / "Mottaget" / etc.
  tags: {
    category: string;       // "Kons"
    relationship: string;   // "Samma kund har skrivit..."
    priority: string;       // "Behöver uppmärksamhet" / "Hög risk" / "Svar krävs"
    action: string;         // "Fortsätt från samma" / "Svara nu"
  };
  mailboxTrail: string[];   // ["Fazli", "Contact", "Egzona", ...]
}
```

### Trunkering av mailboxTrail
- Om `mailboxTrail.length <= 3` → visa alla
- Om `mailboxTrail.length > 3` → visa första 3 + `+{N} till` som klickbar länk

---

## Uppgifter för Cursor

**1.** Hitta nuvarande historik-kort-komponent i repot (troligen i `src/components/` eller motsvarande).

**2.** Skapa/uppdatera `HistorikCard.jsx` (eller `.tsx`) baserat på strukturen i `historik_kort_fix_v3.html`.

**3.** Extrahera CSS från HTML-filen till motsvarande styling-lösning i projektet (styled-components, CSS-modules, Tailwind, eller vilken som redan används).

**4.** Koppla till befintlig data-source. Det kan behöva en backend-ändring för att börja skicka `mailboxTrail` — om det inte redan finns, lägg till det som TODO och mocka data för nu.

**5.** Bevara alla interaktiva effekter:
   - Status-prick på avatar (röd pulsande, gul, grön)
   - Hover: neutral grå kant + mjuk halo (ingen lift/transform)
   - Glossig 3D-yta på kort (inset shadows + glansreflex)
   - Chip-ikoner: skala + rotera vid hover
   - Grön "Fortsätt"-pil: glider åt höger vid hover
   - Entrance-animation: staggered cardIn

**6.** Ikoner: använd Lucide-React (eller motsvarande bibliotek som redan finns i projektet). Mappning:
   - Kons → `Mail`
   - Samma kund har skrivit → `Users`
   - Behöver uppmärksamhet → `AlertTriangle`
   - Fortsätt från samma → `ChevronRight`
   - MAILBOXSPÅR → `Inbox`
   - Historik (section-label) → `Clock`

**7.** Respektera befintliga design tokens. Om projektet har `theme.colors.pink.500` → använd det istället för hårdkodade hex-värden. Listan över färger jag använt:
   - Rosa vänsterkant: `#f472b6` → `#e85a7a` → `#d946a0` (gradient)
   - Chip-blå: `#3b82f6`
   - Chip-pink: `#d946a0`
   - Chip-grön: `#16a34a`
   - MAILBOXSPÅR-lila: `#7c3aed`

**8.** Gör inget annat än det här. Ingen refaktorering av andra komponenter, ingen "passa-på"-cleanup. Commit:ta med meddelande `feat(historik): redesign cards with mailbox trail and status indicators`.

---

## Innan du börjar

Läs igenom `historik_kort_fix_v3.html` i detalj — den är källan till sanning för visuellt utseende, spacing, animationer och hover-effekter. Alla mått, färger, och övergångstider är medvetna val från mig.

Om något är oklart: **fråga mig innan du gissar**. Jag vill inte att du hittar på interaktioner eller stilar som inte finns i referensfilen.
