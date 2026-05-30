# Aisia DS-3 — Personalrutiner (Hair TP pilot)

**Spår:** Kliniskt pilotspår · CCO flag **off** tills `APPLY AISIA TO CCO`  
**Princip:** Aisia tar bilder och analys **i rummet**. CCO tar emot export **senare** (manuellt).

---

## Roller och ansvar

| Roll                   | Gör                                                  | Gör inte                            |
| ---------------------- | ---------------------------------------------------- | ----------------------------------- |
| **Reception**          | Bokar tid, markerar om scalp-analys planeras         | Exporterar inte Aisia-filer         |
| **Behandlare/konsult** | Klinisk bedömning, godkänner capture, tolkar rapport | Auto-diagnos via CCO/AI             |
| **Kamerabehörig**      | DS-3, zoner, export PDF/bilder                       | Skickar filer till extern AI/GitHub |
| **Operatör (CCO)**     | Import + metrics när flag on                         | Verify (kräver behandlare)          |
| **Pilotledare**        | Checklistor, avvikelser, pilotlogg                   | Aktiverar inte prod-flag            |

### RBAC i CCO (när flag aktiverad)

| Permission     | Roller                             |
| -------------- | ---------------------------------- |
| `scalp.read`   | owner, operator, konsult, personal |
| `scalp.write`  | owner, operator, konsult           |
| `scalp.verify` | owner, operator, konsult           |

---

## Daglig rutin — rum utrustning

**Varje morgon (5 min):**

- [ ] DS-3 startar utan fel
- [ ] Kamera ansluten
- [ ] Exportmapp tillgänglig (lokal disk)
- [ ] Kalibrering noterad om klinik kräver daglig check
- [ ] **Ej:** testa mot `aisiausa.umersoft.com:8864`

**Efter sista patient:**

- [ ] Exporterade filer säkerhetskopierade enligt klinik (inte GitHub)
- [ ] Kamera av/parkering enligt SOP
- [ ] Pilotlogg ifylld (mall nedan)

---

## Rutin per besökstyp

| Besök                          | Aisia session     | Checklista                                                                                                     | CCO (efter APPLY)       |
| ------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Ny konsultation / baseline** | `consultation`    | [A — Baseline](./AISIA-CAPTURE-CHECKLISTS-2026-05-30.md#checklista-a--baseline-konsultation)                   | Import + verify         |
| **TP-planering donor-fokus**   | `consultation`    | [A + B](./AISIA-CAPTURE-CHECKLISTS-2026-05-30.md#checklista-b--donor-fokus-tp-planering)                       | Donor metrics           |
| **Uppföljning**                | `follow_up`       | [D — Follow-up](./AISIA-CAPTURE-CHECKLISTS-2026-05-30.md#checklista-d--uppföljning-follow-up)                  | Jämförelse mot baseline |
| **Pre-op kontroll**            | Ev. komplettering | [E — Pre-op gates](./AISIA-CAPTURE-CHECKLISTS-2026-05-30.md#checklista-e--pre-op-readiness-status-inte-beslut) | Protocol-status         |

---

## Tidsbudget (riktlinje)

| Fas               | Baseline      | Uppföljning   |
| ----------------- | ------------- | ------------- |
| Förberedelse      | 5–10 min      | 5 min         |
| Global + donor    | 10–15 min     | 5–10 min      |
| Recipient + mikro | 15–25 min     | 10–15 min     |
| Analys + export   | 5–10 min      | 5 min         |
| **Totalt**        | **35–60 min** | **25–35 min** |

Planera scalp-capture **innan** eller **integrerat med** konsultation — inte efter att patient lämnat om baseline krävs samma dag.

---

## Kommunikation med patient

**Före capture (muntligt, klinikstandard):**

1. Vi tar bilder av hårbotten med specialkamera för att dokumentera och följa upp.
2. Resultatet används som **stöd** i konsultationen — slutlig bedömning görs av behandlare.
3. Bilder sparas enligt klinikens journal-/datalagring (CCO när aktiverat).

**Efter capture:** Behandlare går igenom Aisia-rapport **muntligt** — patientvy i CCO (senare) är förenklad svenska med disclaimer.

---

## Filhantering (pilot)

| Regel      | Detalj                                              |
| ---------- | --------------------------------------------------- |
| Lagring    | Klinikens lokala exportmapp / journalsystem         |
| Namn       | `{datum}-{besökstyp}-{initialer}` enligt klinik-SOP |
| Redigering | **Aldrig** redigera PDF efter export                |
| Delning    | **Aldrig** Slack, privat e-post, GitHub, extern AI  |
| CCO        | Manuell import först efter `APPLY AISIA TO CCO`     |

---

## Avvikelser — eskalering

| Situation                    | Åtgärd                                          |
| ---------------------------- | ----------------------------------------------- |
| Fel patient i Aisia          | Stopp, avbryt session, starta om                |
| DS-3 krasch                  | IT/klinik-SOP — **inte** FAS 2 workaround       |
| Saknad zon                   | Komplettera före export om möjligt              |
| Personal osäker på tolkning  | Behandlare beslutar — ingen auto-rekommendation |
| CCO import fel (efter APPLY) | Operatör + IT; ej patientdata i dev-kanaler     |

---

## Relaterade guider

| Dokument                                                         |                                |
| ---------------------------------------------------------------- | ------------------------------ |
| [Konsultation](./AISIA-CONSULTATION-CAPTURE-GUIDE-2026-05-30.md) | Baseline i konsultationsrummet |
| [Uppföljning](./AISIA-FOLLOW-UP-CAPTURE-GUIDE-2026-05-30.md)     | Dag 14 / mån 1–12              |
| [Rumstest](./AISIA-ROOM-TEST-FLOW-2026-05-30.md)                 | Generellt flöde                |
| [Pilotlogg](./AISIA-PILOT-SESSION-LOG-TEMPLATE-2026-05-30.md)    | Per session                    |

---

_source: AISIA-CAPTURE-PROTOCOL, pilot runbook (befintlig) · new — personalrutiner_
