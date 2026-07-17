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
- `proceededToTreatment` — offert → behandling (nämnare för `offerToTreatment`)
- `stoppedAtOffer` — offert äldre än X dagar utan behandling (**hittills**, inte definitivt tappad)
- `rates: { consultToOffer, offerToTreatment, consultToTreatment }` (null om nämnare 0)
- `coverage: { bookingsMatched, bookingsTotal, offersMatched, offersTotal, via_offer, via_booking_history }`

## Klassregler

1. Konsultation: `bookingKind === 'consultation'` (ORD-76) eller tjänstenamn.
2. Offert: `quoteStatus` ∈ {sent, accepted} + `quoteSentAt`.
3. Behandling / "gått vidare": `paying` eller `included_in_package`, eller `classifyService` ∈ {hair_transplant, prp} — **inte** ny konsultation.
4. Matchning: patientId via email/clientoId/telefon — annars `unknown` i coverage, aldrig gissad konvertering. Intern nyckel får falla tillbaka på `clientoCustomerId` / e-post.

## Komplettering (ägare 2026-07-17)

Konsult→behandling räknas **även** ur Cliento-bokningshistorik utan matchad offert.
`coverage.via_offer` / `coverage.via_booking_history` attributerar konverteringarna
(ömsesidigt uteslutande; offert vinner när den finns före behandling).

## Integritet

Mot CEO: endast antal + procent. Inga namn, e-post, personnummer, anteckningar.

## CEO-uppföljare (Claude)

Tratt-sektion i fx-designen + agent-insikter (t.ex. följ upp offerter äldre än 3 veckor).
Visa gärna `via_offer` vs `via_booking_history` i fotnot.
