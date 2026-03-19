# Pre-deploy snabbcheck (nybörjarvänlig)

Kör dessa 3 kommandon i ordning innan deploy.

## Snabbaste vägen (ett kommando)

```bash
npm run predeploy:quick
```

Valfri egen URL:

```bash
npm run predeploy:quick -- "https://din-miljo.example.com"
```

## 1) Lokal hälsocheck + auto-heal

```bash
npm run ops:suite:strict:local:heal
```

Godkänt resultat:
- `strictMode: failures=0`
- `goAllowed=yes`

Om inte godkänt:
- kör samma kommando en gång till
- om det fortfarande failar: deploya inte

## 2) Lokal smoke-test

```bash
npm run smoke:local
```

Godkänt resultat:
- scriptet avslutas utan error

## 3) Publik preflight mot miljön du ska deploya till

```bash
BASE_URL="https://arcana.hairtpclinic.se" npm run preflight:pilot:report -- --public-url "$BASE_URL" --skip-local
```

Godkänt resultat:
- ingen `no-go` i rapporten

## Klart för deploy när allt ovan är grönt

Minimum:
- steg 1 = grönt
- steg 2 = grönt
- steg 3 = grönt
