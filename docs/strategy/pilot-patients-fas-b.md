---
owner: CCO
status: active
---

# Fas B — pilotkunder

Valda 2026-05-22 efter `npm run migration:import` + `node scripts/select-pilot-patients.js`.

| #   | Namn           | Personnummer  | Journal-PDF | patientId                              |
| --- | -------------- | ------------- | ----------- | -------------------------------------- |
| 1   | Dino Placo     | 19940605-8017 | 12          | `f8233fca-779c-488b-a980-0e41bc01c0c0` |
| 2   | Jonas Lundvall | 19890825-4959 | 12          | `cc07c972-49d9-4c99-928e-d750e79a82e9` |
| 3   | Johan Nguyen   | 19940819-7995 | 11          | `a9a57bb5-c87b-4f63-b4fa-dd42f2aee091` |
| 4   | Oscar Sandklef | 20050705-0896 | 11          | `518e37eb-8bd1-44ef-afb1-9a4b43fb1b6a` |
| 5   | Axel Meijer    | 19980924-6276 | 10          | `2e8d3535-cd89-418e-8b68-ca239f8836a4` |

## Render env

```
ARCANA_PILOT_PATIENT_IDS=f8233fca-779c-488b-a980-0e41bc01c0c0,cc07c972-49d9-4c99-928e-d750e79a82e9,a9a57bb5-c87b-4f63-b4fa-dd42f2aee091,518e37eb-8bd1-44ef-afb1-9a4b43fb1b6a,2e8d3535-cd89-418e-8b68-ca239f8836a4
```

## Kommandon

```bash
# Lokal import (klart)
npm run migration:import
node scripts/select-pilot-patients.js --count 5
node scripts/import-pilot-journals.js

# Prod push (öppen journal-API i byggfas — ingen owner-login)
ARCANA_PUSH_REQUIRE_AUTH=false ./scripts/push-pilot-prod.sh

# Om Render env råkat wipas
./scripts/restore-render-env-from-blueprint.sh
```

Maskera personnummer i supportkanaler utanför kliniken.
