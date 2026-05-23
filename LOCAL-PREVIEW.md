# CCO — Lokal Preview

Snabbguide för att slippa vänta på Render-deploy.

> **Workspace:** Kör alltid från `~/Code/major-arcana` (GitHub). Se [`README.md`](README.md) och [`docs/ops/chatgpt-codex-handoff.md`](docs/ops/chatgpt-codex-handoff.md) för Codex-flödet.

## Snabbstart

```bash
cd ~/Code/major-arcana
./start-cco-local.sh
```

Öppna sen: **http://localhost:3100/major-arcana-preview/**

Refresh tar **0.2 sekunder**. Render-deploy tar **90 sekunder**. Du sparar 89 sekunder per iteration.

---

## Vad scriptet gör

`start-cco-local.sh` startar Express-servern (`server.js`) i offline-läge:

- Port `3100` (bytbar via `PORT=...`)
- Ingen AI-kostnad (`ARCANA_AI_PROVIDER=fallback`)
- Ingen Graph-API-koppling (Outlook-läs/skick avstängt)
- Servar hela `public/`-mappen statiskt
- Auto-killar gamla processer som blockerar port 3100

Det är samma Express-konfiguration som körs på Render — skillnaden är bara att den körs lokalt.

---

## Iterationsflöde

1. **Starta servern en gång** — `./start-cco-local.sh` i en terminal-tab. Lämna den igång.
2. **Editera CSS/JS/HTML** i `public/major-arcana-preview/` — spara filen.
3. **Refresh i Chrome** — `Cmd+Shift+R` (hård-reload, hoppar över cache).
4. Ändringen syns direkt — ingen `git push`, inget Render-bygge.

När du är nöjd: vanlig `git add → commit → push` så Render bygger för riktig URL.

---

## Tips

### Disable cache helt
Öppna Chrome DevTools → fliken `Network` → kryssa i `Disable cache`. Så länge tabben är öppen behöver du bara `Cmd+R` (vanlig refresh).

### Loggar i terminalen
Servern skriver alla requests + fel direkt i terminalen där den körs. Bra för att se vilka filer som faktiskt laddas och om någon 404:ar.

### Byta port
Om port 3100 är upptagen av något annat:
```bash
PORT=3200 ./start-cco-local.sh
```
Då blir URL:en `http://localhost:3200/major-arcana-preview/`.

### Stoppa servern
`Ctrl+C` i terminalen där servern körs.

### Live-reload (frivilligt)
Vanlig hård-reload (`Cmd+Shift+R`) räcker oftast. Om du vill ha auto-reload när filer ändras: installera `livereload`-extension i Chrome eller använd `nodemon` på server-sidan. Inte nödvändigt för CSS-iteration.

---

## När scriptet INTE räcker

- **Backend-state-tester** (worklist-API, sentiment-detection, AI-utkast) → kör `npm run dev` istället för offline-versionen för full integration
- **Ändringar i `server.js`** → behöver omstart (`Ctrl+C` + kör scriptet igen)
- **Cookie-state-buggar** → testa i incognito-tab eller rensa cookies för `localhost`

---

## Felsökning

### "Port 3100 already in use"
Scriptet dödar gamla processer automatiskt. Om det failar:
```bash
lsof -ti:3100 | xargs kill -9
```

### "Cannot find module 'express'"
node_modules saknas. Scriptet kör `npm install` automatiskt om så är fallet — men om det failar:
```bash
npm install
```

### "EADDRINUSE: address already in use :::3100"
Något annat program lyssnar på 3100. Byt port:
```bash
PORT=3200 ./start-cco-local.sh
```

### Sidan ser annorlunda ut än Render
Render kan ha cachade filer. Lokalt servar Express alltid senaste fil-state. Om du vill verifiera att Render också uppdateras: vänta tills bygget är klart (~90s), sen `Cmd+Shift+R`.

---

## Hur du vet att lokalt och Render visar samma sak

I devtools-konsol, kolla:
```js
document.querySelector('link[href*=cco-polish]').href
```

Om det visar `?v=warm-row-rN` med samma N på båda — då har de samma version. Annars är någon stale.

---

## Nästa steg (ur CCO-POSTMORTEM.md)

När du har lokal preview igång → börja Fas 1 cleanup:

1. Radera `runtime-v5-layout-guard.js` — testa direkt i lokal preview om något brakar
2. Radera v3-orphans
3. Synka cache-busters
4. Lös upp demo-fixture-rendern

Allt detta blir 5–10× snabbare med lokal preview.
