---
owner: CCO
status: active
---

# Major Arcana Index

Det här är en samlad ingång till Major Arcana-materialet i repo:t.

Regel:
- Originalfilerna här under ska inte skrivas om eller flyttas.
- Det här indexet är bara en pekare och läsordning.
- Om något senare ska konsolideras ska vi göra det genom nya sammanfattningar, inte genom att förstöra källorna.

## Läsordning

0. Nuläge (uppdateras)
   - [ops/status-2026-05-12.md](./ops/status-2026-05-12.md)
   - [strategy/PROJECT-CHECKLIST.md](./strategy/PROJECT-CHECKLIST.md) — **samlad projektchecklista**
   - Gemensam sanningskälla: verifiering, spår (Cursor vs Cloud AI), nästa tre leveranser.

1. Ursprung och mål
   - [Arcana-mal-original-2026-02-25.txt](./archives/input/arcana-mal-original-2026-02-25.txt)
   - Beskriver varför Arcana blev ett OS och inte bara en chatt.

2. Pilot 1 och vad som faktiskt levererades
   - [Pilot-1-slutrapport.md](./Pilot-1-slutrapport.md)
   - Summerar vad som redan är byggt och verifierat.

3. Fas 2 och prioriteringsordning
   - [strategy/arcana-phase-2-masterplan.md](./strategy/arcana-phase-2-masterplan.md)
   - Låser ordningen för hårdning, incident/SLA, automation, risk precision och patientkanal.

4. Drift, release och slutlås
   - [ops/arcana-finalization-runbook.md](./ops/arcana-finalization-runbook.md)
   - Visar hur Arcana ska driftsättas, verifieras och låsas inför bredare go-live.

5. UI, brand och Major Arcana-ytan
   - [major-arcana-color-inventory.md](./major-arcana-color-inventory.md)
   - Används som visuell referens för Major Arcana-språket och tokeninventering.

6. CCO och operativ struktur
   - [cco-active-index.md](./cco-active-index.md)
   - [cco-mail-foundation-status.md](./cco-mail-foundation-status.md)
   - [cco-mail-foundation-working-sequence.md](./cco-mail-foundation-working-sequence.md)
   - Bra för att förstå hur Major Arcana kopplas till den operativa CCO-ytan.

7. Övriga stödmaterial
   - [cco-next-migration-prep.md](./cco-next-migration-prep.md)
   - [cco-new-salvage-matrix.md](./cco-new-salvage-matrix.md)
   - [cco-mail-mime-fidelity-plan.md](./cco-mail-mime-fidelity-plan.md)

8. Publik webb (hairtpclinic.com)
   - [strategy/web-hairtpclinic-com-masterplan.md](./strategy/web-hairtpclinic-com-masterplan.md)
   - [ops/status-web-2026-05-19.md](./ops/status-web-2026-05-19.md) (senaste, Workstream B+C levererade)
   - [ops/status-web-2026-05-18.md](./ops/status-web-2026-05-18.md) (initial sprint, EN-paritet + Workstream A)
   - Den publika klinikwebben — egen Next.js-monorepo, separat deploy (Vercel),
     men ägs av samma roadmap. Patientkanal-pelaren är fortsatt blockerad i
     Arcana-core; webben är publik kanal för konvertering och SEO.
   - Repo (lokal): **hairtpclinic-web** — separat Next.js-monorepo (Vercel), ej i detta repo

## Canon i kort form

Om du vill läsa Major Arcana som en enda berättelse, använd denna sammanfattning:

- Arcana är ett säkert, spårbart, multi-tenant operativsystem för kliniker.
- Först intern adminnytta och kontrollsystem.
- Sedan interna agenter och driftautomation.
- Sist patientkanal, när hårdning och risk är klar.
- AI får generera utkast, men inte publicera själv.
- Allt viktigt ska vara versionerat, auditerbart och tenant-separerat.

## Var man ska börja om man tappat tråden

- För **nuläge och vad som gäller nu**: läs [ops/status-2026-05-12.md](./ops/status-2026-05-12.md) (eller senaste `ops/status-*.md`).
- För strategi: läs målfilen först.
- För leveransstatus: läs pilotrapporten.
- För nästa steg: läs phase 2 masterplanen.
- För drift och release: läs runbooken.
- För CCO/informationsstruktur: läs CCO-indexet.
- För **publika webben** (hairtpclinic.com): läs [strategy/web-hairtpclinic-com-masterplan.md](./strategy/web-hairtpclinic-com-masterplan.md) + senaste `ops/status-web-*.md`.

