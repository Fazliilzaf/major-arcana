# CCO mobil journal — instruktion för personal

## Snabbstart (iPhone/Android)

1. Öppna **`https://arcana.hairtpclinic.se/staff`** i Safari/Chrome (HTTPS krävs för kamera).
2. **Byggfas:** ingen inloggning krävs om kliniken kör öppen åtkomst. **Skarp drift:** logga in i formuläret som visas.
3. Sök kund → kundkortet öppnas.
4. Fliken **Journal** öppnas automatiskt på mobil.
5. Tryck **Ta bild** → ta foto → välj etikett (Front, Vertex, …).
6. Bilden sparas direkt i behandlingsplanen.

## Lägg till på hemskärmen (iPhone)

1. Öppna CCO i Safari.
2. Dela-knappen → **Lägg till på hemskärmen**.
3. Genvägen öppnar **Kundregister** direkt.

## Galleri i stället för kamera

Använd **Välj från galleri** om bilden redan finns i telefonen (HEIC stöds).

## Signerad behandlingsplan

Om planen är signerad kan inga fler bilder läggas till. Skapa **Ny behandlingsplan** och fortsätt där.

## Markera zoner

Tryck **Markera plan** på en bild. På telefon: rita med fingret. Spara när zoner är klara.

## Offert

När bilder är markerade: **Skapa offert från plan** → PDF/Word/signering som vanligt.

## Deep link till kund

Tryck **Kopiera länk** eller **Visa QR** i kundhuvudet. Länken öppnar samma kund direkt (`?view=customers&patientId=…`).

## Flera bilder från galleri

**Välj från galleri** stöder flera bilder i ett steg — välj upp till flera foton, etikett per bild.

## Efter kodändringar (utveckling)

Starta om CCO-servern och hard-reload webbläsaren så nya API-routes och bundle laddas.

## Före pilot

Se full checklista: [cco-mobile-staff-pilot-checklist.md](./cco-mobile-staff-pilot-checklist.md)

Verifiera deploy:

```bash
BASE_URL=https://arcana.hairtpclinic.se npm run smoke:mobile-journal
```

- **Ingen anslutning** — kontrollera WiFi/mobilnät, försök igen.
- **Inloggning krävs** — logga ut/in igen.
- **Bilden för stor** — max 12 MB; ta om med lägre upplösning.
- Teknisk kontakt: IT/admin för CCO.
