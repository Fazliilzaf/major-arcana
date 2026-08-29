# ORD-133 · Hela listan — offerter, tjänstebeskrivningar, tjänstespecifikationer, journaler

**Arbetsorder · 2026-08-27**
**Bas:** `main` (`31fa3ded`)
**Föregås av:** ORD-126 (estetik-journalerna, klar och verifierad)
**Läs först:** `docs/workflow/MASTERPLAN-CCO-2026-08-27.md`

Hela inventeringen nedan är räknad ur `hairtp-document-types.catalog.json`
(45 rader) och ur filerna i `public/major-arcana-preview/` i dag. Inga
uppskattningar.

---

## 1 · OFFERTER — 6 typer

| id | steg | flöde | kliniker |
| --- | --- | --- | --- |
| `offert_tp` | 7 | tp | hairtp |
| `offert_prp_hair` | 7 | prp_hair | hairtp |
| `offert_prp_skin` | 7 | prp_skin | hairtp + curatiio |
| `offert_microneedling` | 7 | microneedling | hairtp + curatiio |
| `offert_prf` | 7 | prf | hairtp + curatiio |
| `offert_profilo` | 7 | profhilo | curatiio |

På disk: 13 filer — sex `steg5-offert-*` och sex `steg7-offert-*` som är
samma sex typer i två skeden, plus `steg5-info-offert-tp`.

### Hål 1 · Fyra Curatiio-behandlingar kan inte offereras

**Botox · Filler · Ögonlocksplastik · Ortopedi** har **varken offertfil
eller katalograd**. Fyra av åtta Curatiio-behandlingar kan alltså inte
producera en offert i systemet.

### Hål 2 · En offert för 39 tjänster

`offert_tp` täcker alla Hair TP-transplantationer. Men priset beror på
metod och graftantal — "FUE 1 500 grafts · 42 000 kr" är en **tjänst**,
inte en behandlingstyp. Utan `serviceIds` kan offerten inte veta vilken.

### Automatiseringen

1. Sex saknade offerter byggs, samma mall som de befintliga sex.
2. Offerten hämtar pris **genom en referens till tjänsten**, aldrig som
   inklistrad text. Ett pris i ett dokument är rätt den dagen det skrivs.
3. `steg5` (förhandsvisning) och `steg7` (för signering) ska vara samma
   underlag i två lägen — inte två dokument som kan glida isär.

---

## 2 · TJÄNSTEBESKRIVNINGAR — 6 i katalogen, 13 på disk

| id | steg | flöde |
| --- | --- | --- |
| `prp_hair_info_sve` | 3 | prp_hair |
| `prp_hair_info_eng` | 3 | prp_hair |
| `microneedling_info` | 3 | microneedling |
| `hyalase_info` | 4 | hud |
| `botulinum_info` | 4 | hud |
| `info_offert_tp` | 5 | tp (system) |

### Hål 3 · Sju Curatiio-beskrivningar finns som filer men inte i katalogen

`curatiio-botox-info` · `curatiio-filler-info` · `curatiio-ogonlock-info`
· `curatiio-ortoped-info` · `curatiio-prf-hud-info` ·
`curatiio-profhilo-info` · `curatiio-prp-hud-mn-info`

Det är **exakt samma hål som ORD-126 stängde för journalerna** — filerna
finns, katalogen känner dem inte, alltså syns de inte i kundkortet och
kan inte skickas.

### Automatiseringen

1. Sju katalograder, med `clinics: ['curatiio']` eller båda där det
   gäller, och `data-registry-id` i varje fil.
2. Beskrivningen skickas automatiskt **före konsultationen**, kopplad
   till den bokade tjänsten.
3. Språk: `language`-fältet finns redan. Bygg inte dubbletter — SV och EN
   är varianter av samma typ.

---

## 3 · TJÄNSTESPECIFIKATION — finns inte

**Noll katalograder, noll filer.** Det finns ingen dokumenttyp som
beskriver *vad tjänsten innehåller* — metod, omfattning, tid, vad som
ingår.

Det är det som skulle bära "FUE-metoden · 1 500 grafts · 42 000 kr", och
det är det offerten och journalen båda behöver kunna peka på.

### Automatiseringen

**Tjänstespecifikationen ska inte bli ett dokument bland 45.** Den ska
vara en **rad i tjänstekatalogen** som dokumenten refererar till:

- ett `serviceId`
- metod, omfattning, tid
- pris (en nivå per tjänst, inte fritext)
- vilka underlag tjänsten kräver ← det här är `serviceIds` sett från
  andra hållet

Offerten läser den. Journalen länkar till den. Ändras priset ändras det
på ett ställe, och gamla dokument behåller det pris de skrevs med.

---

## 4 · JOURNALER — 11 typer

| id | steg | flöde | kliniker |
| --- | --- | --- | --- |
| `journal_tp` | 8 | tp | hairtp |
| `journal_prp_multi` | 8 | prp_hair, prp_skin, prf, microneedling | båda |
| `journal_estetik_botox` | 8 | botox | båda |
| `journal_estetik_filler` | 8 | filler | båda |
| `journal_estetik_profhilo` | 8 | profhilo | båda |
| `journal_estetik_ortopedi` | 8 | ortopedi | båda |
| `journal_estetik_op` | 8 | op (bleph) | båda |
| `journal_tp_post_prp` | efter 8 | tp | hairtp |
| `journal_tp_follow_4` | efter 8 | tp | hairtp |
| `journal_tp_follow_6` | efter 8 | tp | hairtp | ← **fel, se ORD-127** |
| `journal_tp_follow_12` | efter 8 | tp | hairtp |

Efter ORD-126 är täckningen god. Två saker kvar:

- **`journal_tp_follow_6` ska bli `_8`.** Kadensen är 4 · 8 · 12 i koden
  och på båda workflow-sidorna. Katalogen är ensam om sexan.
- **Curatiio har ingen uppföljningsjournal.** Åtta behandlingar med
  behandlingsjournal men ingen `_follow`. Är det rätt? Det är en klinisk
  fråga — fråga Fazli, anta inte.

### Automatiseringen

1. Rätt journal surfas ur bokningens tjänst — steg 1 i masterplanen.
2. Utföraren (`practitionerId` från bokningen) är förvald ifyllare,
   utbytbar. Inte inloggad användare.
3. Uppföljningsjobben skapar **utkast**, inte tomma blad.

---

## 5 · ORDINATION — 2 typer, båda bara Hair TP

`ordination_tp` (steg 5) och `ordination_recept` (steg 8), båda
`flowApplies: ['tp']`, båda `legallySensitive: true`.

**Curatiio har ingen ordination** — trots att Fazli sagt att läkaren ska
godkänna individuellt före varje operation i **båda** klinikerna. Se
ORD-128; det är den ordern som äger frågan.

---

## 6 · Sammanställningen

| Grupp | I katalogen | På disk | Hål |
| --- | --- | --- | --- |
| Offerter | 6 | 13 filer (6 typer × 2 skeden) | 4 behandlingar utan offert |
| Tjänstebeskrivningar | 6 | 13 | **7 utan katalograd** |
| Tjänstespecifikationer | **0** | 0 | finns inte alls |
| Journaler | 11 | — | follow_6, ingen Curatiio-uppföljning |
| Ordination | 2 | — | ingen för Curatiio |
| Juridik / samtycke | 12 | — | — |
| Automatutskick | 7 | — | — |

---

## Ordningen

1. **Sju katalograder för Curatiio-beskrivningarna** + `data-registry-id`
   i filerna. Minsta arbetet, största effekten — filerna finns redan.
2. **ORD-127** — `follow_6` → `follow_8`. En rad.
3. **Tjänstekatalogen med `serviceId`, pris och krävda underlag.** Det är
   tjänstespecifikationen, och den låser upp både offert och journal.
4. **`serviceIds` på katalograderna**, matat ur Fazlis arbetsblad.
5. **Fyra saknade offerter** — botox, filler, ögonlock, ortopedi.
6. Curatiio-uppföljning och Curatiio-ordination — **efter** Fazlis svar.

## Godkänt när

- Varje ny rad följer katalogen, ingen hårdkodning i en vy.
- Inget dokument bär ett inklistrat pris — bara referens till tjänsten.
- SV/EN är varianter via `language`, inte dubblerade typer.
- Inget godkänns av kod; `pending` är kvar som förval.
- `CCO_SEND_LIVE` orörd.
