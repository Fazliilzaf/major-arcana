# Underlag · Juridisk grind för mallutskick (inför egen order)

**Förberedelse · 2026-08-26 · read-only analys, ingen kod rörd**
Syfte: underlag så Fazli kan fatta beslut om en egen order innan
`CCO_SEND_LIVE` någonsin slås på igen.

---

## 1 · Kedjan som den ser ut idag (fil + rad)

```
Journalsignering (encounter → completed)
  └ ccoJournalBookingBridge.js:528  scheduleAftercareForCompletedEncounter
       └ ccoAftercareSchedulerStore  scheduleForCompletedEncounter
            └ jobb i kö (jobb-id = sha256, idempotent)
                 └ scheduler.js-tick (cron var 5:e minut)
                      └ ccoAftercareSchedulerStore.js:345  processJob
                           ├ templateRegistry.get(job.templateRef)
                           ├ templateRegistry.snapshot(templateRef, lang)
                           ├ renderMessage (variabler fylls, tom variabel → failed)
                           └ ccoSendActionStore.performSend({ kind: 'aftercare', … })
                                └ isDryRunDefault() → läser CCO_SEND_LIVE
                                     ├ false → dry-run (registreras, skickas ej)
                                     └ true  → riktig sändning
```

**Grinden som finns idag:** bara `CCO_SEND_LIVE` (env-flagga, sänd/icke-sänd).
**Grinden som saknas:** ingen kontroll av mallens rättsliga status.

---

## 2 · Var legalReviewStatus finns (och var den inte läses)

`src/ops/ccoTemplateRegistry.js`:

| Rad     | Vad                                                                                     |
| ------- | --------------------------------------------------------------------------------------- |
| 8       | `LEGAL_REVIEW_STATUSES = ['pending', 'in_review', 'approved', 'rejected']`              |
| 125     | normalisering, default `pending`                                                        |
| 283–284 | **ny revision nollställer** `approved → pending` (bra — redan rätt)                     |
| 319     | `setLegalReviewStatus(id, status)` — reviewer, externalRef, reviewedAt, reviewedVersion |

**Ingenstans i sändkedjan läses fältet.** `processJob` hämtar mallen via
`templateRegistry.get(job.templateRef)` och renderar via `snapshot(...)`
utan att titta på `legalReviewStatus`. Samma sak gäller andra utskicksvägar
(se §5).

---

## 3 · Föreslagen grind — fail-closed

**Punkt:** `processJob` i `ccoAftercareSchedulerStore.js`, direkt efter
`templateRegistry.get(job.templateRef)`:

```
template = templateRegistry.get(job.templateRef)
om template.legalReviewStatus !== 'approved' →
    job.lastError = 'template_not_legally_approved'
    audit('aftercare.job.legal_hold', …)
    return { id: job.id, outcome: 'legal_hold' }
```

- **Fail-closed:** jobbet stannar i kön, skickas aldrig. Inget dry-run-läge
  släpper igenom det — grinden sitter FÖRE performSend.
- **Nytt utfall `legal_hold`** (ej retry-försök): annars skulle schedulern
  prova om var femte minut och loggen dränkas. Jobbet förblir icke-terminalt
  och skickas automatiskt när mallen godkänts — ingen manuell omkörning behövs.
- **Audit-händelse** `aftercare.job.legal_hold` med templateRef + status.

**Varför här och inte i `performSend`:** det är enda punkten där både
mallen och jobbet finns i samma anrop. `performSend` tar ingen mallref och
kan inte kontrollera den. (En andra, försvarsdjupande kontroll i
`performSend` kräver att registryt skickas med — möjligt men onödigt
för v1.)

**Varför dry-run inte ska blockeras:** personalen ska kunna förhandsgranska
utkastet av en icke-godkänd mall utan att något skickas. Grinden gäller
sändning, inte rendering.

---

## 4 · Öppna frågor till Fazli (beslutas i ordern)

1. **Vilka malltyper kräver approved?** Alla fem (aftercare-kadenserna) eller
   bara de patientinriktade? Registryt har malltyper — grinden kan villkoras.
2. **Vad händer med blockerade jobb?** Förslag: `legal_hold` i kön (automatisk
   frisläppning vid godkänd mall). Alternativ: terminal `cancelled` med
   staff-notis — sämre, för då måste jobben återskapas.
3. **Vem får sätta `approved`?** `setLegalReviewStatus` tar `opts.role` idag.
   Ska det krävas OWNER (juridikroll), och ska `reviewer`/`externalRef` vara
   obligatoriska vid approved?
4. **Ska en godkänd mall frysa revisionen?** Idag nollställer ny revision
   godkännandet — rätt beteende. Bekräfta att det ska vara så även efter
   grinden.

---

## 5 · Andra sändvägar som saknar samma kontroll (noterat, ej i v1-scope)

- `ccoPortalReplyNotification.js` — portal-svar, grinden är bara
  `CCO_SEND_LIVE` + egen opt-in-null. Inga mallar ur registryt.
- `ccoComposeSend.js` / `ccoOfferQuickStore.js` — manuella utskick via
  staff, inte mallkadens. Värda en separat genomgång, men inte samma
  automatiserade risk.

---

## 6 · Testyta att kräva i ordern

- Enhetstest: `processJob` med mall i varje status — `pending`/`in_review`/
  `rejected` → `legal_hold`, `approved` → normalt flöde; mall som godkänns
  EFTER att jobbet hamnat i hold → nästa tick skickar.
- Regression: journalsignering → jobb skapas som idag (schemaläggningen
  ändras inte); dry-run-läge fortfarande fritt för alla statusar.
- Inget test som kräver riktig sändning — mockad mailer.
