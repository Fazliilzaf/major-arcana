# ORD-134 · Prislistan i systemet ligger under hemsidan

**Arbetsorder · 2026-08-28**
**Bas:** `main` (`0e723425`)
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

Mönstret är +3 000 kr på de flesta transplantationer — men **inte alla** (se
fällan nedan).

---

## Svarade frågor (Fazli)

| Tjänst | Systemet | Rätt |
| --- | --- | --- |
| FUE 4 500 grafts | 67 000 kr | **69 000 kr** → +2 000 |
| DHI 3 000 grafts | 65 000 kr | **68 000 kr** → +3 000 |

Båda säljs fortfarande, men **står inte på hemsidan**. En tjänst som offereras
men inte publiceras går inte att stämma av mot någonting — lägg upp dem på
prissidan.

---

## Fällan: rätta rad för rad, inte "+3 000 på alla"

**FUE 4 500 bryter mönstret.** Alla andra transplantationer ligger exakt
3 000 kr fel — den ligger **2 000 kr** fel. Ett skript som "lägger på 3 000
på alla" skulle sätta 70 000 och bli fel igen, den här gången för dyrt.

**Rättningen görs rad för rad mot listan — priserna räknas aldrig fram.**

---

## Ordningen (går före arbetsbladet, uppföljningen och ordinationen)

1. **Svara först på VAR felet sitter** — i exporten eller i Meridiq. Ingen
   rättar något innan rotorsaken är fastställd.
2. **Rätta rad för rad mot listan** — inte handräkna, inte "+3 000 på alla".
3. **Kontrollskript som LARMAR, inte skriver.** Kod upptäcker att katalog och
   hemsida glidit isär — den avgör aldrig vilken som har rätt.
4. **Offertskydd under tiden** — pausad prisresolvering eller "preliminär"
   (Fazlis val).
5. **Redigeringsyta för kliniken** — den djupaste fixen (krav nedan).
6. **Visa `exportedAt`** — en gammal prislista får aldrig köras skarpt osedd.

---

## Punkt 5 · Redigeringsytan — fyra krav

Prislistan hann bli tre månader gammal **just för att ingen på kliniken kunde
röra den**. Så länge en prisändring kräver en agent eller en JSON-fil kommer
den att glida igen. En yta där ni själva lägger till tjänst, ändrar pris och
avaktiverar tar bort själva orsaken.

1. **Riktningen mot Meridiq explicit.** En lokal ändring får inte tyst skrivas
   över vid nästa import — och inte heller tyst skriva över Meridiq. Den
   frågan avgör om lösningen håller över tid.
2. **Historik på varje prisändring** — vem, när, från vilket värde. Och en
   offert som redan gått ut behåller sitt pris. "Länka, kopiera inte" gäller
   framåt, inte bakåt.
3. **Egen behörighet.** Att sätta pris är inte samma sak som att skriva journal.
4. **Ingen prisändring automatiskt.** Ytan är för människor.

**Rättningen görs först** — annars byggs redigeringsytan ovanpå fel data.

---

## Godkänt när

- Rotorsaken är fastställd (exporten vs Meridiq).
- Katalogen är rättad rad för rad mot listan (inte beräknad).
- Kontrollskriptet larmar vid divergens (skriver aldrig).
- Offerten har skydd (paus eller "preliminär") tills prislistan är fräsch.
- Redigeringsytan uppfyller de fyra kraven — byggd på rättad data.
- `exportedAt` är synligt där prislistan används.
- CCO_SEND_LIVE orörd.
