# CF.9 — Kontoplansförslag (BAS) för Fortnox voucher-sync

**Status:** FÖRSLAG — ägar-GO "GO + dryRun först" 2026-07-13. Revisorn granskar via
dryRun-rapporten i /finance.html innan skarp write tänds. Källa: `DEFAULT_ACCOUNT_MAP`
i `src/cfo/cfoFortnoxVoucherSync.js` (payload märks `accountSource: default_suggestion`).

## Kostnadskonton per kategori

| Kategori (CF)      | BAS-konto | Benämning                                                         |
| ------------------ | --------- | ----------------------------------------------------------------- |
| utrustning         | 5410      | Förbrukningsinventarier                                           |
| forbrukning        | 5460      | Förbrukningsmaterial                                              |
| lokal              | 5010      | Lokalhyra                                                         |
| personal           | 7690      | Övriga personalkostnader                                          |
| utbildning         | 7610      | Utbildning                                                        |
| resor              | 5800      | Resekostnader                                                     |
| mat_representation | 6071      | Representation, avdragsgill                                       |
| marknadsforing     | 5900      | Reklam och PR                                                     |
| administrativ      | 6110      | Kontorsmaterial                                                   |
| it_telefoni        | 6212      | Mobiltelefon (alt. 6540 IT-tjänster — revisorsfråga)              |
| forsakring         | 6310      | Företagsförsäkringar                                              |
| juridik_konsult    | 6580      | Advokat- och rättegångskostnader (alt. 6530/6550 — revisorsfråga) |
| bank_finansiell    | 6570      | Bankkostnader                                                     |
| skatter_avgifter   | 6990      | Övriga externa kostnader (revisorsfråga: 6992 ej avdragsgill?)    |
| annat              | 6990      | Övriga externa kostnader                                          |

## Fasta konton per verifikat

| Roll                 | Konto | Benämning                                               |
| -------------------- | ----- | ------------------------------------------------------- |
| Ingående moms        | 2641  | Debet momsbelopp                                        |
| Motkonto (betalning) | 1930  | Företagskonto, kredit brutto                            |
| Verifikatserie       | A     | (ändra vid behov till egen serie, t.ex. E för expenses) |

## Verifikat-exempel (Telia 1 000 kr inkl 200 kr moms, it_telefoni)

| Konto | Debet | Kredit |
| ----- | ----- | ------ |
| 6212  | 800   | —      |
| 2641  | 200   | —      |
| 1930  | —     | 1 000  |

## Frågor till revisorn (markerade ovan)

1. it_telefoni: 6212 eller dela mobil (6212) / IT-tjänster & SaaS (6540)?
2. juridik_konsult: schablon 6580 eller dela redovisning (6530) / konsult (6550)?
3. skatter_avgifter: 6990 eller specifika (t.ex. 6992 ej avdragsgilla avgifter)?
4. Egen verifikatserie för CF-expenses (t.ex. E) i stället för A?
5. Betalmetod-styrning av motkonto (kort 1930, privat utlägg 2893 skuld till ägare)?

Ändringar görs i `DEFAULT_ACCOUNT_MAP` — en rad per kategori, plus test.
