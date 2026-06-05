# Kundkort v11 · LOCKED · 2026-06-05

**Status:** Owner-approval 2026-06-05 ("kör på de så länge") — locked som canonical kundkort-design tills annat sägs.
**Position:** Mockup-track. Inte i live-port-läge än (pilot-frys gäller P0/P1 endast).
**Föregångare:** v6 → v7 → v8 (signatur+rytm+monogram) → v9 (insikter-strip) → v10 (dokument-segmentvy) → **v11 (stitched: hero → dokument → insikter)**.

---

## Komposition (3 zoner, fast ordning)

### Zon 1 · Hero (bild 2)

- Hero-card med `--shadow-lift` + pappersmonogram-avatar (Georgia italic i lila, gold-passepartout-ring, paper-grain)
- Identitet: kicker "KUNDDOSSIÉR" (lila uppercase), namn 22px, meta-rad, 3 status-pills (VIP/PRP-kur/engagement)
- Amber medicinsk briefing-block med 4-kolumns grid (Allergier/Mediciner/Diagnoser/Övrigt) — amber-stripe vänster
- Stat-row 1.6fr/1fr/1fr: hjälte-stat "0 no-shows · Klockren · Topp 5%" med lila-radial-halo + 2 dämpade sublines (Besök, Intäkt)

### Zon 2 · Dokument-segmentvy (bild 3 · **OFÖRÄNDRAD**)

**Kontext-rubrik:** "DOSSIÉR · DOKUMENT-SEGMENT" + count-line "14 dokument · 8 klara · 1 väntar · 5 kommer"

**Filter-rad** (3 axlar synliga som chips):

- Vem fyller: Patient (lila) · Personal (grön) · Auto (neutral)
- Flöde: TP (varmt brun-vellum) · PRP hår (grön)
- Vy: Per kategori (selected, dark) · Per steg · Tidslinje

**4 grupper:**

1. **Offerter** (commit · steg 5–7) — 2 godkända Offerter med flow-chip + belopp
2. **Hälso- & samtyckesdokument** (kund fyller) — 3 signerade + 2 dashed planerade (Friskförsäkran op-dag · Foto-samtycke op-dag)
3. **Journaler** (personal fyller) — 3 signerade + 1 amber "Att fylla i" + 3 dashed planerade
4. **Auto-dokument** (system skickar) — 3-kolumns grid med 6 auto-utskick

Varje dokumentrad bär 3 segment-signaler: flow-chip + journeyStep i meta + status-pill.

### Zon 3 · Insikter + Sticky (bild 1)

- Insikter-strip header: "INSIKTER" (10px lila kicker) + "Visa kundresa ›" lila-länk
- 3 insikt-kort: Hälsodekl TP (amber, Nästa steg) · Behandlingsrespons (vellum/lila, Förberedelse) · Retention (vellum/grön, Relation)
- Sticky bottom: 1 hjälte gold "Boka nästa PRP" + 2 assistenter ("Ta bild" vellum · "Bekräfta · 2" grön-pill)
- Helper-text under sticky: "Signera hälsodeklarationen innan du skapar behandlingsplan."

---

## Designsystem-tokens (måste användas vid port)

```css
--ink:
  #2b251f --ink-soft: rgba(70, 60, 50, 0.6) --ink-mute: rgba(70, 60, 50, 0.42)
    --vellum: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.96),
      rgba(247, 241, 236, 0.88)
    )
    --vellum-border: 1px solid rgba(255, 255, 255, 0.7) --card-rule: 1px solid
    rgba(180, 160, 140, 0.18) --lila-strong: #7c3aed /* identitet */
    --lila-text: #3d2576 --lila-pill,
  --lila-pill-border,
  --lila-wash --gron-text: #1f5236 /* klar-state */
    --gron-grad: linear-gradient(180deg, #5fae84, #3e8a5e) --gron-pill,
  --gron-pill-border,
  --gron-wash --amber-text: #7a4014 /* varning + premium-CTA */
    --amber-grad: linear-gradient(180deg, #f4cc80, #dc9640) --amber-wash,
  --amber-border --shadow-base: 0 1px 0 rgba(255, 255, 255, 0.85) inset,
  0 2px 6px rgba(56, 40, 28, 0.05),
  0 1px 2px rgba(56, 40, 28, 0.03) --shadow-lift: 0 1px 0
    rgba(255, 255, 255, 0.95) inset,
  0 10px 28px rgba(56, 40, 28, 0.08), 0 3px 8px rgba(56, 40, 28, 0.05);
```

**Typografi-skala (LÅST 5 sizes):** 10 · 11 · 13 · 16 · 22 (label · body-fine · body · section-title · hero-number)

**Rytm:** 6px inom card · 14px mellan card · 24px (via hårsträng) mellan zoner

**Hairstrand-signatur:** SVG `cubic-bezier` curve med gold-gradient fade in/out, används som zon-skarv. Inte rak `<hr>`.

---

## Beroenden för live-port (när owner säger "porta")

1. **ORD-24 backend** (dokument-segment + 5 axlar) MÅSTE vara klart först — Zon 2 visar dummy-data utan det
2. **Allergi-fält strukturerat på patient** (per ORD-23) — Zon 1 medicinsk briefing
3. **Insikter-strip backend** (capability-matrix utökat med "varför" per insikt) — Zon 3

Frontend-port: refaktorera `cco-v9-customers-parity.js` dossier-render-path till v11-layouten. Inte SPA-render via `patient-master-ui.js` (Cursor äger render-pathen).

---

## Frusna designval (får inte ändras utan owner-OK)

- **Ingen rosa** som dominant ton (lila ersätter)
- **Inga bruna checkmarks** (grön)
- **5 typstorlekar max**
- **Inga blå stripes** alls
- **Bild 3 layout 1:1** — Offerter heter "Offert" (inte Behandlingsavtal)
- **Ikoner endast på actions** (knappar, status-rader, insikt-kort) — inte på sektionsrubriker

---

_Locked 2026-06-05 efter v6→v11 iteration. Snapshot ligger även i visualize-output `kundkort_v11_stitched_hero_dokument_insikter`._
