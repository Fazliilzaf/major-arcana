---
owner: CCO
status: active
---

Ja � det h�r ska byggas som ett eget segment i Major Arcana:
CM / Corporate Expense Management
Eller �nnu tydligare i systemet:
CM Expense � fakturor, kvitton, ink�p, resor, mailkvitton och ekonomisk kontroll
Det ska inte bara vara �ladda upp kvitto�. Det ska vara en ekonomisk importmotor som tar emot underlag fr�n skanner, mobilkamera, PDF, mail, bilagor och ren mailtext � och sedan l�gger allt i r�tt ekonomifl�de.
I ert nuvarande CCO-scope finns redan att kvitto, fakturor, kassa, POS-ordrar och kassarapport ska byggas, men det �r kopplat till behandling/kassa. CM b�r bli ett bredare ekonomisegment f�r f�retagets egna kostnader, leverant�rsfakturor, kvitton, resor och ink�p. �

Grundid�n
CM ska kunna ta emot ekonomiska dokument fr�n tre huvudk�llor:

1. Skanna/ladda upp sj�lv
   o faktura
   o kvitto
   o bild fr�n mobilkamera
   o PDF
   o sk�rmdump
   o papperskvitto
2. Mail fr�n Microsoft/Outlook
   o kvitton i mail
   o fakturor i mail
   o orderbekr�ftelser
   o flygbiljetter
   o hotellbokningar
   o abonnemangskvitton
   o k�pbekr�ftelser
   o PDF-bilagor
   o mail utan PDF men med ekonomisk text
3. Manuell komplettering
   o kategori
   o kostnadsst�lle
   o projekt
   o ansvarig person
   o kommentar
   o betalstatus
   o export till Fortnox/Visma senare

Det viktiga: den ska g�ra det en g�ng
Precis som med mailimporten vi pratade om tidigare ska CM ha:

- raw import
- dedupe
- processing ledger
- AI/OCR-extraction
- filterversion
- status
- audit
- reprocess bara vid behov
  Det betyder:
  N�r ett mail, kvitto eller en PDF har l�sts in en g�ng ska systemet inte l�sa om allt igen varje g�ng du �ppnar CM.
  Det ska bara processas om om:
- du trycker �processa om�
- AI-reglerna uppdaterats
- dokumentet �ndrats
- matchningen var fel
- OCR:n misslyckades
- n�gon med beh�righet beg�r ny analys

R�tt fl�de f�r CM
K�lla
?
Raw Store
?
Deduplication
?
Document Detection
?
OCR / AI Extraction
?
Expense Classification
?
Supplier / Vendor Match
?
VAT / Moms / Belopp Kontroll
?
Approval Workflow
?
Accounting Export
?
Archive + Audit
P� svenska:
Mail/skanning/uppladdning
?
Spara original
?
Kolla om dokumentet redan finns
?
Identifiera dokumenttyp
?
L�s av faktura/kvitto/mailtext
?
Kategorisera kostnad
?
Koppla leverant�r
?
Kontrollera moms, summa, datum
?
Skicka f�r godk�nnande
?
Exportera till ekonomi
?
Arkivera och auditlogga

AI:n ska kunna l�sa detta
Fr�n fakturor
CM ska extrahera:

- leverant�r
- organisationsnummer
- fakturanummer
- fakturadatum
- f�rfallodatum
- OCR-nummer
- bankgiro/plusgiro/IBAN
- totalbelopp
- momsbelopp
- momsprocent
- valuta
- referens
- radartiklar
- betalstatus
- PDF/originalfil
- kategori
- kostnadsst�lle
- ansvarig
- om den verkar vara dubblett
  Azure AI Document Intelligence har f�rdiga modeller f�r fakturor som kan extrahera exempelvis kundnamn, faktureringsadress, f�rfallodatum, belopp och radartiklar. �
  Fr�n kvitton
  CM ska extrahera:
- butik/leverant�r
- datum
- tid
- totalbelopp
- moms
- valuta
- betalmetod
- kortslut/last 4 om det finns
- ink�pskategori
- radartiklar om m�jligt
- bild/PDF/original
- anst�lld/person
- om kvittot ska ers�ttas privat
- om det �r f�retagskort
  Fr�n flygbiljetter och resor
  CM ska extrahera:
- flygbolag
- bokningsnummer
- biljett-/order-ID
- passagerare
- resa fr�n/till
- datum
- avg�ngstid
- returresa
- belopp
- valuta
- moms/skatt d�r det g�r
- PDF/e-ticket om den finns
- om det �r resa, hotell eller transport
- koppling till person/projekt
  Fr�n mail utan PDF
  Om det inte finns PDF ska systemet inte ge upp.
  D� ska CM:
- l�sa mailtexten
- spara mailet som originalk�lla
- skapa ett expense candidate
- flagga: NO_PDF_BODY_USED
- visa att underlaget bygger p� mailtext, inte PDF
- be om komplettering om underlaget �r f�r svagt
  Exempel:
  �Ingen PDF hittades. Ekonomisk information extraherades fr�n mailtexten. Kr�ver granskning.�
  Det �r exakt s� ni undviker att viktiga k�p missas.

Mailintegration f�r CM
F�r Microsoft-mail ska ni anv�nda samma t�nk som vi pratade om f�r CCO-mail:

- ett mailkonto i taget
- en folder i taget
- ett mail i taget
- raw save f�rst
- dedupe sedan
- AI/OCR sedan
- CM-status sist
  Microsoft Graph har st�d f�r att l�sa mail och bilagor, och delta query g�r att man kan synka nya/�ndrade mail utan att l�sa om hela mailboxen varje g�ng. � Microsoft anger ocks� att message delta tracking g�rs per folder, vilket betyder att varje mailfolder ska ha sin egen sync-state/delta-token. �
  Bilagor kan h�mtas via Microsoft Graph attachment-API:t, som kan l�sa egenskaper eller r�inneh�ll f�r bilagor p� meddelanden. �

Dokumenttyper CM ska k�nna igen
CM ska klassificera allt som kommer in:

- leverant�rsfaktura
- kvitto
- orderbekr�ftelse
- betalningsbekr�ftelse
- flygbiljett
- hotellbokning
- taxikvitto
- t�g/bussbiljett
- abonnemangskvitto
- programvarukvitto
- Apple/Google/Meta/LinkedIn-kvitto
- bank-/kortnotis
- kreditfaktura
- p�minnelsefaktura
- ink�psorder
- ok�nd ekonomisk handling
- ej ekonomiskt mail

Statusar i CM
Varje dokument/mail ska ha en tydlig status:
IMPORTED
RAW_SAVED
DUPLICATE_CHECKED
DUPLICATE_SKIPPED
PDF_FOUND
NO_PDF_FOUND
BODY_TEXT_USED
OCR_PENDING
OCR_DONE
AI_EXTRACTED
EXTRACTION_LOW_CONFIDENCE
NEEDS_REVIEW
READY_FOR_APPROVAL
APPROVED
REJECTED
READY_FOR_BOOKKEEPING
EXPORTED
ARCHIVED
FAILED
REPROCESS_REQUESTED
Det h�r g�r att ni alltid vet exakt var n�got fastnade.

Flaggor CM ska kunna s�tta
Dokumentflaggor
NO_PDF_FOUND
PDF_FOUND
IMAGE_RECEIPT_FOUND
BODY_TEXT_USED_AS_SOURCE
ATTACHMENT_UNREADABLE
OCR_FAILED
LOW_CONFIDENCE_EXTRACTION
UNKNOWN_DOCUMENT_TYPE
Ekonomiflaggor
MISSING_TOTAL_AMOUNT
MISSING_VAT
MISSING_INVOICE_NUMBER
MISSING_DUE_DATE
MISSING_SUPPLIER
UNKNOWN_SUPPLIER
DUPLICATE_INVOICE_NUMBER
DUPLICATE_RECEIPT_HASH
CURRENCY_NOT_SEK
FOREIGN_PURCHASE
TRAVEL_EXPENSE
SUBSCRIPTION_EXPENSE
PRIVATE_REIMBURSEMENT_NEEDED
ALREADY_PAID
PAYMENT_NEEDED
Granskningsflaggor
NEEDS_MANUAL_REVIEW
NEEDS_APPROVAL
NEEDS_ACCOUNTING_REVIEW
NEEDS_SUPPLIER_MATCH
NEEDS_CATEGORY
NEEDS_COST_CENTER
NEEDS_PROJECT
NEEDS_EMPLOYEE_ASSIGNMENT

CM ska ha en inkorg
Bygg en egen vy:
CM Inbox
D�r syns allt ekonomiskt som kommer in:

- nya fakturor
- nya kvitton
- nya mailkvitton
- nya PDF-bilagor
- mail utan PDF
- os�kra tolkningar
- dubblettmisstankar
- saker som beh�ver godk�nnande
- saker som �r redo f�r bokf�ring
  Varje rad ska visa:
- leverant�r
- datum
- belopp
- moms
- valuta
- dokumenttyp
- k�lla
- status
- confidence score
- ansvarig
- n�sta �tg�rd

CM ska ha en godk�nnandek�
Approval Queue
H�r ska ni kunna godk�nna:

- kvitto
- faktura
- resa
- �terbetalning
- abonnemang
- leverant�rsk�p
- k�p som saknar PDF
- k�p som bygger p� mailtext
  Knapp:
- Godk�nn
- Avvisa
- Beg�r komplettering
- Koppla leverant�r
- �ndra kategori
- Skicka till bokf�ring
- Markera som betald
- Markera som dubblett

Viktigt: originalet m�ste sparas
Allt ska ha originalfil/originalk�lla.
F�r varje ekonomisk post ska CM spara:

- originalmail
- PDF-bilaga
- bild
- filhash
- MIME type
- filnamn
- avs�ndare
- mottagare
- mottagningsdatum
- import-run
- AI-resultat
- m�nskliga �ndringar
- auditlogg
  BFN anger att r�kenskapsinformation m�ste sparas i 7 �r efter kalender�ret d� r�kenskaps�ret avslutades. �

Dedupe: undvik dubbla fakturor och kvitton
Det h�r �r extremt viktigt.
CM m�ste kontrollera dubbletter p�:

- fakturanummer + leverant�r
- totalbelopp + datum + leverant�r
- PDF hash
- bild hash
- mail internetMessageId
- Graph message ID/immutable ID
- attachment ID
- OCR-nummer
- bokningsnummer/ordernummer
- flygbiljett PNR
- kvitto-ID
- betalreferens
  Om samma kvitto kommer b�de som:
- mailtext
- PDF
- bild
- uppladdad manuellt
  �ska CM f�rst� att det kan vara samma underlag.

Datamodell Cursor b�r bygga
cm_sources
id
type = email | upload | scanner | mobile_camera | manual
provider = microsoft_graph | local_upload | mobile
createdAt
cm_mail_accounts
id
email
provider = microsoft_graph
status
lastSyncAt
enabled
cm_import_runs
id
sourceId
mailAccountId
mode = initial | delta | manual_upload | reset | reprocess
status
startedAt
finishedAt
totalFound
totalImported
totalDuplicates
totalFailed
cm_raw_items
id
sourceType
sourceId
mailMessageId
internetMessageId
subject
fromEmail
receivedAt
rawEmailJson
rawBodyText
hasAttachments
hasPdf
hasImage
dedupeKey
status
createdAt
cm_documents
id
rawItemId
documentType
fileName
mimeType
storagePath
fileHash
pageCount
source = pdf | image | email_body | manual
ocrStatus
aiExtractionStatus
confidenceScore
createdAt
cm_expense_records
id
documentId
expenseType = invoice | receipt | travel | subscription | purchase | unknown
supplierId
supplierName
invoiceNumber
receiptNumber
orderNumber
date
dueDate
amountExVat
vatAmount
amountIncVat
currency
paymentStatus
category
costCenter
project
employeeId
approvalStatus
bookkeepingStatus
confidenceScore
createdAt
updatedAt
cm_processing_ledger
id
rawItemId
documentId
expenseRecordId
processorVersion
filterVersion
status
attempts
errorCode
errorMessage
processedAt
completedAt
cm_audit_events
id
expenseRecordId
action
actorId
oldValue
newValue
timestamp

AI-agentens roll i CM
CM-agenten ska kunna:

- l�sa av kvitto/faktura
- f�resl� leverant�r
- f�resl� kategori
- f�resl� kostnadsst�lle
- f�resl� moms
- f�resl� om n�got �r dubblett
- flagga os�kra v�rden
- flagga saknad PDF
- flagga saknad moms
- flagga ok�nd leverant�r
- skapa sammanfattning
- f�resl� bokf�ringsunderlag
- f�resl� �tg�rd: godk�nn, beg�r komplettering, kontrollera
  Men CM-agenten ska inte:
- godk�nna betalning sj�lv
- bokf�ra slutgiltigt utan m�nsklig kontroll
- �ndra originalunderlag
- radera underlag
- skicka externa mailsvar utan godk�nnande
- tolka os�kra fakturor som s�kra

Koppling till Fortnox/Visma senare
Jag hade byggt CM s� att det f�rst fungerar internt, och sedan exporterar till ekonomi.
M�jliga integrationer:

- Fortnox
- Visma eEkonomi
- manuell CSV/export
- SIE/export senare
- bokf�ringsbyr�vy
  Fortnox API �r REST-baserat och har resurser/scopes f�r bland annat bokf�ring och leverant�rsfakturor; Fortnox beskriver verifikationer som bokf�ring av exempelvis kvitton och Z-rapporter samt hantering av leverant�rsfakturor och leverant�rer. � Visma eAccounting API ger �tkomst till bland annat invoices, expenses, customer information och financial reports. �

Viktig skillnad: faktura vs kvitto
CM m�ste skilja p�:
Faktura

- ska ofta betalas
- har f�rfallodatum
- har fakturanummer
- kan beh�va attest
- kan exporteras som leverant�rsfaktura
  Kvitto
- �r oftast redan betalt
- ska bokf�ras som utl�gg/kostnad
- kan beh�va kopplas till anst�lld/kort
- kan beh�va ers�ttning
  Mailk�p utan PDF
- kan vara underlag
- men b�r flaggas som svagare dokumentation
- ska kr�va granskning om information saknas

CM-dashboard
Bygg dessa flikar:

1. Inbox
   Alla nya ekonomiska underlag.
2. Beh�ver granskas
   Os�kra dokument, saknad PDF, l�g confidence, ok�nd leverant�r.
3. Fakturor
   Leverant�rsfakturor med status.
4. Kvitton
   Skannade och mailkvitton.
5. Resor
   Flyg, hotell, taxi, t�g.
6. Godk�nnande
   Saker som kr�ver attest.
7. Redo f�r bokf�ring
   Klart att exportera.
8. Exporterat
   Skickat till Fortnox/Visma/CSV.
9. Dubbletter
   Misst�nkta dubbla kvitton/fakturor.
10. Fel & importlogg
    Mail som inte gick att l�sa, bilagor som misslyckades, OCR-fel.

Prompt till Cursor
Kopiera detta:
Vi ska bygga CM � Corporate Expense Management � i Major Arcana.

CM ska hantera f�retagets ekonomiunderlag:

- fakturor
- kvitton
- skannade dokument
- mobilbilder
- PDF-filer
- mailkvitton
- orderbekr�ftelser
- flygbiljetter
- hotellbokningar
- abonnemang
- k�p som kommer via Microsoft Outlook-mail

M�let �r att CM ska importera, l�sa av, klassificera och l�gga in ekonomiska underlag i CM-segmentet.

Viktiga krav:

1. K�llor:

- Microsoft Graph mail
- PDF-bilagor
- bildbilagor
- mailtext om PDF saknas
- manuell uppladdning
- mobilkamera/skanning

2. Import:

- ett mailkonto i taget
- en folder i taget
- ett mail i taget
- raw save f�rst
- dedupe sedan
- OCR/AI sedan
- CM-record sist

3. Processa inte om allt:

- anv�nd delta sync f�r mail
- spara delta token per mailkonto/folder
- skapa dedupeKey
- skapa processing ledger
- spara processorVersion och filterVersion
- processa inte samma mail/dokument igen om inget �ndrats
- reprocess endast manuellt eller vid ny filterVersion

4. Om PDF finns:

- extrahera PDF
- spara PDF som original
- k�r OCR/AI p� PDF
- skapa faktura/kvitto/resa-record

5. Om PDF saknas:

- flagga NO_PDF_FOUND
- analysera mail body text
- skapa BODY_TEXT_USED_AS_SOURCE
- skapa expense candidate
- kr�va manuell granskning om data saknas

6. Om bild finns:

- spara originalbild
- k�r OCR
- skapa kvitto/faktura-record

7. AI ska extrahera:

- leverant�r
- organisationsnummer
- fakturanummer
- kvittonummer
- ordernummer
- datum
- f�rfallodatum
- totalbelopp
- moms
- valuta
- radartiklar
- betalstatus
- kategori
- kostnadsst�lle
- projekt
- ansvarig person
- confidence score

8. Dokumenttyper:

- invoice
- receipt
- travel
- flight_ticket
- hotel
- taxi
- subscription
- purchase_confirmation
- credit_invoice
- reminder_invoice
- unknown

9. Flaggor:

- NO_PDF_FOUND
- PDF_FOUND
- BODY_TEXT_USED_AS_SOURCE
- OCR_FAILED
- LOW_CONFIDENCE_EXTRACTION
- UNKNOWN_SUPPLIER
- MISSING_TOTAL_AMOUNT
- MISSING_VAT
- MISSING_INVOICE_NUMBER
- MISSING_DUE_DATE
- DUPLICATE_INVOICE_NUMBER
- DUPLICATE_RECEIPT_HASH
- NEEDS_MANUAL_REVIEW
- NEEDS_APPROVAL
- READY_FOR_BOOKKEEPING

10. UI:
    Bygg CM dashboard med:

- Inbox
- Beh�ver granskas
- Fakturor
- Kvitton
- Resor
- Godk�nnande
- Redo f�r bokf�ring
- Exporterat
- Dubbletter
- Importlogg/fel

11. S�kerhet:

- radera aldrig originalunderlag
- spara originalmail/PDF/bild
- auditlogga alla �ndringar
- ingen automatisk betalning
- ingen slutlig bokf�ring utan m�nskligt godk�nnande
- k�nslig data ska hanteras privat och inte skickas till extern AI utan policybeslut

12. Integration senare:

- f�rbered export till Fortnox/Visma/CSV
- skapa bookkeepingStatus
- skapa externalAccountingId n�r export sker

Leverera:

1. Datamodell
2. Importpipeline
3. Dedupelogik
4. OCR/AI-extraction
5. CM-dashboard
6. Manual review workflow
7. Approval workflow
8. Export-ready workflow
9. Auditlogg
10. Testplan

Cursor-regel att l�gga in
Skapa:
.cursor/rules/cm-corporate-expense-management.mdc
L�gg in:

---

description: CM Corporate Expense Management rules
alwaysApply: true

---

# CM � Corporate Expense Management Rules

CM handles company expense documents, invoices, receipts, travel documents and purchase confirmations.

## Core principle

Every financial source item must be imported once, stored once, deduplicated, processed through CM filters and never reprocessed unnecessarily.

## Sources

CM must support:

- Microsoft Graph mail
- PDF attachments
- image attachments
- email body text if no PDF exists
- manual upload
- scanner/mobile camera upload

## Ingestion

- Save raw source first.
- Never delete original source.
- Create dedupeKey.
- Create processing ledger.
- Store processorVersion and filterVersion.
- Skip already processed items unless reprocess is requested.
- Use delta sync for Microsoft mail.
- Process one mailbox at a time during rollout.
- Process one mail at a time during initial rollout.

## Document handling

If PDF exists:

- save PDF
- run extraction
- create document record

If no PDF exists:

- flag NO_PDF_FOUND
- use email body text
- flag BODY_TEXT_USED_AS_SOURCE
- require manual review if confidence is low

If image exists:

- save original image
- run OCR
- create receipt/invoice candidate

## Extraction fields

Extract:

- supplier
- org number
- invoice number
- receipt number
- order number
- issue date
- due date
- total amount
- VAT amount
- VAT rate
- currency
- line items
- payment method
- payment status
- category
- cost center
- project
- responsible person
- confidence score

## Safety

- Do not auto-pay invoices.
- Do not final-bookkeep without human approval.
- Do not overwrite original data.
- Do not delete source documents.
- All human changes must be audit logged.
- Low confidence extraction must go to manual review.
- Duplicate candidates must not be auto-approved.

## UI

CM must include:

- Inbox
- Needs Review
- Invoices
- Receipts
- Travel
- Approvals
- Ready for Bookkeeping
- Exported
- Duplicates
- Import Errors

## Accounting export

Prepare for:

- Fortnox
- Visma
- CSV/SIE export

Store externalAccountingId when exported.

MVP f�r CM
Jag hade byggt f�rsta versionen s� h�r:
Fas 1 � Grund

- Manuell uppladdning PDF
- Manuell uppladdning bild/kvitto
- Microsoft mail read-only
- PDF-detektering
- Mailtext om PDF saknas
- Raw store
- Dedupe
- AI/OCR extraction
- CM Inbox
- Needs review
  Fas 2 � Ekonomifl�de
- Faktura/kvitto-statusar
- Leverant�rsregister
- Kategori/kostnadsst�lle/projekt
- Momsf�lt
- Godk�nnandefl�de
- Dubblettdetektion
- Arkivering
  Fas 3 � Automation
- Automatisk maildelta-sync
- Automatisk klassificering
- Fortnox/Visma-export
- Expense reports
- F�retagskort/bankmatchning
- M�nadsrapport

Min viktigaste rekommendation
Bygg inte CM som �AI l�ser allt och l�gger in direkt�.
Bygg det som:
AI f�resl�r ? systemet flaggar os�kerhet ? m�nniska godk�nner ? CM l�ser/exporterar.
D� f�r ni automation utan att riskera felaktig bokf�ring, dubbla fakturor eller missade underlag.
