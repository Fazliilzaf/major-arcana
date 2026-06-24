# V12 facit-parity / design-depth — backlog-sektion · 2026-06-23

**Status:** Backlog/dokumentation. Ingen kod. Codex-bokförd efter facit-gap-granskning.
**Hör till:** CCO 100%-backloggen — denna sektion ska in som en egen del där.
**Underlag:** [V12-WORKSPACE-FACIT-GAP-2026-06-23.md](V12-WORKSPACE-FACIT-GAP-2026-06-23.md) (gissningsfri facit↔live-jämförelse, file:line).
**Facit:** `V12-WORKSPACE-CONTENT-CANON-2026-06-21.html` (Zon 2) + `V11-rail-AMBER-DEMPAD.html` (Zon 1).

> Kontext: V12 är strukturellt ~80% mot facit (sektionsordning 1→13 exakt match, alla 13 moduler finns, rent `.v12-workspace__*`-namespace). Gapen nedan är **detaljdjup + layout-modell + data**, inte saknad struktur. Kärnan i facit-parity behöver bokföras exakt.

---

## Sektion: V12 facit-parity / design-depth

### Layout & helhet

- [ ] **V12 layout-beslut** — stor kundvy/overlay/minimal jump-rail (320px) **vs** nuvarande två-zon med full V11-rail bredvid. Facit = full sida + minimal jump-rail; live = overlay från rail-sektionsklick med hela V11-railen. **Kräver canon-beslut** (störst).
- [ ] **Palettregel Zon 2** — V12 ska följa facit-ton (LOUD amber, `--amber-bg .16`), **inte** bli för nedtonad. AMBER-DEMPAD gäller ENBART Zon 1-railen.

### Modul-djup (facit-parity per sektion)

- [ ] **Kundens nuläge (#1)** — Förbered besök-CTA, Ny bokning, Redigera + snabbknappar (Ring/SMS/Mejl) enligt facit. Live har tel/sms/mail-länkar men saknar quick-knapp-rad + hero-CTA.
- [ ] **Aktivt besök (#2)** — 6-node timeline enligt facit (bokad→incheckad→behandling→journal→eftervård→klar). Live har 3-node (checkin→progress→done).
- [~] **Hälsa (#4)** — Fas A **KLAR** (#175, `0c679d18` merged 2026-06-24): kontraindikationer surfas från hälsodeklarationens riktiga `hd.flags` (röd/amber). **KVAR = B1:** pågående läkemedel (namn) saknar datakälla — kräver formulär-fråga + parser + lagring (owner-beslut). Läkemedel visar empty/unknown-state tills dess.
- [ ] **Kundresa (#5)** — per-steg-länkar/koppling till dokument/foto/journal per steg. Live har stepper utan per-steg-länkar.
- [ ] **Bilder (#7)** — jämför-rad (före/efter-par) + krona-vy/gap-varning. Live har grid utan jämför/gap.
- [ ] **Dokument (#9)** — facit-gruppering / 2-kol dokumentkort. Live har 3 subsektioner (offers/autodocs/files).
- [x] **Ekonomi (#11)** — fakturarader från `paymentHistory` → **#172 MERGED 2026-06-23** (`8773e8e8`). partially_paid/failed härdade, betalstatus-färger, unknown-state bevarad.
- [ ] **Insikter (#12)** — amber "Gör nu" + grön "Möjlighet"-kort tydligt åtskilda. Live har next-block + insights-lista utan grön möjlighet-kort-styling.

### QA / förutsättning

- [ ] **Full-data testkund** — hitta/skapa en kund som faktiskt fyller vyerna (besök, journal, aktivt besök, foton, ekonomi) så facit-jämförelse blir rättvis. Idag visar demokunder (Abdalle) gles data → tomma empty-states som inte speglar facit.

---

## Klassificering (från gap-analysen)

| Typ                         | Punkter                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Canon-beslut**            | Layout-modell (overlay vs full-sida + jump-rail)                                                                                       |
| **Backend/datamodell**      | Hälsa B1 läkemedel-namn (kontraindikationer KLAR via #175; läkemedel kräver formulär-fråga + owner-beslut)                             |
| **Frontend (klart)**        | Ekonomi fakturarader (#172 MERGED 2026-06-23)                                                                                          |
| **Frontend (presentation)** | Nuläge-CTA/snabbknappar, 6-node timeline, Kundresa steg-länkar, Bilder jämför/gap, Dokument-gruppering, Insikter grön-kort, palett-ton |
| **QA**                      | Full-data testkund                                                                                                                     |

## Vad detta INTE är

- Inte en strukturell ombyggnad (ordning + moduler + namespace stämmer)
- Inte ett palett-problem i fel riktning (Zon 2 ska vara loud, inte dämpas)
- Inte "gammal prod-kod" (prod kör samma bundle som main)

---

_Bokförd 2026-06-23 efter Codex facit-gap-granskning. Endast dokumentation — ingen kodändring i denna commit._
