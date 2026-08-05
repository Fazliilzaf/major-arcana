# Marketing Agent Handover — Kimi / Arcana CMO

Version: 1.0  
Datum: 2026-08-05  
Ägare: Fazli Krasniqi  
Målgrupp: Marknadskillar som använder Kimi med skillen `major-arcana-marketing-agent`

---

## 1. Syfte

Detta dokument är den versionshanterade sanningen för hur marknadsagenten ska arbeta i Kimi. Det kopplar:

- **Kimi-skillen:** `~/.kimi-code/skills/major-arcana-marketing-agent/SKILL.md`
- **Arcanas kod:** CMO-agenten, capabilities, registry, policy floor
- **Webbrepona:** `hairtpclinic-web`, `curatiio-web`
- **Design & rapporter:** iCloud-mappen `Major Arcana 2.0/05 · CMO (Marknad)/`

---

## 2. Arkitektur — var marknadsagenten passar in

```
┌─────────────────────────────────────────────────────────────┐
│  Kimi med major-arcana-marketing-agent skill                 │
│  - skapar utkast, planer, rapporter                         │
│  - läser/fyller i mallar i CMO-mappen                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  iCloud: Major Arcana 2.0/05 · CMO (Marknad)/               │
│  - VECKORAPPORT-MALL.md                                     │
│  - VECKORAPPORT-YYYY-W##.md                                 │
│  - CONTENT-PLAN-YYYY-W##.md                                 │
│  - AD-DRAFT-<kanal>-YYYY-MM-DD.md                           │
│  - SEO-ACTION-YYYY-MM-DD.md                                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Arcana CMO (kod)                                           │
│  - src/agents/cmoContentAgent.js                            │
│  - src/capabilities/registry.js (CMO bundle)                │
│  - src/policy/floor.js (marketing_copy gate)                │
│  - data/marketing-campaign-drafts.json                      │
│  - data/marketing-claims-whitelist.json                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Webbrepon (separata Vercel-projekt)                        │
│  - hairtpclinic-web (Next.js, hairtpclinic.com)             │
│  - curatiio-web (Next.js, curatiio.com)                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Regler för marknadsagenten

1. **Ingen autonom publicering.** Alla annonser, inlägg, mail och webbändringar är utkast tills Fazli godkänner.
2. **Ingen autonom budget.** Budget är förslag.
3. **Compliance first.** Extern copy som påstår något medicinskt eller lockande ska flaggas för `ValidateMarketingClaims` + CLINICAL_GUARD.
4. **Datakällkrav.** KPI:er måste ha källa, tidsfönster och freshness. Annars `insufficient_data`.
5. **Versionshantering.** Alla ändringar i kod eller webb går via branch + PR. Aldrig direkt på `main`.

---

## 4. Filer agenten ska känna till

### 4.1 Arcana-kod

| Fil | Syfte |
|-----|-------|
| `src/agents/cmoContentAgent.js` | CMO-agentens entrypoint |
| `src/capabilities/registry.js` | CMO capability-bundle |
| `src/capabilities/generateContentBrief.js` | SEO/content briefs |
| `src/capabilities/generateOutreachCampaign.js` | Kampanjutkast |
| `src/capabilities/validateMarketingClaims.js` | Claims-whitelist check |
| `src/policy/floor.js` | `marketing_copy` policy floor |
| `data/marketing-campaign-drafts.json` | Lagrade kampanjutkast |
| `data/marketing-claims-whitelist.json` | Godkända påståenden |

### 4.2 Strategidokument

| Fil | Syfte |
|-----|-------|
| `docs/strategy/cmo-arcana-marketing-copilot-implementation-plan.md` | CMO-faserna A–M och v3-plan |
| `docs/strategy/gtm-plan.md` | Go-to-market-plan, ICP, kanaler, KPI:er |
| `docs/strategy/web-hairtpclinic-com-masterplan.md` | Webbens masterplan och DoD |
| `docs/strategy/cmo-capability-risk-matrix.md` | Risker och gränser |

### 4.3 iCloud-mallar

| Fil | Syfte |
|-----|-------|
| `05 · CMO (Marknad)/VECKORAPPORT-MALL.md` | Mall för veckovis rapport |
| `05 · CMO (Marknad)/marketing-agent-dashboard-preview.html` | Visuell mockup av arbetsytan |

---

## 5. Veckoflöde (rekommenderat)

### Måndag
1. Öppna senaste `VECKORAPPORT-YYYY-W##.md`.
2. Granska förra veckans KPI:er och blockerare.
3. Bestäm denna veckans fokus (SEO, Ads, Meta, content, email).

### Tisdag–torsdag
1. Arbeta med utkast enligt plan.
2. Spara alla utkast i CMO-mappen med tydliga filnamn.
3. Markera vad som väntar på Fazlis godkännande.

### Fredag
1. Sammanfatta veckan i ny `VECKORAPPORT-YYYY-W##.md`.
2. Skicka översikt till Fazli med:
   - Vilka filer som skapats.
   - Vilka utkast som väntar godkännande.
   - Vilka blockerare som finns.

---

## 6. Koppling till webbrepona

Marknadsagenten får inte ändra i webbrepona direkt. Istället:

1. SEO-förslag → `SEO-ACTION-YYYY-MM-DD.md` eller GitHub-issue i rätt webb-repo.
2. Content-utkast → `CONTENT-PLAN-YYYY-W##.md`.
3. Webbändringar som kräver kod → GitHub-issue/PR mot `hairtpclinic-web` eller `curatiio-web`.

### Repo-kartläggning

| Varumärke | Repo | Deploy | Branch-regel |
|-----------|------|--------|--------------|
| Hair TP Clinic | `~/Code/hairtpclinic-web` | Vercel `hair-tp-clinic` | Alltid PR till `main`, aldrig direktpush |
| Curatiio | `~/Code/curatiio-web` | Vercel (egen instans) | Alltid PR till `main`, aldrig direktpush |

---

## 7. Datakällor att efterfråga

Marknadsagenten har ingen direkt API-åtkomst i v1. Be marknadskillen klistra in data från:

- **Google Search Console:** Klick, visningar, genomsnittlig position, indexerade/deindexerade sidor.
- **Google Ads:** Kampanjer, spend, CTR, CPC, konverteringar, Quality Score.
- **Meta Ads:** Kampanjer, spend, CTR, CPC, konverteringar, relevance score.
- **GA4 / Plausible:** Besökare, kanaler, konverteringshändelser, toppsidor.
- **Sociala kanaler:** Räckvidd, engagemang, följare (manuellt).

---

## 8. Godkännandeflöde

```
Utkast skapat av marknadskill
        │
        ▼
Compliance-check (automatiskt/semiautomatiskt i CMO)
        │
        ▼
Fazli granskar och godkänner/avvisar/begär ändring
        │
        ▼
Schemaläggning/publicering av godkänd person
```

I Kimi: markera alltid utkast med status **DRAFT — väntar godkännande**.

---

## 9. Vanliga uppgifter och vilken fil de landar i

| Uppgift | Output-fil | Godkänns av |
|---------|------------|-------------|
| Veckorapport | `VECKORAPPORT-YYYY-W##.md` | Fazli (granskning) |
| Content-plan | `CONTENT-PLAN-YYYY-W##.md` | Fazli |
| SEO-åtgärder | `SEO-ACTION-YYYY-MM-DD.md` | Fazli |
| Google Ads-utkast | `AD-DRAFT-google-YYYY-MM-DD.md` | Fazli |
| Meta-utkast | `AD-DRAFT-meta-YYYY-MM-DD.md` | Fazli |
| Webbförslag (kod) | GitHub issue/PR | Fazli |
| Kampanjgodkännande | Uppdatera `marketing-campaign-drafts.json` via CMO UI | Fazli |

---

## 10. Nästa steg för att förbättra agenten

1. **MCP-kopplingar:** När nycklar finns, koppla GSC, Google Ads, Meta Business Manager, Notion, Google Drive.
2. **Automatisk veckorapport:** Schemalägg hämtning av GSC/Ads-data till CMO-mappen.
3. **Publiceringskalender:** Synka content-plan med CMO UI och eventuellt Notion.
4. **A/B-testlogg:** Förslag på testbara rubriker/CTA som spåras separat.

---

## 11. Kontakt & ägarskap

- **Ägare:** Fazli Krasniqi
- **Marknadskillar:** (fyll i namn)
- **Kimi-skill:** `~/.kimi-code/skills/major-arcana-marketing-agent/SKILL.md`
- **Detta dokument:** `~/Code/major-arcana/docs/strategy/marketing-agent-handover.md`
