# Agent-koordinering — Claude · Cursor · Codex

Spelregler för när flera AI-agenter jobbar i samma repo samtidigt. Mål: bygga
parallellt utan merge-krig. Krockar är ett **processproblem**, inte ett kodproblem.

## De sju grundreglerna

1. **En delad fil = en agent åt gången.** Krockarna kommer nästan alltid från de
   tunga delade filerna. Bestäm _innan_ vem som äger vilken just nu; resten håller
   sig borta tills den släpps.

2. **Nya filer slår redigeringar.** Kan uppgiften lösas som en **fristående
   modul/op/doc** → gör det (noll krock). Bara wiring som _måste_ in i en delad fil
   redigerar den — en agent, sekventiellt.

3. **Egen branch per agent, serie-merge till main.** Pusha inte alla till samma
   branch. Varje agent sin branch → separata PR:er → merga **en i taget**; övriga
   rebasar efter varje merge. Håll merge-ordningen seriell (en agent äger den).

4. **Kontrakt först.** Kom överens om gränssnittet (funktions-signatur, output-shape,
   endpoint-params) i en spec/doc **innan** wiring. Då bygger alla mot samma
   gränssnitt utan att röra varandras filer. Gränssnittet är koordineringssömmen.

5. **Sekvensera beroende steg** i stället för att parallellisera dem. Steg som rör
   samma fil körs efter varandra. (Ex: resolver → consumer-fält → endpoint →
   deep-link.)

6. **Rebasa mot `origin/main` precis före push. Små PR:er. Merga snabbt.** Korta
   livslängder → få och triviala konflikter. Restarta grenen från `origin/main`
   inför varje ny PR.

7. **Samma formattering.** Alla kör `prettier` (och `eslint`) före commit. Annars
   skapar olika radbrytning fantom-diffar som ser ut som konflikter.

## "Heta" delade filer att vakta

Erfarenhetsbaserat — dessa har orsakat krockar och kräver tydligt ägarskap:

- `public/konversationer.html` (stor inline-JS, lanes, inbox-render)
- worklist-/conversation-consumern
- `server.js` (route-montering)
- `src/ops/ccoPatientMasterStore.js` (patient-master)
- delade CSS/token-block

Nya `src/ops/*`, `tests/**`, `docs/**` och fristående `public/*-modul.js` är
lågriskytor — föredra dem.

## Handoff-protokoll

- **Ta en fil explicit:** "Jag tar `X` nu" → andra rör den inte förrän "Släpper `X`".
- **Fråga före delad fil:** rör du en het fil, bekräfta först att den är din just nu.
- **Behöver du något från en annan agents yta:** be om ett **kontrakt/doc**, inte en
  ändring i din fil.
- **Notera ägarbyten i PR-beskrivningen** ("Cursor tar wiring i consumern").

## Om en konflikt ändå uppstår

1. `git fetch origin main && git rebase origin/main` — lös i den agent som pushar sist.
2. Minsta möjliga diff; rör inte rader utanför din uppgift.
3. Är konflikten i en het fil du inte äger → stanna, lämna över till ägaren.

## Checklista före push

- [ ] Grenen omstartad/rebasad mot `origin/main`.
- [ ] Bara filer som hör till min uppgift är rörda (inga oavsiktliga delade filer).
- [ ] `prettier` + `eslint` + berörda tester gröna lokalt.
- [ ] Liten, enkelriktad PR; ägarbyten noterade.

## Rollfördelning (utgångsläge, kan förhandlas per uppgift)

| Agent              | Föredragen yta                                                                 |
| ------------------ | ------------------------------------------------------------------------------ |
| **Claude**         | fristående ops/resolvers/moduler, tester, docs, kontrakt                       |
| **Cursor / Codex** | wiring i konversations-UI/API, routes, consumer, patient-master, merge-ordning |

Icke förhandlingsbart oavsett agent: canonical id-regler (t.ex. `patientId` =
`patient.id`, aldrig `cliento_*`), read-only/ingen-send/ingen-live-Graph där det gäller.
