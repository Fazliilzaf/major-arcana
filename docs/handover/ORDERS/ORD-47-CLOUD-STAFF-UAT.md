# ORD-47 — Cloud Staff UAT (§-kort · V1)

**Status:** Ready · prod live `7e7ac22b`+  
**Prod:** `https://arcana.hairtpclinic.com`  
**Facit:** [`docs/strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md`](../../strategy/KUNDKORT-DOKUMENT-PLACERING-FACIT.md)  
**Föregångare:** ORD-46 wiring (bundle v7, op-day, HD/FC/foto) — fortsatt giltig under §-kort  
**Förväntad tid:** 25–35 min per testare  
**Kända PARTIAL (förväntat):** `foto_samtycke` (ORD-24), `behandlingsplan_staff`, `anteckningar_kort`, `id_verifiering`, `auto_internt_sms`

---

## Förutsättningar

1. Inloggad som staff/owner i CCO
2. Använd **canonical UAT-URL** nedan (med `patientId`)
3. Allt test sker i **höger kundkort-panel** (v10 facit / `.kkref`)
4. **Default ska INTE** vara flat registry “Alla · 26+”

---

## Start-URL (canonical — endast denna bas)

```
https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=<uuid>
```

**Pilot-UUID (prod):**

| Stickprov                   | Kund           | patientId                              |
| --------------------------- | -------------- | -------------------------------------- |
| TP tidig (steg 7 demo-skip) | Axel Meijer    | `2e8d3535-cd89-418e-8b68-ca239f8836a4` |
| TP op-dag                   | Dino Placo     | `f8233fca-779c-488b-a980-0e41bc01c0c0` |
| Variation / PRP-flöde       | Jonas Lundvall | `cc07c972-49d9-4c99-928e-d750e79a82e9` |

**Var i UI:** UAT-länken ska **direkt öppna kundkort** i höger panel (desktop + mobil). Kräver `view=customers` + `patientId` i URL. Hårdladda (Cmd+Shift+R) vid cache-problem.

Ingen modal ska auto-öppnas vid kundklick (med `demoSkipSteg7=1`).

---

## L3 — Snabb prod-checklista (7 punkter)

Markera efter första kundöppning:

| #   | Kontroll      | Förväntat                                                                        | PASS |
| --- | ------------- | -------------------------------------------------------------------------------- | ---- |
| G1  | Default vy    | **Ingen** synlig flat registry “Dokument · registry · Alla · 26+” above-the-fold | ☐    |
| G2  | Topp-rad      | Synlig: Steg / Nästa / Tid till op (`.kk-ord47-topbar`)                          | ☐    |
| G3  | §2 Hälsa      | Expanderbar → HD preview öppnas vid klick                                        | ☐    |
| G4  | §5 Operation  | Op-dag **5 knappar** (FC · Journal · Ordination · Bild · Foto)                   | ☐    |
| G5  | §6 Foto       | Samtycke-overlay/modal + PARTIAL-banner OK                                       | ☐    |
| G6  | Mallbibliotek | Knapp “Mallbibliotek · alla dokumenttyper” → registry med sök/filter             | ☐    |
| G7  | Rail status   | En rad status (`.kk-ord47-rail`) matchar aktivt steg                             | ☐    |

---

## Testsekvens per §-kort

Markera **PASS / FAIL / N/A**. Screenshot vid FAIL.

### §1 — Bokning (steg 2 + cross)

| #   | Steg          | Förväntat                                                                           | PASS |
| --- | ------------- | ----------------------------------------------------------------------------------- | ---- |
| S1  | Kort synligt  | §1 Bokning i `.kk-doc-cards`                                                        | ☐    |
| S2  | Auto-dokument | Bokningsbekräftelse/påminnelse preview via kort (ej duplicerat Auto-dokument-block) | ☐    |

### §2 — Hälsa (steg 3–4)

| #   | Steg            | Förväntat                                   | PASS |
| --- | --------------- | ------------------------------------------- | ---- |
| S3  | Medicinskt läge | HD-status synlig                            | ☐    |
| S4  | HD preview      | Klick öppnar hälsodeklaration               | ☐    |
| S5  | Konsultation    | Info-rader eller placeholder — ej tom crash | ☐    |

### §3 — Behandling (steg 5)

| #   | Steg            | Förväntat                                                    | PASS |
| --- | --------------- | ------------------------------------------------------------ | ---- |
| S6  | Aktivt flöde    | **En** relevant offert (TP eller PRP) — inte alla 6 offerter | ☐    |
| S7  | Behandlingsplan | Rad/sektion synlig eller placeholder                         | ☐    |

### §4 — Juridik (steg 6–7)

| #   | Steg                  | Förväntat                                    | PASS |
| --- | --------------------- | -------------------------------------------- | ---- |
| S8  | Betänketid / samtycke | Rader eller hint synlig                      | ☐    |
| S9  | Offert-signering      | Klick offert → steg 7-modal (avtal+samtycke) | ☐    |

### §5 — Operation (steg 8)

| #   | Steg           | Förväntat                           | PASS |
| --- | -------------- | ----------------------------------- | ---- |
| S10 | Op-dag panel   | 5 knappar synliga med `demoOpDay=1` | ☐    |
| S11 | Friskförsäkran | Steg 8-modal, 13 frågor             | ☐    |
| S12 | Journal-knapp  | TP/PRP journal öppnas               | ☐    |

### §6 — Foto-samtycke (steg 9)

| #   | Steg           | Förväntat                       | PASS |
| --- | -------------- | ------------------------------- | ---- |
| S13 | PARTIAL-banner | Synlig (ORD-24) — **inte FAIL** | ☐    |
| S14 | Signera demo   | Modal + demo-signering fungerar | ☐    |

### §7–§9 — Uppföljning / Ekonomi / Anteckningar

| #   | Steg            | Förväntat                              | PASS |
| --- | --------------- | -------------------------------------- | ---- |
| S15 | §7 Uppföljning  | Post-op journalrader eller placeholder | ☐    |
| S16 | §8 Ekonomi      | Kort synligt (kan vara tunt i V1)      | ☐    |
| S17 | §9 Anteckningar | Policy/intern — kort synligt           | ☐    |

### Kundresa + navigation

| #   | Steg                       | Förväntat                                   | PASS |
| --- | -------------------------- | ------------------------------------------- | ---- |
| N1  | Kundresa-chips             | Klick hoppar till rätt §-kort (`kk-card-*`) | ☐    |
| N2  | Mallbibliotek dolt default | Registry host `hidden` tills knapp klickas  | ☐    |
| N3  | Console                    | Inga röda JS-fel vid kundklick              | ☐    |

---

## Stickprov-URL:er (L6)

```
# 1 · TP tidig (demo skip steg 7)
https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&demoSkipSteg7=1&patientId=2e8d3535-cd89-418e-8b68-ca239f8836a4

# 2 · TP op-dag
https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=f8233fca-779c-488b-a980-0e41bc01c0c0

# 3 · Variation
https://arcana.hairtpclinic.com/staff?view=customers&v9=on&demo=on&demoOpDay=1&patientId=cc07c972-49d9-4c99-928e-d750e79a82e9
```

---

## Felsökning

| Symptom                                | Åtgärd                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Hamnar bara på kundlistan (ej kort)    | Kräver `view=customers&patientId=` + senaste build (desktop deeplink). Hårdladda.  |
| Tomt kundkort / vit panel              | Hårdladda (Cmd+Shift+R). Kräver commit `7e7ac22b`+ (resolver helpers exporterade). |
| Flat registry som default              | Bug — ska vara dold; öppna Mallbibliotek medvetet                                  |
| Konversationer istället för Kunder     | Ladda canonical URL                                                                |
| 502 / vit sida                         | Vänta 60 s, ladda om                                                               |
| `filterOffersByFlow is not a function` | Prod saknar `7e7ac22b` — deploy om                                                 |

---

## Godkännandekriterier

**UAT GODKÄND** om:

- G1–G7 = PASS
- S4, S10, S11, S9 = PASS (kärnflöden HD · op-dag · avtal)
- N3 = inga blockerande JS-fel
- PARTIAL foto = **inte** FAIL

**UAT UNDERKÄND** om:

- Kundkort renderas inte alls
- Flat registry “Alla · 26+” är default synlig
- Op-dag 5 knappar saknas med `demoOpDay=1`
- HD/offert/FC-modal öppnas inte

---

## Rapportering (manuell)

```
Testare:
Datum:
Enhet:
Prod commit: (curl /api/v1/_diag/version)

G1–G7:
S1–S17:
FAIL-lista:
```

---

## Prod-verify (automation)

Kör före/efter deploy:

```bash
# ORD-46 + ORD-47 wiring
ARCANA_CLOUD_EXPECT_COMMIT=$(curl -fsS https://arcana.hairtpclinic.com/api/v1/_diag/version | node -pe 'JSON.parse(fs.readFileSync(0,"utf8")).commit.slice(0,8)') \
  node scripts/verify-cloud-document-wiring-prod.js

# L6 stickprov (statisk + URL)
node scripts/verify-ord47-prod-sticks.js
```

Personal behöver **inte** köra script — endast checklista ovan.

---

_Hair TP · ORD-47 · Staff UAT · §-kort V1_
