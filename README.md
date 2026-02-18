# Arcana (Hair TP Clinic)

Node + Express-app med en patientvänlig chatt som:
- har konversationsminne (via `conversationId`)
- kan öppna bokning via Cliento-widget (”Boka tid”)
- kan svara utifrån en lokal kunskapsbas (Markdown/TXT)

## Kom igång
1) Skapa `.env` (utgå från `.env.example`)
2) Installera deps: `npm install`
3) Starta: `npm run dev`

Öppna sedan `http://localhost:3000`.

## Lägg in Arcana på hemsidan (WordPress)
Arcana behöver först köras på en publik **HTTPS**-adress (t.ex. `https://arcana.dindomän.se/`).

### Alternativ 1: Flytande chatt-knapp (rekommenderat)
Lägg in denna rad på er sida (t.ex. i WordPress “Anpassad HTML”-block eller i ett script-inject plugin):

```html
<script defer src="https://arcana.dindomän.se/embed.js"></script>
```

Tips:
- För att tvinga brand (om det behövs): `data-brand="hair-tp-clinic"` eller `data-brand="curatiio"`.
- För att byta knapptext: `data-button-text="Chatta med oss"`.

### Alternativ 2: Inline på en sida (iframe)
```html
<iframe
  src="https://arcana.dindomän.se/"
  style="width:100%;height:720px;border:0;border-radius:24px;overflow:hidden"
  title="Arcana chatt"
></iframe>
```

## Kunskapsbas (från hemsidan)
Fyll `knowledge/` med innehåll. För snabb import kan du testa:

`npm run ingest:hairtpclinic`

Starta om servern efter import för att indexera nya filer.

## Bokningar
Bokning sker via **Cliento** i en inbyggd modal (widget).

Konfigurera i `.env`:
- `CLIENTO_ACCOUNT_IDS` (kommaseparerad lista). Om du anger två IDs kan användaren välja bolag i widgeten.
  - Om er snippet använder `widget-v3/cliento.js`: sätt `CLIENTO_WIDGET_SRC` (eller brand-variant) till den URL:en.
Alternativt (fallback):
- `CLIENTO_BOOKING_URL` (t.ex. Clientos publika “business”-länk) för att öppna/iframe:a bokningen om ni inte vill använda widget-ID.

## Två bolag (Hair TP Clinic + Curatiio)
Om du vill köra **en** Arcana-server men ha rätt innehåll/bokning per domän:
1) Sätt mapping i `.env` med `ARCANA_BRAND_BY_HOST` (host → brand)
2) Sätt brand-specifika Cliento-värden:
   - `CLIENTO_ACCOUNT_IDS_HAIR_TP_CLINIC` / `CLIENTO_BOOKING_URL_HAIR_TP_CLINIC`
   - `CLIENTO_ACCOUNT_IDS_CURATIIO` / `CLIENTO_BOOKING_URL_CURATIIO`

Tips:
- Om du kör bakom en reverse proxy: sätt `TRUST_PROXY=true` så `req.hostname` blir rätt.
- Om Arcana kör på en separat domän men embed:as i en iframe så används `document.referrer` (parent-sidans URL) för att välja brand.
