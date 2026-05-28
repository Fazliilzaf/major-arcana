---
owner: Ops
status: active
---

# Public Booking Go-Live Runbook

## Förutsättningar

Innan `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=true` flippas:

- [ ] Kalender R1–R4 klar (✅ 2026-05-27)
- [ ] Fas 2 Block 1–4 klar (bekräftelse, påminnelser, avboka, omboka) (✅ 2026-05-27)
- [ ] Full tjänstekatalog aktiv (12 tjänster) (✅)
- [ ] SMS-påminnelser konfigurerade (46elks) (✅)
- [ ] Resend/Graph mail fungerar (✅)
- [ ] Fazlis explicita OK

## Steg för go-live

1. **Render Dashboard** → `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=true`
2. Vänta ~2 min på deploy
3. Verifiera: `curl https://arcana.hairtpclinic.se/api/public/booking-engine/catalog?host=hairtpclinic.com`
   - Ska returnera 200 med alla tjänster (inte 503)
4. Testa publik bokning: `https://hairtpclinic.com/boka`
5. Bekräfta att operatör ser bokningen i CCO

## Rollback

Om något går fel:
1. Sätt `ARCANA_PUBLIC_WEB_BOOKING_ENABLED=false` i Render
2. Patienter faller tillbaka till Cliento-widget
3. Ingen data förloras

## Cliento-avveckling

Efter go-live + 2 veckor utan problem:
1. Ta bort Cliento-widget från hairtpclinic.com
2. Redirect `/boka` → Arcana engine
3. Markera legacy `ccoBookingStore.js` + `ccoBookings.js` som avvecklade (redan @deprecated)

## Ansvarig

Beslut: Fazli Krasniqi (OWNER)
Ingen ändring utan explicit OK.
