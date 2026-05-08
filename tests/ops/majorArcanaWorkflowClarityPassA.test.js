const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const INDEX_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'index.html');

const STYLES_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'styles.css'
);

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

const RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-focus-intel-renderers.js'
);

test('focusytan lyfter ut rekommenderat drag ur konversationsscrollen till en egen arbetsrad', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const renderersSource = fs.readFileSync(RENDERERS_PATH, 'utf8');

  assert.match(
    indexSource,
    /data-focus-conversation-layout/,
    'Fokusytan ska ha en egen layout-wrapper som kan bära separat scrollzon och separat arbetsrad.'
  );

  assert.match(
    indexSource,
    /<section\b[^>]*class="focus-conversation"[\s\S]*?data-focus-conversation[\s\S]*?<\/section\s*>\s*<div\b[^>]*class="focus-workrail"[^>]*data-focus-workrail>/,
    'Bottom railen ska ligga som syskon efter konversationssektionen i DOM, inte inne i scrollcontainern.'
  );

  const conversationSectionMatch = indexSource.match(
    /<section\b[^>]*class="focus-conversation"[\s\S]*?data-focus-conversation[\s\S]*?<\/section\s*>/
  );

  assert.ok(
    conversationSectionMatch,
    'Den statiska fokus-DOM:en ska fortfarande innehålla en tydlig .focus-conversation-sektion.'
  );

  assert.doesNotMatch(
    conversationSectionMatch[0],
    /conversation-next-step/,
    'Bottom railen får inte längre ligga inne i .focus-conversation i den statiska DOM-strukturen.'
  );

  assert.match(
    stylesSource,
    /\.focus-section-conversation\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*\}/,
    'Konversationspanelen ska vara en tvåzonslayout där scroll och arbetsrad kan separeras.'
  );

  assert.match(
    stylesSource,
    /\.focus-conversation-layout\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*flex:\s*1 1 auto;[\s\S]*height:\s*100%;[\s\S]*min-height:\s*0;[\s\S]*\}/,
    'Mittkolumnen ska ha en separat intern layout som delar upp scrollande tråd och en verkligt statisk arbetsrad längst ner.'
  );

  assert.match(
    stylesSource,
    /\.focus-conversation\s*\{[\s\S]*padding-right:\s*0;[\s\S]*padding-bottom:\s*8px;[\s\S]*overflow-y:\s*auto;[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;[\s\S]*\}/,
    'Konversationen ska fortsätta vara en egen scrollzon ovanför arbetsraden men utan synlig scrollbar.'
  );

  assert.match(
    stylesSource,
    /\.focus-conversation::-webkit-scrollbar\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Webkit-scrollbaren ska döljas så den mörka raden inte syns trots att ytan fortsatt kan scrolla.'
  );

  assert.match(
    stylesSource,
    /\.focus-workrail\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*margin:\s*auto 0 0;[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*\}/,
    'Arbetsraden ska ligga statiskt längst ner i mittenkolumnen utan egen inramning eller extra rail-kort.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-step\s*\{[\s\S]*width:\s*100%;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.45fr\)\s+auto;[\s\S]*background:\s*transparent;[\s\S]*position:\s*relative;[\s\S]*\}/,
    'Bottom railen ska använda arbetsytans bredd som egen rad utan att ligga inramad som en separat bubbla.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-actions\s*\{[\s\S]*gap:\s*10px;[\s\S]*padding-left:\s*18px;[\s\S]*border-left:\s*1px solid rgba\(214,\s*200,\s*190,\s*0\.84\);[\s\S]*\}/,
    'CTA-zonen ska vara visuellt separerad från summary-delen så arbetsraden känns fristående.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-summary\s*\{[\s\S]*grid-template-areas:[\s\S]*"label title"[\s\S]*"text text";[\s\S]*\}/,
    'Summary-zonen ska använda exakt två textrader: label och rubrik på rad ett, stödtext på rad två från samma vänsterkant.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-label\s*\{[\s\S]*font-size:\s*10\.5px;[\s\S]*line-height:\s*11px;[\s\S]*\}/,
    'Kicker-raden ska använda samma kompakta storleksnivå som rubriken utan att växa i höjd.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-title\s*\{[\s\S]*font-size:\s*10\.5px;[\s\S]*line-height:\s*11px;[\s\S]*\}/,
    'Rubriken ska dela samma kompakta storleksnivå som kicker-raden så summaryn känns mer enhetlig.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-title\s*\{[\s\S]*white-space:\s*nowrap;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*\}/,
    'Rubriken i arbetsraden ska kännas horisontellt utdragen i stället för att bygga tjocklek genom flera rader.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-text\s*\{[\s\S]*white-space:\s*nowrap;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*\}/,
    'Stödtexten ska hållas kompakt på en rad så railen blir tunnare i känslan utan större komponenter.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-button\s*\{[\s\S]*min-height:\s*44px;[\s\S]*padding:\s*0 22px;[\s\S]*border:\s*1px solid rgba\(178,\s*91,\s*126,\s*0\.72\);[\s\S]*background:[\s\S]*font-size:\s*13px;[\s\S]*text-decoration:\s*none;[\s\S]*\}/,
    'CTA-zonen ska nu bära den större magenta Svarstudio-knappen från referensen i stället för den tidigare textlänkslayouten.'
  );

  assert.match(
    stylesSource,
    /\.conversation-next-icon-button\s*\{[\s\S]*width:\s*38px;[\s\S]*height:\s*38px;[\s\S]*border-radius:\s*999px;[\s\S]*background:[\s\S]*box-shadow:/,
    'Snabbverktygen bredvid Svarstudio ska nu vara egna runda ljusa ikonknappar.'
  );

  assert.match(
    stylesSource,
    /\.focus-workrail::before\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Arbetsraden ska inte längre ritas som en egen inramad rail med separat skiljelinje ovanfor.'
  );

  assert.match(
    appSource,
    /const focusWorkrail = document\.querySelector\("\[data-focus-workrail\]"\);/,
    'Appen ska hämta den separata workrail-containern som egen DOM-hook.'
  );

  assert.match(
    stylesSource,
    /\.focus-surface\s*\{[\s\S]*height:\s*var\(--workspace-pane-max-height\);[\s\S]*min-height:\s*var\(--workspace-pane-max-height\);[\s\S]*overflow:\s*hidden;[\s\S]*\}/,
    'Mittenkolumnens yttre surface får inte själv scrolla om arbetsraden ska kunna ligga statiskt längst ner.'
  );

  assert.match(
    stylesSource,
    /\.focus-section-conversation\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow:\s*hidden;[\s\S]*\}/,
    'Konversationssektionen ska kapsla scrollen till själva tråden och hålla arbetsraden utanför den rörliga ytan.'
  );

  assert.match(
    renderersSource,
    /focusConversationSection\.innerHTML = `[\s\S]*\$\{olderHistoryMarkup\}`;[\s\S]*focusWorkrail\.innerHTML = conversationNextStepMarkup;/,
    'Runtime-renderingen ska skriva tråden och arbetsraden till olika DOM-containers.'
  );

  assert.match(
    renderersSource,
    /focusWorkrail\.innerHTML = "";/,
    'Renderingen ska kunna tömma arbetsraden separat när ingen live-tråd är vald.'
  );
});

test('reply-studion visar Från-val separat från composefälten och behåller signaturkortet synligt i reply', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assert.match(
    indexSource,
    /data-studio-compose-role="from"/,
    'Från-fältet ska vara explicit markerat så reply-läget kan visa rätt avsändarval utan att blanda in övriga composefält.'
  );

  assert.match(
    stylesSource,
    /\.studio-shell:not\(\[data-mode="compose"\]\)\s+\.studio-compose-fields\s*\{[\s\S]*display:\s*grid;[\s\S]*\}/,
    'Reply-läget ska göra Från-väljaren synlig även utanför compose.'
  );

  assert.match(
    stylesSource,
    /\.studio-shell:not\(\[data-mode="compose"\]\)\s+\.studio-compose-field:not\(\[data-studio-compose-role="from"\]\)\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Reply-läget ska hålla To/Ämne dolda när bara avsändarvalet behövs.'
  );

  assert.doesNotMatch(
    stylesSource,
    /\.studio-shell:not\(\[data-mode="compose"\]\)\s+\.studio-signature-card\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Reply-läget ska inte längre dölja signaturkortet när signaturen ska kunna väljas separat från Från-mailboxen.'
  );

  assert.match(
    stylesSource,
    /\.studio-editor-top\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-areas:[\s\S]*"recipient tools"[\s\S]*"fields tools";[\s\S]*\}/,
    'Studiotoppen ska använda en kontrollerad grid så befintlig bredd nyttjas bättre utan större ytor.'
  );

  assert.match(
    stylesSource,
    /\.studio-shell:not\(\[data-mode="compose"\]\)\s+\.studio-compose-fields\s*\{[\s\S]*width:\s*min\(252px,\s*100%\);[\s\S]*grid-template-columns:\s*minmax\(188px,\s*252px\);[\s\S]*\}/,
    'Reply-lägets Från-del ska få lite mer faktisk bredd så kontrollen blir tydligare utan att öppna mailboxpasset.'
  );

  assert.match(
    stylesSource,
    /\.studio-control-row\s*\{[\s\S]*grid-template-columns:\s*68px\s+minmax\(0,\s*1fr\);[\s\S]*gap:\s*8px;[\s\S]*\}/,
    'Studiokontrollerna ska ge valytan mer användbar bredd så läsbarhet och kontroll förbättras lokalt i studion.'
  );
});

test('mailbox-dropdownen använder kontrollerad enradslayout med fullbreddsval', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.mailbox-menu-grid\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*\}/,
    'Mailbox-dropdownen ska rendera som en kontrollerad enkelkolumn i stället för wrapade chips.'
  );

  assert.match(
    stylesSource,
    /\.mailbox-option\s*\{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*44px;[\s\S]*\}/,
    'Varje mailboxrad ska ha full bredd och jämn höjd så att inget sticker utanför eller får olika storlek.'
  );

  assert.match(
    stylesSource,
    /\.mailbox-option\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*\}/,
    'Mailbox-dropdownen ska inte längre rita varje mailboxrad som en egen bubbla runt namnet.'
  );

  assert.match(
    stylesSource,
    /\.mailbox-option-box svg\s*\{[\s\S]*width:\s*11px;[\s\S]*height:\s*11px;[\s\S]*\}/,
    'Checkmarken i mailbox-dropdownen ska vara större och tydligare.'
  );

  assert.match(
    stylesSource,
    /\.mailbox-menu\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*1200;[\s\S]*\}/,
    'Mailbox-dropdownen ska renderas som ett riktigt overlay-lager ovanpå UI:t, inte som en vanlig absolut panel i innehållsflödet.'
  );

  assert.match(
    appSource,
    /function syncMailboxDropdownOverlay\(/,
    'Appen ska ha en liten overlay-sync för mailbox-dropdownen så att panelen kan positioneras som ett flytande lager.'
  );
});

test('arbetsytans tre huvudkolumner använder samma stabila panehojd och vänsterscope har ikon-actions', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assert.match(
    stylesSource,
    /\.preview-shell\s*\{[\s\S]*height:\s*var\(--workspace-pane-max-height\);[\s\S]*min-height:\s*var\(--workspace-pane-max-height\);[\s\S]*\}/,
    'Vänsterkolumnen ska låsa till en stabil panehojd så nederkanten inte flyttar sig med antalet synliga mejl.'
  );

  assert.match(
    stylesSource,
    /\.focus-surface\s*\{[\s\S]*height:\s*var\(--workspace-pane-max-height\);[\s\S]*min-height:\s*var\(--workspace-pane-max-height\);[\s\S]*\}/,
    'Mittkolumnen ska använda samma stabila panehojd som övriga arbetsytor.'
  );

  assert.match(
    stylesSource,
    /\.focus-intel\s*\{[\s\S]*height:\s*var\(--workspace-pane-max-height\);[\s\S]*min-height:\s*var\(--workspace-pane-max-height\);[\s\S]*\}/,
    'Högerkolumnen ska använda samma stabila panehojd som övriga arbetsytor.'
  );

  assert.match(
    indexSource,
    /data-queue-actions/,
    'Vänsterarbetsytan ska ha en scope-rad för snabbåtgärder (Alla + ikonstripp).'
  );

  assert.match(
    indexSource,
    /data-queue-action-strip/,
    'Scope-raden ska ha en tom stripp där check- och radera-ikoner renderas dynamiskt.'
  );

  assert.match(
    appSource,
    /renderQueueLaneShortcutRows/,
    'Appen ska fylla scope-strippen med handled- och delete-åtgärder via renderQueueLaneShortcutRows.'
  );

  assert.match(
    appSource,
    /handleRuntimeHandledAction/,
    'Snabbåtgärder ska fortfarande nå handled-logiken via action-motorn.'
  );

  assert.match(
    appSource,
    /const runtimeMode = normalizeKey\(state\.runtime\.mode \|\| ""\);[\s\S]*runtimeMode === "offline_history"/,
    'Snabbactions-stripen ska döljas helt i offline_history så att inga extra check/radera-ikoner läcker ovanpå historikcopy.'
  );
});
