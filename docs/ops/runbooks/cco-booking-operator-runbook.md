---
owner: CCO
status: active
---

# CCO Bokningsoperatör — Runbook

Version: 1.0  
Datum: 2026-05-23  
Status: AKTIV

---

## Syfte

Operativ runbook för **webb-bokningar** i CCO (`/admin#cco` / `/major-arcana-preview/`). Beskriver hur operatören hittar bokningsärenden från hairtpclinic.com, skiljer dem från mejltrådar och tar typiska åtgärder.

---

## Snabbstart

1. Logga in i CCO som operatör eller OWNER.
2. Öppna **Bokning** i höger arbetsyta (eller motsvarande bokningspanel).
3. Välj sortering **Webb-bokningar** i bokningslistan.
4. Klicka ett **bokningsärende** — mejltråd krävs inte för webb-leads.

---

## Termer

| Operatörsterm | Betydelse |
|---------------|-----------|
| **Webb-bokning** | Bokning skapad via hairtpclinic.com (`/boka`), inte via telefon eller mejl. |
| **Bokningsärende** | Ett öppet case i bokningsytan med status, signal och nästa steg. |
| **Webb-bokningar** | Filter/sortering som visar enbart webb-leads. |
| **Bokningshandoff** | Ärende som väntar på operatörsbeslut eller extern bekräftelse. |
| **Svarstudio** | Yta för svar, förslag och utkast mot kund. |

Se även [cco-operator-language.md](../../uiux/cco-operator-language.md).

---

## Arbetsflöde — Webb-bokningar

### 1. Hitta nya ärenden

- Öppna bokningspanelen med listan **Bokningsärenden**.
- Välj **Webb-bokningar** i sorteringsmenyn.
- Tom lista: *"Inga webb-bokningar i listan just nu. Nya bokningar från /boka visas här."*
- Nya webb-bokningar visas **inte** i vänsterkolumnens generella Bokning-filter — använd alltid **Webb-bokningar**-vyn.

### 2. Öppna och bedöm ärende

- Klicka raden i listan — trådval i mejlkön är **valfritt** för webb-leads.
- Läs toppkortet: behandling, kontakt, signal (*Webb-bokning skapad*) och rekommenderat nästa steg.
- Kontrollera **Logg** om historik eller proveniens behöver verifieras.

### 3. Typiska åtgärder

| Situation | Åtgärd |
|-----------|--------|
| Ny webb-bokning, tid ok | Bekräfta/boka i extern kalender, markera bekräftelse i CCO. |
| Kund saknar telefon/e-post | Följ upp via angiven kanal; lägg anteckning i ärendet. |
| Behandling kräver medicinsk bedömning | Eskalera enligt klinikens rutin; håll ärendet i vänteläge. |
| Dubbel bokning / dubblett | Slå ihop eller stäng det äldre ärendet; dokumentera i loggen. |
| Kund svarar i mejl efter webb-bokning | Öppna relaterad tråd om den finns; annars fortsätt i bokningsärendet. |

### 4. Avsluta eller överlämna

- När bokning är bekräftad: markera enligt bokningsytans primära åtgärd.
- Vid **Överlämning**: ange tydlig status så nästa skift ser vad som väntar på kund eller kollega.

---

## Filter och navigation

- **Webb-bokningar** — endast leads från webben.
- **Bokningsärenden** (listans aria-label) — alla öppna bokningscase i panelen.
- Mejlköns **Bokning**-filter — e-postbaserade bokningsärenden; **ersätter inte** webb-bokningsvyn.

---

## Felsökning

| Symptom | Kontroll |
|---------|----------|
| Lista tom trots ny bokning på webben | Vänta på sync; kontrollera att rätt tenant/mejlkonto är aktivt. |
| Ärende syns i mejl men inte under Webb-bokningar | Troligen mejlbaserat ärende — använd mejlköns Bokning-filter. |
| Bokningspanel laddar inte | Ladda om CCO; kontrollera nätverk och inloggning. |

---

## Relaterade dokument

- [cco-operator-language.md](../../uiux/cco-operator-language.md)
- [cco-booking-mvp-spec.md](../../strategy/cco-booking-mvp-spec.md)
- [web-to-arcana-bridge.md](../../strategy/web-to-arcana-bridge.md)
