# ORD-157 · Tre avtal utan avtal

**Arbetsorder · 2026-09-01**
**Bas:** `main` (`1bb5e9de`)
**Föregås av:** ORD-133 (Curatiio-dokumenten), ORD-149 §3 (momsraderna i offerten), `hairtp-document-flow-contract-2026-06-28.md`
**Grind:** ORD-131 — ingen text ändras utan beslut · `CCO_SEND_LIVE` orörd
**Prioritet:** P1 — patienter signerar i dag ett dokument som kallar sig avtal utan att bära avtalets villkor

---

## Vad som saknas

Tre av tio behandlingsavtal innehåller **inga juridiska avsnitt alls**.

Mätt med `grep -cE '<h[23][^>]*class="doc-heading'` — rubriker i dokumentet,
inte CSS-regler:

```
avtal                  rader   rubriker   innehåll
offert_op                1074      22      11 avsnitt × SV + EN
offert_botox             1074      22      11 avsnitt × SV + EN
offert_filler            1074      22      11 avsnitt × SV + EN
offert_ortopedi          1074      22      11 avsnitt × SV + EN
offert_tp                1001       9      9 avsnitt, svenska + data-i18n
offert_prp_hair           630       9      9 avsnitt, svenska
offert_prp_skin           630       9      9 avsnitt, svenska
offert_microneedling      600       0      ← endast samtycke + signering
offert_prf                600       0      ← endast samtycke + signering
offert_profilo            600       0      ← endast samtycke + signering
```

De tre sista har noll rubriker. Det som finns i dem är:

```
"Behandlingsavtal"
"Begäran och samtycke till att behandling påbörjas under ångerfristen (14 dagar)"
"Jag godkänner behandlingsavtalet och lämnar särskilt samtycke …"   [ Signera ]
```

Alltså rubriken _Behandlingsavtal_, ångerrättssamtycket, och en signeringsknapp.
Ingen behandlingsbeskrivning, ingen offert, **ingen betänketid**, inga
betalningsvillkor, ingen av- och ombokning, inget ansvar, ingen tvistklausul.

Patienten signerar ett dokument som utger sig för att vara ett avtal och hänvisar
till "behandlingsavtalet" — men villkoren finns inte i det.

---

## Vad de ska bli

Mallen finns redan i repot, i två skick. **Använd den fullständiga.**

`steg7-offert-op-final-demo.html` (och botox/filler/ortopedi, identiska på
juridiken) bär elva avsnitt på både svenska och engelska:

```
Behandlingen · Offert · Giltighetstid och betänketid · Betalningsvillkor
Av- och ombokning · Resultat · Ansvar · Ångerrätt
Avtalsbrott och force majeure · Tvist · Information & samtycke
```

De sju-, nio-avsnittsvarianterna (`offert_tp`, `prp_hair`, `prp_skin`) är
svenskspråkiga och saknar engelsk spegling. Bygg inte de tre nya mot dem — då
ärver de en lucka som redan finns.

### Betänketiden: två dagar, ordagrant ur källan

Alla tre är injektions-/hudbehandlingar. Lag 2021:363 ger **två dagar**; sju
gäller kirurgi (ORD-157:s föregångare `1bb5e9de` rättade ögonlocksplastiken från
två till sju av just det skälet).

Meningen ska vara teckenidentisk med Nordbros tvådagarsversion:

> Tjänsteutövaren tillämpar betänketid (Betänketiden). Avtalet kan ingås med
> bindande verkan först när minst två (2) dagar har förflutit från att Kunden
> tagit del av informationen om Behandlingen i tjänstebeskrivningen.

Källa: `251203_Behandlingsavtal Hair TP Clinic gbg AB (DHI-metoden), 2 dagar.docx`.
Ägaren laddade upp den 2026-09-01 tillsammans med sjudagarsversionen. **De två
skiljer sig på exakt en mening** — betänketidens längd — allt annat är
teckenidentiskt. Verifierat med diff.

---

## Uppgiften

### 1 · Lägg källdokumenten i repot först

Nordbros två `.docx` finns i dag bara i ägarens Nedladdningar. Utan dem i repot
kan ingen kontrollera att en texträttelse följer källan — vilket är hela poängen
med `GRANSKNINGSKRAV`.

Lägg dem under `docs/legal/nordbro/` med datum i filnamnet, oförändrade, och
notera i `document-inventory.json` att de är facit för betänketidsklausulen.

Ingen konvertering, ingen omformatering. Originalen.

### 2 · Bygg de tre på den fullständiga mallen

Utgå från `steg7-offert-op-final-demo.html`. Byt ut det behandlingsspecifika —
behandlingsnamn, beskrivning, pris, riskavsnitt — och lämna de juridiska
avsnitten orörda.

Behandlingsspecifikt innehåll finns redan: `curatiio_prp_hud_mn_info`,
`curatiio_prf_hud_info` och `curatiio_profhilo_info` beskriver respektive
behandling och är patientinformation, inte avtalstext. Hämta därifrån hellre än
att formulera nytt.

**Rör inte de elva juridiska avsnitten.** De är Nordbro-material och omfattas av
ägarbeslutet 2026-06-28: oförändrat godkänt material förblir godkänt, men ändrad
lydelse i villkor, timing, ångerrätt eller betänketid kräver ny granskning.

### 3 · Behåll ångerrättssamtycket

De tre har redan samtyckesdelen — _"Begäran och samtycke till att behandling
påbörjas under ångerfristen (14 dagar)"_ enligt distansavtalslagen (2005:59).
Den ska ligga kvar. Den fyller en annan funktion än betänketiden och är korrekt
formulerad i dag.

**Två skilda saker som lätt blandas ihop:**

```
ångerfrist    14 dagar   distansavtalslagen — gäller distansavtal
betänketid     2 dagar   lag 2021:363 — gäller alla estetiska behandlingar
```

### 4 · Registrera proveniensen

`document-inventory.json` ska för de tre bära `contentSource`, vad som är
Nordbro-material och vad som är klinikens eget — så som `offert_prp_hair` redan
gör (`"klinik"`, `owner_facit_sync`). Utan det står vi om ett halvår med samma
fråga som i går: är den här texten godkänd?

---

## Fällan

**Skjut inte in en betänketidsmening i de nuvarande filerna.**

Det var den första reflexen, och den hade varit sämre än att låta bli. Ett
dokument som saknar tjugotvå avsnitt men har betänketidsmeningen ser komplett ut
i en granskning och är det inte. Antingen bygger man hela avtalet, eller så
lämnar man det uppenbart ofullständigt tills någon gör det.

**Rör inte de fyra som redan är rätt.** `offert_op` rättades 2026-09-01 och är
teckenidentisk med sjudagarsversionen. `offert_botox`, `offert_filler` och
`offert_ortopedi` är korrekta med två dagar.

---

## Godkänt när

1. Nordbros två `.docx` ligger i `docs/legal/nordbro/`, oförändrade, och pekas ut
   som facit i `document-inventory.json`.
2. De tre avtalen har samtliga elva juridiska avsnitt, på svenska och engelska.
3. Betänketidsmeningen är **teckenidentisk** med tvådagarsversionen. Ett test som
   jämför strängen mot källfilen, inte mot en kopia i testet.
4. Ångerrättssamtycket finns kvar oförändrat i alla tre.
5. Ett test som räknar juridiska avsnitt per avtal och failar om något av de tio
   har färre än elva. Det är kontrollen som saknades — ingen märkte att tre
   dokument var halva.
6. Mutationstesta punkt 3: ändra "två (2)" till "tre (3)" och visa att testet blir
   rött.
7. `document-inventory.json` bär proveniens för de tre.
8. Ingen text i de fyra fungerande avtalen ändrad. Diff ska visa noll rader där.

---

## Vad jag inte avgjort

**Om `offert_tp`, `prp_hair` och `prp_skin` ska byggas om till samma mall.** De
har nio avsnitt mot elva och saknar engelsk spegling. De är inte trasiga på
samma sätt som de tre — villkoren finns — men de är inte heller lika. Att göra om
dem är ett större arbete och en egen order. Mät skillnaden och **föreslå**.

**Om `GRANSKNINGSKRAV` ska bort från de arton dokument som bär den.** Ägaren
konstaterade 2026-09-01 att flaggan inte behövs när läkaren själv håller
konsultationen — men flaggan betyder något annat än sidans etikett påstår: att
texten inte kunnat matchas mot en Nordbro-godkänd version. Etiketten i
`cco-dokument-v1.html` bör rättas först, så att nästa beslut fattas mot rätt
fråga. Det är en egen liten order.

**Vem som skriver behandlingsbeskrivningarna.** Punkt 2 föreslår att hämta dem ur
patientinformationen, men den texten är skriven för att informera, inte för att
avtala. Om den inte passar rakt av är det klinikens formulering som gäller — inte
en AI:s.
