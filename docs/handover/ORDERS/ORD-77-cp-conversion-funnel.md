# ORD-77 · CP konverteringstratt: konsultation → offert → behandling

**Status:** PR FÖRBEREDD · **MERGE BLOCKERAD** tills Drive-ingest-frysen släpper (samma gate som ORD-74/75/76)  
**Repo:** major-arcana · **Prio:** P2 · **Byggare:** CURSOR  
**Notion:** [ORD-77 · CP konverteringstratt](https://app.notion.com/p/3a0060ccc15b812c84efda556f1f25cb)  
**OBS:** Separat från CM-ORD-77 (avdragsbevis, omnumrerad f.d. ORD-75). Levereras i samma PR-gren som ORD-75/76.

---

## Inventering (check-before-code)

| Del                      | Finns?  | Var                                                               | Gap                            |
| ------------------------ | ------- | ----------------------------------------------------------------- | ------------------------------ |
| Konsultationer + no-show | hel     | Cliento + ORD-76 `bookingKind=consultation`                       | —                              |
| Offerter per patient     | hel     | `ccoCommercialStore` (`customerId`, `quoteSentAt`, `quoteStatus`) | —                              |
| Cliento → patientId      | hel     | `buildPatientLookupMaps` / `resolvePatientIdFromClientoBooking`   | —                              |
| Behandling efter offert  | del     | `classifyService` hair_transplant/prp                             | journal steg 8 ej inkopplat v1 |
| CP funnel-KPI            | **nej** | —                                                                 | denna order                    |
| CEO tratt-UI             | nej     | arcana-ceo-agent                                                  | Claude efter merge             |

---

## Payload (endast aggregat — ingen persondata)

```js
conversionFunnel: {
  stoppedAtOfferDays: 60,
  period: { /* same-day månadsfönster */ },
  rolling90d: { /* rullande 90 dagar */ },
}
```

Per fönster:

- `consultations: { booked, show, noShow }`
- `offersSent`
- `proceededToTreatment`
- `stoppedAtOffer` — offert äldre än X dagar utan behandling (**hittills**, inte definitivt tappad)
- `rates: { consultToOffer, offerToTreatment, consultToTreatment }` (null om nämnare 0)
- `coverage: { bookingsMatched, bookingsTotal, offersMatched, offersTotal }`

## Klassregler

1. Konsultation: `bookingKind === 'consultation'` (ORD-76) eller tjänstenamn.
2. Offert: `quoteStatus` ∈ {sent, accepted} + `quoteSentAt`.
3. Behandling: `classifyService` ∈ {hair_transplant, prp} och **inte** consultation/follow_up/included_in_package.
4. Matchning: patientId via email/clientoId/telefon — annars `unknown` i coverage, aldrig gissad konvertering.

## Integritet

Mot CEO: endast antal + procent. Inga namn, e-post, personnummer, anteckningar.

## CEO-uppföljare (Claude)

Tratt-sektion i fx-designen + agent-insikter (t.ex. följ upp offerter äldre än 3 veckor).
