# Nordbro — källdokument för behandlingsavtalen

Originalfiler från Nordbro, oförändrade. **Redigera dem inte.** De är facit
som repots avtalstexter jämförs mot.

| Fil                                            | SHA-256 (16)       | Betänketid    |
| ---------------------------------------------- | ------------------ | ------------- |
| `2025-12-03-behandlingsavtal-dhi-2-dagar.docx` | `5a88840a29350aff` | två (2) dagar |
| `2025-12-03-behandlingsavtal-dhi-7-dagar.docx` | `e90e6e89e1b51e51` | sju (7) dagar |

## Varför två versioner

De skiljer sig på **exakt en mening** — allt annat är teckenidentiskt,
verifierat med diff:

> Tjänsteutövaren tillämpar betänketid (Betänketiden). Avtalet kan ingås med
> bindande verkan först när minst **två (2)** / **sju (7)** dagar har förflutit
> från att Kunden tagit del av informationen om Behandlingen i
> tjänstebeskrivningen.

Lag 2021:363: **sju dagar för kirurgiska ingrepp, två för injektionsbehandlingar.**
Ägarbeslut 2026-09-01: kirurgi är det enda som får sju.

Det betyder i praktiken:

```
sju dagar   ögonlocksplastik (offert_op)          — kirurgi
två dagar   alla övriga behandlingsavtal
```

`offert_op` angav två dagar fram till 2026-09-01 (`1bb5e9de`). Det var fel och
är rättat.

## Varför de ligger här

Flaggan `GRANSKNINGSKRAV` betyder att en text inte kunnat matchas mot en
Nordbro-godkänd version — se
`docs/ops/hairtp-document-flow-contract-2026-06-28.md`. Utan källan i repot går
den matchningen inte att göra, och flaggan blir en gissning.

Ägarbeslutet 2026-06-28 gäller: **oförändrat Nordbro-material förblir godkänt.**
Ändras däremot villkor, timing, ångerrätt eller betänketid krävs ny granskning.
Ändrar du en avtalstext: jämför mot filerna här först.

## Ångerfrist är inte betänketid

Två skilda saker som blandas ihop lätt:

```
ångerfrist    14 dagar   distansavtalslagen (2005:59) — gäller distansavtal
betänketid     2 / 7 dagar   lag 2021:363 — gäller alla estetiska behandlingar
```

Båda finns i avtalen, och båda ska finnas. Att se "14 dagar" i en text betyder
alltså inte att betänketiden är fel.
