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

**Bekräftat 2026-08-28 (Fazli + reviewer):** 16 ärvda (6 PRP-efterbehandling +
9 uppföljningar + 1 suturborttagning), 5 konsultationer står själva, **66 rader
att gå igenom**. Tabellen är låst på dessa siffror.

Kvar som bedömning: huvudtjänst är en **representativ graftnivå** (t.ex.
"1000 grafts"). Det spelar ingen roll för underlagen i dag, men om någon senare
låter pris eller journal följa kopplingen blir det fel — håll koll på det.

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
