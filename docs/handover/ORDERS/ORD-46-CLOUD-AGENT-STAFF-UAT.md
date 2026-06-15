# ORD-46 — Cloud Agent Staff UAT

**Status:** ✅ Ready (prod verified 9/9)  
**Prod:** `https://arcana.hairtpclinic.com` · commit `af3c4b5c`  
**Förväntad tid:** 20–30 min per testare  
**Känd begränsning:** Steg 9 (`foto_samtycke`) visar **PARTIAL** tills ORD-24 text sync — navigation och scope ska fungera ändå.

---

## Förutsättningar

1. Inloggad som staff/owner i CCO
2. v9 kundvy aktiv (`data-v9-enabled="on"`)
3. Demo-läge för steg 7/8/9-modaler (URL-parametrar nedan)

---

## Start-URL

```
https://arcana.hairtpclinic.com/staff?view=customers&demo=on&demoOpDay=1
```

Valfritt: `&demoPatient=Test+Kund` · `&demoSkipSteg7=1` (hoppa över steg 7-gate för steg 8)

---

## Testsekvens

Markera **PASS / FAIL / N/A** och anteckna skärmdump vid FAIL.

### A — Dokumentpanel (V11 dossier)

| #   | Steg                                        | Förväntat                                         | PASS |
| --- | ------------------------------------------- | ------------------------------------------------- | ---- |
| A1  | Öppna kund i kolumn 3                       | Dokument-segment laddas (registry-räkning synlig) | ☐    |
| A2  | Klicka auto-rad (t.ex. bokningsbekräftelse) | Preview-modal SMS/e-post                          | ☐    |
| A3  | Klicka offert-rad (`offert_tp`)             | Steg 7 avtal+samtycke öppnas                      | ☐    |
| A4  | Klicka **Friskförsäkran**                   | Steg 8-modal med 13 frågor                        | ☐    |
| A5  | Klicka **journal_tp**                       | Journal-flik + TP-journal öppnas                  | ☐    |
| A6  | Filter **personal / auto**                  | Rader filtreras korrekt                           | ☐    |
| A7  | PARTIAL-rad                                 | Gul chip + ev. `!` blocker-hint                   | ☐    |

### B — Op-dag panel (sticky)

| #   | Steg                             | Förväntat                            | PASS |
| --- | -------------------------------- | ------------------------------------ | ---- |
| B1  | Synlig med `demoOpDay=1`         | Rad **Op-dag** med 5 knappar         | ☐    |
| B2  | **Friskförsäkran**               | Steg 8-modal                         | ☐    |
| B3  | **TP-journal** / **PRP-journal** | Rätt journal enligt flöde            | ☐    |
| B4  | **Ordination**                   | Staff preview (stub-text OK)         | ☐    |
| B5  | **Före/efter-bild**              | Preview med stadier Före/Under/Efter | ☐    |
| B6  | **Foto-samtycke**                | Steg 9-modal + PARTIAL-banner        | ☐    |

### C — Steg 8 (friskförsäkran)

| #   | Steg                           | Förväntat                        | PASS |
| --- | ------------------------------ | -------------------------------- | ---- |
| C1  | Scroll hela formuläret (mobil) | Sista fält + Signera synligt     | ☐    |
| C2  | Validering                     | Fel om obligatoriska fält saknas | ☐    |
| C3  | Demo-signera                   | Signerad-panel, entry-ID visas   | ☐    |

### D — Steg 9 (foto-samtycke)

| #   | Steg            | Förväntat                          | PASS |
| --- | --------------- | ---------------------------------- | ---- |
| D1  | PARTIAL-banner  | Synlig (tills ORD-24 FULL)         | ☐    |
| D2  | Scope           | Hårlinje/krona — aldrig ansikte    | ☐    |
| D3  | Signera (demo)  | Status grön + entry-ID             | ☐    |
| D4  | Efter signering | Journal-flik + kamera-kort triggas | ☐    |

### E — Referenskundkort (KKX)

| #   | Steg                            | Förväntat                  | PASS |
| --- | ------------------------------- | -------------------------- | ---- |
| E1  | Sektion **Dokument · registry** | Lista + filter-chips       | ☐    |
| E2  | Klick registry-rad              | Rätt modal/preview/journal | ☐    |
| E3  | Blocker `!`                     | Tooltip/hint för PARTIAL   | ☐    |

### F — iPhone / iPad (390px / 768px)

| #   | Steg           | Förväntat                            | PASS |
| --- | -------------- | ------------------------------------ | ---- |
| F1  | Steg 7 modal   | Scroll till Signera                  | ☐    |
| F2  | Steg 8 modal   | Scroll till Signera                  | ☐    |
| F3  | Steg 9 modal   | Scroll till Signera                  | ☐    |
| F4  | Op-dag knappar | Wrap, inga klippta etiketter (Å/Ä/Ö) | ☐    |

---

## Godkännandekriterier

**UAT GODKÄND** om:

- A1–A5, B1–B6, C1–C3, D1–D4 = PASS
- Inga blockerande JS-fel i konsol vid normal navigering
- PARTIAL på steg 9 **räknas inte** som FAIL (text kommer ORD-24)

**UAT UNDERKÄND** om:

- Modal öppnas inte från dokumentrad eller op-dag
- Steg 8 saknar frågor (< 13)
- Journal/ordination-klick gör ingenting
- Scroll klipper sign-knapp på mobil

---

## Rapportering

Fyll i efter test:

```
Testare:
Datum:
Enhet (iPhone/iPad/desktop):
Prod commit (verifiera): af3c4b5c

FAIL-lista (om någon):
1.
2.

Övriga kommentarer:
```

Skicka till owner / lägg i Notion ORD-46 eller ny ORD för fix.

---

## Prod-verify (automation — redan körd)

Agent verify före UAT (2026-06-15):

- `/readyz` OK
- Bundle `hairtp-document-content-v6`
- Cloud wiring symbols live på prod static assets

Personal behöver **inte** köra verify-script — endast manuell checklista ovan.
