# CCO — Krav-checklista (extraherad ur workflow-dokumenten)

> **Källa (allt läst):**
>
> - `docs/workflow/cco-workflow-v13.md` (huvud-workflow, **källan vid konflikt**)
> - `docs/workflow/cco-workflow-curatiio.md`
> - `docs/workflow/cco-dokument-inventering.md`
> - `docs/handover/ord110-cco-store-path-inventering.md` (bakgrund: state/persistens)
> - `docs/handover/ORDERS/ORD-111-mallen-nar-aldrig-mejlet-2026-08-26.md` (eftervård-scheduler, `{{treatment}}`, varibel-ifyllning, dry-run)
>
> **Viktig korrigering som genomsyrar allt:** uppföljning är **4 / 8 / 12 mån** (inte 4/6/12). Efter Figma-rättelsen 2026-08-26: fyra träffar på 4 mån, tre på 8, tre på 12, **noll på 6**. Föråldrat `cco-end-to-end-kundresa.md` säger 4/6/12 — ignoreras.

---

## (a) Kund-sida — vad kunden gör / får per fas + dokument som skickas

**FAS 1 · Upptäckt & intresse**

- [ ] Webb (hairtpclinic.com / curatiio.com), Instagram, telefon → lämnar kontakt i formulär → registreras som potentiell kund.

**FAS 2 · Bokning**

- [ ] Bokar konsultation — **Online** eller **Fysisk** (`Boka konsultation` → `Slutför bokning`).
- [ ] Godkänner **personuppgiftspolicy**, **bokningsvillkor & GDPR** (3 samtycken: Personuppgiftspolicy, Bokningsvillkor & GDPR, Personuppgifter).
- [ ] **Får:** Bokningsbekräftelse + **Hälsodeklaration (HTPC)** + **Tjänstespecifikation (länk)** via AutoMail. Dokument: `steg2-auto-bokningsbekraftelse-final-demo.html`.

**FAS 3 · Konsultation**

- [ ] Fyller **hälsodeklaration** — fysiskt på plats **eller online (länk före konsultation)**. Varumärkesvariant: `steg3-halsodeklaration-final-demo.html`, `steg3-halsodeklaration-curatiio-final-demo.html`, `steg3-health-questionnaire-eng-final-demo.html`.
- [ ] Får **info per behandlingsväg**: `steg4-prp-hair-info-sve/-eng`, `steg4-botulinum-info-sve`, `steg4-hyalase-info-sve`, `steg4-microneedling-info-sve`, `curatiio-profhilo-info`, `curatiio-prp-hud-mn-info` (och övriga `curatiio-*`-info).

**FAS 4 · Offert & behandlingsplan**

- [ ] Får **offert** (behandlingsplan, tjänstespec, ev. ritningar), läser och accepterar → `Offert | Accepterad`.
- [ ] Offert-dokument per väg: `steg5/steg7-offert-tp`, `steg5-offert-prp-hair`, `steg5-offert-prp-skin`, `steg5-offert-profilo`, `steg5-offert-prf`, `steg5-offert-microneedling`, `steg5-info-offert-tp`.

**FAS 5 · Förberedelse inför behandling**

- [ ] Godkänner/skriver **avtal** + **avstår ångerrätt 2 v.** + **bokningsvillkor** + **bildhantering** (TP Behandlingsavtal, Ångerrätt, Betänketid, Bildhantering = alla `Godkänd`).
- [ ] Godkänner/skriver **estetik-avtal + bildsamtycke + bokningsvillkor** (Curatiio).
- [ ] **Friskförsäkran** — **enbart på operationsdagen** (`steg8-friskforsakran-final.html`).
- [ ] Dokument: `steg6-angerratt-samtycke`, `steg6-betanketid-samtycke`, `steg6-auto-betanketid`, `steg8-friskforsakran`, `steg8-fore-efter-bildmall`.

**FAS 6 · Behandling**

- [ ] Genomgår behandling per väg A–F; **får behandlingsbekräftelse (AutoMail)**.

**FAS 7 · Betalning & fakturering**

- [ ] Betalar **förskott 20 %** → `Förskott betald`; därefter **slutfaktura 80 %** → `Slutfaktura | Betald`.
- [ ] **Får** `Faktura 20 % | Mail` och `Faktura 80 % | Mail`.

**FAS 8 · Eftervård & uppföljning**

- [ ] Får **eftervårdsråd** + **påminnelser** (AutoMail, påminnelse 24 h före behandling).
- [ ] Deltar i uppföljningar: TP **4 / 8 / 12 mån** (12 = slutresultat); PRP **~2 mån efter sista**; Curatiio **enligt behandlingsplan**.
- [ ] Godkänner **foto-samtycke** vid uppföljning (Hair TP: hårlinje/krona — aldrig ansikte). Dokument: `steg9-foto-samtycke-final-demo.html`.

**FAS 9 · Resultat & återkomst**

- [ ] Nöjd → återkommer/rekommenderar. Resultatbilder (före/efter) används → Instagram (med samtycke); **anpassat resultatmail** (manuellt idag).

---

## (b) Personal-sida — vad personalen gör / dokumenterar per fas

**FAS 3 · Konsultation**

- [ ] Hårspecialist/klinikchef (TP/PRP) **eller** ssk/läkare (estetik) genomför konsultation enligt **konsultationsmall** + **ID-verifiering**.
- [ ] Stämmer av **hälsodeklaration**, avgör **behandlingsbarhet** och väljer **behandlingsväg A–F**. `Hälsodeklaration | Reg.` → kundkort + kalender.
- [ ] Verktyg: `steg4-konsultationsmall-final-demo.html`, `steg4-id-verifiering-final-demo.html`.

**FAS 4 · Offert & behandlingsplan**

- [ ] Tar fram offert per väg, markerar `Offert | Accepterad`, bokar tid → `Behandlingstid | Bokad`.
- [ ] Fyller **behandlingsplan (staff)**: `steg5-behandlingsplan-staff-final-demo.html`.

**FAS 5 · Förberedelse (pre-OP)**

- [ ] Transpl./PRP: **ID & friskförsäkran**, **vitalparametrar**, bekräfta behandlingsplan, **rakning/ritning/pre-OP-foto** (+ post-OP-foto på op-dag).
- [ ] Curatiio pre-OP: ID, plan, före-foto; **friskförsäkran vid kirurgi** (ögonlock).
- [ ] CCO-data: `TP DATA` (Behandlingsavtal, Ångerrätt, Bokningsvillkor, Bildhantering = godkänd) + `Förkonsultation DATA` (Friskförsäkran ifylld, Behandlingsplan bekräftad, Ritning/Pre-OP/Post-OP-bild → bildbank).

**FAS 6 · Behandling**

- [ ] **TP (hår/ögonbryn/skägg) op-dag:** **Ordination (läkare — ej kund)** → medicinsk instruktion → **lokalbedövning 1 & 2** → **extraktion** → **kanaler** → **implantation** → **PRP 1/4** → **post-OP-foto** → **post-OP-medicinering**. Journal: `Journal | TP`.
- [ ] **PRP 2/4–4/4:** **TP-post-PRP-journal** + bilder. `Journal | PRP Efterbehandling`.
- [ ] **Curatiio:** **estetik-journal per behandling** + före/efter-bilder; **ordination** (Botox/läkemedel) skrivs av läkare — personal ser, kunden ser den ej.
- [ ] Journal + bilder **varje besök** (regel 4).

**FAS 8 · Eftervård & uppföljning**

- [ ] Bokar + genomför uppföljningar; **journal + före/efter-bilder varje besök**.
- [ ] `Journal | 4/8/12-månaderskontroll`, `Före & Efter | Bildbank` per tillfälle; `Efterbehandling bokad | 3/4`, `4/4`. AutoMail + påminnelse 24 h.

**FAS 9 · Resultat & återkomst**

- [ ] `🔒 Resultatbilder | Före & Efter` → Instagram (**Anpassat Mail | Manuellt** idag).

---

## (c) System / automatisering

**Beställd kundresa**

- [ ] **Kundresa 9 steg** via `buildJourneyFromState` / V11-rail (behålls).
- [ ] **Bokningsmotor + AutoMail** via `ccoBookingEngineStore` (behålls): bokningsbekräftelse + hälsodeklaration + tjänstespec-länk.
- [ ] **Offert / Accepterad** (kommersiell store) (behålls).
- [ ] **Hälsodeklaration + friskförsäkran** (kundresa steg 2/8) (behålls).
- [ ] **Dokument (avtal, samtycken)** — ok/avstå-ångerrätt (behålls).
- [ ] **Journaler per besök** ("Besök · tillfällen") (behålls).
- [ ] **Ekonomi (värde/skuld)** via V11-rail (behålls).

**Ska automatiseras (var manuellt i dag)** — från §8 automatisering

- [ ] **AutoMail-påminnelser ×4** → automatisera (var `PåminnelseMail x4` manuellt; ska auto ≤ V13).
- [ ] **Påminnelse 24 h före behandling**.
- [ ] **Anpassat erbjudande/resultatmail** (AI-förslag) → automatisera.
- [ ] **Instagram-publicering** → delvis auto.
- [ ] **Fakturering 20/80** → flytta in i CCO (idag befintlig lösning).

**Eftervård-scheduler + delad followup-mall**

- [ ] `ccoAftercareSchedulerStore` skapar jobb med referens `followup_${treatmentKey}_${offset}` (t.ex. `followup_fue_8m`).
- [ ] **Väg B = delad mall med `{{treatment}}`** (Fazli-beslut 2026-08-26): **3 mallar** i stället för 12; fylls vid sändning. `followup_tp_4m/8m/12m`, ämnen "Fyra månader / Åtta månader / Ett år efter din behandling".
- [ ] `{{treatment}}` fylls med böjd behandling i löptext: _hårtransplantation / ögonbrynstransplantation / skäggtransplantation_ (ej nyckeln `fue`).
- [ ] **Gemensam nyckel** för de fyra transplantationstyperna → `tp` (mappning `fue|dhi|beard|eyebrow → tp` vid ref-bygge, eller fyra refs som pekar på samma mall).
- [ ] **Kadens** för transplantationsnycklar: `["4m", "8m", "12m"]` (och för `beard`/`eyebrow` — se (e)).
- [ ] **Variabelsubstitution** (ORD-111): renderare (`subject`/`html`/`text`) hämtas från mallens revision; både **automatisk** (systemvärden) och **manuell ifyllning**.
- [ ] **En konvention:** camelCase (registret) — migrera `prepareResponseDrafts` från snake_case. Återanvänd `extractVariablesFromContent` (i `optimizeVariables.js`) — skriv inte om.
- [ ] Ofylld variabel **får aldrig** gå ut som `{{namn}}` till kund → fylls eller stoppas (med orsak till avsändaren).
- [ ] **`performSend` får aldrig skicka skarpt vid tom `subject`/kropp** — idag faller `subject` på `'(utan ämne)'` och `html`/`text` på `undefined` → gör till fel som stoppar och loggar.

**Persistens / state (ORD-110-bakgrund)**

- [ ] Beständig state ska skrivas till `/var/data` (via `ARCANA_STATE_ROOT`), inte till containerns filsystem (`data/`) som raderas vid deploy.
- [ ] Flytta beständiga stores: `cco-customers`, `cco-booking-cases`, `cco-mailboxes`, `cco-photo-annotations`, `cco-treatment-plans`, `cco-incident-log`, `cco-dsr`, `cco-dataflow-map`, `cco-offer-document-packages`, `cco-vendor-register`, `cco-policies`, `cco-brands`, `cco-users`, `cco-photo-consents`, `cco-id-verifications`, `cco-marketing-consent`, `cco-offers-quick`, `cco-agreements-quick`, `cco-send-actions`, `photos` (katalog).
- [ ] `cco-customers.json` har **duplikat** (server.js:426 hårdkodad + 11304 via config) → red ut risken för split-fil.

---

## (d) Dokument & journaler (komplett)

**Dokument Hair TP Clinic (steg 2–9)**

- [ ] Steg 2: `steg2-auto-bokningsbekraftelse-final-demo.html` · `auto-bokningspaminnelse-final-demo.html` · `auto-avbokningsbekraftelse-final-demo.html`
- [ ] Steg 3: `steg3-halsodeklaration-final-demo.html` · `steg3-health-questionnaire-eng-final-demo.html` · `steg3-auto-instruktion-formular-final-demo.html`
- [ ] Steg 4: `steg4-prp-hair-info-sve-final-demo.html` · `steg4-prp-hair-info-eng-final-demo.html` · `steg4-konsultationsmall-final-demo.html` · `steg4-id-verifiering-final-demo.html`
- [ ] Steg 5: `steg5-info-offert-tp-final-demo.html` · `steg5-offert-tp-final-demo.html` · `steg5-offert-prp-hair-final-demo.html` · `steg5-behandlingsplan-staff-final-demo.html`
- [ ] Steg 6: `steg6-angerratt-samtycke-final-demo.html` · `steg6-betanketid-samtycke-final-demo.html` · `steg6-auto-betanketid-final-demo.html`
- [ ] Steg 7: `steg7-offert-tp-final-demo.html` · `steg7-offert-prp-hair-final-demo.html` · `steg7-v6-kundkort-final-demo.html`
- [ ] Steg 8: `steg8-friskforsakran-final.html` · `steg8-fore-efter-bildmall-final-demo.html`
- [ ] Steg 9: `steg9-foto-samtycke-final-demo.html`
- [ ] Bundle: `cco-avtal-samtycke-bundle.html`

**Dokument Curatiio (info / offert / hälsodeklaration)**

- [ ] Info: `curatiio-botox-info-final-demo.html` · `curatiio-filler-info-final-demo.html` · `curatiio-profhilo-info-final-demo.html` · `curatiio-ogonlock-info-final-demo.html` · `curatiio-prf-hud-info-final-demo.html` · `curatiio-prp-hud-mn-info-final-demo.html` · `curatiio-ortoped-info-final-demo.html` · `steg4-botulinum-info-sve-final-demo.html` · `steg4-hyalase-info-sve-final-demo.html` · `steg4-microneedling-info-sve-final-demo.html`
- [ ] Offert: `steg5/steg7-offert-profilo` · `steg5/steg7-offert-prf` · `steg5/steg7-offert-microneedling` · `steg5/steg7-offert-prp-skin`
- [ ] Hälsodeklaration: `steg3-halsodeklaration-curatiio-final-demo.html`
- [ ] ⚠️ **Bildsamtycke (ansikte)** — saknas (se (e)).

**Gemensamma & auto-mail**

- [ ] `auto-integritet-final-demo.html` (GDPR/integritetspolicy) · `auto-medical-finance-final-demo.html` (medicinsk/finans) · `auto-bokningspaminnelse-final-demo.html` · `auto-avbokningsbekraftelse-final-demo.html` · `cco-workflow-v13.html` (workflow-översikt) · `cco-friskforsakran-demo-overlay.html` · `cco-foto-samtycke-demo-overlay.html`

**Journaltyper (per behandling) + faktiska fält**

- [ ] **PRP-journal (multi)** — PRP hår, PRP hud (`steg8-journal-prp-multi-final-demo.html`).
- [ ] **TP-journal · Op-dag (52 fält)** (`steg8-journal-tp-final-demo.html`): metod FUE/DHI/kombination · reaktion lokalbedövning 1&2 · Dalacin ja/nej · grafts singel/dubbel/trippel/kvadrupel/totalt · tidsregistrering (start planering, lokalbedövning donation, extraktion donation, lokalbedövning mottagar, kanalpreparering mottagar, implantation start/slut, lämnar rum) · läkemedel ml (Carbokain-adrenalin 20 mg/ml, Marcain 5 mg/ml, Adrenalin 1 mg/ml, Tribonat).
- [ ] **TP-post-PRP (24 fält)** (`steg8-journal-tp-post-prp-final-demo.html`): känselbortfall · klåda · svårt att sova · öm donationsområde · blödning · spänningshuvudvärk · kommit åt/slagit · annat besvär · stickstatus (nålrädd, svårstucken, svaga kärl, rädd för blod, annat) · allmänna anteckningar.
- [ ] **TP-uppföljning 4/8 mån (8 fält)** (`steg8-journal-tp-follow-4/-8-final-demo.html`): läkning normal · lätt rodnad · ökad ärrvävnad · återväxt bra · gleshet i nacken · långsam/försenad återväxt · glest slutresultat · observationer.
- [ ] **TP-resultat 12 mån (12 fält)** (`steg8-journal-tp-follow-12-final-demo.html`): 8 basfält + slutresultat/bedömning · patient nöjd · rekommendation · före/efter-bild.
- [ ] **Estetik-journal** (Curatiio) — genereras via `cco-journalbygge-v3.html`, `cco-journal-qa-v3.html`, `cco-journal-safety-v3.html`, `journal-plan-editor-demo.html`.
- [ ] **Ordination TP (lokalbedövning)** (`steg8-ordination-tp-final-demo.html`): patient · personnummer · behandlingsdag · behandlare · läkemedel ml (Carbokain, Marcain, Adrenalin i NaCl, Tribonat) · ordinerande behandlare · övrig ordination. (Källa: SharePoint "Ordination – Lokalbedövning vid hårtransplantation.docx".)
- [ ] **Ordination recept** (`steg8-ordination-recept-final-demo.html`): ⚠️ stub/placeholder, **ingen "Signera"-knapp** (endast "Spara utkast"), avvaktar SharePoint/e-recept.
- [ ] **Före/efter-bildmall** · **Konsultationsmall** · **ID-verifiering** · **Kundkort (v6)** (alla behandlingar).

---

## (e) Kända glapp / blockerare

- [ ] **Curatiio foto-samtycke (ansikte) saknas.** Hair TP scope = hårlinje/krona (aldrig ansikte); estetik scope = **ansikte**. Behöver en Curatiio-specifik foto-samtycke (inventeringen + curatiio-workflow rad 124/139).
- [ ] **Ordination-recept (SharePoint/e-recept) koppling saknas.** `steg8-ordination-recept-final-demo.html` är en fungerande stub (Signera finns men ingen e-recept/SharePoint-koppling; ingen signera-knapp, bara "Spara utkast").
- [ ] **Manuell variabel-ifyllning UI saknas.** Idag `snapshotForSend` returnerar `revision.body` ordagrant; ingen substitution någonstans. `prepareResponseDrafts` hårdkodar endast `{{first_name}}`/`{{clinic_name}}` (snake_case) vs registrets camelCase (`firstName`, `treatment` m.fl. — 20 variabler). `extractVariablesFromContent` gör uttagning men ersätter inget. Risk: `{{namn}}` kan gå ut rå till kund.
- [ ] **`performSend`-bugg (oupptäckt, tack vare dry-run):** ingen subject/html/text byggs — ämne faller till `'(utan ämne)'`, kropp `undefined` → skulle skicka tomt meddelande skarpt. Måste bli ett stoppande fel.
- [ ] **Dry-run vs skarp sändning:** `CCO_SEND_LIVE` är **osatt** → `isDryRunDefault()` true → ingenting skickas. Allt arbete sker i dry-run tills Fazli sätter `CCO_SEND_LIVE`. Mallen "når aldrig mejlet" just därför.
- [ ] **`beard` och `eyebrow` saknas i kadenskonfigen.** `cco-treatment-document-requirements.json` har 13 nycklar (fue, dhi, prp_hair, microneedling_hair, trichoscopy, botox, filler, bleph, prp_skin, mesotherapy, profhilo, fat_dissolving, orthopedics_prp) — **inga beard/eyebrow**. Bokningsmotorn har tjänsterna (active=true), men eftervården känner inte till dem → inga uppföljningar skickas för skägg/ögonbryn. Lägg till `["4m","8m","12m"]`.

> **Övriga kända fakta (ej blockerare, vägledande):** ögonbryn- och skäggtransplantation följer exakt väg C (samma journaler/dokument); enda skillnad ingreppsområde. PRP har **ingen extraktion** (extraktion enbart på transplantation). Curatiio har inga PRP 2/4–4/4 eller 4/8/12-uppföljningar — följs upp enligt behandlingsplan.
