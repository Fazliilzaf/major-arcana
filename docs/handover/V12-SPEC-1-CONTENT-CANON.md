# V12 SPEC 1 — CONTENT-CANON (13 sektioner)

**Källa:** `~/Library/Mobile Documents/com~apple~CloudDocs/Major Arcana 2.0/V12-WORKSPACE-CONTENT-CANON-2026-06-21.html`
**Roll i triadens:** Definierar **VAD** stora kundvyn innehåller — de 13 sektionerna, deras innehåll, ordning och åtgärder. (Spec 2 JOURNEY-SPINE = HUR det organiseras; Spec 3 JAMA = konkret instans.)
**Referenskund:** Anna Karlsson, steg 4 av 9, Konsultation pågår.

---

## 1. Funktion & princip

- **"V11 Rail expanderad till arbetsyta."** En vertikal arbetsyta som följer kundens resa från Nuläge → Insikter.
- **Inga tabbar. Inga DÖLJ-paneler.** Allt synligt i en lång kolumn.
- **Fast sektionsordning 1→13.** Aldrig omsorterad.
- **Layout:** 2 kolumner — `main` (1fr) + `rail` (360px sticky) + global `sticky-bar` längst ner.
- **Höger-rail är minimalistisk:** bara Snabb-jump (ankarmeny) + Senaste händelser.

## 2. UI-system (LOUD-palett, scoped)

| Token              | Värde                  | Bruk                       |
| ------------------ | ---------------------- | -------------------------- |
| `--amber`          | `#c8821e`              | accent, kickers, aktiv     |
| `--amber-bg`       | `rgba(200,130,30,.16)` | warning-chip/tag-bg        |
| `--amber-grad-top` | `#e89a2e`              | gradient-topp på CTA/badge |
| `--green`          | `#4a8268`              | done/ok                    |
| `--red`            | `#b94a4a`              | blockerare/danger          |
| `--info`           | `#4a7ba8`              | info                       |
| `--vellum`         | vit→cream gradient     | kort-yta                   |

- **Chips:** `.chip.ok` (grön) · `.warn` (amber) · `.danger` (röd) · `.info` (blå) · `.neutral` (grå).
- **Pulse-animation** (`@keyframes pulse`, amber glow) på aktiva element (aktivt-besök-prick, aktivt steg).
- **Stripe-accenter:** `--amber-stripe`/`--green-stripe`/`--red-stripe` = `inset 4px 0 0 <färg>` (vänsterkant).

## 3. De 13 sektionerna — innehåll, klick & arbetsfunktion

### 1 · Nuläge (`#s1`)

- **Innehåll:** XL-avatar, status-rad ("Aktivt besök · pågår · Steg 4 av 9"), namn, meta (ålder · tel · mejl · adress), Kund-ID + personnr-status, tags (VIP/PRP-hår/Botox/Återkommande/Allergi).
- **Snabbknappar (`.s1-quick`):** 📞 Ring · 💬 SMS · ✉️ Mejl · 📅 Ny bokning · ✏️ Redigera.
- **Hero-actions:** `⚡ Förbered besök` (primär gold-CTA) · `Åtgärder ▾` (meny).
- **Arbetsfunktion:** identitet + omedelbar kontakt + start på besöksförberedelse.

### 2 · Aktivt besök (`#s2`)

- **Innehåll:** PÅGÅR-badge (pulse) + tid sedan check-in; behandling (PRP 2/3, scalp, protokoll-version) + behandlare/rum.
- **6-node timeline:** bokad → in → **nu** (active) → journal → eftervård → klart, med connector-lines (`.tline` grön→amber done, `.tline.todo` amber→grå). _(= live #187.)_
- **Blockerare-lista:** "Måste lösas innan ingrepp" (Friskförsäkran saknas / Före-bild zonkarta).
- **Actions:** `📝 Starta journal` (hero) · `📷 Foto` · `✏️ Anteckning` · `✓ Avsluta` (tert/grön).
- **Arbetsfunktion:** operatörens live-kontroll under pågående besök.

### 3 · Kritiska varningar (`#s3`) — _du länkade hit_

- **Innehåll:** "måste lösas innan behandling" — `.warn-row` per varning: ikon `!` + what + why + action-knapp.
  - Penicillin-allergi (hög risk) → **Visa**
  - Friskförsäkran saknas (krävs före PRP) → **Skicka**
  - Blödarsjukdom (`.warn-amber`, måttlig) → **OK**
- **Arbetsfunktion:** säkerhets-gate — röda/amber rader som kräver kvittering/åtgärd innan behandling.
- **Live-status:** finns live (sett som "KRITISKA VARNINGAR" i V12 — Hälsodeklaration/Journal saknas-rader).

### 4 · Hälsa (`#s4`)

- **Header-action:** `Öppna full hälsoprofil →`.
- **2-kortsgrid:** (a) Hälsodeklaration · 9 frågor med chip-svar (Allergier JA·Penicillin danger, Blodförtunnande NEJ ok, …); (b) Läkemedel + kontraindikationer (Levaxin 50µg neutral, Vitamin D, Ingen ASA/NSAID ok, Penicillin·kontra danger "Aktiv flagga").
- **Arbetsfunktion:** medicinskt beslutsunderlag. **Not:** läkemedel/kontraindikationer kräver datakälla som live saknar (= backlog B1, owner-blockerad).

### 5 · Kundresa (`#s5`)

- **Progress-rad:** "3 klara · 1 pågår · 5 kommande" + bar + 44%.
- **9 steg-rader** med badge (✓/nummer), titel, sub, **per-steg-länkar** (`.step-link`: "📄 1 dok", "📷 4 foton", "📓 1 journal") + meta (datum/Pågår/Blockerare).
- **States:** done (grön ✓) · active (amber) · future · blocked (röd, steg 7).
- **Arbetsfunktion:** översikt + hopp till relaterat material per steg. _(= live #188 per-steg-länkar, fast canon visar dok/foto/journal-räkning.)_

### 6 · Journal (`#s6`)

- **Header-action:** `+ Ny anteckning`.
- **Rader:** datum-block + titel + meta + status-chip (Utkast warn / Signerad ok) + actions (Utkast→Spara/Fortsätt; signerad→Öppna).
- **Arbetsfunktion:** journalhistorik + fortsätt/öppna.

### 7 · Bilder (`#s7`)

- **Header-actions:** `📷 Ta bild` · `Jämför →`.
- **Foto-grid:** taggade tiles (`FÖRE 9 mar`, `ÖVER 11 apr`, `EFTER 5 maj`, `FILM 5 maj`) — kategori-klasser `fore/over/efter/film`.
- **Före/efter-bar:** "par föreslaget: FÖRE 9 mar ↔ EFTER 5 maj" + **Jämför**-knapp.
- **Gap-notis:** "⚠ Krona-vy saknas" + **Begär foto**.
- **Arbetsfunktion:** dokumentation + jämförelse. **Not:** före/efter/kategori kräver foto-metadata som live saknar (= backlog, owner-blockerad).

### 8 · Bokningar (`#s8`)

- **Header-action:** `+ Boka`.
- **Rader:** datum-block + titel + meta + status-chip (Bokad/Genomförd) + action (Bekräfta/Visa).
- **Sektion-CTA:** "3 kommande tider väntar bekräftelse" + **Bekräfta alla**.
- **Arbetsfunktion:** boknings-översikt + bekräfta/visa.

### 9 · Dokument (`#s9`)

- **Header-action:** `+ Lägg till`.
- **doc-grid:** rader med fil-ikon (PDF/DOCX/XLSX) + namn + meta + status-chip + action (Öppna/Skicka/Förhandsgranska).
- **Arbetsfunktion:** dokumentregister + signerings-flöde. _(Live grupperar offers/auto/files; #184 gjorde 2-kol kort.)_

### 10 · Kommunikation (`#s10`)

- **Header-actions:** `+ Svara` · `Svarstudio →`.
- **comm-rader:** kanal-ikon (mail/sms/call) + who + snippet + riktning/kanal/tid.
- **Arbetsfunktion:** kontaktlogg + svar.

### 11 · Ekonomi (`#s11`)

- **Header-action:** `→ Fortnox`.
- **eko-stats (4):** Total intäkt · Livstidsvärde · Snitt per besök · Utestående.
- **Faktura-rader** (PDF + namn + meta + status-chip Betald/Gratis + Visa).
- **Arbetsfunktion:** ekonomisk översikt + faktura-åtkomst. _(= live #172 fakturarader.)_

### 12 · Insikter och nästa bästa åtgärd (`#s12`)

- **Två kort:** `⚡ Gör nu` (amber, what+why+Skicka nu/Granska först) och `💡 Möjlighet` (grön, what+why+Boka/Påminn).
- **Arbetsfunktion:** prioriterad åtgärd + intäktsmöjlighet. _(= live #181 amber/grön gruppering.)_

### 13 · Sticky-arbetsbar (global, alltid nederst)

- **Innehåll:** kontext-rad (kund · behandling · rum + ⚡ kritisk uppmaning) + `📷 Foto` + `📝 Starta journal nu` (primär).
- **Princip:** primär CTA **ändras beroende på läge**.
- **Arbetsfunktion:** persistent nästa-åtgärd oavsett scroll. _(= live #13 sticky-modul.)_

## 4. Höger-rail (minimal)

- **Snabb-jump:** ankarlänkar `#s1`–`#s12` med nummer → scroll till sektion.
- **Senaste händelser:** mini-feed (check-in, HD uppdaterad, SMS skickad, bokning bekräftad).

## 5. Live-status mot canon (2026-06-24)

Alla 13 moduler renderar live (verifierat). Facit-parity-gap åtgärdade i Våg 5: Insikter (#181), Dokument 2-kol (#184), Palett (#186), 6-node timeline (#187), Kundresa-länkar (#188). **Kvar/blockerat:** Hälsa läkemedel+kontra (datakälla), Bilder före/efter+gap (foto-metadata), Nuläge "Förbered besök"-CTA (handler).

## 6. Relation till de andra två

- **Spec 2 (JOURNEY-SPINE)** tar SAMMA innehåll men omorganiserar: istället för 13 parallella sektioner hänger sektionernas data inline på det kundresa-steg de hör till. Kundresa (#s5) blir ryggraden; Aktivt besök (#s2), Bilder (#s7), Journal (#s6) etc. distribueras ut på stegen.
- **Spec 3 (JAMA)** = denna canon tillämpad på en tidig-journey-kund (steg 3, gles data).
