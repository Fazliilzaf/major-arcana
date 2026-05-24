# Major Arcana — masterlista (en sida)

Senast uppdaterad: **2026-05-24**  
Prod: **https://arcana.hairtpclinic.se** · Repo: `~/Code/major-arcana`

**Du är här:** Mobil pilot **Fas 5.5–5.6** (manuellt) + kundlista/Drive på prod.

**Notion (samma lista, bockbar):** [Major Arcana — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6)

Detaljdokument finns kvar i [PROJECT-CHECKLIST.md](./PROJECT-CHECKLIST.md) och [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md). **Den här sidan är den enda du behöver följa dagligen.**

---

## P0 — Blockerar klinik-pilot

| # | Uppgift | Vem | Status |
|---|---------|-----|--------|
| 1 | **Fas 5.6** — ≥2 personal, ≥5 riktiga konsultationer, feedback + GO/NO-GO | Du + personal | ☐ |
| 2 | **Fas 5.5** — enhetstabell: Android Chrome + iPad (iPhone påbörjad) | Du | ☐ |
| 3 | **STAFF-login på mobil** — iPhone + Android efter inloggning | Du | ☐ |
| 4 | **Kundlista mobil UI** — smoke med 7 349 kunder (`verify:staff-ui-prod`) | Agent/Du | ☐ |
| 5 | **Drive-PDF på prod** — Google Drive API / volym (ej 86 GB zip på 2 GB disk) | Agent | ☐ |
| 6 | Personal har läst [mobilinstruktion](./cco-mobile-staff-instructions.md) | Personal | ☐ |

---

## P1 — Auth & drift polish

| # | Uppgift | Vem | Status |
|---|---------|-----|--------|
| 7 | Rollback-plan + underhållsfönster dokumenterat | Agent | ☐ |
| 8 | Backup journal-photos schemalagd (`npm run backup:journal-photos`) | Agent | ☐ |
| 9 | Notion: verify prod efter duplicate-cleanup (30 maj) | Du | ☐ |

---

## P2 — Nästa våg (efter pilot GO)

| # | Uppgift | Vem | Status |
|---|---------|-----|--------|
| 10 | Post-op Fas 1 — Playwright smoke `/uppfoljning/[token]` prod | Agent | ☐ |
| 13 | Pipedrive People+Deals export | Agent | ☐ |
| 14 | Plan A valfritt: Resend patient-mail + bokning→journal koppling | Agent | ☐ |

---

## Klart (senaste veckan)

- [x] **Juridiska underlag** — godkända av advokater, följer svensk lag (2026-05-24)
- [x] Mobil UX sweep #1–16 (kod + prod)
- [x] Plan A bokning — automated GO (2026-05-24)
- [x] Open access av — login krävs
- [x] OWNER MFA enforced i prod
- [x] iOS blur/touch-block fix — stängda modal-backdrops (`3364875`)
- [x] Kundlista API smoke — 7 349 kunder
- [x] Migration + avtal + journal kod prod
- [x] PDL juridiskt signerat / extern granskning (2026-05-24)
- [x] Render EU Frankfurt verifierad i Dashboard (2026-05-24)
- [x] Post-op Fas 1 — 4 beslut + Graph send live (`verify:post-op-graph-prod`, 2026-05-24)

---

## Backlog (medvetet inte nu)

- Full månadskalender mobil (#17 i UX sweep)
- cco-next-release parity (#18)
- Full bookingmotor + påminnelser
- CMO live connectors
- Compliance Fas 9 (retention, GDPR, Art. 30)

---

## Snabb verify (kör vid tvivel)

```bash
npm run verify:cco-mobile-pilot-prod
npm run verify:mobile-staff-regression-prod
npm run verify:customer-list-prod
npm run verify:auth-go-live-prod
curl -fsS https://arcana.hairtpclinic.se/readyz
```

**Pilot-detalj:** [cco-mobile-staff-pilot-checklist.md](./cco-mobile-staff-pilot-checklist.md)
