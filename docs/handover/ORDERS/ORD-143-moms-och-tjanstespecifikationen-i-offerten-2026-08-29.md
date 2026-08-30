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

**Satsen: 25 % på allt som kostar.** Fazli, 2026-08-29: verksamheten är
estetisk, alltså momspliktig. Ingen befrielse, ingen specialhantering.

Bygg ändå satsen som **en uppgift på tjänsten**, inte som `0.25` inskrivet
i tjugo mallar. Ändras en sats någon gång ska det vara en rad, inte tjugo.

Nolltjänsterna (uppföljningar, PRP-efterbehandling) kostar inget och har
därmed ingen momsrad att visa.

## 2 · Tjänstespecifikationen refereras men bifogas aldrig

Det här är det allvarligare av de två.

> ### ⚠ RÄTTELSE 2026-08-30 — siffrorna nedan är felaktiga
>
> Tabellen sa **"8 av 10 offerter nämner tjänstespecifikationen"**. Det
> stämmer inte. Mätt om:
>
> ```
> $ git grep -c "tjänstespec" -- src/ops/ccoOfferTemplateStore.js
> 0
>
> agreementText-mallar: 14
> ```
>
> **Ingen** av de fjorton offertmallarna nämner specifikationen. De säger
> "behandlingsplan" och "markerade zoner". Siffran kom ur en tidigare
> rapport som jag förde vidare utan att mäta om — mitt fel.
>
> **Påståendet finns, men i signeringsflödet, inte i offerten:**
>
> ```
> ccoTreatmentAgreementDocument.js:96   "Genom signering bekräftar patienten
>                                        att bilaga 1 mottagits…"
> ccoOfferEsign.js:260                  "…betänketid är X dagar från att du
>                                        mottagit tjänstespecifikation…"
> ```
>
> Rad 96 är allvarligast: patienten **skriver under** på mottagandet.
> Rad 260 **räknar betänketiden** från det.
>
> §2 nedan är därför överspelad i sina siffror men rätt i sin sak.
> **Den ersätts av ORD-150**, som är byggd på den korrigerade mätningen.
> Bygg efter ORD-150, inte efter det här avsnittet.

Offerttexten säger, i klartext — men i signeringsflödet, inte i mallarna:

> "… tjänstespecifikation ('Behandlingen') som tillhandahållits Kunden."

Avtalet **förutsätter att kunden har fått den.** Och det som stod fast
även efter ommätningen:

|                                                          |          |
| -------------------------------------------------------- | -------- |
| Dokument som **bifogar eller länkar** en specifik version | **0**    |
| Katalograder för tjänstespecifikation                     | **0**    |

Systemet påstår i ett juridiskt bindande dokument att något lämnats till
kunden, utan att veta om det gjordes. Det är sant — bara på ett annat
ställe än den här ordern trodde.

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
4. Satsen står på **ett** ställe. Sök efter `0.25` och `25` i mallarna och
   visa noll träffar.
5. Offerten bär tjänstespecifikationens version. Ett test som misslyckas
   när versionen saknas.
6. `prp-hair` och `prp-skin` har samma text som övriga åtta.
7. Versionsfältet är **samma** som ORD-136 använder. Visa att det är ett
   fält, inte två.
8. `CCO_SEND_LIVE` orörd. `pending` kvar som förval.

## Besvarat 2026-08-29

**Momssatsen: 25 %, på allt som kostar.** Verksamheten är estetisk och
därmed momspliktig. Frågan om befrielse är stängd.

**Offertaccept och avtalssignering är två moment.** Bekräftat i koden och
av Fazli. Tiden **reserveras** vid accept och **bekräftas** vid signerat
avtal. Det ägs av ORD-146 — rör ingen bokningskod härifrån.
