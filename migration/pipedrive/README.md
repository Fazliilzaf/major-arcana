# Pipedrive-export (Hair TP Clinic)

| Fil | Status | Rader | Källa |
|-----|--------|-------|-------|
| `personer-2026-05-24.csv` | ✅ Validerad | 3 694 personer (+ rubrikrad) | Pipedrive → Personer → CSV (2026-05-24) |
| `affarer-2026-05-24.csv` | ✅ Validerad | 3 487 affärer (+ rubrikrad) | Pipedrive → Affärer → Alla → CSV (2026-05-24) |

**Källfiler (Nedladdningar):**

| Original | MD5 | Använd |
|----------|-----|--------|
| `~/Downloads/people-19510795-5.csv` | `81b5e9e3…` | ✅ → `personer-2026-05-24.csv` |
| `~/Downloads/people-19510795-4.csv` | `81b5e9e3…` | dubblett av `-5` |
| `~/Downloads/deals-19510795-5.csv` | — | ✅ → `affarer-2026-05-24.csv` |

**Gammal zip (tom):** `Pipedrive (Hair TP Clinic)-20260521T215137Z-3-001.zip` innehöll bara mall-docx, inte People/Deals.

## Import till patientmaster

Efter Cliento-import (`npm run migration:import`):

```bash
npm run migration:import-pipedrive
```

Kopplar via personnummer → e-post → telefon. Skapar inga nya patienter — berikar befintliga med `pipedrive.personId` och `pipedrive.deals[]` (join: `Kontaktpersonens id` → person `ID`).
