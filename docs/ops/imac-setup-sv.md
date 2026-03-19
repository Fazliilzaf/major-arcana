# iMac-flode for Arcana

Det har ar samma arbetsmodell som for Mac Studio, men riktad mot din iMac.

## Dagligt bruk fran MacBook

Nar SSH till iMac ar upplagd anvander du:

```bash
arcana-imac-bootstrap
arcana-imac-shell
arcana-imac-studio
arcana-imac-doctor
arcana-imac-share
```

Det betyder:
- `arcana-imac-bootstrap` synkar repo, Codex-state och SSH-konfig till iMac och kor bootstrap dar
- `arcana-imac-shell` oppnar Arcana-mappen pa iMac
- `arcana-imac-studio` synkar och startar Codex pa iMac
- `arcana-imac-doctor` verifierar iMac-flodet
- `arcana-imac-share` oppnar skarmdelning mot iMac

## Forsta gangen pa iMac

Om du sitter direkt pa iMac och vill satta upp allt lokalt:

```bash
cd "$HOME/Desktop/Arcana"
npm run workstation:bootstrap
```

Det installerar:
- Homebrew och shellenv
- git, node, gh, render, ripgrep, fd, tmux, direnv, uv
- Tailscale
- Arcana-beroenden via `npm ci`
- Arcana-kommandon via `npm run commands:install`

## Forsta gangen fran MacBook

Nar SSH fungerar till iMac:

```bash
cd "$HOME/Desktop/Arcana"
arcana-imac-bootstrap
```

Det gor detta:
- syncar Arcana-repot till iMac
- kopierar `~/.codex/config.toml`
- kopierar `~/.codex/.credentials.json`
- kopierar `~/.codex/auth.json`
- kopierar `~/.ssh/config`
- kopierar `~/.ssh/known_hosts`
- kor workstation-bootstrap pa iMac

## Nuvarande blockerare

iMacen ar synlig pa Tailscale som `imac-som-tillhr-hair` och har nu ett lokalt SSH-alias:

```bash
ssh imac-ai
```

Det som aterstar ar att SSH-autentisering till iMac maste godkannas en gang. Nar det ar gjort kan resten koras helt via `arcana-imac-bootstrap`.

Snabbaste vagen dit:

```bash
arcana-imac-share
```

Nar iMac-skarmen ar oppen:
1. Slå pa `Fjarrinloggning` i `Systeminstallningar -> Allmant -> Delning`.
2. Lagga in din SSH-nyckel for den har Macen i `~/.ssh/authorized_keys`.
3. Kor sedan `arcana-imac-bootstrap` fran MacBooken igen.
