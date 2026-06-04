# Aisia DS-3 — Snabbreferens (personal, 1 sida)

**Hair TP · Pilot · CCO flag OFF** tills `APPLY AISIA TO CCO`

---

## Tre regler

1. **All bildtagning i Aisia DS-3** — inte i CCO
2. **Export PDF + bilder** — manuell import till CCO senare
3. **Behandlare verifierar** — ingen auto-diagnos, ingen extern AI

---

## Baseline (konsultation) — P0-zoner

```
GLOBAL:  front → vänster → höger → bak
DONOR:   occipital → vänster → höger
RECIPIENT: hairline → problemområde (+ crown/mid vid behov)
MIKRO:   10× → 50× → 100×/200× · vit / PL / UV
EXPORT:  PDF (orörd) + ev. bilder
```

Checklista: **A** · Guide: [Konsultation](./AISIA-CONSULTATION-CAPTURE-GUIDE-2026-05-30.md)

---

## Uppföljning — P0

```
Samma zoner som baseline · ny follow_up-session
Timepoint: D14 · M1 · M3 · M6 · M12
EXPORT → senare CCO: follow_up + jämförelse
```

Guide: [Uppföljning](./AISIA-FOLLOW-UP-CAPTURE-GUIDE-2026-05-30.md)

---

## Tri-spektral (påminnelse)

| Ljus    | Använd                    |
| ------- | ------------------------- |
| **Vit** | Antal, diameter, översikt |
| **PL**  | Känslighet, rodnad, kärl  |
| **UV**  | Talg, porfyriner          |

---

## CCO (efter APPLY only)

| Steg | Knapp                      |
| ---- | -------------------------- |
| 1    | Skapa session              |
| 2    | Importera PDF              |
| 3    | Importera bilder           |
| 4    | Spara mätvärde             |
| 5    | **Verifiera** (behandlare) |

Flik: **Hår-/scalpanalys** · Runbook: [MVP pilot](./AISIA-MVP-PILOT-RUNBOOK-2026-05-30.md)

---

## Förbjudet i pilot

❌ Prod-flag utan owner · ❌ FAS 2 API · ❌ Kamera i CCO · ❌ Extern AI · ❌ GitHub-filer

---

## Owner-kommandon

| Säg                    | Betyder                                             |
| ---------------------- | --------------------------------------------------- |
| **APPLY AISIA TO CCO** | Aktivera FAS 1 (`ENABLE_AISIA_SCALP_ANALYSIS=true`) |
| **START AISIA FAS 2**  | Export/API/kamera-undersökning                      |

---

## Hjälp

| Behov        | Dokument                                                |
| ------------ | ------------------------------------------------------- |
| Index        | [Pilotpaket](./AISIA-PILOT-PACKAGE-INDEX-2026-05-30.md) |
| Rum          | [Room test flow](./AISIA-ROOM-TEST-FLOW-2026-05-30.md)  |
| QA vid APPLY | [APPLY QA](./AISIA-APPLY-TO-CCO-QA-2026-05-30.md)       |

---

_source: sammanfattning av pilotpaket · new_
