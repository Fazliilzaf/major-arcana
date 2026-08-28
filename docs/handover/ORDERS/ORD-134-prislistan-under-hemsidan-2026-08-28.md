# ORD-134 · Prislistan i systemet ligger under hemsidan

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`dae86fb5`)
**Föregås av:** ORD-133 (redo-delen klar — kopplingen serviceId → pris är nu dragen och live)
**Kritisk:** Ja — offerten hämtar nu pris ur en katalog som är tre månader gammal.

---

## Problemet

`migration/meridiq-service-catalog.json` har `exportedAt: 2026-05-25` och
`source: "Meridiq API live"` — men exporten är **tre månader gammal**.

**24 av 52 priser stämmer inte med hemsidan.** Kopplingen som ORD-133 drog
(offert → `resolveServicePrice(serviceId)`) gör felet levande: offerten visar
nu ett pris som kan vara fel mot kunden.

Konkret exempel:

| Tjänst | Systemet | Hemsidan |
| --- | --- | --- |
| FUE Hårtransplantation 2 500 grafts | **51 000 kr** | **54 000 kr** ("bindande fastpris") |

**Mönstret är exakt +3 000 kr på varenda transplantation** — en prishöjning
som aldrig nått Meridiq. Det är inte 24 slumpmässiga skrivfel, det är ett
systematiskt glapp mellan två källor.

---

## Ordningen (går före arbetsbladet, uppföljningen och ordinationen)

1. **Svara först på VAR felet sitter** — i exporten eller i Meridiq. Ingen
   rättar något innan rotorsaken är fastställd.
2. **Rätta inte de 24 raderna för hand.** Rättas katalogen manuellt är källan
   fortfarande gammal, och det glider isär igen vid nästa export.
3. **Kontrollskript som LARMAR, inte skriver.** En prislista är ett
   affärsbeslut. Kod får upptäcka att katalog och hemsida glidit isär — den
   får aldrig avgöra vilken som har rätt.
4. **Offertskydd under tiden** — antingen pausad prisresolvering eller tydlig
   "preliminär"-märkning. Det är Fazlis val.
5. **Visa `exportedAt`.** Fältet finns i filen men syns ingenstans — det är
   därför en tre månader gammal prislista kunde köras skarpt utan att någon
   reagerade.

---

## Frågor till Fazli (bara du kan svara)

1. **FUE Hårtransplantation 4 500 grafts · 67 000 kr** — säljer ni den
   fortfarande? Finns i systemet, men inte på hemsidan.
2. **DHI Hårtransplantation 3 000 grafts · 65 000 kr** — säljer ni den
   fortfarande? Finns i systemet, men inte på hemsidan.

---

## Godkänt när

- Rotorsaken är fastställd (exporten vs Meridiq).
- Katalogen är uppdaterad från rätt källa — inte handrättad.
- Kontrollskriptet larmar vid divergens (skriver aldrig).
- Offerten har skydd (pausad resolvering eller "preliminär") tills prislistan är fräsch.
- `exportedAt` är synligt där prislistan används.
- CCO_SEND_LIVE orörd.
