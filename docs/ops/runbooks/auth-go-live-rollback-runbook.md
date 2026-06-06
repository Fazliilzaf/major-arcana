# Auth go-live — underhållsfönster & rollback (Arcana prod)

**Tjänst:** `arcana` · `srv-d8b3i3tckfvc73clgeng` · https://arcana.hairtpclinic.com  
**Tenant:** `hair-tp-clinic`  
**Relaterat:** [ROLLOUT-PLAN.md](../../strategy/ROLLOUT-PLAN.md) Fas 2 · `scripts/verify-auth-go-live-prod.sh`

---

## Underhållsfönster (mall)

| Fält               | Värde                                                                          |
| ------------------ | ------------------------------------------------------------------------------ |
| **Syfte**          | Byte av auth-env (open access / OWNER MFA / preflight)                         |
| **Längd**          | ~15 min (max 30)                                                               |
| **Föredragen tid** | Kväll eller helg — utanför klinikens journal-/fototid                          |
| **Påverkan**       | `/staff` och journal-API kan kräva omstart (~1–2 min 502 efter Render deploy)  |
| **Kommunikation**  | Informera STAFF (Slack/SMS): _"Arcana journal ~15 min, logga in igen efteråt"_ |
| **Ägare GO**       | OWNER (Fazli)                                                                  |
| **Ägare rollback** | OWNER — se [Rollback](#rollback-nödfall)                                       |

### Före fönster

1. `npm run verify:auth-go-live-prod` — notera nuvarande `OPEN` och `MFA`.
2. Bekräfta att minst **2 STAFF** kan logga in (test på en telefon).
3. (Valfritt) `npm run backup:journal-photos` om stora kod-/state-ändringar samma kväll.
4. Ha OWNER recovery-koder och Render CLI/API-nyckel tillgängliga.

### Under fönster

1. Uppdatera env i **Render** (Dashboard eller `render.yaml` + blueprint sync — se [ROLLOUT-PLAN](../../strategy/ROLLOUT-PLAN.md) §2.2).
2. Vänta tills `GET /readyz` → `ready: true` (kan ta 1–3 min).
3. Kör verifiering (nedan).

### Efter fönster

```bash
cd ~/Code/major-arcana
npm run verify:auth-go-live-prod
npm run verify:journal-photos-backup-prod
npm run verify:staff-mobile-login-prod
npm run verify:cco-mobile-pilot-prod   # kräver STAFF/OWNER i .env
curl -fsS https://arcana.hairtpclinic.se/readyz
```

**GO:** Open access av (`false`), STAFF login + foto-upload OK, OWNER MFA enligt plan.

---

## Mål-läge (go-live)

| Env                                 | Prod (mål)                                           |
| ----------------------------------- | ---------------------------------------------------- |
| `ARCANA_STAFF_JOURNAL_OPEN_ACCESS`  | `false`                                              |
| `ARCANA_AUTH_OWNER_MFA_REQUIRED`    | `true`                                               |
| `ARCANA_PREFLIGHT_READINESS_CHECKS` | `cors_strict,owner_mfa_enforced` (via `render.yaml`) |

**Render Dashboard (obligatoriskt vid go-live):** Sätt ovan i Environment → Deploy. `render.yaml` har fortfarande `ARCANA_AUTH_OWNER_MFA_REQUIRED=false` (byggfas) — synka blueprint efter env-flip. Kör `npm run owner:mfa:setup` **innan** MFA required slås på.

**Go-live-steg** (samma som `verify-auth-go-live-prod.sh` skriver ut):

1. STAFF-konton klara · `npm run owner:mfa:setup` för OWNER.
2. Sätt env ovan på Render.
3. Merge/sync blueprint (`bash scripts/verify-render-blueprint-link.sh` → `in_sync`).
4. Testa `/staff` på iPhone + Android.
5. `npm run verify:cco-mobile-pilot-prod`.

---

## Rollback (nödfall)

**Trigga rollback om:**

- STAFF kan inte logga in >15 min under kliniktid.
- Journal/foto flöde helt blockerat utan workaround.
- Felaktig MFA-konfiguration låser OWNER ute (utan recovery).

**Snabb rollback (återgå till pilotläge):**

| Env                                | Rollback-värde | Effekt                                  |
| ---------------------------------- | -------------- | --------------------------------------- |
| `ARCANA_STAFF_JOURNAL_OPEN_ACCESS` | `true`         | Journal nås utan login (endast nödfall) |
| `ARCANA_AUTH_OWNER_MFA_REQUIRED`   | `false`        | OWNER login utan MFA tills fixat        |

**Steg:**

1. Render Dashboard → **major-arcana** → Environment → sätt variablerna ovan.
2. Deploy/restart (eller vänta på blueprint sync om du ändrat `render.yaml`).
3. Verifiera:

```bash
npm run verify:auth-go-live-prod
# Förväntat efter rollback: OPEN=true, MFA=off eller false
```

4. Dokumentera i incident-notering (tid, orsak, vem som godkände).
5. Planera nytt underhållsfönster innan go-live försöks igen.

**Rör inte** (om inte separat beslut):

- `ARCANA_PUBLIC_WEB_BOOKING_ENABLED` — påverkar inte journal.
- Patient master / migration state — använd [rollback-runbook.md](./rollback-runbook.md) för state-restore, inte för auth.

---

## Övrig rollback (plattform)

- **Release / state / governance:** [rollback-runbook.md](./rollback-runbook.md)
- **Incidenter / SLO:** [incident-runbook.md](./incident-runbook.md)
- **Patientsäkerhet:** [patient-safety-incident-runbook.md](./patient-safety-incident-runbook.md)

---

## Verifieringskommandon (snabbreferens)

```bash
curl -fsS https://arcana.hairtpclinic.se/api/v1/_diag/env | jq '.env.ARCANA_STAFF_JOURNAL_OPEN_ACCESS, .env.ARCANA_AUTH_OWNER_MFA_REQUIRED'
npm run verify:auth-go-live-prod
npm run verify:journal-photos-backup-prod
npm run verify:staff-mobile-login-prod   # STAFF @390px + OWNER API MFA
bash scripts/verify-render-blueprint-link.sh
```

## STAFF login i fält (U2.4)

**Flöde:** `/staff?view=customers` → e-post + lösenord (+ tenant `hair-tp-clinic` om synligt) → token i `localStorage`/`sessionStorage` → kundlista. Passkey stöds ej i nuvarande STAFF-formulär (lösenord only).

**Automatiserad verify (kör före fälttest):**

```bash
npm run verify:u2-4-field-prep-prod       # kedjar staff-login, staff-ui, booking-policy, cco-mobile-pilot
npm run verify:staff-mobile-login-prod   # Chromium + WebKit @ iPhone 13, API-login
npm run verify:cco-mobile-pilot-prod       # bred mobil suite inkl. journal
npm run smoke:mobile-journal             # journal-photos health + UI gates
```

**Fältchecklista:** [u2-4-staff-field-login-checklist.md](./u2-4-staff-field-login-checklist.md)

Kräver i `.env`: `ARCANA_STAFF_EMAIL`, `ARCANA_STAFF_PASSWORD` (samma som prod-konton). OWNER MFA: `ARCANA_OWNER_MFA_SECRET` eller recovery.

**Fysisk enhet (endast efter automation PASS):** iPhone/Android → Add to Home Screen (PWA manifest pekar på `/staff?view=customers`) → logga in → öppna pilotkund → Filer/Journal.

**Senast granskad:** 2026-05-25
