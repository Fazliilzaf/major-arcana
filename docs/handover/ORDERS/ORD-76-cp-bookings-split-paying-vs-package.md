# ORD-76 · CP: betalande vs ingår-i-TP-paketet (Cliento-pris)

**Status:** PR FÖRBEREDD · **MERGE BLOCKERAD** tills Drive-ingest-frysen släpper (samma gate som ORD-74/75)  
**Repo:** major-arcana · **Prio:** P2 · **Byggare:** CURSOR  
**Notion:** [ORD-76 · CP bookings split](https://app.notion.com/p/3a0060ccc15b81189675c0a267189ee6)  
**OBS:** Separat från IMAP-OOM-ORD-76 — samma ORD-nummer, annat spår. Levereras tillsammans med ORD-75.

---

## Inventering (check-before-code)

| Del                                   | Finns?  | Var                                | Gap                |
| ------------------------------------- | ------- | ---------------------------------- | ------------------ |
| Cliento `serviceLabel` + `notes`      | hel     | `clientoBookingStore` / CSV-import | —                  |
| Cliento **pris** på bokning           | **nej** | CSV/API synkas inte                | måste kompletteras |
| `composeClinicMetrics` bookings total | hel     | `clinicPerformance.js`             | ingen split        |
| CEO-fotnot för split                  | nej     | arcana-ceo-agent                   | Claude efter merge |

---

## Bakgrund

Hair TP fastpris inkluderar PRP + uppföljningar + eftervård. Dessa bokningar fyller kalendern utan ny intäkt. Cliento-markör: paketbokningar ofta **0 kr** på tjänster som "PRP efter TP"; betalande bär pris > 0. Konsultationer är 0 kr men är säljled — egen klass.

## Klassificering (`bookingKind`)

`paying` | `included_in_package` | `consultation` | `unknown`

1. **Pris** (primär): `priceSek > 0` → `paying`
2. **Tjänstenamn** (sekundär): efter TP / uppföljning / OP-dagen / underhåll efter TP → `included_in_package`; konsultation → `consultation`
3. **Anteckningar** (tertiär, endast internt): "ingår i TP-paketet", "utan kostnad", m.m.
4. Annars → `unknown` (**aldrig gissa**)

**Integritetsgräns:** nottext får användas inne i gatewayn för klass — **aldrig** exponeras till CEO. Endast `bookingKind` + aggregat lämnar systemet.

## Payload

`bookingsSplit: { current|previous: { paying, includedInPackage, consultations, unknown } }`  
`bookings.current` förblir totalen (bakåtkompatibelt).

## Synk-komplettering

CSV-import + store får `priceSek` (kolumner: Pris / Belopp / Pris (inkl. moms) / …). Historik utan pris → namn/noter eller `unknown`.

## Forbidden

- Merge under ingest-frysen
- Skicka anteckningstext till CEO
- Tyst omklassning av `unknown`
