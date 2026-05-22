# Mac Studio Setup för Arcana

Den här guiden är till för din nya Mac Studio.

Viktigt:
- jag kan inte installera direkt på Mac Studio från den här sessionen eftersom den här Codex-sessionen just nu kör på din MacBook Air
- därför har jag förberett ett bootstrap-script i repot

## 1. Grundsteg på Mac Studio

1. Starta Mac Studio.
2. Logga in med Apple-ID.
3. Kör alla macOS-uppdateringar i `Systeminställningar -> Allmänt -> Programuppdatering`.
4. Öppna `Terminal`.

## 2. Klona Arcana

Om GitHub är tillgängligt:

```bash
git clone https://github.com/Fazliilzaf/Arcana.git "$HOME/Desktop/Arcana"
cd "$HOME/Desktop/Arcana"
```

## 3. Kör bootstrap

```bash
bash ./scripts/bootstrap-mac-studio.sh
```

Det installerar:
- Xcode Command Line Tools
- Homebrew
- git
- node
- gh
- render
- python@3.14
- ripgrep
- fd
- tmux
- direnv
- uv

Om macOS öppnar en dialog för Xcode Command Line Tools:
- slutför den installationen
- kör sedan scriptet igen

## 4. Logga in efter bootstrap

```bash
gh auth login -h github.com -p https -w
render whoami
```

## 5. Installera Arcana lokalt

```bash
cd "$HOME/Desktop/Arcana"
npm ci
```

## 6. Valfri kontroll

```bash
BASE_URL=https://arcana.hairtpclinic.se npm run smoke:public
```

## 7. Jobba fran MacBook Air men kor pa Mac Studio

Nar Mac Studio ar bootstrapad och Arcana finns dar kan du sta pa MacBook Air och skicka jobbet dit:

```bash
cd "$HOME/Desktop/Arcana"
npm run studio:sync
npm run studio:shell
```

Om Codex-appen ar installerad pa Mac Studio kan du starta Codex i Arcana-mappen med:

```bash
cd "$HOME/Desktop/Arcana"
npm run studio:codex
```

For ett enda kommando fran vilken mapp som helst pa MacBook Air:

```bash
arcana-studio
```

Om du bara vill oppna ett vanligt skal pa Mac Studio:

```bash
arcana-shell
```

Det viktiga ar:
- `studio:sync` kopierar arbetskopian fran MacBook Air till Mac Studio
- `studio:shell` oppnar ett skal i Arcana pa Mac Studio
- `studio:codex` kor `codex` pa Mac Studio, inte pa MacBook Air
- `arcana-studio` kor sync och startar sedan Codex pa Mac Studio
- `arcana-shell` oppnar bara ett vanligt terminalskal pa Mac Studio

## 8. Om du vill använda Mac Studio som fast Arcana-maskin

Bra att slå på:
- `Systeminställningar -> Batteri/Energi` så den inte går ner i onödig vila
- `Fildelning` eller `Skärmdelning` om du vill nå den hemifrån
- `FileVault`
