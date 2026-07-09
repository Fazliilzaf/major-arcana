# Runbook — Slå på "Besvarad i CCO"-kategorin för kons@

Mål: när en operatör svarar en kund i CCO ska originalmailet i den delade
`kons@`-brevlådan visa en **grön** kategori `Besvarad i CCO – <namn>` i Outlook/Mac,
så kollegor utan CCO-åtkomst ser att — och av vem — kunden är besvarad.

Koden finns redan (PR #725 + #726), bakom flagga och default av. Detta är
on-/verifierings-steget. Sandboxen når inte Graph, så detta körs av prod-agenten
(Coworker).

## 0. Förutsättningar (kontrollera FÖRST)

Graph-app-registreringen (client-credentials) måste ha **application permissions**
med admin-consent:

- `Mail.ReadWrite` — sätta kategori på meddelandet (PATCH `/messages/{id}`). Redan
  krav för send-vägen.
- `MailboxSettings.ReadWrite` — **NYTT krav** för att lista/skapa master-kategorin
  (`GET`/`POST /users/kons@.../outlook/masterCategories`).

Om `MailboxSettings.ReadWrite` saknas: taggen sätts ändå (best-effort), men utan
garanterad **färg** (visas grå). Lägg till behörigheten + admin-consent för att få
grönt.

Snabbkoll av tokenens roller: `graphSendConnector.inspectPermissions()` →
`roles`/`scopes` ska innehålla båda ovan.

## 1. Slå på flaggan

Sätt i prod-env (render.yaml / Render dashboard):

```
ARCANA_CCO_MARK_ANSWERED_CATEGORY=true
```

Endast `kons@` är i scope idag (allowlist redan smal). Deploya.

## 2. Verifiera skarpt (mot kons@)

1. Öppna en tråd i CCO för en **testkund** i `kons@` och skicka ett svar.
2. I Outlook/Mac på den delade `kons@`-brevlådan, kontrollera på originalmailet:
   - ✅ **Besvarad-pil** på originalet (från `createReply`, fanns redan).
   - ✅ Svaret ligger i **Sent Items** (fanns redan).
   - ✅ **Grön kategori** `Besvarad i CCO – <namn>` på originalet (nytt).
3. Kontrollera att namnet stämmer med operatören som svarade.
4. Skicka ett svar från en **andra** operatör på en annan tråd → verifiera att
   deras namn dyker upp och att färgen är samma gröna (auto-provisionering av
   master-kategorin för nya namn).

## 3. Felsökning

- **Ingen tagg alls:** flaggan inte satt, eller `markMessageAnswered` kastade före
  patch. Kolla serverlogg efter `[cco-reply] markMessageAnswered misslyckades`
  (best-effort-varning). Verifiera `Mail.ReadWrite`.
- **Tagg men grå (ingen färg):** `MailboxSettings.ReadWrite` saknas → master-kategorin
  kunde inte skapas. Lägg till behörighet + consent, kör om.
- **Fel/gammalt namn kvar:** en tidigare `Besvarad i CCO`-tagg ersätts via
  `replacePrefix`; manuella kategorier (t.ex. VIP) bevaras. Om dubbletter syns,
  kontrollera att `replacePrefix` = prefixet `Besvarad i CCO`.

## 4. Rollback

Sätt `ARCANA_CCO_MARK_ANSWERED_CATEGORY=false` och deploya. Sändning och
besvarad-pil/Sent-kopia påverkas inte (de är oberoende av flaggan). Redan satta
kategorier ligger kvar tills de tas bort manuellt i Outlook.

## Referenser i koden

- `src/ops/ccoAnsweredCategory.js` — kategorinamn, färg (`preset4`), flagga.
- `src/infra/microsoftGraphSendConnector.js` — `markMessageAnswered`,
  `ensureMasterCategory`.
- `src/routes/ccoConversation.js` — best-effort-anropet efter skarpt svar.
