# ORD-42 — Offert-öppningsspårning ("öppnad · N:e gången")

**Skapad:** 2026-06-09 (Claude PM)
**Assignee:** Codex (backend — open-tracking + commercial-store + timeline-event)
**Claude-spår:** frontend konsumerar redan timeline-events i Historik (gemensamma kortet) — ingen frontend-ändring behövs utöver vad som finns.
**Prio:** P2 · gör kundkortets Historik komplett mot mockupen ("Offert O-1024 öppnad · 2:a gången")
**Relaterat:** gemensamma kortets Historik (commit beebfeee — visar offer_sent + betalningar + besök), `journal-timeline`-API:t, [[project_gemensamt_kort_live_render_2026_06_09]]

---

## Mål / bakgrund

Kundkortets Historik (gemensamma kortet) visar nu **Offert skickad**, betalningar, besök och första kontakt. Men **"Offert öppnad (2:a gången)"** går inte att visa — det finns **ingen öppningsspårning** för offerter någonstans i systemet:

- `ccoCommercialStore` har `quoteStatus`, `quoteSentAt`, `quoteAcceptedAt`, `offerDocumentId`, `coolingOffEndsAt` — men **inga öppnings-fält**.
- `journal-timeline` (server.js ~6640) emittar `offer_sent`/`offer_created` (ur `data/cco-offers-quick.json`) — men **inget `offer_opened`**.
- Offerten visas för kund via `/api/v1/cco-commercial/offer-document` (kundens vy-URL) + esign via **GetAccept**.

Mål: logga när **kunden** öppnar offerten → visa "Offert öppnad · N:e gången" i Historik. Det är affärskritiskt (öppnad-men-ej-svarat = påminnelse-signal, redan en gate i Smart nästa steg).

## Scope (Codex — backend)

### 1. Fånga öppningar (källor, i prioritetsordning)

- **(a) Kundens vy av offert-dokumentet:** när `/api/v1/cco-commercial/offer-document` (eller portal-/`offerSignUrl`-vyn) öppnas av **kunden** (ej personal) → registrera en öppning. Skilj kund-öppning från personal-förhandsgranskning (filtrera på actor/roll, eller en explicit `?viewer=customer`/token-baserad kundvy).
- **(b) GetAccept "document viewed"-webhook** (om tillgängligt): GetAccept skickar view-events → registrera öppning därifrån (mest tillförlitligt för mail-öppningar). Verifiera webhook-signatur.
- **(c) (valfritt) Mail-spårpixel:** 1×1-pixel i offert-mailet → `GET /api/v1/cco-commercial/offer/:token/open-beacon` → registrera. **Integritet:** ingen PII i URL:en (endast offert-token), beaconen returnerar tom pixel.

### 2. Lagra öppningar (`ccoCommercialStore`)

Lägg fält på commercial-caset: `quoteOpens: [{ ts, source }]`, `quoteOpenCount` (antal), `quoteOpenedAt` (senaste). Ny metod `recordQuoteOpen({ tenantId, patientId, source })` som pushar + räknar upp. **Idempotens:** debounce dubbel-träffar inom ~30 s (samma källa) så en enda visning ej dubbelräknas.

### 3. Timeline-event (`journal-timeline`, server.js)

Emittera **`offer_opened`**-events ur `quoteOpens`: `title: "Offert {ref} öppnad"`, `ts: open.ts`, `tone: 'warn'`, `detail.openIndex: N`. När `openIndex > 1` → frontend visar "N:e gången" (2:a/3:e…). En event per öppning (eller en med senaste + count — välj det som matchar mockupens "2:a gången").

### 4. Kort (Claude — redan klart)

Gemensamma kortets Historik merge:ar redan timeline-events → `offer_opened` dyker upp automatiskt. Lägg ev. en liten frontend-tweak: visa "N:e gången"-tagg ur `detail.openIndex` (Claude gör den när events finns).

## FÖRBJUDET / integritet

- **Räkna ALDRIG personal-/interna öppningar** som kund-öppningar.
- **Ingen PII i beacon-/webhook-URL:er** (endast offert-token).
- **Aldrig auto-agera** på en öppning (ingen auto-påminnelse) — öppningen är bara en signal; människa agerar (befintlig Smart nästa steg-gate).
- Ingen extern AI på offert-innehåll. Webhook-signatur verifieras.

## Gates

- `npm run check:syntax` · `npm run lint:no-bypass` · `npm run test:unit`
- Test: (a) `recordQuoteOpen` ×2 → `quoteOpenCount=2`, `quoteOpens.length=2`, debounce hindrar dubbel inom 30 s; (b) timeline emitterar `offer_opened` med `openIndex`; (c) personal-vy räknas EJ.
- Commit refererar ORD-42.

## Rapport till Claude (UAT)

Commit + filer + bevis: en kund-öppning → `quoteOpenCount` upp + `offer_opened` i `journal-timeline` → syns i kundkortets Historik som "Offert öppnad" (och "2:a gången" vid andra öppningen). Claude UAT:ar i /staff (gemensamma kortet).

## Status

| Fas                                           | Status          |
| --------------------------------------------- | --------------- |
| Order skapad (repo + Notion)                  | KLAR 2026-06-09 |
| Codex: open-capture (portal/GetAccept/pixel)  | Väntar          |
| Codex: commercial-store quoteOpens + recordet | Väntar          |
| Codex: timeline offer_opened-event            | Väntar          |
| Claude: "N:e gången"-tagg + UAT i kortet      | Väntar          |
