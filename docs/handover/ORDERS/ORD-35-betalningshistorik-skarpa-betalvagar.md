# ORD-35 — Betalningshistorik + skarpa betalvägar (kundkort)

**Skapad:** 2026-06-08 (Claude PM)
**Assignee:** Codex (backend-aggregering + endpoint-kontrakt; Claude wirar frontend efter)
**Claude-spår:** frontend-wiring av Förbered-knapparna + UAT
**Prio:** P1 · money-relaterat — säkerhet före allt
**Bygger på:** Betalnings-sektionen i kundkortet (commit b8b986d0)

---

## Bakgrund / mål

Kundkortet har nu en **Betalnings-sektion** (committad offert följer med + `paymentStatus` + betalvägar Swish/Medical Finance/kort/faktura). Två saker saknas, båda backend:

1. **Betalningshistorik finns inte i datan.** `commercialCase` bär bara nuvarande `paymentStatus` + `quotedAmount`/`depositAmount` — inga tidigare betalningar. Vi vill se _hur_ det betalades (metod, datum, belopp, faktura).
2. **Förbered-knapparna är stubbar** (visar bara en ruta) — ska wiras mot riktiga endpoints, men **med bekräftelse, aldrig auto-pengar**.

## Scope (Codex — backend)

1. **Aggregera betalningshistorik per patient** → ny readout `paymentHistory: [{ dateIso, method, amountLabel, status, ref, source }]`:
   - Swish-betalningar ur `ccoSwishStore` (kopplat på patient/conversation/customerId).
   - Fortnox-fakturor om fakturadata finns (kund → fakturor, betald/obetald, förfallodatum). Om Fortnox-fakturasync saknas: notera det i rapporten — då blir historiken Swish-only tills fakturasync byggs.
   - Exponera `paymentHistory` + befintliga `paymentStatus`/`quotedAmount`/`depositAmount` i **dossier-bundle / patient/summary**-payloaden (samma väg som driveFiles/journalEntries) så panelen kan rendera.
2. **Betal-endpoint-kontrakt (confirm-gated, ROLE_OWNER/STAFF):**
   - Swish: POST `/api/v1/cco-swish/payment-request` finns redan — bekräfta params (belopp, patient/payeeAlias) + att den returnerar en **förfrågan att skicka**, inte auto-drar.
   - Kort/betalningslänk: skapa länk via `ccoIntegrations` (Stripe/kortlänk) — returnera länk, ingen auto-debet.
   - Faktura: skapa Fortnox-fakturautkast (om möjligt) — returnera utkast/ref, ingen auto-bokföring.
   - Medical Finance: ingen API — returnera info/kontaktväg (det är extern finansiering).
   - Varje endpoint: kräver explicita params + (för skarpa skick) `confirmText`/bekräftelse, audit-loggar. Dokumentera kontrakten i rapporten så Claude kan wira Förbered-knapparna.

## FÖRBJUDET (money-safety)

- ALDRIG auto-exekvera betalning/överföring/debet. Knapp = förbered/skapa förfrågan → människa bekräftar och skickar/slutför.
- Lagra ALDRIG kortnummer/PII i klartext eller URL.
- Ändra inte `paymentStatus`-logiken (ccoCommercialStore) — bara läs + aggregera.
- Inga credentials i kod.

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Test: paymentHistory-aggregering (Swish + ev. Fortnox), tom-historik-fall, endpoint kräver bekräftelse.
- Commit refererar ORD-35.

## Rapport till Claude

Commit + filer + (a) `paymentHistory`-fältets form i dossier-bundle, (b) endpoint-kontrakt för Swish/kort/faktura (params + confirm + svar), (c) om Fortnox-fakturasync saknas. Claude wirar sedan Förbered-knapparna (data-kk-betvag) mot kontrakten med confirm + UAT.

## Status

| Fas                                    | Status          |
| -------------------------------------- | --------------- |
| Order skapad (repo + Notion)           | KLAR 2026-06-08 |
| Codex: aggregering + endpoint-kontrakt | Väntar          |
| Claude: frontend-wiring + UAT          | Väntar          |
