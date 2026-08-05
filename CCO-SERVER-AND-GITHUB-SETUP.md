# UPPDRAG TILL CLAUDE CODE — CCO: UTVECKLING LOKALT, SERVERN ÄR CI/DEPLOY

Du arbetar i VS Code med Claude Code, i det befintliga CCO-projektet
(`major-arcana`) på den lokala utvecklingsmaskinen. Till skillnad från ett
nytt projekt är det här **inte** en nyinstallation: koden, git-historiken och
GitHub-kopplingen finns redan. Ditt uppdrag är att verifiera, säkra och
fortsätta arbeta i den befintliga miljön — inte skapa en ny.

Arbeta i denna ordning. Anta ingenting du kan kontrollera i stället.

---

## 0. Viktigt att veta innan du börjar

- Projektet ligger i `~/Code/major-arcana` **på den lokala utvecklingsmaskinen**.
  Klona det INTE om — verifiera bara att det som finns är komplett och rätt.
  Servern har medvetet ingen utvecklarkopia; se avsnitt 2–3.
- Git är redan initierat och kopplat till GitHub
  (`Fazliilzaf/major-arcana`). Skapa inget nytt repo.
- PR #1281 (`fix/cco-local-dev-data-isolation`) är **mergad** till `main`
  2026-08-02 som `c94ffaf2`. Den lagade en tidigare incident: en
  disk-guard-rutin raderade 35 filer i `data/reports/` vid en lokal
  serverstart eftersom flera lagringssökvägar var hårdkodade mot
  produktionens `data/`-katalog i stället för en lokal scratch-katalog.
  Isoleringsfixen ligger alltså i `main` — men läs stycket om den säkra
  startprofilen nedan ändå, den är fortfarande det som skyddar dig.
- Stack: Node.js + Express, npm (använd `package-lock.json`, inte en annan
  pakethanterare). `engines` kräver Node `>=20 <23` — Node 20.20.2 är känt
  fungerande. Ingen databas: CCO lagrar allt som JSON-filer på disk
  (mailbox-shardar + sidofiler under `bodies/`). Installera ingen
  databasklient.
- En lokal, säker startprofil finns redan i `.vscode/launch.json` och
  `.vscode/tasks.json` (skapad i samband med PR #1281). Den pekar alla
  lagringssökvägar mot en gitignorerad `.local-state/`-katalog i stället för
  produktionens `data/` och en iCloud-mapp med riktiga patientdokument.
  **Använd den profilen** för all lokal körning — starta aldrig servern med
  ett bart `npm start` utan den, det var precis så incidenten uppstod
  senast.

Lägg inte in lösenord, privata SSH-nycklar, API-nycklar eller andra
hemligheter i något du skriver eller dokumenterar.

---

## 1. Spara denna instruktion som en textfil

Skapa i projektets rot:

```text
CCO-SERVER-AND-GITHUB-SETUP.md
```

Spara hela den här instruktionen där, som dokumentation för Fazli och andra
utvecklare. Committa den inte automatiskt — den blir en granskad fil som
alla andra (se steg 9).

---

## 2–3. Arbetsmiljö — servern kör CI, Render kör prod, utveckling sker lokalt

**Servern (`134.209.232.101`, användare `fazli`) kör GitHub Actions-runnern
— inget annat som rör CCO. Ingen utvecklarkopia av repot ska klonas dit, och
inget utvecklingsarbete sker där — allt sådant sker lokalt i
`~/Code/major-arcana` på utvecklingsmaskinen.**

**Servern är INTE deploy-mål.** Produktion är Render Frankfurt
(`srv-d8b3i3tckfvc73clgeng`, arcana.hairtpclinic.com), Blueprint-managed via
`render.yaml` med autodeploy på commit till `main`. En tidigare version av
det här dokumentet kallade servern "deploy-mål" — det stämde aldrig.
Verifierat 2026-08-05: ingen systemd-unit för CCO, tom `/var/www/majorarcona`,
inget nginx-vhost för arcana.

Den enda CCO-relaterade utcheckningen på servern är runnerns egen
arbetskatalog (`~/actions-runner-major-arcana/_work/…`). Den är CI-ägd och
nollställs per jobb — redigera aldrig i den.

Servern kör därutöver `majorarcana-legacy.service` (systemd --user, från
`~/major-arcana-legacy`, lyssnar `127.0.0.1:4020`). Den är en referenskopia av
en äldre app, inte prod och inte del av det här repots deploy-kedja.

Anslut till servern bara när du faktiskt behöver felsöka CI eller deploy, och
ändra inte dess SSH-konfiguration eller brandvägg utan ett tydligt, verifierat
behov.

---

## 4. Kontrollera miljön (lokalt och/eller vid CI-/deploy-felsökning på servern)

```bash
whoami
hostname
pwd
echo "$HOME"
git --version
claude --version
node --version      # måste vara >=20 <23 — 20.20.2 är känt fungerande
npm --version
df -h
free -h
```

Kontrollera att `node --version` faktiskt matchar kravet innan du kör något
installationssteg. Om fel Node-version är aktiv, byt (t.ex. via `nvm use 20`)
i stället för att gissa att det duger.

---

## 5. Verifiera det befintliga projektet — inte en ny överföring

```bash
cd ~/Code/major-arcana
git status
git remote -v
git branch --show-current
git log -1 --oneline
```

Förväntat: `origin` pekar redan på `git@github.com:Fazliilzaf/major-arcana.git`
(eller motsvarande), och det finns redan committad historik. Är något av
detta INTE fallet — stanna och rapportera i stället för att anta att
projektet ska initieras om.

Kontrollera vilken branch som är utcheckad. Om det är `main`, gör inga
ändringar direkt där — skapa en feature-branch (se steg 8) precis som
tidigare i den här kodbasens historik.

Läs, om de finns: `README.md`, `AGENTS.md`/`CLAUDE.md`,
`CCO-SERVER-AND-GITHUB-SETUP.md` (den här filen, efter att du sparat den),
`.env.example`.

---

## 6. Säkerhetskontroll innan du gör något annat

Kontrollera, utan att skriva ut innehållet i terminalen eller i din
sammanfattning:

- `.env` finns och är gitignorerad: `git check-ignore .env`
- `.local-state/` finns i `.gitignore`
- Ingen hemlighet är hårdkodad i källkoden. Om du hittar en: ersätt den med
  en miljövariabel och berätta VILKEN fil/rad — utan att återge värdet.
- `ARCANA_CCO_SECURE_STORAGE_ROOT` i `.env` pekar mot
  `./.local-state/cco-secure-storage` — INTE mot en iCloud-sökväg med riktig
  patientdata. Om den pekar fel: stanna och fråga innan du kör något som
  startar servern.

Kör aldrig servern utan att först ha bekräftat den sista punkten. En tidigare
körning utan detta raderade 35 filer i produktionsnära `data/`-katalog via en
inbyggd disk-guard-rutin.

---

## 7. Installera beroenden

```bash
npm ci
```

Använd inte `npm install` om `package-lock.json` finns och matchar
`package.json`. Installera inga globala paket. Kör inga kommandon som
raderar filer, databaser eller data.

---

## 8. Kontrollera projektet — med den säkra profilen, inte ett bart kommando

Kör kvalitetskontrollerna i den här ordningen, och redovisa resultatet av
var och en även vid fel:

```bash
npm run check:syntax
npm run lint:no-bypass
npm run test:unit        # ~6000+ tester, detta är baseline, inte en engångskörning
```

Starta servern **via den befintliga VS Code-profilen** (`.vscode/tasks.json`
— den som redan sätter `ARCANA_STATE_ROOT` till en lokal scratch-katalog och
stänger av Graph/scheduler/IMAP för lokal körning), inte via ett bart
`npm start`.

Efter start, verifiera:

```bash
curl -s localhost:3001/healthz
curl -s localhost:3001/readyz
```

Och kontrollera att inget skrevs i den skarpa `data/`-katalogen eller någon
iCloud-mapp under körningen (jämför filantal/`ls -la data/reports | wc -l`
före och efter — exakt det mönster som redan användes för att verifiera
PR #1281).

Rätta bara fel som orsakas direkt av miljön (t.ex. saknad env-variabel). Gör
ingen stor refaktorering. Är något redan trasigt av andra skäl (det finns
kända, förbefintliga testfel — se PR #1281:s verifieringstabell för det
senast kända antalet): redovisa det, fixa det inte på egen hand.

---

## 9. Granska ändringar innan något committas

```bash
git status --short
git diff
```

Kontrollera noga att inget av följande finns med:
`.env`, privata nycklar, tokens, lösenord, patientdata, `data/`-filer,
`.local-state/`, `node_modules/`, byggcache.

Använd aldrig `git add .` utan att först ha granskat listan. Lägg till
filer namn för namn eller i granskade grupper.

---

## 10. Branch, commit, push — följ befintligt flöde

Projektet har redan ett etablerat flöde: feature-branch → commit → push →
draft PR → granskning → merge. Följ det, hoppa inte över steg.

```bash
git checkout main
git pull --ff-only
git checkout -b <beskrivande-branchnamn>
```

Efter granskade ändringar:

```bash
git add <granskade-filer>
git diff --cached
git commit -m "<beskrivande meddelande>"
git push -u origin <branchnamn>
```

Skapa PR:en som **draft**. Pusha aldrig direkt till `main`. Använd aldrig
`git push --force` eller `git reset --hard` utan att jag uttryckligen bett
om det.

Verifiera GitHub-anslutningen om något är oklart:

```bash
ssh -T git@github.com
git config --global user.name
git config --global user.email
```

Hitta inte på namn/e-post om de saknas — fråga mig.

---

## 11. Dokumentation att hålla uppdaterad

Skapa eller uppdatera vid behov (inte i onödan):

- `README.md` — startkommando, testkommando, kända begränsningar.
- `CCO-SERVER-AND-GITHUB-SETUP.md` (den här filen).
- `.env.example` — bara variabelnamn, aldrig riktiga värden.

Lägg aldrig in privata nycklar eller riktiga hemligheter i något av detta.

---

## 12. Slutrapport

När du är klar, lämna en sammanfattning med:

1. Vilken branch du arbetade på och dess senaste commit-hash.
2. Vilka kommandon du körde (lint/test/build) och exakt resultat
   (antal pass/fail, inte bara "klart").
3. Om servern startades, med vilken profil, och resultatet av
   `/healthz`/`/readyz`.
4. Bekräftelse på att `data/`-katalogen och eventuell iCloud-lagring var
   orörda efter körningen (filantal före/efter).
5. Skapade eller ändrade filer.
6. Eventuella säkerhetsfynd — utan att återge några hemligheter.
7. Status på PR #1281 om du kontrollerade den.
8. Kvarstående fel eller manuella steg.

Påstå aldrig att ett steg är klart utan att det faktiskt har kontrollerats.

---

## Regler

- Fråga inte om bekräftelse för normala, säkra steg.
- Fråga bara om sådant som verkligen saknas (t.ex. server-IP, SSH-användare,
  en riktig hemlighet du inte kan gissa dig till).
- Kör aldrig destruktiva kommandon (`rm -rf`, databasrensning, force push,
  reset mot produktion, `git stash drop` — den senare kräver alltid att jag
  kör den manuellt själv).
- Committa eller pusha ingenting till `main` direkt.
- Visa aldrig en hel hemlighet/nyckel/token i svaret.
- Minsta nödvändiga ändring för att verifiera och fortsätta arbetet — inget
  mer.

---

---

## TILLÄGG: Verifieringsanteckning 2026-08-02

> Detta avsnitt är **inte** del av originalinstruktionen. Det är resultatet av
> att faktiskt köra stegen ovan, och det korrigerar en premiss i dokumentet.

## Servern har ingen utvecklarkopia av repot

Steg 0 och 5 utgår från att projektet ligger i `~/Code/major-arcana` på
servern. **Det gör det inte.** Kontrollerat 2026-08-02:

```text
$ ssh fazli@134.209.232.101 'ls ~/Code/major-arcana'
NEJ — katalogen finns inte
```

Den enda utcheckningen på servern är GitHub Actions-runnerns arbetskatalog:

```text
/home/fazli/actions-runner-major-arcana/_work/major-arcana/major-arcana
```

Den är **CI-ägd** och nollställs per jobb. Den ska inte användas som
utvecklarmiljö — manuellt arbete där skrivs över av nästa körning och kan
störa pågående CI-jobb. Vid kontrolltillfället stod den på
`c3e22c1 Merge f3fb259f into d27962ca`, alltså merge-testet av PR #1281.

**Slutsats:** servern är CI-runner, varken utvecklingsmiljö eller deploy-mål
(se avsnitt 2–3 — deploy går till Render Frankfurt).
Utvecklingsarbetet sker på den lokala maskinen i `~/Code/major-arcana`, där
`.vscode`-profilerna, `.env` och `.local-state/` redan finns.

## Servermiljön i övrigt (steg 4) — verifierad OK

|           |                                                   |
| --------- | ------------------------------------------------- |
| Värd      | `ubuntu-s-4vcpu-8gb-fra1-01` (DigitalOcean, fra1) |
| Användare | `fazli`, `sudo` utan lösenord                     |
| git       | 2.25.1                                            |
| node      | **v20.20.2** ✅ uppfyller `>=20 <23`              |
| npm       | 10.8.2                                            |
| claude    | `/home/fazli/.local/bin/claude`                   |
| nvm       | v20.20.2, v22.23.2                                |
| Disk      | 104 GB fritt av 155 GB (34 % använt)              |
| Minne     | 7,8 GB totalt, 5,8 GB tillgängligt                |

## PR #1281 — mergad

|               |                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Tillstånd     | **mergad** till `main` 2026-08-02 18:42 UTC som `c94ffaf2`                                                                              |
| Omfattning    | 7 filer, +195 / −26, 1 commit (`f3fb259f`)                                                                                              |
| CI före merge | **7 av 7 gröna** — säkerhets-headers, cmo-mutation, smoke, npm audit, dependency outdated, Unit tests + coverage gate, build-and-deploy |

Isoleringsfixen ligger därmed i `main`, och deploy-pipelinen tar den vidare
automatiskt.
