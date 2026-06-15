# Kundkort · Dokumentplacering — Facit (36 typer)

**Status:** Sammanslagning av tre källor (2026-06-15)  
**Katalog:** `src/ops/hairtp-document-types.catalog.json` (36 typer)  
**Kundresa:** [`CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md`](./CCO-KUNDRESA-9-STEG-HAIR-TP-2026-06-03.md)  
**Bundle:** `hairtp-document-content-v7` (39 typer — 3 extra utanför katalog, se slut)

---

## Principer

1. **Personal ska inte se 36 rader i en flat lista.** Dokument placeras där de hör hemma i kundresan.
2. **Tre UI-lager** — samma data, olika djup:

| Lager                     | Var                                                  | Vad staff ser                                                                            |
| ------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **A · Högerpanel (rail)** | Smalt kundkort                                       | Status nu: _"HD saknas"_, _"Offert väntar"_, _"FC signerad"_ — max 1 rad per aktivt steg |
| **B · Stor kundvy**       | Expanderat kort / slide-over                         | 9 tematiska kort grupperade efter kundresa — **inte** 36 rader                           |
| **C · Registry**          | `Åtgärder → Mallbibliotek / Visa alla dokumenttyper` | Dolt bibliotek för QA, admin, felsökning — **aldrig default-vy**                         |

3. **Steg 5 vs steg 7 (viktigt):** Katalogen sätter `journeyStep: 7` på offert-typerna — det beskriver **signeringsögonblicket**. I UX ska staff se **offert/behandlingsplan i steg 5** och **avtal/samtycke-signering i steg 7**. Samma `registryId`, två steg.

4. **En doc → en primär hemvist** i stor vy. Sekundära ytor (Op-dag-knapp, chip, preview) är länkar — inte duplicerade listor.

5. **Aktivt flöde:** Bara relevant offert/journal för patientens behandling (TP, PRP, …) — inte alla sex offerter samtidigt.

---

## Topp-rad (Stor kundvy)

| Fält                         | Källa                    |
| ---------------------------- | ------------------------ |
| Patient                      | Kundkort-header          |
| Aktuellt steg (1–9 / post-8) | Kundresa · 9 steg        |
| Nästa action                 | Smart nästa steg / gates |
| Tid till operation           | Nästa bokning            |

---

## Kundresa — översikt

```
Steg 1  Bokning              → (inga katalog-docs) · topp-rad
Steg 2  Bekräftelse           → Kort §1 Bokning
Steg 3  Hälsodeklaration      → Kort §2 Hälsa
Steg 4  Konsultation          → Kort §2 Hälsa
Steg 5  Offert = plan          → Kort §3 Behandling + Offert-sektion
Steg 6  Betänketid 2 d         → Kort §4 Juridik
Steg 7  Avtal + samtycke       → Kort §4 Juridik (signering)
Steg 8  Operationsdagen        → Kort §5 Operation
Steg 9  Foto-samtycke          → Kort §6 Foto
post-8  Uppföljning            → Kort §7 Uppföljning
cross   Tvärgående             → §1 + §8 + §9
```

---

## Nio kort i stor kundvy

```
═══════════════════════════════════════════════════════════════
📍 TOPPART — Patient · Steg · Nästa action · Tid till operation
═══════════════════════════════════════════════════════════════

§1  BOKNING · steg 2 + cross
    Status: "Bokning · [datum tid] · [bekräftad/avbokad]"
    Docs: auto_bokningsbekraftelse, auto_bokningspaminnelse,
          auto_avbokningsbekraftelse, auto_instruktion_formular*

§2  HÄLSA · steg 3–4
    Status: "Hälsokontroll · [Att fylla / Klar / Delvis]"
    Docs: haelso_tp_sve, health_tp_eng, prp_hair_info_sve/eng,
          microneedling_info, id_verifiering, konsultationsmall

§3  BEHANDLING · steg 5
    Status: "Behandlingsplan · [Utkast / Skickad / Godkänd]"
    Docs: behandlingsplan_staff, ordination_tp, info_offert_tp,
          offert_* (VISNING — aktivt flöde)

§4  JURIDIK · steg 6–7
    Status: "Avtal · [Betänketid / Väntar review / Signerad]"
    Docs: samtycke_bokning_2d, samtycke_angerratt, auto_betanketid,
          offert_* (SIGNERING steg 7-modal)

§5  OPERATION · steg 8
    Status: "Operationsdag · [datum] · [FC ✓ / Journal ✓ / …]"
    Docs: friskfoers_tp, journal_tp, journal_prp_multi,
          ordination_tp, fore_efter_bildmall
    Op-dag: 5 knappar (FC · Journal · Ordination · Bild · → Foto)

§6  FOTO-SAMTYCKE · steg 9
    Status: "Foto · [Väntande text / Att signera / Signerad]"
    Docs: foto_samtycke (PARTIAL OK tills ORD-24)

§7  UPPFÖLJNING · post-8
    Status: "Efterkontroller · [nästa: 4 mån / 6 mån / …]"
    Docs: journal_tp_post_prp, journal_tp_follow_4/_6/_12
    UI: Tidslinje — EJ flat registry

§8  EKONOMI · cross
    Status: "Betalning · [Betald / Förfallen / MF]"
    Docs: auto_medical_finance (+ Fortnox/Pipedrive ⏳ extern)

§9  ANTECKNINGAR & POLICY · cross
    Status: "Anteckningar · [n st] · Policy"
    Docs: anteckningar_kort, auto_integritet, auto_internt_sms

═══════════════════════════════════════════════════════════════
C · REGISTRY — Åtgärder → Mallbibliotek (dolt, alla 36 sökbara)
═══════════════════════════════════════════════════════════════

* auto_instruktion_formular: primärt steg 3 (HD-påminnelse),
  sekundärt steg 8 (FC-påminnelse) — §1 Bokning eller §2 Hälsa
```

---

## Master-tabell — alla 36 dokument

|   # | registryId                   | Dokument                             | Fyller   | Flöde    | Kat. steg | **Visas (UX)** | **Action** | Högerpanel (A)          | Stor vy kort (B) | Primär sektion        | Sekundär                  |
| --: | ---------------------------- | ------------------------------------ | -------- | -------- | --------- | -------------- | ---------- | ----------------------- | ---------------- | --------------------- | ------------------------- |
|   1 | `haelso_tp_sve`              | Hälsodeklaration · Hair TP Clinic    | Kund     | TP       | 3         | **3**          | signera    | HD saknas / klar        | §2 Hälsa         | Medicinskt läge       | Kundresa chip 3 · Stor vy |
|   2 | `health_tp_eng`              | ENG · Health Questionnaire           | Kund     | TP       | 3         | **3**          | signera    | Endast vid ENG          | §2 Hälsa         | Medicinskt läge       | Språkval                  |
|   3 | `friskfoers_tp`              | Friskförsäkran · TP                  | Kund     | TP       | 8         | **8**          | signera    | FC saknas / signerad    | §5 Operation     | Op-dag knapp 1        | Medicinskt läge · chip 8  |
|   4 | `offert_tp`                  | Offert · TP                          | Kund     | TP       | 7         | **5**          | **7** sign | Offert väntar / godkänd | §3 + §4          | Offert-sektion steg 5 | Steg 7-modal              |
|   5 | `offert_prp_hair`            | Offert · PRP hår                     | Kund     | PRP      | 7         | **5**          | **7**      | (PRP aktivt)            | §3 + §4          | Offert-sektion        | Filter PRP                |
|   6 | `offert_prp_skin`            | Offert · PRP hud                     | Kund     | PRP hud  | 7         | **5**          | **7**      | (PRP hud)               | §3 + §4          | Offert-sektion        | Curatiio                  |
|   7 | `offert_microneedling`       | Offert · Microneedling + PRP         | Kund     | MN       | 7         | **5**          | **7**      | (MN aktivt)             | §3 + §4          | Offert-sektion        | —                         |
|   8 | `offert_prf`                 | Offert · PRF hud                     | Kund     | PRF      | 7         | **5**          | **7**      | (PRF aktivt)            | §3 + §4          | Offert-sektion        | —                         |
|   9 | `offert_profilo`             | Offert · Profhilo                    | Kund     | Profhilo | 7         | **5**          | **7**      | (Profhilo)              | §3 + §4          | Offert-sektion        | Curatiio                  |
|  10 | `samtycke_bokning_2d`        | Samtycke vid bokning inom 2 dagar    | Kund     | Alla     | 6         | **6**          | signera    | Vid närbokning          | §4 Juridik       | Avtal/samtycke        | Medicinskt läge           |
|  11 | `samtycke_angerratt`         | Begäran + samtycke ångerfrist (2 d)  | Kund     | Alla     | 6         | **6**          | signera    | Betänketid aktiv        | §4 Juridik       | Avtal/samtycke        | Cooling-räknare           |
|  12 | `prp_hair_info_sve`          | PRP hår info SWE                     | Kund     | PRP      | 3         | **3–4**        | läs        | Inför konsult           | §2 Hälsa         | Info under behandling | chip 3/4                  |
|  13 | `prp_hair_info_eng`          | PRP info ENG                         | Kund     | PRP      | 3         | **3–4**        | läs        | Inför konsult           | §2 Hälsa         | Info under behandling | Språkval                  |
|  14 | `microneedling_info`         | Microneedling info                   | Kund     | MN       | 3         | **3–4**        | läs        | Inför konsult           | §2 Hälsa         | Info under behandling | —                         |
|  15 | `foto_samtycke`              | Samtycke till foto-publicering       | Kund     | Alla     | 9         | **9**          | signera    | Foto-samtycke saknas    | §6 Foto          | Op-dag knapp 5        | chip 9 · hårlinje/krona   |
|  16 | `journal_tp`                 | Journal · TP Behandling              | Personal | TP       | 8         | **8**          | skriv      | Op-dag journal          | §5 Operation     | Journal per besök     | Op-dag knapp 2            |
|  17 | `journal_tp_post_prp`        | Journal · TP Efterbehandling PRP     | Personal | TP       | post-8    | **post-8**     | skriv      | Efterkontroll           | §7 Uppföljning   | Besök / Journal       | Tidslinje                 |
|  18 | `journal_tp_follow_4`        | Journal · TP Uppföljning 4 mån       | Personal | TP       | post-8    | **post-8**     | skriv      | 4-mån                   | §7 Uppföljning   | Besök / Journal       | Serie                     |
|  19 | `journal_tp_follow_6`        | Journal · TP Uppföljning 6 mån       | Personal | TP       | post-8    | **post-8**     | skriv      | 6-mån                   | §7 Uppföljning   | Besök / Journal       | Serie                     |
|  20 | `journal_tp_follow_12`       | Journal · TP Resultat 12 mån         | Personal | TP       | post-8    | **post-8**     | skriv      | 12-mån                  | §7 Uppföljning   | Besök / Journal       | Serie                     |
|  21 | `journal_prp_multi`          | Journal · PRP/PRF/Microneedling      | Personal | PRP+     | 8         | **8**          | skriv      | Behandlingsdag          | §5 Operation     | Journal per besök     | Op-dag (PRP-flöde)        |
|  22 | `behandlingsplan_staff`      | Behandlingsplan / offert (personal)  | Personal | Alla     | 5         | **5**          | skapa      | Plan utkast             | §3 Behandling    | Behandlingsplan       | Staff preview             |
|  23 | `konsultationsmall`          | Konsultationsmall · Hair TP Clinic   | Personal | Alla     | 4         | **4**          | skriv      | Konsultation            | §2 Hälsa         | Besök / Journal       | Op-dag briefing           |
|  24 | `ordination_tp`              | Ordinationsmall · Hårtransplantation | Personal | TP       | 5         | **5 + 8**      | skriv      | Pre-op / Op-dag         | §3 + §5          | Steg 5 planering      | Op-dag knapp 3            |
|  25 | `anteckningar_kort`          | Anteckningar på patientkort          | Personal | Alla     | cross     | **cross**      | skriv      | Staff notes             | §9               | Högerpanel / Stor vy  | Aldrig kundresa-steg      |
|  26 | `id_verifiering`             | ID-verifiering                       | Personal | Alla     | 4         | **4 + 8**      | process    | ID ej verifierad        | §2 Hälsa         | Medicinskt/admin      | Op-dag checklista         |
|  27 | `info_offert_tp`             | Offert & Behandlingsplan · TP (auto) | Auto     | TP       | 5         | **5**          | skicka     | Plan skickad            | §3 Behandling    | Behandlingsplan       | Kommunikation             |
|  28 | `auto_bokningsbekraftelse`   | Bokningsbekräftelse SMS/e-post       | Auto     | Alla     | 2         | **2**          | skicka     | Bekräftelse skickad     | §1 Bokning       | Auto — ej huvudlista  | Kommunikation             |
|  29 | `auto_bokningspaminnelse`    | Bokningspåminnelse SMS/e-post        | Auto     | Alla     | cross     | **cross**      | skicka     | —                       | §1 Bokning       | Auto                  | Kommunikation             |
|  30 | `auto_avbokningsbekraftelse` | Avbokningsbekräftelse SMS/e-post     | Auto     | Alla     | cross     | **cross**      | skicka     | —                       | §1 Bokning       | Auto                  | Kommunikation             |
|  31 | `auto_instruktion_formular`  | Instruktion HD/FC                    | Auto     | Alla     | cross     | **3 + 8**      | skicka     | HD/FC-påminnelse        | §1 / §2          | Auto kopplat formulär | steg 3 HD · steg 8 FC     |
|  32 | `auto_betanketid`            | Betänketid enligt lag (2 d) e-post   | Auto     | Alla     | 6         | **6**          | skicka     | Betänketid · X d kvar   | §4 Juridik       | Auto / Avtal          | Kommunikation             |
|  33 | `auto_medical_finance`       | Medical Finance betalningsinfo       | Auto     | Alla     | cross     | **cross**      | skicka     | MF / betalning          | §8 Ekonomi       | Ekonomi + Offert-länk | Kommunikation             |
|  34 | `auto_integritet`            | Personuppgiftspolicy / integritet    | Auto     | Alla     | cross     | **cross**      | läs        | —                       | §9 Policy        | Dold mall / Avtal     | Filer                     |
|  35 | `fore_efter_bildmall`        | Före/efter-bildmallar                | Personal | TP       | 8         | **8–9**        | skriv      | Foto-protokoll          | §5 Operation     | Bildstudio / Journal  | Op-dag knapp 4            |
|  36 | `auto_internt_sms`           | Internt SMS bokning/avbokning        | Auto     | Alla     | cross     | **cross**      | arkiv      | —                       | §9 Intern        | Endast personal/admin | PARTIAL · ej till kund    |

**Kolumnförklaring**

- **Kat. steg** — `journeyStep` i katalogen (facit för utvecklare).
- **Visas (UX)** — var staff **hittar** dokumentet i stor vy / högerpanel.
- **Action** — vad som händer vid klick (signera, skicka, steg 7-modal, …).

---

## Per kundrese-steg — vad som syns

### Steg 1 · Bokning

- **Docs:** inga katalog-dokument.
- **A:** _"Bokad konsultation"_ · slot + tjänst.
- **B:** Bokningsmotor, kapacitet.

### Steg 2 · Bokningsbekräftelse (1 doc)

- **Docs:** `auto_bokningsbekraftelse` (#28).
- **A:** _"Bekräftelse skickad"_.
- **B:** §1 Bokning — preview SMS/e-post.

### Steg 3 · Hälsodeklaration (5 + auto)

- **Docs:** #1, #2, #12–14, #31 (HD-del).
- **A:** _"HD saknas / klar / delvis"_.
- **B:** §2 Hälsa — Medicinskt läge. **Inte** alla fem som flat lista — status + aktivt flöde.

### Steg 4 · Konsultation (2 docs)

- **Docs:** #23, #26 (+ #12–14 inför konsult).
- **A:** _"Konsultation · ID?"_.
- **B:** §2 Hälsa — konsultationsmall, ID-checklista.

### Steg 5 · Offert = behandlingsplan (3 + 6 offerter)

- **Docs:** #22, #24, #27, #4–9 (visning), #33 (länk).
- **A:** _"Plan / offert · [status]"_.
- **B:** §3 Behandling + Offert-sektion. **En aktiv offert** per flöde.

### Steg 6 · Betänketid 2 dagar (3 docs)

- **Docs:** #10, #11, #32.
- **A:** _"Betänketid · X dag kvar"_.
- **B:** §4 Juridik — samtycken vid behov, cooling-räknare.

### Steg 7 · Avtal + samtycke bundle (signering)

- **Docs:** samma `offert_*` (#4–9) — **action** steg 7-modal.
- **A:** _"Avtal · väntar review / signerad"_.
- **B:** §4 Juridik — bundle-signering, legal review.

### Steg 8 · Operationsdagen (4 docs + ordination)

- **Docs:** #3, #16, #21, #24, #35, #31 (FC-del), #26 (ID).
- **A:** _"Op-dag · FC · journal · bild"_.
- **B:** §5 Operation — Op-dag 5 knappar (sticky).

| Knapp                    | registryId                         |
| ------------------------ | ---------------------------------- |
| Friskförsäkran           | `friskfoers_tp`                    |
| TP-journal / PRP-journal | `journal_tp` / `journal_prp_multi` |
| Ordination               | `ordination_tp`                    |
| Före/efter-bild          | `fore_efter_bildmall`              |
| Foto-samtycke →          | `foto_samtycke` (§6)               |

### Steg 9 · Foto-samtycke (1 doc)

- **Docs:** #15.
- **A:** _"Foto-samtycke · [status]"_.
- **B:** §6 Foto — scope hårlinje/krona, aldrig ansikte.

### Efter op-dag · Uppföljning (4 docs)

- **Docs:** #17–20.
- **A:** _"Nästa uppföljning · [4/6/12 mån]"_.
- **B:** §7 Uppföljning — tidslinje. **Exkluderas** från flat registry (`isPost8JournalRegistryId`).

### Tvärgående · cross

- **Docs:** #25, #29, #30, #33, #34, #36 (+ delar av #31).
- **A:** visas **inte** som kundrese-steg (utom triggers).
- **B:** §1 Bokning, §8 Ekonomi, §9 Anteckningar & policy.

---

## Mål-UX — doc → ett hemvist (stor vy)

| Kort                     |      Antal | registryId                  |
| ------------------------ | ---------: | --------------------------- |
| §1 Bokning               |          4 | 28, 29, 30, 31\*            |
| §2 Hälsa                 |          7 | 1, 2, 12, 13, 14, 23, 26    |
| §3 Behandling            |          9 | 22, 24, 27, 4–9 _(1 aktiv)_ |
| §4 Juridik               |   3 + sign | 10, 11, 32 + signering 4–9  |
| §5 Operation             |          5 | 3, 16, 21, 24†, 35          |
| §6 Foto                  |          1 | 15                          |
| §7 Uppföljning           |          4 | 17–20                       |
| §8 Ekonomi               | 1 + extern | 33                          |
| §9 Anteckningar & policy |          3 | 25, 34, 36                  |
| **Registry (C)**         | 36 sökbara | Dolt — QA/admin             |

\*31 delas steg 3/8 · †24 delas §3/§5

---

## Op-dag · personal (kod idag)

Redan i `cco-hairtp-document-cloud.js` — ska mappa till **§5 Operation**, inte registry-lista.

---

## Implementation — nuläge vs mål

| Område              | ORD-46 idag                  | Mål enligt detta facit       |
| ------------------- | ---------------------------- | ---------------------------- |
| Steg 3 HD           | ✅ Medicinskt läge + preview | §2 Hälsa-kort                |
| Steg 5 plan         | ⚠️ Delvis Offerter           | §3 eget kort · offert steg 5 |
| Steg 6–7            | ✅ Cooling + steg 7-modal    | §4 Juridik-kort · 5/7-split  |
| Steg 8              | ✅ Op-dag 5 knappar          | §5 Operations-kort           |
| Steg 9 foto         | ✅ Overlay PARTIAL           | §6 · ORD-24 full text        |
| Post-8              | ✅ Timeline (kod)            | §7 kort-UX                   |
| Högerpanel status   | ⚠️ Delvis chips              | Layer A — en rad per steg    |
| Registry flat 26–35 | ❌ Rörigt                    | Layer C — dolt bibliotek     |
| Stor vy 9 kort      | ❌ Saknas                    | Layer B — ny struktur        |

---

## Bundle v7 vs katalog (36)

Tre typer i bundle **utan** katalog-post — placering tills katalog uppdateras:

| registryId          | Föreslagen placering                |
| ------------------- | ----------------------------------- |
| `botulinum_info`    | §2 Hälsa · steg 3–4 (Curatiio/info) |
| `hyalase`           | §2 Hälsa · medicinskt tillägg       |
| `ordination_recept` | §5 Operation / §3 Behandling        |

---

## Metadata-förslag (kod)

Lägg till i katalog eller bundle-mapping:

```json
{
  "journeyStepCatalog": 7,
  "journeyStepDisplay": 5,
  "journeyStepAction": 7,
  "uiCard": "behandling",
  "uiLayerA": "offert_status",
  "hiddenFromRegistryDefault": true
}
```

---

## Källor som slagits ihop

1. **Journey-map** — steg-för-steg, registryId, filler, flöde, primär/sekundär sektion, post-8 utanför registry.
2. **9-korts kundkort** — §1–§9 tematiska kort med status-rader.
3. **Codex 3-lager** — högerpanel status · stor vy grupperad · registry dolt · offert steg 5 / avtal steg 7.

---

_Hair TP Clinic · Dokumentplacering facit · 2026-06-15_
