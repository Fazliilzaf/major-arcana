# Arcana utan WiFi (Happy-flöde)

Den här guiden är för när du:
- saknar WiFi på datorn
- eller måste jobba från mobil/app

## A) Jobba på dator utan internet

Kör Arcana i offline-läge:

```bash
npm run dev:offline
```

Detta gör att Arcana:
- inte kräver OpenAI-anslutning
- inte försöker använda Microsoft Graph
- fortfarande kan köras och testas lokalt

Lokal adress:
- `http://localhost:3000`

## B) Kör lokal hälsocheck före push

```bash
npm run ops:suite:strict:local:heal
```

Godkänt minimum:
- `strictMode: failures=0`
- `goAllowed=yes`

## C) När du har internet igen

Kör snabb pre-deploy:

```bash
npm run predeploy:quick
```

## D) Jobba från mobil (Happy)

För att kunna fortsätta när du inte har dator:
- använd Arcana på den publika länken: `https://arcana.hairtpclinic.se`
- kör deploy-flödet i GitHub Actions: `arcana-deploy-cloud-safe`

Viktigt:
- utan internet går det inte att deploya
- utan internet går det inte att nå publika länken
