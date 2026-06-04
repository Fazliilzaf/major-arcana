# Cycle 45 prod-UAT — ORD-3 (B-sprint)

**Scope:** Automation Registry dry-run + Smart nästa steg UI på prod (`arcana.hairtpclinic.com`).

**Kör:**

```bash
CCO_PERSONAL_DEMO_BASE=https://arcana.hairtpclinic.com npm run cco:cycle-45-prod-uat
```

## Checklista

| #   | Check                                                      | Förväntat                         |
| --- | ---------------------------------------------------------- | --------------------------------- |
| 1   | `GET /readyz`                                              | 200                               |
| 2   | `verify-kundresa-canonical-9-step`                         | PASS                              |
| 3   | `verify-smart-next-step-dry-run`                           | PASS                              |
| 4   | `verify-kunder-real-data` + mobil                          | PASS                              |
| 5   | `cco:real-cco-gate` mot prod                               | PASS (inkl. smart-next-step.js)   |
| 6   | Prod assets `cco-kunder-smart-next-step.js`                | 200                               |
| 7   | Prod JS `includeAutomation` + `CcoKunderSmartNextStep`     | finns                             |
| 8   | `GET /api/v1/cco/automation/catalog` utan token            | 401/403                           |
| 9   | `customers-shell?includeAutomation=1` utan token           | 401/403                           |
| 10  | Journal routes + kunder verify (ORD-3 subset)              | PASS                              |
| 11  | Render env `ENABLE_AUTOMATION_RUNNER=true`                 | true (manuell Render-verifiering) |
| 12  | Inloggad STAFF: dossier «Smart nästa steg» + Dry-run badge | manuell (ej i script)             |

## Rapport

Skrivs till `data/reports/cycle-45-prod-uat-ord3-*.md` (gitignored `data/`).

## Efter PASS

- Uppdatera `CCO-END-TO-END-UAT-2026-05-31.md` Cycle-45-rad
- Informera Fazli: validera 20+ patienter i Kunder-dossier (manuell UAT)
