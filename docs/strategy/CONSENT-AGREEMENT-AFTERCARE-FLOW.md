# Consent, Agreement & Aftercare Flow

Kombinerad referens för samtyckes-, avtals- och eftervårdsflöden i CCO. Tre delar:

- **Del A** — Consent & Agreement Flow per brand (Hair TP unified-mall vs. Curatiio per-behandling)
- **Del B** — Aftercare & Follow-up Matrix per behandling × cadence
- **Del C** — Revocation-flöde (GDPR Art. 7.3 vs. PDL 10-års bevarande)

**Källor:**
- `migration/meridiq/consent-catalog.json` — 39 consents (varav 14 är `Behandlingsavtal`)
- `migration/meridiq/service-bindings-catalog.json` — 82 services + bindings
- `config/cco-treatment-document-requirements.json` — 10 treatments
- `data/cco-templates.json` — 77 templates
- `src/ops/ccoMarketingConsentStore.js` — opt-in/opt-out + unsubscribe-token
- `src/ops/ccoPhotoConsentStore.js` — granted/revoked
- `src/ops/ccoTreatmentAgreementStore.js` + `ccoAgreementQuickStore.js` — sign-flow
- `src/ops/ccoAftercareSchedulerStore.js` — cadence-parser
- `src/ops/ccoAftercareStore.js` — needs_review/scheduled/in_progress/complete/cancelled
- `src/ops/ccoRetentionPolicy.js` — PDL 10 år
- `src/ops/ccoBlockingStore.js` — betänketid 14d distance / 7d in-clinic aesthetic

---

# Del A — Consent & Agreement Flow

## A.1 Hair TP-flödet — 1 unified avtal (Meridiq C 170917)

Alla Hair TP-behandlingar (FUE, DHI, Skägg-FUE/DHI, Ögonbryn-DHI) delar **ett enda behandlingsavtal**: Meridiq Consent **170917** "Behandlingsavtal TP".

```
Pre-konsult info
   ↓ (Nordbro patient_info_consultation v2.0.0)
Hälsodeklaration
   ↓ (Meridiq Q 16414 → schema health_declaration:hair_tp, sign+journal)
Friskförsäkran
   ↓ (Insatt v2.0.0 + Meridiq Q 16413 → schema fitness_certificate:hair_tp, sign+journal)
Betänketid (14d distance_purchase, blocking)
   ↓ (ccoBlockingStore.getCoolingOffForTreatment)
Behandlingsavtal (170917 — 1 mall för alla TP-metoder)
   ↓ (Insatt v4.0.0 wrapper + ccoAgreementQuickStore, sign via BankID)
Behandlingssamtycke (Meridiq C 170917 — samma avtal är samtycke)
   ↓ (sign + journal-snapshot)
Foto-samtycke internt (consent_photo_internal — obl. för pre/post-foton)
   ↓ (sign + version-snapshot via ccoPhotoConsentStore)
Foto-samtycke publik (consent_photo_publish — frivillig, showcase)
   ↓ (sign + ccoPhotoPublishConsent)
Boka behandling
   ↓ (ccoBookingStore + service-bindings 7086-7414)
```

**Kedjekontroll per länk:**

| Länk | Mall/ID | Status | Blocker |
|---|---|---|---|
| Info | `patient_info_consultation` (v2.0.0) | EXISTS | — |
| Hälsodekl | `health_declaration_hair_tp` (Q 16414 v3.0.0) | EXISTS | journal must-store |
| Friskförsäkran | `fitness_certificate_hair_tp` (Q 16413 v2.0.0) | EXISTS | T-48h innan |
| Betänketid | `ccoBlockingStore.getCoolingOffForTreatment` (14d) | EXISTS (regel) | distansavtalslag |
| Avtal | `agreement_hair_tp_generic` (Insatt v4.0.0) | EXISTS | sign BankID |
| Samtycke | `consent_treatment_fue` (Meridiq C 170917) | **MISSING** import — endast Nordbro-leverans noterad | journal-snapshot |
| Foto-internt | `consent_photo_internal` (v2.0.0) | EXISTS | sign + snapshot |
| Foto-publik | `consent_photo_publish` (v2.0.0) | EXISTS (frivillig) | sign |
| Boka | service-binding 7086-7414 | EXISTS | gate via `ccoTreatmentBookingGate` |

**Status:** EXISTS för 7 av 9 länkar, **MISSING** för `consent_treatment_fue/dhi/...` (CCO-import väntar på Nordbro-leverans).

---

## A.2 Curatiio-flödet — 7 separata avtal (per behandling)

Curatiio har **7 unika behandlingsavtal** i Meridiq:

| Behandling | Meridiq C | Brand i Meridiq | Brand IRL | Brand-override behövs? |
|---|---|---|---|---|
| Ortopedi PRP/PRF | 170941 | curatiio | curatiio | nej |
| Ortopedi HA | 170942 | curatiio | curatiio | nej |
| Ortopedi HA+PRP/PRF | 170943 | curatiio | curatiio | nej |
| Botox | 170949 | curatiio | curatiio | nej |
| Fillers | 170950 | curatiio | curatiio | nej |
| Profhilo | 170948 | **hair_tp** | curatiio | **JA** |
| Ögonlocksplastik | 170954 | curatiio | curatiio | nej |
| PRP/PRF hud Curatiio | 170951/170952 | **hair_tp** | curatiio | **JA** |
| PRP + Microneedling Curatiio | 170953 | **hair_tp** | curatiio | **JA** |

Curatiio-flöde per behandling:

```
Pre-konsult info
   ↓ (Nordbro patient_info_{botox,filler,bleph,...} v2.0.0)
Hälsodeklaration Estet. injektioner ELLER Ortho ELLER Bleph
   ↓ (Meridiq Q 16472 inj / Q 14878 ortho / Q 16415 bleph, brand=curatiio i schema)
Friskförsäkran
   ↓ (Insatt v2.0.0 + Meridiq Q 16389 bleph eller motsvarande, sign+journal)
Betänketid (7d in_clinic_aesthetic — för injektioner) eller 14d (för bleph)
   ↓ (ccoBlockingStore)
Behandlingsavtal (per behandling — separat mall)
   ↓ (Insatt v4.0.0 + ccoAgreementQuickStore, sign via BankID)
Behandlingssamtycke (per behandling — kan vara samma som avtalet eller separat)
   ↓ (sign + journal-snapshot)
Foto-samtycke (obl. internt + frivillig publik)
   ↓ (samma som Hair TP)
Boka behandling
   ↓ (ccoBookingStore + service-bindings 7080/7081/8694/7082/7085/7105/7109/7123/7124/7376-7385/7406/7411-7413)
```

**Kedjekontroll per behandling:**

| Behandling | Info | Hälsodekl | Friskförs | Betänketid | Avtal | Samtycke | Foto | Boka |
|---|---|---|---|---|---|---|---|---|
| Botox | EXISTS | EXISTS Q 16472 | EXISTS | EXISTS 7d | EXISTS Insatt | EXISTS C 170949 | EXISTS | EXISTS |
| Filler | MISSING `patient_info_filler` | EXISTS | EXISTS | EXISTS 7d | EXISTS | EXISTS C 170950 | EXISTS | EXISTS |
| Profhilo | MISSING `patient_info_profilho` | EXISTS | EXISTS | EXISTS 7d | PARTIAL (treatment-config saknas) | EXISTS C 170948 (brand-mismatch) | EXISTS | PARTIAL |
| Bleph | EXISTS | EXISTS Q 16415 | EXISTS Q 16389 | EXISTS 14d | EXISTS | EXISTS C 170954 | EXISTS | EXISTS |
| PRP hud (curatiio) | PARTIAL | EXISTS Q 16472 | EXISTS | EXISTS 7d | EXISTS | EXISTS C 170944/170951 (brand-mismatch) | EXISTS | EXISTS |
| Mesotherapy | MISSING info-mall | EXISTS Q 16472 | EXISTS | EXISTS 7d | MISSING avtal | MISSING samtycke | EXISTS | PARTIAL |
| Ortopedi PRP/PRF | MISSING info-mall | EXISTS Q 14878 | EXISTS | EXISTS | EXISTS | EXISTS C 170941 | EXISTS | **MISSING treatment-config** |
| Ortopedi HA | MISSING info-mall | EXISTS Q 14878 | EXISTS | EXISTS | EXISTS | EXISTS C 170942 | EXISTS | **MISSING treatment-config** |
| Ortopedi HA+PRP/PRF | MISSING info-mall | EXISTS Q 14878 | EXISTS | EXISTS | EXISTS | EXISTS C 170943 | EXISTS | **MISSING treatment-config** |
| Fettuplösande inj. | MISSING info-mall | EXISTS | EXISTS | EXISTS | MISSING avtal | EXISTS C 152995/152996 (brand-mismatch) | EXISTS | **MISSING treatment-config** |

**Status:** Av 10 Curatiio-behandlingar är **endast Botox och Bleph fullt EXISTS** i kedjan. 8 har PARTIAL eller MISSING-element.

---

## A.3 Brand-mismatch — brand-override-tabell

Följande mallar är **`Hair TP Clinic`-taggade i Meridiq men säljs som Curatiio**. Vid import till CCO `data/cco-templates.json` ska brand mappas om:

| apiId | Title (Meridiq) | Meridiq-brand | CCO-target-brand | Bound-services |
|---|---|---|---|---|
| 152981 | Botulinumtoxin ENG | hair_tp | **curatiio** | (legacy, ej direkt-bunden) |
| 152988 | Botulinumtoxin SWE | hair_tp | **curatiio** | (legacy) |
| 152995 | Fat dissolving injection ENG | hair_tp | **curatiio** | (legacy) |
| 152996 | Fettuplösande injektioner SWE | hair_tp | **curatiio** | (legacy) |
| 152998 | Microneedling SWE | hair_tp | **shared** (säljs av båda) | 7121/7392-7396 |
| 152999 | Plasma Pen ENG | hair_tp | **curatiio** | (legacy) |
| 153000 | Plasma Pen SWE (v1) | hair_tp | **curatiio** | duplikat-flagga vs 153001 |
| 153001 | Plasma Pen SWE (v2) | hair_tp | **curatiio** | duplikat-flagga vs 153000 |
| 153002 | Profhilo ENG | hair_tp | **curatiio** | — |
| 153003 | Profhilo SWE | hair_tp | **curatiio** | — |
| 170944 | Behandlingsavtal PRP hud | hair_tp | **curatiio** (säljs Curatiio) | 7117-7122 |
| 170946 | Behandlingsavtal Microneedling och PRP | hair_tp | **shared** | 7121/7392-7396 |
| 170947 | Behandlingsavtal PRF hud | hair_tp | **curatiio** | — |
| 170948 | Behandlingsavtal Profilho | hair_tp | **curatiio** | 7379-7381 |
| 170951 | Behandlingsavtal PRP hud Curatiio | hair_tp | **curatiio** | — |
| 170952 | Behandlingsavtal PRF hud Curatiio | hair_tp | **curatiio** | — |
| 170953 | Behandlingsavtal PRP och Microneedling Curatiio | hair_tp | **curatiio** | — |

**Implementations-not:** Lägg detta som JSON-mapping i `config/meridiq-brand-overrides.json` och konsumera vid import i `ccoTemplateRegistry`. Audit-event `compliance.brand_override_applied`.

---

# Del B — Aftercare & Follow-up Matrix

Per behandling × cadence — vilket templateId triggas?

Källor:
- `config/cco-treatment-document-requirements.json` — `aftercareTemplate` + `followupCadence`
- `data/cco-templates.json` — vilka templates som faktiskt finns registrerade
- `src/ops/ccoAftercareSchedulerStore.js` — offset-parser

**Cadence-tolkning från `ccoAftercareSchedulerStore`:**
- `1h` = +1h, `1d` = +1d, `7d` = +7d, `1w` = +7d, `2w` = +14d, `1m` = ~30d, `3m` = ~90d, `6m` = ~180d, `12m` = ~360d
- `2w_after_each_session` → +14d efter varje encounter
- `1m_after_final` → +30d efter sista encounter i serie
- `7d_suture_removal`, `2w_touchup_window`, `3m_re_treat_window`, `12m_re_treat`, `2w_check` är behandlingsspecifika men parsas som `Nd/Nw/Nm`

## B.1 Aftercare-matrix (T+1h, T+1d, T+7d)

| Behandling | T+1h | T+1d | T+7d | Mall-ID | Mall-status |
|---|:---:|:---:|:---:|---|---|
| FUE | sms | email | email | `aftercare_fue` | EXISTS |
| DHI | sms | email | email | `aftercare_dhi` | **MISSING** |
| PRP Hår | sms | email | — | `aftercare_prp_hair` | EXISTS |
| Microneedling Hår | sms | email | — | `aftercare_microneedle` | **MISSING** |
| Trichoscopy | — | — | — | (ingen aftercare) | N/A |
| Botox | sms | email | — | `aftercare_botox` | EXISTS |
| Filler | sms | email | — | `aftercare_filler` | EXISTS |
| Bleph | sms | email | email + portal (suture) | `aftercare_bleph` | EXISTS |
| PRP hud | sms | email | — | `aftercare_prp_skin` | **MISSING** |
| Mesotherapy | sms | email | — | `aftercare_meso` | **MISSING** |

**Aftercare-coverage:** 5 av 9 behandlingar (FUE, PRP Hair, Botox, Filler, Bleph). 4 saknar mall (DHI, Microneedling, PRP skin, Meso).

## B.2 Follow-up-matrix (1w, 2w, 1m, 3m, 4m, 6m, 12m)

`✅` = template + cadence i config. `⚠️` = cadence i config men template saknas. `—` = ej tillämplig.

| Behandling | 1w | 2w | 1m | 3m | 4m | 6m | 12m | Mall-ID |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| FUE | — | — | ✅ | ✅ | ⚠️ (Q 16407) | ✅ (Q 16409) | ✅ (Q 16390) | `followup_fue_{1m,3m,4m,6m,12m}` |
| DHI | — | — | ✅ | ✅ | ⚠️ | ✅ (Q 16409) | ✅ (Q 16390) | `followup_fue_*` (delas) |
| PRP Hår | — | ✅ each session | ✅ after final | — | — | — | — | `followup_prp_hair_2w` EXISTS + `_1m_after_final` **MISSING** |
| Microneedling Hår | ✅ each session | — | ✅ after final | — | — | — | — | **MISSING** båda |
| Trichoscopy | — | — | — | — | — | — | — | N/A (konsultation) |
| Botox | — | ✅ touchup window | — | ✅ re-treat window | — | — | — | `followup_botox_2w_touchup_window` EXISTS, `_3m_re_treat_window` **MISSING** |
| Filler | — | ✅ check | — | — | — | — | ✅ re-treat | `followup_filler_2w_check` + `_12m_re_treat` **MISSING båda** |
| Bleph | — | — | — | ✅ | — | — | ✅ | `followup_bleph_7d_suture_removal` + `_3m` + `_12m` **MISSING alla 3** |
| PRP hud | — | ✅ after each | ✅ after final | — | — | — | — | **MISSING båda** |
| Mesotherapy | ✅ after each | — | — | — | — | — | — | **MISSING** |

**Follow-up-coverage:** 6 av 30 cadence-celler är EXISTS (~20%). De flesta gaps är **Curatiio follow-ups som inte har patient-facing template registrerad** trots att cadence finns i config.

## B.3 Aftercare-jobs lifecycle (`ccoAftercareStore`)

States: `needs_review` → `scheduled` → `in_progress` → `complete` / `cancelled`

Contact-states: `pending` → `confirmed` / `not_needed`
Outcome-states: `unknown` / `stable` / `needs_attention`

**Job-deduplication:** `mkJobId(customerId, encounterId, templateRef, offset)` — SHA256-hashed → idempotent vid re-trigger.

**Audit-events:**
- `aftercare.job.queued` (när scheduler skapar)
- `aftercare.job.sent` (när `ccoSendActionStore` skickat)
- `aftercare.job.failed` (med error-msg)
- `aftercare.job.cancelled` (manuell stop, t.ex. avbokad behandling)
- `aftercare.job.skipped` (consent revoked)

---

# Del C — Revocation-flöde

## C.1 Vad kan återkallas?

| Consent-typ | Återkallbar? | Effect | Källa |
|---|:---:|---|---|
| `consent_marketing` (email/sms/profiling) | Y | omedelbar stop på utskick | `ccoMarketingConsentStore.setOptOut` |
| `consent_photo_internal` | Y | foton döljs i UI, behålls i journal (PDL) | `ccoPhotoConsentStore` `revoked` state |
| `consent_photo_publish` | Y | publika foton tas ned omedelbart, internt arkiv kvar | `ccoPhotoPublishConsent` |
| `consent_treatment_*` | **N** | kan INTE återkallas retroaktivt för utförd behandling — patientjournal måste sparas 10 år (PDL 3 kap. 17 §) | `ccoRetentionPolicy` blockerar |
| Behandlingsavtal (170917/170948-170954) | **N** retroaktivt | endast framtida behandlingar — avtal för utförd behandling stannar i journal | civilrätt + PDL |
| `health_declaration` / `fitness_certificate` | **N** | utförda journalposter är journalförda och låsta | PDL + `ccoJournalStore.signAndLock` |

## C.2 Hur återkallar patienten samtycke?

**Marketing-revocation (1-klick):**

```
Patient klickar unsubscribe-länk i mail/SMS
   ↓ token från ccoMarketingConsentStore.generateUnsubscribeToken (base64url 12 bytes)
   ↓ GET /unsubscribe?token=...
   ↓ ccoMarketingConsentStore.processUnsubscribeToken(token, { reason })
   ↓ setOptOut(customerId, channel, { actorRole: 'patient', source: 'unsubscribe_link', reason, tokenUsed })
   ↓ data.consents[customerId][channel].state = 'opted_out'
   ↓ audit: 'marketing.consent.opted_out' (med tokenUsed för spårbarhet)
   ↓ notification_feed:consent_revoked → staff
   ↓ token markeras usedAt: nowIso() (single-use)
```

GDPR-krav: 1-klicks unsubscribe (Art. 13 + e-Privacy Directive). Ingen login krävs.

**Foto-publish-revocation (logged-in):**

```
Patient loggar in på portal → Inställningar → Foto-samtycke → "Återkalla publik publicering"
   ↓ ccoPhotoConsentStore.setStatus(customerId, 'revoked')
   ↓ revokedAt: nowIso() + audit
   ↓ trigger: hide all published photos in showcase UI
   ↓ ccoPhotoPublishConsent → notify staff
```

**Konversion av Foto-samtycke internt:** Kräver staff-handpåläggning eftersom interna foton är journalförda (PDL 10 år). Patienten kan begära att foton inte visas i UI, men kan inte begära fysisk radering.

## C.3 Är revocation implementerat? Status per store

| Store | Revocation-action | Audit-event | UI-flöde | Status |
|---|---|---|---|---|
| `ccoMarketingConsentStore` | `setOptOut(customerId, channel, opts)` | `marketing.consent.opted_out` | 1-klick token-länk | EXISTS |
| `ccoMarketingConsentStore` | `processUnsubscribeToken(token, opts)` | + `tokenUsed` | inbäddad i alla mail/SMS | EXISTS |
| `ccoPhotoConsentStore` | `setStatus(customerId, 'revoked')` | `photo.consent.revoked` (via audit) | portal Inställningar | EXISTS (`revokedAt` settas) |
| `ccoPhotoPublishConsent` | (re-uses PhotoConsentStore) | `photo.publish.revoked` | portal | EXISTS |
| `ccoTreatmentAgreementStore` | EJ tillämpligt retroaktivt — patientjournal låst | `retention_locked` (försök blockeras) | UI visar "Kan ej raderas" + ref. till PDL | EXISTS (block) |
| `ccoJournalStore` | EJ raderbart pga PDL | `retention_locked` 10 år | UI guard | EXISTS |

## C.4 GDPR Art. 7.3 vs PDL 10-års bevarande — hur löst?

**Konflikten:**
- GDPR Art. 7.3: "Den registrerade ska ha rätt att när som helst återkalla sitt samtycke."
- PDL 3 kap. 17 §: "En patientjournal ska bevaras minst tio år efter den senaste anteckningen."

**Lösningen i CCO:**

1. **Patientjournal-data behandlas inte på laglig grund "samtycke"** — utan på "vårdgivare har rättslig skyldighet" (GDPR Art. 6.1.c + PDL). → Återkallat samtycke påverkar inte journalen. UI:t kommunicerar detta klart: "Din journal måste lagras i 10 år enligt Patientdatalagen och kan inte raderas, även om du återkallar samtycke till behandling."

2. **Marketing + foto-publish behandlas på samtycke** (GDPR Art. 6.1.a) → kan återkallas, omedelbar effekt, ingen retention-undantag.

3. **Foto-samtycke internt = behandlingsbehov** (Art. 6.1.c — föra journal kräver pre/post-foton för kirurgi). Patienten kan begära att foton inte visas i UI men kan inte begära radering förrän 10-års-retention löpt ut.

4. **Operations-impact tracker:** vid revocation registrerar `auditLog`:
   ```json
   { "action": "marketing.consent.opted_out", "customerId": "...", "channel": "email_marketing",
     "source": "unsubscribe_link", "tokenUsed": "...", "actorRole": "patient",
     "reason": "Patient klickade unsubscribe-länk", "ts": "2026-05-29T12:00:00Z" }
   ```
   och triggar `notification_feed:consent_revoked` → staff får notis i CCO-feed.

5. **Återförsäkran-text i UI:**
   - Marketing-flöden: "Du kan när som helst säga upp dessa utskick med ett klick."
   - Behandlingsflöden: "Detta samtycke gäller den specifika behandlingen och kan inte återkallas i efterhand. Patientjournalen lagras i 10 år enligt Patientdatalagen."

6. **Retention-check vid delete-försök:** `ccoRetentionPolicy.shouldKeep(lastActivityAt)` returnerar `true` om < 10 år sedan senaste journalpost. UI blockerar deletes med error `retention_locked` + dagar kvar.

7. **Efter 10 år:** `daysUntilEligibleForPurge` blir 0 → journal kan rensas vid nästa städ-pass. Skall vara explicit operations-handling, inte automatisk delete.

## C.5 Audit-trail vid revocation — fält som loggas

Per `ccoMarketingConsentStore.setOptOut`:

| Fält | Innehåll | Syfte |
|---|---|---|
| `action` | `marketing.consent.opted_out` | identifiera event-typ |
| `customerId` | customer-ref | spårbarhet |
| `channel` | `email_marketing` / `sms_marketing` / `profiling_segmentation` | vilken kanal |
| `actorRole` | `patient` / `staff` / `system` | vem agerade |
| `source` | `unsubscribe_link` / `portal_settings` / `staff_action` | UI-väg |
| `reason` | fritext | förklaring |
| `tokenUsed` | token om via länk | engångs-spårning |
| `previousState` | tidigare state | för revert om misstag |
| `ts` | ISO-timestamp | när skedde |

Samma struktur används för `ccoPhotoConsentStore.setStatus('revoked')` med `action: 'photo.consent.revoked'`.

## C.6 Pre-emptive notice — vad ska kommuniceras INNAN samtycke?

Per GDPR Art. 13 krav på informerad samtycke ska patienten vid varje samtyckesförfrågan veta:

| Krav | Implementation | Status |
|---|---|---|
| Ändamål för behandling | text i `letterText` per consent | EXISTS för 20/39, **MISSING for 19/39** (tom letterText) |
| Lagringsperiod (10 år PDL) | standardfras i consent-template | **PARTIAL** — verifiera per mall |
| Mottagare / mottagarkategori | t.ex. "Hair TP Clinic + underleverantörer (BankID, Resend)" | EXISTS |
| Rätt till åtkomst, rättelse, radering | standardfras | **PARTIAL** — verifiera per mall |
| Rätt att återkalla | standardfras + länk | EXISTS i marketing, **MISSING** i behandlingssamtycken |
| Klagomål till IMY | standardfras | **PARTIAL** |

**Åtgärd:** komplettera de 19 tomma `letterText`-fälten med standardiserad svensk text (skickas tillsammans med behandlingsspecifik text från Nordbro/Insatt-PDFs).

---

*Genererad: 2026-05-29*
