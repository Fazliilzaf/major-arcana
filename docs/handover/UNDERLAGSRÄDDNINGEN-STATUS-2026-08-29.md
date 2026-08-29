# Underlagsräddningen — status 2026-08-29 (löpande arbete)

Syfte: om chatten dör ska nästa session kunna fortsätta direkt. Läs denna fil först.

## Bakgrund

- 930 av 935 CFO-kvitton delade storageKey (fel underlag på nästan alla) efter import-bugg i ORD-102 auto-fetch.
- Totalt värde: 1 379 422 kr. Åtgärdslista per leverantör: `outputs/underlag-action-list-2026-08-29.md`
- Export-gate AKTIV på prod (`export_blocked_until_repair`) — återaktivera först när reparation är klar.
- Backup: `data/backups/cfo-cm-prod-2026-08-29-07-47-27/`
- Admin-token (fungerar via curl mot alla cco-cf-endpoints): finns i användarens localStorage `ARCANA_ADMIN_TOKEN` + i sessionens historik. 401 i finance.html var falskt alarm — token funkar, felet var gammal browser-session.

## Vad som är KLART (deployat på prod)

1. **Reparations-API:** `POST /api/v1/cco-cf/receipts/:id/repair-from-mailbox` (+ `?force=true`), `POST /:id/repair-storage-key`. Källkod: `src/routes/cfoReceiptRepair.js`, `src/cfo/cfoReceiptStore.js` (`repairStorageKey`).
2. **Batch-skript:** `scripts/cfo/repairReceiptAttachmentsFromMailbox.js` (DRY_RUN default, CFO_AUTH_TOKEN + DRY_RUN=false för skarpt). Resultat mailbox-vägen: bara 3/100 — mejlen saknas i M365-truth.
3. **Google Ads API FUNKAR (spend):** Basic Access GODKÄND 2026-08-29. v22 (v16–v21 pensionerade). login-customer-id = kontots EGET id per anrop (kontona är INTE länkade under MCC 2363523505 — MCC-header ger 403). searchStream-svaret är EN pretty-printad JSON-array (ej NDJSON). Live-data: Hair TP 260 246 kr jan–aug, Curatiio 114 584 kr.
4. **Google invoices:** finns EJ via API — kontona kör automatisk betalning (5000-dragninar), Google utfärdar bara fakturor till månadsfaktura-kunder. Officiella underlag = "Billing documents" i Ads-UI:t.
5. **Vendor-PDF-brygga:** `googleAds.js` fångar pdfUrl + `fetchInvoicePdfBuffer()`; `cfoVendorInvoiceFetch.js` `repairReceiptsFromVendorInvoices()` (månadsmatchning för aggregerade annonsfakturor); `POST /cco-cf/receipts/repair-from-vendors` (dryRun default).
6. **Diagnos-endpoints:** `GET /cco-cf/google/invoices`, `GET /cco-cf/google/accessible-customers`, `GET /cco-cf/bank-reconciliation/google-ads-spend` (alla med debug-parametrar).
7. **Fortnox:** om-auktoriserad med scope `customer invoice payment bookkeeping archive supplierinvoice inbox`. Slutsats: DÖTT SPÅR för kortköp — arkivet tomt, 3 875 lev.fakturor men bara Loopia 735 kr matchar. Diagnos: `GET /cco-fortnox/attachments`. OBS: Fortnox saknar datumfilter på lev.fakturor — sortera `invoicedate descending` + filtrera klient-sidigt.

## PÅGÅENDE ARBETE (mitt i bygget — ej commitat/deployat än)

**repair-from-cm:** 866 info@fazli.se-mejl (IMAP-import ORD-73) har bilagor lagrade LOKALT i secure storage, men repair-from-mailbox letar bara i M365-truth. Ny väg:

- `src/routes/cfoReceiptRepair.js`: ny `POST /:id/repair-from-cm` — använder `findCmRecord` + `loadCmDocumentBuffer` (båda från `src/cfo/cfoInvoiceFetch.js`, exporterade i detta arbete)
- `server.js`: cmStore + secureStorage inkopplade i createCfoReceiptRepairRouter
- **KVAR:** uppdatera `scripts/cfo/repairReceiptAttachmentsFromMailbox.js` att prova repair-from-cm FÖRE repair-from-mailbox, commita, deploya, kör skarpt i batcher

## KVARSTÅENDE BESLUT/UPPGIFTER

1. **Meta Ads (11 kvitton, 79k):** OAuth-router färdigbyggd (`cfoMetaAdsAuth.js`), saknar META_APP_ID/SECRET/REDIRECT_URI. Användaren måste skapa Meta-app på developers.facebook.com (scopes: ads_read,business_management). Adapter: `src/cfo/vendors/metaAds.js` (Graph v21.0, levande version).
2. **Gmail (hairtpclinic@gmail.com):** dit går Google-avier/Apple/Anthropic-mejl. Kan INTE loggas in i automatiserad Chrome (Google anti-bot "webbläsaren kanske inte är säker"). Vägar: (a) användaren vidarebefordrar manuellt till kvitto@hairtpclinic.com, (b) bygg andra IMAP-källa i cmImapSync (CM*IMAP2*\*) — kräver Gmail app-lösenord.
3. **Manuell sittning** per `outputs/underlag-action-list-2026-08-29.md`: portaler (Apple reportaproblem, Microsoft, Lufthansa m.fl. ~320k), butikskvitton NK/Hemköp (~148k).
4. **Privata poster** (Spotify/Netflix/Google One, 24 st, 2 256 kr) — flytta ur CFO.
5. **Återaktivera export-gate** när reparationen nått sin nivå.

## Viktiga lärdomar (upprepa inte dessa misstag)

- Google Ads API-versioner dör ~1 år — kontrollera alltid version först (oautentiserat anrop: 404=död, 401=levande).
- MCC-header ≠ åtkomst: kontona måste vara länkade under MCC:n, annars login-customer-id = eget konto-id.
- searchStream = pretty-printad JSON-array, INTE NDJSON.
- Fortnox /attachments finns inte — heter /archive. Lev.fakturor saknar datumfilter.
- Kvitto underlag får ALDRIG skapas ur kortrad utan dokument (designlås).
