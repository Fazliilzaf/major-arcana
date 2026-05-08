const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const INDEX_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'index.html');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

const OVERLAY_RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-overlay-renderers.js'
);

const QUEUE_RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-queue-renderers.js'
);

const STYLES_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'styles.css'
);

test('mailbox-admin har en kompakt lokal signatursektion i samma modal', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    indexSource,
    /mailbox-admin-identity-section/,
    'Mailbox-admin ska ha en separat identitetssektion så namn, e-post och ägare inte flyter ihop med signaturen.'
  );
  assert.doesNotMatch(
    indexSource,
    /mailbox-admin-head-inline[\s\S]*<span>Identitet<\/span>/,
    'Den gamla synliga identitetsrubriken ska vara borttagen ur mailbox-admin-headern.'
  );
  assert.doesNotMatch(
    indexSource,
    /id="mailbox-admin-identity-title">Identitet/,
    'Den synliga sektionsrubriken Identitet ska inte längre renderas ovanför fälten.'
  );
  assert.match(
    indexSource,
    /mailbox-admin-identity-section"[^>]*>\s*<div class="mailbox-admin-identity-grid">/,
    'Namn, e-post och ägare ska börja direkt överst i identitetssektionen utan mellanrubrik.'
  );
  assert.match(
    indexSource,
    /data-mailbox-admin-signature-name/,
    'Mailbox-admin ska ha ett fält för signaturnamn i samma modal.'
  );
  assert.match(
    indexSource,
    /data-mailbox-admin-signature-full-name/,
    'Mailbox-admin ska ha ett separat fält för namnrad i signaturen.'
  );
  assert.match(
    indexSource,
    /data-mailbox-admin-signature-title/,
    'Mailbox-admin ska ha ett separat fält för roll/rad i signaturen.'
  );
  assert.match(
    indexSource,
    /data-mailbox-admin-signature-editor/,
    'Mailbox-admin ska ha en editorliknande yta för själva signaturinnehållet.'
  );
  assert.match(
    indexSource,
    /data-mailbox-signature-command="bold"/,
    'Mailbox-admin ska erbjuda grundläggande formatkommandon i signatursektionen.'
  );
  assert.match(
    indexSource,
    /mailbox-admin-signature-pill/,
    'Signatursektionen ska få små integrerade statuspills i stället för att kännas som ett löst eftertanke-fält.'
  );
  assert.match(
    indexSource,
    /mailbox-admin-head-inline[\s\S]*data-mailbox-admin-form-title/,
    'Mailbox-admin ska bära mailbox-copy som en liten inline-rad i headern utan extra identitetsrubrik.'
  );
  assert.match(
    indexSource,
    /mailbox-admin-bottom-notes[\s\S]*Aktiva mailboxar[\s\S]*Signatur/,
    'Mailbox-admin ska bära aktiva mailboxar-copy och signatur-copy i samma kompakta fotrad i editorytan.'
  );
  assert.match(
    indexSource,
    /mailbox-admin-head-actions[\s\S]*data-mailbox-admin-reset[\s\S]*data-mailbox-admin-close/,
    'Ny mailbox-knappen ska ligga i samma lilla actionkluster som krysset, inte längre i en separat editor-rad eller mitt i hjälpcopyn.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-identity-section\s*\{[\s\S]*gap:\s*0;[\s\S]*padding:\s*0 0 12px;[\s\S]*\}/,
    'Identitetsytan ska börja direkt i topp med fälten i stället för att lägga en extra sektionsrubrik ovanför dem.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-identity-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(0,\s*1\.1fr\)\s+minmax\(148px,\s*0\.72fr\);[\s\S]*\}/,
    'Mailbox-admin ska använda bredden bättre genom att lägga identitetsfälten i ett horisontellt band i stället för att stapla dem i onödan.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-signature-section\s*\{[\s\S]*padding:\s*10px 0 0;[\s\S]*\}/,
    'Signatursektionen ska hållas kompakt i mailbox-admin och inte växa till en separat stor editorprodukt.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-signature-toolbar\s*\{[\s\S]*border:\s*1px solid rgba\(229,\s*218,\s*210,\s*0\.74\);[\s\S]*border-radius:\s*999px;[\s\S]*background:[\s\S]*linear-gradient[\s\S]*\}/,
    'Signaturverktygen ska bära samma mjuka toolbar-surface som reply-studion i stället för att ligga rått på sidan.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-signature-editor\s*\{[\s\S]*border-radius:\s*20px;[\s\S]*background:[\s\S]*radial-gradient[\s\S]*linear-gradient[\s\S]*box-shadow:[\s\S]*\}/,
    'Signatur-editorn ska få samma mjuka editor-surface som reply-studion.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-signature-section \.mailbox-admin-field input\s*\{[\s\S]*border-radius:\s*12px;[\s\S]*background:[\s\S]*linear-gradient[\s\S]*box-shadow:[\s\S]*\}/,
    'Signaturfälten ska bära samma lugna inputspråk som Svarstudions kontroller.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-bottom-notes\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*\}/,
    'Signatursektionen ska bära en tvåspårs fotrad så aktiva mailboxar-copy och signatur-copy kan ligga på samma låga nivå.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-inline-note p\s*\{[\s\S]*font-size:\s*9px;[\s\S]*white-space:\s*nowrap;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*\}/,
    'De två hjälpnivåerna ska hållas små och kompakta som två textrader utan större typografi.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-head-inline\s*\{[\s\S]*display:\s*flex;[\s\S]*gap:\s*10px;[\s\S]*\}/,
    'Mailbox-admin-headern ska ha en liten och tät inline-rad för mailbox-copy bredvid huvudtiteln.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-head-actions\s*\{[\s\S]*display:\s*inline-flex;[\s\S]*gap:\s*5px;[\s\S]*\}/,
    'Ny mailbox och krysset ska ligga i ett tätare actionkluster i headern.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-head-pill\s*\{[\s\S]*min-height:\s*18px;[\s\S]*font-size:\s*8\.5px;[\s\S]*box-shadow:\s*none;[\s\S]*\}/,
    'Ny mailbox-knappen ska uppträda som en liten bubbla i samma stilfamilj som övriga pills, inte som en stor utility-knapp.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-surface \.customers-modal-close\s*\{[\s\S]*height:\s*18px;[\s\S]*border-radius:\s*999px;[\s\S]*box-shadow:\s*none;[\s\S]*\}/,
    'Krysset ska också bära samma lilla pill-språk som mailboxbubblorna i stället för en separat rund ikonknapp.'
  );
});

test('custom mailbox-definitioner bär lokal ton och signaturdata utan att öppna bred settings-logik', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    appSource,
    /function normalizeCustomMailboxDefinition\(mailbox,\s*index = 0\)/,
    'Custom mailbox-normalisering ska vara den lokala ingången för mailbox-admin-data.'
  );
  assert.match(
    appSource,
    /toneClass:\s*deriveMailboxToneClass\(/,
    'Custom mailboxar ska få en lokal toneClass så mailbox-identiteten kan följa med in i adminytan.'
  );
  assert.match(
    appSource,
    /signature:\s*normalizeMailboxSignatureDraft\(mailbox\.signature \|\| mailbox,/,
    'Custom mailboxar ska bära signaturdata lokalt i samma definition i stället för via separat settings-spår.'
  );
  assert.match(
    appSource,
    /function buildMailboxAdminSignatureSeedHtml\(\)/,
    'Mailbox-admin ska kunna skapa en kompakt standardsignatur från de lokala identitets- och signaturfälten.'
  );
  assert.match(
    appSource,
    /function buildMailboxAdminSignatureSeedHtml\(\)\s*\{[\s\S]*buildDefaultMailboxSignatureHtml\(\{/,
    'Den permanenta signaturmallen ska börja med en riktig hälsningsrad och därefter en rik HTML-signatur, inte bara tom placeholdercopy.'
  );
  assert.ok(
    appSource.includes('Bästa hälsningar') &&
      appSource.includes('data:image/svg+xml;charset=utf-8') &&
      appSource.includes('Visit website') &&
      appSource.includes('Visit instagram') &&
      appSource.includes('Visit facebook'),
    'Den permanenta signaturmallen ska bära både hälsningsrad och den godkända ikonraden utan att falla tillbaka till textlänkar.'
  );
  assert.match(
    appSource,
    /img2\.gimm\.io\/9e99c2fb-11b4-402b-8a43-6022ede8aa2b\/image\.png/,
    'Signaturmallen ska använda Hair TP Clinics riktiga signaturasset i stället för en generisk textmall.'
  );
  assert.match(
    appSource,
    /syncMailboxAdminSignatureEditorFromFields\(\)/,
    'Mailbox-admin ska kunna synka den kompakta standardsignaturen från fälten innan användaren börjar redigera fritt.'
  );
  assert.match(
    appSource,
    /state\.customMailboxes = state\.customMailboxes\.map\(/,
    'Mailbox-admin ska uppdatera befintliga custom mailboxar lokalt i customMailboxes.'
  );
  assert.match(
    appSource,
    /function loadPersistedCustomMailboxes\(\)/,
    'Custom mailboxar ska kunna laddas tillbaka från lokal persistens när appen startar igen.'
  );
  assert.match(
    appSource,
    /function persistCustomMailboxes\(\)/,
    'Mailbox-admin ska kunna skriva mailboxar och signaturer till lokal persistens.'
  );
  assert.match(
    appSource,
    /function mergeDefaultCustomMailboxDefinitions\(storedMailboxes = \[\]\)/,
    'Defaultsignaturerna för Egzona och Fazli ska kunna mergeas in ovanpå äldre lokal persistens i stället för att försvinna när browsern redan har sparade mailboxar.'
  );
  assert.match(
    appSource,
    /return mergeDefaultCustomMailboxDefinitions\(parsed\);/,
    'Lokal persistens ska läsas tillbaka genom en merge med defaults så Egzona- och Fazli-signaturerna fortsätter finnas permanent även efter äldre lagrat state.'
  );
  assert.match(
    appSource,
    /state\.customMailboxes = loadPersistedCustomMailboxes\(\);[\s\S]*persistCustomMailboxes\(\);/,
    'Egzona- och Fazli-signaturer ska seedas och sedan persisteras så de ligger kvar i samma browserprofil.'
  );
  assert.match(
    appSource,
    /DEFAULT_CUSTOM_MAILBOX_SIGNATURE_PRESETS[\s\S]*egzona@hairtpclinic\.com[\s\S]*fazli@hairtpclinic\.com/,
    'Defaultpresets ska omfatta både Egzona och Fazli som permanenta mailboxsignaturer.'
  );
  assert.ok(
    appSource.includes('buildApprovedFazliSignatureHtml()') &&
      appSource.includes('Vasaplatsen 2, 411 34 Göteborg') &&
      appSource.includes('contact@hairtpclinic.com'),
    'Fazlis seedade defaultsignatur ska kunna bära den godkända HTML-signaturen oförändrat i preview/admin-parity.'
  );
  assert.match(
    appSource,
    /mailbox-option-status">Custom/,
    'Custom mailboxar ska bära samma lilla statusstruktur i dropdownen som övriga mailboxar.'
  );
});

test('mailbox-admin-listan visar tydligare name-email-separation och lokal redigering', () => {
  const overlaySource = fs.readFileSync(OVERLAY_RENDERERS_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    overlaySource,
    /mailbox-admin-entry-identity/,
    'Mailbox-admin-listan ska ha en separat identitetsgrupp så tonen och mailboxnamnet hålls ihop visuellt.'
  );
  assert.match(
    overlaySource,
    /mailbox-admin-entry-email/,
    'Mailbox-admin-listan ska rendera e-post i ett separat sekundärt fält.'
  );
  assert.match(
    overlaySource,
    /mailbox-admin-entry-headline[\s\S]*mailbox-admin-entry-email/,
    'Mailbox-admin-listan ska nu lägga namn och e-post i samma topprad så varje mailbox blir lättare att scanna.'
  );
  assert.match(
    overlaySource,
    /mailbox-admin-entry-subline[\s\S]*mailbox-admin-entry-meta/,
    'Mailbox-admin-listan ska hålla bubblorna i en separat andra rad under namn och e-post.'
  );
  assert.match(
    overlaySource,
    /mailbox-admin-entry-pill/,
    'Mailbox-admin-listan ska rendera meta som små separata pills i stället för en enda hopslagen rad.'
  );
  assert.match(
    overlaySource,
    /mailbox-admin-entry-pill mailbox-admin-entry-pill-live">Live/,
    'Live-mailboxar ska bära sin tredje bubbla i samma kompakta meta-rad i stället för i en separat badge-zon.'
  );
  assert.match(
    overlaySource,
    /data-mailbox-admin-edit=/,
    'Custom mailboxar ska kunna öppnas för lokal redigering direkt i mailbox-admin-listan.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry-copy\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*\}/,
    'Vänstersidan i mailboxlistan ska ge namnblocket en egen ren kolumn i stället för att trycka meta intill namnen.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry-headline\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*baseline;[\s\S]*\}/,
    'Toppraden i mailboxlistan ska hålla namn och e-post i samma horisontella scanlinje.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry-subline\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*\}/,
    'Andra raden i mailboxlistan ska reserveras för bubbleraden under namn och e-post.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry-meta\s*\{[\s\S]*flex-wrap:\s*nowrap;[\s\S]*padding-left:\s*0;[\s\S]*\}/,
    'De tre bubblorna ska ligga i en kompakt enradig meta-rad under namnet i stället för att brytas upp eller skjutas in.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*\}/,
    'Mailboxraderna ska inte längre ha en egen inramad box runt namnblocket.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry-tone\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Färgpricken ska tas bort när mailboxnamnet själv bär mailboxens ton.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry-name\.mailbox-option-egzona\s*\{[\s\S]*color:\s*#be2166;[\s\S]*\}/,
    'Mailboxnamnet ska ärva mailboxens identitetsfärg i stället för att färgen ligger i en separat prick.'
  );
});

test('mailbox-dropdownen separerar namn, e-post och capability-info i samma kompakta radstruktur', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const queueRenderersSource = fs.readFileSync(QUEUE_RENDERERS_PATH, 'utf8');

  assert.match(
    indexSource,
    /mailbox-option-status">Live/,
    'Preset-mailboxarna ska ha en tydlig liten statusmarkör direkt i dropdownen.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-option-secondary\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*\}/,
    'Dropdownen ska ha en separat sekundärrad för e-post och capability/meta så den går snabbare att skanna.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-option-status\s*\{[\s\S]*text-transform:\s*uppercase;[\s\S]*\}/,
    'Statusmarkören i dropdownen ska vara en liten kontrollerad pill, inte en ny tung rad.'
  );
  assert.match(
    queueRenderersSource,
    /mailbox-option-status">\$\{escapeHtml\(statusLabel\)\}<\/span>/,
    'Runtime-renderingen ska bära samma lilla statusstruktur som den statiska dropdown-markupen.'
  );
});

test('mailbox surfaces skiljer live-mailbox med lokal signaturprofil från ren custom-mailbox i admin och dropdown', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const overlaySource = fs.readFileSync(OVERLAY_RENDERERS_PATH, 'utf8');
  const queueRenderersSource = fs.readFileSync(QUEUE_RENDERERS_PATH, 'utf8');
  const compositionSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'runtime-dom-live-composition.js'
    ),
    'utf8'
  );
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    appSource,
    /function finalizeRuntimeMailboxSurface\(mailbox = \{\}\)/,
    'Mailbox surfaces ska låsa en explicit sanningsmodell i stället för att låta renderers tolka custom-flaggan på egen hand.'
  );
  assert.match(
    appSource,
    /statusLabel:\s*isCustomMailbox\s*\?\s*"Custom"\s*:\s*"Live"/,
    'Sanningsmodellen ska skilja mellan ren custom-mailbox och live-mailbox med lokal signaturprofil.'
  );
  assert.match(
    appSource,
    /adminRemovable:\s*isCustomMailbox\s*\|\|\s*\(hasLocalSignatureDefinition && hasLiveSource && !localSignatureSeeded\)/,
    'Mailbox surfaces ska kunna hålla seeded liveprofiler redigerbara utan att de samtidigt behandlas som borttagbara custom-mailboxar.'
  );
  assert.match(
    overlaySource,
    /mailbox\.adminEditable/,
    'Mailbox-admin-listan ska använda mailboxens ytsanning för redigering i stället för att bara titta på custom=true.'
  );
  assert.match(
    overlaySource,
    /mailbox\.adminRemovable/,
    'Mailbox-admin-listan ska använda mailboxens ytsanning för borttagning i stället för att bara titta på custom=true.'
  );
  assert.match(
    overlaySource,
    /mailbox-admin-entry-pill-local">Lokal signatur/,
    'Mailbox-admin ska kunna markera live-mailboxar som bär lokal signaturprofil utan att kalla dem Custom.'
  );
  assert.match(
    queueRenderersSource,
    /mailbox\.signatureCopy \|\|[\s\S]*mailbox\.ownerCopy/,
    'Dropdownen ska kunna visa den nya mailboxsanningen från modellen när capability-meta saknas.'
  );
  assert.match(
    compositionSource,
    /availableMailbox && availableMailbox\.adminRemovable !== true/,
    'Mailbox-admin-remove ska nu respektera mailboxytans removability i stället för att radera alla customdefinitioner blint.'
  );
  assert.match(
    compositionSource,
    /Den lokala signaturen togs bort\./,
    'När en liveprofil bara tappar sin lokala signatur ska feedbacken säga det explicit.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry-pill-local\s*\{[\s\S]*color:\s*#6a564a;[\s\S]*\}/i,
    'Mailbox-admin ska ge lokal signaturprofil en egen lågmäld men tydlig meta-nyans.'
  );
});

test('mailbox-admin hålls inom viewporten som en enda modalruta med intern scroll', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.mailbox-admin-surface\s*\{[\s\S]*max-height:\s*calc\(100vh - 132px\);[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto;[\s\S]*overflow:\s*hidden;[\s\S]*\}/,
    'Mailbox-admin-surface ska låsas till viewporten och bära en intern trezonslayout i stället för att växa utanför skärmen.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-list\s*\{[\s\S]*grid-auto-flow:\s*column;[\s\S]*grid-template-rows:\s*repeat\(2,\s*auto\);[\s\S]*grid-auto-columns:\s*minmax\(188px,\s*max-content\);[\s\S]*justify-content:\s*start;[\s\S]*gap:\s*0 2px;[\s\S]*overflow-x:\s*auto;[\s\S]*overflow-y:\s*hidden;[\s\S]*overscroll-behavior-x:\s*contain;[\s\S]*\}/,
    'Mailbox-admin-listan ska visa ett horisontellt bottensegment med två kompakta innehållsstyrda rader i stället för att blåsa upp segmenthöjden.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-editor-card\s*\{[\s\S]*overflow:\s*auto;[\s\S]*overscroll-behavior:\s*contain;[\s\S]*\}/,
    'Editorpanelen ska scrolla internt så att identitet och signatur ryms i samma sammanhållna modal.'
  );
});

test('mailbox-admin bär nu en enda huvudyta utan inre lagerkort', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.mailbox-admin-surface::before\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Mailbox-admin ska inte längre bära ett extra inre overlay-lager ovanpå huvudsurface.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-list-card,\s*\.mailbox-admin-editor-card\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*\}/,
    'Vänster- och högerdelen i mailbox-admin ska inte längre ritas som egna lagerkort ovanpå huvudsurface.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-identity-section\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*\}/,
    'Identitetssektionen ska också vara avlagerad så att mailbox-admin upplevs som en enda sammanhållen ruta.'
  );
});

test('mailbox-admin använder bredden bättre än höjden i editorpanelen', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.mailbox-admin-surface\s*\{[\s\S]*width:\s*min\(880px,\s*calc\(100% - 72px\)\);[\s\S]*\}/,
    'Mailbox-admin ska få en bredare desktopyta innan vi löser problem genom mer höjd.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*grid-template-areas:[\s\S]*"editor"[\s\S]*"list"[\s\S]*\}/,
    'Mailbox-admin ska lägga editorn i huvudytan och flytta aktiva mailboxar till ett kompakt bottensegment i stället för en hög vänsterspalt.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-list-card\s*\{[\s\S]*grid-area:\s*list;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*border-top:\s*1px solid rgba\(221,\s*210,\s*202,\s*0\.74\);[\s\S]*\}/,
    'Aktiva mailboxar ska ligga i botten som ett eget horisontellt segment utan separat vänsterspalt när copy flyttats upp till signaturdelen.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-entry\s*\{[\s\S]*min-height:\s*46px;[\s\S]*\}/,
    'Varje mailbox i bottensegmentet ska vara ännu kompaktare så att både mellanrummet mellan segmenten och den interna höjden minskar.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-list \.mailbox-admin-entry:nth-child\(2n\)\s*\{[\s\S]*border-bottom:\s*0;[\s\S]*\}/,
    'Bottensegmentet ska kunna visa två mailboxrader per kolumn utan extra separator under den nedersta raden.'
  );
  assert.match(
    stylesSource,
    /\.mailbox-admin-signature-section\s*\{[\s\S]*grid-template-areas:[\s\S]*"head tools"[\s\S]*"fields fields"[\s\S]*"editor editor"[\s\S]*\}/,
    'Signatursektionen ska använda bredden som horisontella arbetsband i stället för att byggas som ännu ett högt staplat block.'
  );
});
