# ORD-135 · Ärvning av underlag för 0-kr-tjänster

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`be5736ed`)
**Föregås av:** ORD-134 (prislistan), ORD-127 (`follow_6` → `_8`)
**Kritisk:** Nej — additiv, men avgör hur arbetsbladets 0-kr-rader behandlas.

---

## Beslutet (Fazli 2026-08-28)

0-kr-tjänsterna delas i två:

- **Ärver underlagen** — samma vårdepisod som huvudtjänsten:
  PRP-efterbehandlingar, uppföljningar, suturborttagning.
- **Står själva** — eget möte med egna underlag: konsultationerna.

Fazlis genomgång krymper därmed från 82 till **61 rader** (ärvda räknas inte).

---

## Ärv-tabellen — explicit, inte namnmatchning

`src/ops/cco-service-inheritance.json` bär tabellen (`inheritsFrom`: tjänst → huvudtjänst).
Namnmatchning är förbjudet — det var namnmatchning som gav fyra felaktiga
patientsammanslagningar.

Tabellen är seedad från katalogen (16 rader):

| Grupp | Antal | Huvudtjänst |
| --- | --- | --- |
| PRP-efterbehandling | 6 | transplantationskategorin (representativ graftnivå) |
| Uppföljningar | 9 | behandlingen den följer upp |
| Suturborttagning | 1 | ögonlocksplastik |

**Flagga att bekräfta innan tabellen låses:**
- Reviewer skrev "8 PRP-efterbehandlingar", katalogen har **6**. Diff på 2.
- Reviewer skrev "konsultationer står själva" (≈3), katalogen har **5**
  konsultationer (3 Curatiio + 2 Hair TP).
- Huvudtjänst är en **representativ graftnivå** (t.ex. "1000 grafts") — det är
  en bedömning; kliniker kan vilja peka på en annan nivå.

## Villkor

1. **Explicit tabell**, inte namnmatchning.
2. **Ärvningen syns i utdata** — `getUnderlagSource()` returnerar
   `{ inherited, chain, rootServiceId }` så man ser varifrån ett krav kommer.
3. **`?` får inte ligga kvar på de ärvda** — importen räknar dem som ärvda,
   inte som obesvarade.

## Bedömningar (märkta — kliniker kan säga emot utan att arbetet görs om)

- **Suturborttagning** (7107) är ett eget ingrepp på en annan dag — bedömning.
- **Uppföljning Botox/Filler/Profhilo** (8952/8953/8954) ärver en behandlingsjournal
  till ett återbesök utan behandling — bedömning, hänger ihop med att Curatiio
  saknar uppföljningsjournal (öppen fråga från ORD-133).

---

## Godkänt när

- Ärv-tabellen är bekräftad av kliniker (diffarna ovan lösta).
- `getRequiredUnderlag` löser ärvda tjänster till huvudtjänstens underlag.
- Importen räknar ärvda som ärvda (inte obesvarade), och utdata visar källan.
