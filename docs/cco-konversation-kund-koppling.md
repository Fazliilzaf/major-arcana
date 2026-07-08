# Konversationer ↔ Kund — wiring-kontrakt (Plan A)

Koppla Konversationer till rätt kund i Kundlistan/Kunddossiern/V12. Resolvern är
byggd och mergad (**#712**); det här dokumentet är kontraktet för **wiring:en**,
som ägs av den som är i konversations-UI/API-filerna (Cursor/Codex).

Plan A: Claude rör INTE `konversationer.html`, worklist-consumern eller routes så
länge Cursor/Codex är där. Resolvern (ny fil) är byggstenen alla kopplar in.

## Icke förhandlingsbar identitet

- **Canonical kund-id = `patient.id`** (heter `patientId` i UI/API/URL).
- `cliento_*` / `pipedrive_*` är **alias för matchning**, ALDRIG primärnyckel.
- Matchar en tråd via `cliento.emails[]` → svaret är ändå `patientId: "<pm-uuid>"`.
- Konversationer får **inget eget kund-id-system** — samma canonical id som
  kundsegment/kundkort. Annars dubbel sanning (samma alias-problem som Gate 2).

## Byggstenen (klar, #712)

`src/ops/ccoConversationPatientResolver.js`:

```js
const {
  resolveConversationPatient,
} = require('./ccoConversationPatientResolver');

const match = await resolveConversationPatient(
  { tenantId, email }, // motpartens/kundens e-post från konversations-readmodellen
  { patientMasterStore } // app.locals.ccoPatientMasterStore
);
```

Read-only: läser via `patientMasterStore.listPatients` — rör inte storen, ingen
send, ingen live Graph. Matchar mot `primaryEmail · emails[] · cliento.emails[] ·
pipedrive.emails[]`.

**Output (evidence):**

```js
{
  patientId: '<pm-uuid>' | null,
  displayName: string | null,
  matchedBy: 'primaryEmail' | 'emails' | 'cliento.emails' | 'pipedrive.emails' | 'email' | null,
  confidence: 1 (direkt) | 0.9 (alias) | 0,
  status: 'matched' | 'ambiguous' | 'unmatched' | 'no_email' | 'store_unavailable',
  candidates?: [{ patientId, displayName, matchedBy, confidence }] // vid ambiguous
}
```

Regel: **länka bara automatiskt vid `status === 'matched'`.** Vid `ambiguous` →
visa "flera möjliga kunder", länka INTE. Vid `unmatched` → okopplad konversation.

## Wiring-steg (ägs av Cursor/Codex)

Additivt, i den ordningen. Varje steg är litet och isolerat.

### 1. Additiva fält i worklist-consumern

Per konversationsrad, kör resolvern på radens motparts-e-post och lägg till
(bryt inget befintligt):

```
patientId          // '<pm-uuid>' | null
patientMatch       // hela evidence-objektet ovan
patientDisplayName // för snabb visning i listan
```

Ingen live-fetch mot Graph vid trådöppning — använd lokal ingestion/readmodel.

### 2. Kundens konversationer

`GET /api/v1/cco/conversations/by-patient?patientId=<uuid>` (Bearer-token auth,
read-only), ELLER ett `patientId`-filter i den befintliga consumern. Returnerar
trådarna vars `patientId` matchar.

### 3. Deep-link till kundvyn

Vid öppning av en tråd med `patientId`:

```
/major-arcana-preview/?view=customers&v9=on&v11rail=on&v12workspace=on&patientId=<patientId>
```

Stora kundvyn hämtar payloaden:

```
GET /api/v1/cco-patient-master/patient?patientId=<patientId>&includeDriveFiles=1
```

### 4. UI-status

Visa match-status i tråden/listan: `matched` (länkad), `ambiguous` (välj kund,
länka inte auto), `unmatched` (okopplad). Aldrig e-post eller cliento-alias i URL.

## Scope (bevaras i alla steg)

- Konversationer + patient-master readmodel only
- ingen Drive-skrivning, ingen send, ingen live Graph vid trådöppning
- Bearer-token auth
- additivt — bryt inga befintliga fält

## Återanvändning senare

Resolvern kan gradvis ersätta dagens smala `findPatientByEmail` (bara
`primaryEmail` + `emails[]`) i mail-ingestion och compose — samma canonical-id-
regel överallt.
