# ORD-127 · Katalogen säger 6 månader, allt annat säger 8

**Arbetsorder · 2026-08-27**
**Bas:** `main` (`9589d47a`)
**Till:** DeepSeek
**Beslut:** Fazli 2026-08-27 — **kadensen är 4 · 8 · 12.** Punkt.

---

## Vad som är fel

`src/ops/hairtp-document-types.catalog.json` har kvar:

- id `journal_tp_follow_6`
- namn "Uppföljning **6 mån**"
- `requiredFor: ['6_man_check']`

Allt annat säger 8. Koden ändrades redan (ORD-uppgiften från 2026-08-26):
`ccoJournalSchemas.js`, `ccoFollowupDraftPlanner.js` och `scheduler.js` är
eniga om 4/8/12. Båda workflow-sidorna
(`cco-workflow-v13.html` §3 och §4) skriver **4 · 8 · 12**.

Katalogen är ensam kvar med sexan.

### Följden, konkret

`ccoDocumentReadiness.js:145` bygger signal-id direkt av strängen:
`document.requiredFor.${step}`. Alltså genereras
`document.requiredFor.6_man_check` — ett krav som aldrig kan uppfyllas,
eftersom besöket sker vid åtta månader. Personalen får dessutom fel mall
i handen.

### Det extraherade dokumentet bekräftar att det är en dubblett

`steg8-journal-tp-follow-6` och `steg8-journal-tp-follow-8` är
**byte-identiska bortsett från siffran**, och båda bär samma
Meridiq-källa (MQ 16409). Det är alltså inte två olika journaler — det är
en journal som fått två namn.

---

## Uppgiften

1. I katalogen: `journal_tp_follow_6` → `journal_tp_follow_8`, namnet till
   "Uppföljning 8 mån", `requiredFor: ['6_man_check']` →
   `['8_man_check']`.
2. Sök igenom repot efter `follow_6`, `6_man_check` och `6_man` och rätta
   varje kvarvarande träff. Ta med tester och fixtures.
3. Ta bort dubbletten `steg8-journal-tp-follow-6` **eller** gör den till
   en ren omdirigering till `-8`. Välj det som inte bryter befintliga
   `data-registry-id`-referenser, och skriv i committen vilket du valde
   och varför.

## Godkänt när

- `grep -rn "6_man_check\|follow_6" --include='*.js' --include='*.json' .`
  ger noll träffar utanför arkiv.
- Ett test som ger en patient en åttamånadersuppföljning ser kravet
  uppfyllt. Mutationstesta det: sätt tillbaka `6_man_check` i katalogen
  och visa att testet blir rött. Ett test som inte kan fela bevisar
  ingenting.
- Båda workflow-sidorna är fortfarande orörda — de hade redan rätt.

## Rör inte

Kadensen i `ccoJournalSchemas.js`, `ccoFollowupDraftPlanner.js` eller
`scheduler.js`. De är redan rätt. Det är katalogen som ska följa efter,
inte tvärtom.
