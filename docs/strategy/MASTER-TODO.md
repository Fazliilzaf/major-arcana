# Major Arcana — masterlista (en sida)

Senast uppdaterad: **2026-05-20**  
Prod: **https://arcana.hairtpclinic.se** · Repo: `~/Code/major-arcana`

**Du är här:** Drive-PDF på prod + auth polish + bred drift. **Fas 5.5–5.6 manuellt uppskjuten.**

**Notion (samma lista, bockbar):** [Major Arcana — Master TODO](https://www.notion.so/6d5ae9dabf314678959270ba86a6cbf6)

Detaljdokument finns kvar i [PROJECT-CHECKLIST.md](./PROJECT-CHECKLIST.md) och [ROLLOUT-PLAN.md](./ROLLOUT-PLAN.md). **Den här sidan är den enda du behöver följa dagligen.**

---

## P0 — Blockerar bred drift

| # | Uppgift | Vem | Status |
|---|---------|-----|--------|
| 1 | **Drive-PDF på prod** — Google Drive API / volym (ej 86 GB zip på 2 GB disk) | Agent | ☐ |

---

## P1 — Auth & drift polish

| # | Uppgift | Vem | Status |
|---|---------|-----|--------|
| 4 | Rollback-plan + underhållsfönster dokumenterat | Agent | ☐ |
| 5 | Backup journal-photos schemalagd (`npm run backup:journal-photos`) | Agent | ☐ |
| 6 | Notion: verify prod efter duplicate-cleanup (30 maj) | Du | ☐ |

---

## P2 — Nästa våg

| # | Uppgift | Vem | Status |
|---|---------|-----|--------|
| 7 | Post-op Fas 1 — Playwright smoke `/uppfoljning/[token]` prod | Agent | ☐ |
| 8 | Pipedrive People+Deals export | Agent | ☑ |
| 9 | Plan A valfritt: Resend patient-mail + bokning→journal koppling | Agent | ☐ |

---

## Klart (senaste veckan)

- [x] **Mobil pilot GO (automation)** — `verify:staff-ui-prod` 13/13, full kundbas (2026-05-20)
- [x] **Kundlista mobil UI smoke** — 7 351 kunder prod
- [x] **Juridiska underlag** — godkända av advokater, följer svensk lag (2026-05-24)
- [x] Mobil UX sweep #1–16 (kod + prod)
- [x] Plan A bokning — automated GO (2026-05-24)
- [x] Open access av — login krävs
- [x] OWNER MFA enforced i prod
- [x] iOS blur/touch-block fix — stängda modal-backdrops (`3364875`)
- [x] Kundlista API smoke — 7 349+ kunder
- [x] Migration + avtal + journal kod prod
- [x] PDL juridiskt signerat / extern granskning (2026-05-24)
- [x] Render EU Frankfurt verifierad i Dashboard (2026-05-24)
- [x] Post-op Fas 1 — 4 beslut + Graph send live (`verify:post-op-graph-prod`, 2026-05-24)

---

## Backlog (medvetet inte nu)

- **Personal + utbildning** — mobilinstruktion + `/staff`-intro (hanteras externt, ej blocker)
- **Fas 5.5–5.6 manuell pilot** — enhetstabell + ≥5 konsultationer med personal ([checklista](./cco-mobile-staff-pilot-checklist.md))
- Full månadskalender mobil (#17 i UX sweep)
- cco-next-release parity (#18)
- Full bookingmotor + påminnelser
- CMO live connectors
- Compliance Fas 9 (retention, GDPR, Art. 30)

---

## Snabb verify (kör vid tvivel)

```bash
npm run verify:staff-ui-prod
npm run verify:cco-mobile-pilot-prod
npm run verify:customer-list-prod
npm run verify:auth-go-live-prod
curl -fsS https://arcana.hairtpclinic.se/readyz
```
