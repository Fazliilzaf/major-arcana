# ORD-143 · Momsen och tjänstespecifikationen i offerten

**Arbetsorder · 2026-08-29**
**Bas:** `origin/main` (`8a087c54`)
**Underlag:** juristens genomgång (Nordbro, 2026-08) + `cco-workflow-v13.html`
**Gäller båda bolagen.**

---

## Utgångspunkt

Fazli: **vi följer vår egen kundresa.** Juristens ordning är bekräftad mot
`cco-workflow-v13.html` och täcks redan — utom två saker.

GetAccept lämnas utanför den här ordern. Underlagen finns i SharePoint och
är kartlagda i
`docs/handover/SP-KUNDDOKUMENT-KVALITETSSAKRA-FORTECKNING-2026-08-29.md`.

---

## 1 · Momsen saknas i offerterna

Juristen: uppgift om moms behöver läggas till i offerten.

Mätt: **noll av tio** offertvägar har en momsrad. De två träffarna jag först
fick var `vat` inuti andra ord, inte "moms".

Tjugo filer berörs — tio behandlingsvägar i två skeden:

```
steg5-offert-*   botox · filler · microneedling · op · ortopedi
steg7-offert-*   prf · profilo · prp-hair · prp-skin · tp
```

**Regler för hur den ska in:**

- Momsen **beräknas ur tjänstens pris**, den skrivs inte in som text. Ett
  inklistrat belopp är rätt den dagen det skrivs och fel därefter.
- `steg5` och `steg7` ska visa **samma** underlag i två lägen. De får inte
  glida isär — det stod redan i ORD-133.
- Priset hämtas som referens till tjänsten, aldrig som kopia. Oförändrat
  sedan ORD-134.

**Vård kan vara momsbefriad.** Är en behandling det ska offerten säga det —
inte utelämna raden. En saknad rad och "0 kr moms" är två olika besked.
Vilka behandlingar som är befriade är Fazlis och juristens fråga, inte
kodens: bygg så att båda utfallen kan visas, och fråga innan ett blir
förval.

## 2 · Tjänstespecifikationen refereras men bifogas aldrig

Det här är det allvarligare av de två.

Offerttexten säger redan, i klartext:

> "Behandlingen utförs i enlighet med tjänstespecifikationen samt den
> individuella …"
> "… tjänstespecifikation ('Behandlingen') som tillhandahållits Kunden."

Avtalet **förutsätter alltså att kunden har fått den.** Men:

|                                                           |                         |
| --------------------------------------------------------- | ----------------------- |
| Offerter som nämner tjänstespecifikationen i text         | **8 av 10**             |
| Saknar omnämnandet helt                                   | `prp-hair` · `prp-skin` |
| Offerter som **bifogar eller länkar** en specifik version | **0 av 20**             |
| Katalograder för tjänstespecifikation                     | **0**                   |

Systemet påstår i ett juridiskt bindande dokument att något lämnats till
kunden, utan att veta om det gjordes.

### Vad som ska byggas

**a)** Tjänstespecifikationen blir en **referens till tjänsten**, inte en
fritext i mallen. Det är den struktur ORD-133 beslutade: en rad i
tjänstekatalogen som dokumenten pekar på.

**b)** Offerten bär **vilken version** kunden fick. Ändras specen ett
halvår senare ska det gå att se vad som gällde den dagen.

**c)** `prp-hair` och `prp-skin` får samma text som de andra åtta.

**d)** Underlagen hämtas ur SharePoint-förteckningen. De finns per
behandling, båda bolagen, uppdaterade **mars 2026**:

```
Botox® · Fillers · Profhilo® · PRF hud · PRP hud ·
PRP+Microneedling · Ortopedi (5 varianter) · Ögonlocksplastik
```

**e)** Curatiios patientinformation heter **`Information vid
ögonlocksplastik (Dermatochalasis)`** — inte "eftervård" eller
"förberedelse". Sök på sak, inte på namn. Förteckningens rad 111.

---

## Kopplingen till ORD-136

ORD-136 säger att biverkningsgenomgången ska registrera **vem, när och
vilken version** av tjänstespecifikationen som visades.

Den ordern förutsatte att specen fanns att peka på. Nu vet vi att den gör
det. Punkt 2b är samma versionsfält sett från offertsidan — **bygg det en
gång, använd det på båda ställena.**

---

## Godkänt när

1. Alla tjugo offertfiler visar moms, beräknad ur tjänstens pris.
2. Ingen offert bär ett inklistrat belopp. Visa det med en sökning.
3. `steg5` och `steg7` ger samma underlag. Ett test som jämför.
4. Momsbefriad behandling visar det uttryckligen, inte genom att utelämna
   raden.
5. Offerten bär tjänstespecifikationens version. Ett test som misslyckas
   när versionen saknas.
6. `prp-hair` och `prp-skin` har samma text som övriga åtta.
7. Versionsfältet är **samma** som ORD-136 använder. Visa att det är ett
   fält, inte två.
8. `CCO_SEND_LIVE` orörd. `pending` kvar som förval.

## Vad jag inte avgjort

**Vilka behandlingar som är momsbefriade.** Fazli och juristen.

**Om offertaccept och avtalssignering är samma moment.** Er tabell säger
`Offert | Accepterad · Behandlingstid | Bokad`. Juristen säger att tiden
bokas efter **undertecknat** avtal. Är det ett moment hos er stämmer det
redan; är det två finns en skillnad. Rör ingen bokningsgrind förrän Fazli
svarat.
