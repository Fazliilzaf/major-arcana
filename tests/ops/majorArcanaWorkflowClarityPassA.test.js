const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertMatchFast } = require('../helpers/assertMatchFast');

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

const ACTION_ENGINE_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-action-engine.js'
);

const DOM_LIVE_COMPOSITION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);

test('focusytan lyfter ut rekommenderat drag ur konversationsscrollen till en egen arbetsrad', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const renderersSource = fs.readFileSync(RENDERERS_PATH, 'utf8');
  const actionEngineSource = fs.readFileSync(ACTION_ENGINE_PATH, 'utf8');

  assertMatchFast(
    indexSource,
    /data-focus-conversation-layout/,
    'Fokusytan ska ha en egen layout-wrapper som kan bära separat scrollzon och separat arbetsrad.'
  );

  assertMatchFast(
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

  assertMatchFast(
    stylesSource,
    /\.focus-section-conversation\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*\}/,
    'Konversationspanelen ska vara en tvåzonslayout där scroll och arbetsrad kan separeras.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-conversation-layout\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto;[\s\S]*flex:\s*1 1 auto;[\s\S]*height:\s*100%;[\s\S]*min-height:\s*0;[\s\S]*\}/,
    'Mittkolumnen ska ha en separat intern layout som delar upp scrollande tråd och en verkligt statisk arbetsrad längst ner.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-conversation\s*\{[\s\S]*padding-right:\s*0;[\s\S]*padding-bottom:\s*8px;[\s\S]*overflow-y:\s*auto;[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;[\s\S]*\}/,
    'Konversationen ska fortsätta vara en egen scrollzon ovanför arbetsraden men utan synlig scrollbar.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-conversation\s*\{[\s\S]*scrollbar-width:\s*none;[\s\S]*-ms-overflow-style:\s*none;[\s\S]*\}/,
    'Fokuskonversationen ska fortsatt dölja den visuella scrollbaren även när webkit-regeln lever i en annan overlay.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-workrail\s*\{[\s\S]*flex:\s*0 0 auto;[\s\S]*margin:\s*auto 0 0;[\s\S]*padding:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*\}/,
    'Arbetsraden ska ligga statiskt längst ner i mittenkolumnen utan egen inramning eller extra rail-kort.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-step\s*\{[\s\S]*width:\s*100%;[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.45fr\)\s+auto;[\s\S]*background:\s*transparent;[\s\S]*position:\s*relative;[\s\S]*\}/,
    'Bottom railen ska använda arbetsytans bredd som egen rad utan att ligga inramad som en separat bubbla.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-actions\s*\{[\s\S]*gap:\s*10px;[\s\S]*padding-left:\s*18px;[\s\S]*border-left:\s*1px solid rgba\(214,\s*200,\s*190,\s*0\.84\);[\s\S]*\}/,
    'CTA-zonen ska vara visuellt separerad från summary-delen så arbetsraden känns fristående.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-summary\s*\{[\s\S]*grid-template-areas:[\s\S]*["']label title["'][\s\S]*["']text text["'];[\s\S]*\}/,
    'Summary-zonen ska använda exakt två textrader: label och rubrik på rad ett, stödtext på rad två från samma vänsterkant.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-label\s*\{[\s\S]*font-size:\s*10\.5px;[\s\S]*line-height:\s*11px;[\s\S]*\}/,
    'Kicker-raden ska använda samma kompakta storleksnivå som rubriken utan att växa i höjd.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-title\s*\{[\s\S]*font-size:\s*10\.5px;[\s\S]*line-height:\s*11px;[\s\S]*\}/,
    'Rubriken ska dela samma kompakta storleksnivå som kicker-raden så summaryn känns mer enhetlig.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-title\s*\{[\s\S]*white-space:\s*nowrap;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*\}/,
    'Rubriken i arbetsraden ska kännas horisontellt utdragen i stället för att bygga tjocklek genom flera rader.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-text\s*\{[\s\S]*white-space:\s*nowrap;[\s\S]*text-overflow:\s*ellipsis;[\s\S]*\}/,
    'Stödtexten ska hållas kompakt på en rad så railen blir tunnare i känslan utan större komponenter.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-button\s*\{[\s\S]*min-height:\s*44px;[\s\S]*padding:\s*0 22px;[\s\S]*border:\s*1px solid rgba\(178,\s*91,\s*126,\s*0\.72\);[\s\S]*background:[\s\S]*font-size:\s*13px;[\s\S]*text-decoration:\s*none;[\s\S]*\}/,
    'CTA-zonen ska nu bära den större magenta Svarstudio-knappen från referensen i stället för den tidigare textlänkslayouten.'
  );

  assertMatchFast(
    stylesSource,
    /\.conversation-next-icon-button\s*\{[\s\S]*width:\s*38px;[\s\S]*height:\s*38px;[\s\S]*border-radius:\s*999px;[\s\S]*background:[\s\S]*box-shadow:/,
    'Snabbverktygen bredvid Svarstudio ska nu vara egna runda ljusa ikonknappar.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-workrail::before\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Arbetsraden ska inte längre ritas som en egen inramad rail med separat skiljelinje ovanfor.'
  );

  assertMatchFast(
    appSource,
    /const focusWorkrail = document\.querySelector\("\[data-focus-workrail\]"\);/,
    'Appen ska hämta den separata workrail-containern som egen DOM-hook.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-surface\s*\{[\s\S]*height:\s*var\(--workspace-pane-max-height\);[\s\S]*min-height:\s*var\(--workspace-pane-max-height\);[\s\S]*overflow:\s*hidden;[\s\S]*\}/,
    'Mittenkolumnens yttre surface får inte själv scrolla om arbetsraden ska kunna ligga statiskt längst ner.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-section-conversation\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;[\s\S]*overflow:\s*hidden;[\s\S]*\}/,
    'Konversationssektionen ska kapsla scrollen till själva tråden och hålla arbetsraden utanför den rörliga ytan.'
  );

  assertMatchFast(
    renderersSource,
    /focusConversationSection\.innerHTML = `[\s\S]*\$\{olderHistoryMarkup\}`;[\s\S]*focusWorkrail\.innerHTML = conversationNextStepMarkup;/,
    'Runtime-renderingen ska skriva tråden och arbetsraden till olika DOM-containers.'
  );
  assertMatchFast(
    renderersSource,
    /function buildConversationJourneyActionMarkup\(config = \{\}, threadId = ""\)/,
    'Arbetsraden ska kunna välja primär CTA från patientresans aktiva domän i stället för att alltid låsa till Svarstudio.'
  );
  assertMatchFast(
    renderersSource,
    /getJourneyPrimaryActionConfig\(thread, focusReadState\)/,
    'Fokusytans arbetsrad ska fråga patientresan vilken handling som ska vara primär.'
  );
  assertMatchFast(
    renderersSource,
    /data-booking-open-surface/,
    'När bokning leder patientresan ska arbetsraden kunna öppna bokningsytan direkt som primär handling.'
  );
  assertMatchFast(
    renderersSource,
    /function buildJourneyActionButtonMarkup\([\s\S]*className = "intel-card-action-button"[\s\S]*\)/,
    'Högerpanelen ska kunna återanvända samma journey-action som liten CTA utan att duplicera actionlogik för varje domän.'
  );
  assertMatchFast(
    renderersSource,
    /actionButton:\s*primaryActionConfig[\s\S]*threadId:\s*thread\?\.id/,
    'Journey-kortet i Operativt stöd ska bära en konkret CTA som pekar på rätt arbetsyta för vald tråd.'
  );
  assertMatchFast(
    renderersSource,
    /focus-customer-next-action-button/,
    'Kundpanelen ska kunna rendera ett litet Nästa drag-CTA direkt under sammanfattningen.'
  );
  assertMatchFast(
    appSource,
    /quickAction:\s*"note"/,
    'Journey-mappen ska kunna översätta dokument- och konsultationslägen till en riktig note-snabbaction.'
  );
  assertMatchFast(
    appSource,
    /function getJourneyPreferredIntelTabId\(thread, focusReadState = \{\}\)/,
    'Patientresan ska kunna översätta aktiv domän till en föredragen högerpanelflik vid trådbyte.'
  );
  assertMatchFast(
    appSource,
    /activeModuleId === "identity"[\s\S]*return "intel-view-customer";/,
    'Identitetsläge ska kunna landa i kundfliken när det är den mest naturliga operatörsytan.'
  );
  assertMatchFast(
    appSource,
    /activeModuleId === "timeline"[\s\S]*return "intel-view-history";/,
    'Tidslinjeläge ska kunna landa i historikfliken när patientresan främst handlar om historik.'
  );
  assertMatchFast(
    appSource,
    /syncJourneyDrivenIntelSelection\(selectedFocusThread, focusReadState\);[\s\S]*renderRuntimeIntel\(selectedFocusThread, focusReadState\);/,
    'Fokusskalet ska synka vald högerpanelflik från patientresan innan operativt stöd renderas.'
  );
  assertMatchFast(
    appSource,
    /function getJourneyPreferredWorkspaceAction\(thread, focusReadState = \{\}\)/,
    'Patientresan ska kunna mappa aktiv domän till ett föredraget första arbetsläge.'
  );
  assertMatchFast(
    appSource,
    /preferredAction === "booking_surface"[\s\S]*openBookingOperatorSurface\(\{[\s\S]*scroll: false,[\s\S]*message: "",[\s\S]*\}\);/,
    'Bokningsdomäner ska kunna landa direkt i bokningsytan utan extra feedbackbrus när tråden öppnas.'
  );
  assertMatchFast(
    appSource,
    /preferredAction === "schedule_open"[\s\S]*openRuntimeSchedule\(\{ renderDraft: true \}\)/,
    'Eftervårdsdomäner ska kunna landa direkt i uppföljningsytan när den är patientresans primära verktyg.'
  );
  assertMatchFast(
    appSource,
    /preferredAction === "note_open"[\s\S]*openRuntimeNote\(\)\.catch/,
    'Dokument- och konsultationsdomäner ska kunna landa direkt i Smart anteckning som första arbetsläge.'
  );
  assertMatchFast(
    appSource,
    /function getJourneyPreferredNoteDestination\(thread, focusReadState = \{\}\)/,
    'Patientresan ska kunna välja rätt Smart anteckning-destination utifrån aktiv domän.'
  );
  assertMatchFast(
    appSource,
    /activeModuleId === "commercial"\) return "betalning";/,
    'Kommersiella domäner ska kunna förvälja betalningsdestination i Smart anteckning.'
  );
  assertMatchFast(
    appSource,
    /activeModuleId === "consultation"[\s\S]*activeModuleId === "operation"[\s\S]*return "medicinsk";/,
    'Kliniska och konsultativa domäner ska kunna förvälja medicinsk destination i Smart anteckning.'
  );
  assertMatchFast(
    appSource,
    /function seedJourneyDrivenWorkspace\(thread, focusReadState = \{\}, preferredAction = ""\)/,
    'Journey-landningen ska kunna förfina arbetsytan efter att rätt verktyg öppnats.'
  );
  assertMatchFast(
    appSource,
    /function getJourneyPreferredBookingStatusStep\(readout = \{\}\)/,
    'Patientresan ska kunna översätta backendblockerare till rätt bokningsdelsteg innan operatören börjar klicka.'
  );
  assertMatchFast(
    appSource,
    /blockerKey === "candidate_slots"[\s\S]*return "slots_ready";/,
    'Tidsblockerare ska kunna landa i delsteget Tider i bokningsytan.'
  );
  assertMatchFast(
    appSource,
    /blockerKey === "insert_studio"[\s\S]*return "offered";/,
    'Erbjudande-/Svarstudio-blockerare ska kunna landa i delsteget Erbjudet i bokningsytan.'
  );
  assertMatchFast(
    appSource,
    /function focusBookingStatusStep\(status = ""\)/,
    'Bokningsytan ska kunna fokusera ett delsteg direkt utan att ändra status automatiskt.'
  );
  assertMatchFast(
    appSource,
    /function getJourneyPreferredBookingSurfaceZone\(statusStep = "", readout = \{\}\)/,
    'Patientresan ska kunna översätta bokningsdelsteget vidare till rätt arbetsblock inne i bokningsytan.'
  );
  assertMatchFast(
    appSource,
    /function buildBookingStageContext\(statusStep = "", readout = \{\}\)/,
    'Bokningsytan ska kunna översätta delsteget till stegmedveten copy för kontext- och handoffblocken.'
  );
  assertMatchFast(
    appSource,
    /function buildBookingSurfaceStageLayout\(statusStep = "", readout = \{\}\)/,
    'Bokningsytan ska kunna översätta delsteget till prioriterad blockordning och vikt i samma yta.'
  );
  assertMatchFast(
    appSource,
    /function buildBookingStageMicrocopy\(statusStep = "", readout = \{\}, nextAction = \{\}\)/,
    'Bokningsytan ska kunna översätta delsteget till mikrocopy för knappar och slotytor.'
  );
  assertMatchFast(
    appSource,
    /function buildBookingPreferredWindowHints\(readout = \{\}\)/,
    'Bokningsytan ska kunna tolka kundens önskade tidsfönster innan kandidat-tider rankas.'
  );
  assertMatchFast(
    appSource,
    /function buildBookingSlotRecommendation\(slot = \{\}, readout = \{\}\)/,
    'Bokningsytan ska kunna poängsätta en tid mot kundens önskade veckodag eller tidsfönster.'
  );
  assertMatchFast(
    appSource,
    /function rankBookingAvailableSlots\(slots = \[\], readout = \{\}\)/,
    'Bokningsytan ska kunna rangordna externa tider och markera upp till tre rekommenderade kandidater.'
  );
  assertMatchFast(
    appSource,
    /function getBookingRankedSelectedSlots\(readout = \{\}\)/,
    'Bokningsytan ska kunna återanvända samma kandidatlogik även för valda tider.'
  );
  assertMatchFast(
    appSource,
    /function buildBookingSelectedSlotSpreadAnalysis\(readout = \{\}\)/,
    'Bokningsytan ska kunna analysera om valda tider är för lika varandra innan överlämning.'
  );
  assertMatchFast(
    appSource,
    /normalizedStatus === "needs_triage"[\s\S]*heroLabel:\s*"Triage nu"[\s\S]*normalizedStatus === "waiting_customer"[\s\S]*heroLabel:\s*"Kundsvar nu"/,
    'Triage och väntar kund ska kunna ge olika operatörscopy i samma bokningsyta.'
  );
  assertMatchFast(
    appSource,
    /normalizedStatus === "slots_ready"[\s\S]*advancedSummaryLabel:\s*"Stöd · Kö och logg"[\s\S]*primaryZones:\s*\[[\s\S]*"slot_overview"[\s\S]*"slot_controls"[\s\S]*"available_slots"[\s\S]*"selected_slots"[\s\S]*\]/,
    'Tidsläget ska kunna lyfta kandidater och valda tider som primära block i bokningsytan.'
  );
  assertMatchFast(
    appSource,
    /advancedSummaryLabel:\s*"Stöd · Bekräftelse och historik"[\s\S]*primaryZones:\s*\["handoff_summary",\s*"action_head",\s*"action_row",\s*"decision_context"\]/,
    'Bekräftelseläget ska kunna lyfta logg och händelser som primära block i bokningsytan.'
  );
  assertMatchFast(
    appSource,
    /normalizedStatus === "needs_triage"[\s\S]*availableEmptyTitle:\s*"Tider kommer efter triage"[\s\S]*candidate_slots:\s*"Validera & välj tider"/,
    'Triage-läget ska kunna tala tydligare om att tider kommer först efter validerat underlag.'
  );
  assertMatchFast(
    appSource,
    /normalizedStatus === "waiting_customer"[\s\S]*schedule_followup:\s*slotCount >= 3 \? "Säkra uppföljning" : "Skapa uppföljning"[\s\S]*confirm_external:\s*slotCount >= 3 \? "Bekräfta \/ boka om" : "Markera bekräftad"/,
    'Kundväntan ska kunna ge mer situationsspecifika knappetiketter för uppföljning och bekräftelse.'
  );
  assertMatchFast(
    appSource,
    /normalizedStatus === "needs_triage"\) return "decision_context";[\s\S]*normalizedStatus === "slots_ready"[\s\S]*"slot_controls"[\s\S]*normalizedStatus === "offered"\) return "action_row";/,
    'Triage, tider och erbjudande ska kunna landa i olika arbetsblock i samma bokningsyta.'
  );
  assertMatchFast(
    appSource,
    /function focusBookingSurfaceZone\(zoneKey = ""\)/,
    'Bokningsytan ska kunna markera och fokusera rätt arbetsblock utan att utföra någon åtgärd.'
  );
  assertMatchFast(
    appSource,
    /function setBookingSurfaceZoneHighlight\(zoneKey = ""\)/,
    'Bokningsytan ska kunna hålla kvar samma primära arbetsblock visuellt även efter senare rerenders.'
  );
  assertMatchFast(
    appSource,
    /function applyBookingSurfaceStageLayout\(bookingDom,\s*stageLayout = \{\}\)/,
    'Bokningsytan ska ha en separat helper som applicerar blockordning och prioritet utan att skapa en separat layoutgren.'
  );
  assertMatchFast(
    appSource,
    /function applyBookingActionStagePresentation\(bookingDom,\s*stageMicrocopy = \{\}\)/,
    'Bokningsytan ska ha en separat helper som applicerar stegmedvetna etiketter och rollnivåer på samma actions.'
  );
  assertMatchFast(
    appSource,
    /bookingDom\.advancedPanel\.open = Boolean\(stageLayout\.advancedOpen\);/,
    'Renderingen ska kunna öppna avancerat-läget medvetet när aktuellt bokningssteg kräver det.'
  );
  assertMatchFast(
    appSource,
    /node\.dataset\.stagePriority = "primary";[\s\S]*node\.dataset\.stagePriority = "quiet";[\s\S]*node\.dataset\.stagePriority = "supporting";/,
    'Layoutmotorn ska kunna märka bokningsblock som primära, tystare eller stödjande beroende på steg.'
  );
  assertMatchFast(
    appSource,
    /function seedBookingSurfaceForCurrentThread\(thread,\s*\{\s*moveActionFocus = false,\s*announce = false\s*\} = \{\}\)/,
    'Bokningsytan ska ha en gemensam seed-helper så journey- och manuellt öppna-läge landar lika.'
  );
  assertMatchFast(
    appSource,
    /function buildBookingDecisionCards\(thread,\s*readout = \{\},\s*stageContext = \{\}\)/,
    'Beslutskorten ska kunna ta in stegmedveten context i stället för helt statisk bokningscopy.'
  );
  assertMatchFast(
    appSource,
    /label:\s*stageContext\.heroLabel \|\| "Nu"[\s\S]*value:\s*stageContext\.heroValue \|\| formatBookingStatus\(readout\.status\)/,
    'Bokningskontexten ska få ett primärt "Nu"-kort som speglar aktivt steg.'
  );
  assertMatchFast(
    appSource,
    /function buildBookingHandoffSummary\(readout = \{\},\s*stageContext = \{\}\)/,
    'Överlämningssammanfattningen ska kunna färgas av aktivt steg och inte bara visa generisk blockeringscopy.'
  );
  assertMatchFast(
    appSource,
    /label:\s*stageContext\.handoffLabel \|\| "Blockering"[\s\S]*stageContext\.handoffMeta/,
    'Blockeringskortet i överlämningen ska kunna få stegmedveten copy utifrån aktivt bokningsläge.'
  );
  assertMatchFast(
    appSource,
    /querySelectorAll\("\[data-booking-stage-focus-zone\]\.booking-stage-focus-target"\)/,
    'Fokuszonen ska rensas innan ett nytt bokningsblock lyfts fram, så bara en primär arbetsyta känns aktiv åt gången.'
  );
  assertMatchFast(
    appSource,
    /const preferredStatusStep = getJourneyPreferredBookingStatusStep\(readout\);[\s\S]*const stageContext = buildBookingStageContext\(preferredStatusStep,\s*readout\);[\s\S]*const stageLayout = buildBookingSurfaceStageLayout\(preferredStatusStep,\s*readout\);[\s\S]*const preferredFocusZone = getJourneyPreferredBookingSurfaceZone\(preferredStatusStep,\s*readout\);[\s\S]*const nextAction = buildBookingNextActionReadout\(readout\);[\s\S]*const stageMicrocopy = buildBookingStageMicrocopy\(preferredStatusStep,\s*readout,\s*nextAction\);[\s\S]*applyBookingSurfaceStageLayout\(bookingDom,\s*stageLayout\);[\s\S]*applyBookingActionStagePresentation\(bookingDom,\s*stageMicrocopy\);[\s\S]*setBookingSurfaceZoneHighlight\(preferredFocusZone\);/,
    'Renderingen ska återapplicera rätt bokningszon visuellt så highlighten inte försvinner när ytan uppdateras.'
  );
  assertMatchFast(
    appSource,
    /const preferredStatusStep = getJourneyPreferredBookingStatusStep\(readout\);[\s\S]*const stageContext = buildBookingStageContext\(preferredStatusStep,\s*readout\);[\s\S]*const stageLayout = buildBookingSurfaceStageLayout\(preferredStatusStep,\s*readout\);[\s\S]*const nextAction = buildBookingNextActionReadout\(readout\);[\s\S]*const stageMicrocopy = buildBookingStageMicrocopy\(preferredStatusStep,\s*readout,\s*nextAction\);/,
    'Renderingen ska räkna ut stegmedveten booking-context en gång och återanvända den genom ytan.'
  );
  assertMatchFast(
    appSource,
    /buildBookingDecisionCards\(thread,\s*readout,\s*stageContext\)[\s\S]*renderBookingHandoffSummary\(bookingDom,\s*readout,\s*stageContext\)/,
    'Både kontextkort och handoffsammanfattning ska läsa från samma stegmedvetna booking-context.'
  );
  assertMatchFast(
    appSource,
    /renderAvailableBookingSlots\(bookingDom,\s*stageMicrocopy,\s*readout\)/,
    'Slotytan ska få samma stegmedvetna mikrocopy som actions och övriga bokningsblock.'
  );
  assertMatchFast(
    appSource,
    /recommendationRank < 3[\s\S]*entry\.recommendation\.rankLabel = `Rek \$\{recommendationRank\}`;/,
    'Kandidatlistan ska kunna markera högst tre rekommenderade tider för operatören.'
  );
  assertMatchFast(
    appSource,
    /const rankedSelectedSlots = getBookingRankedSelectedSlots\(readout\);[\s\S]*slot\.selectedRankLabel \|\| "Vald"/,
    'Listan för valda tider ska kunna sorteras och märkas upp med Val 1-3 i samma operatorlogik.'
  );
  assertMatchFast(
    appSource,
    /uniqueDays\.size === 1 && uniqueBands\.size === 1[\s\S]*väldigt nära varandra[\s\S]*sprida förslaget över fler tider eller dagar/s,
    'Valda tider ska kunna ge en tydlig varning när hela förslaget ligger för tätt i både dag och tidsfönster.'
  );
  assertMatchFast(
    appSource,
    /booking-slot-spread-note/,
    'Valda tider ska kunna visa en liten spridningsnotis direkt i listan när urvalet behöver bättre variation.'
  );
  assertMatchFast(
    appSource,
    /if \(hasSelectedSlots && bookingDom\.actionHint && selectedSlotSpread\.summary\)/,
    'Action-hinten ska kunna återanvändas för spridningsråd när tider redan är valda.'
  );
  assertMatchFast(
    appSource,
    /rankBookingAvailableSlots\(\[\.\.\.selectedSlots,\s*slot\], currentReadout\)[\s\S]*\.slice\(0,\s*3\);/,
    'När en ny tid väljs ska de valda tiderna sorteras om efter rekommendationsstyrka innan de sparas.'
  );
  assertMatchFast(
    appSource,
    /const slots = getBookingRankedSelectedSlots\(readout\);[\s\S]*slots\[0\]\?\.recommendation\?\.reason/,
    'Överlämningssammanfattningen ska kunna använda den starkaste valda tiden och dess motivering.'
  );
  assertMatchFast(
    appSource,
    /<small class="booking-slot-recommendation" data-tone="recommended">/,
    'Rekommenderade kandidattider ska rendera en liten Rek-badge direkt i slotraden.'
  );
  assertMatchFast(
    stylesSource,
    /\.booking-decision-grid\[data-stage-priority="primary"\],[\s\S]*\.booking-action-row\[data-stage-priority="primary"\][\s\S]*border-top-color:\s*rgba\(106,\s*61,\s*37,\s*0\.22\);/,
    'Primära bokningsblock ska kunna få en lite tydligare visuell vikt utan att bli nya paneler.'
  );
  assertMatchFast(
    stylesSource,
    /\.booking-advanced-disclosure\[data-stage-priority="primary"\]\s*>\s*\.booking-advanced-summary strong/,
    'Avancerat-sammanfattningen ska kunna bära mer ton när dess innehåll faktiskt är primärt i steget.'
  );
  assertMatchFast(
    stylesSource,
    /\.booking-decision-grid\[data-stage-priority="quiet"\],[\s\S]*opacity:\s*0\.88;/,
    'Mindre viktiga bokningsblock ska kunna tonas ned lite i samma yta utan att döljas helt.'
  );
  assertMatchFast(
    stylesSource,
    /\.booking-action\[data-stage-role="primary"\][\s\S]*opacity:\s*1;[\s\S]*\.booking-action\[data-stage-role="quiet"\]:not\(:disabled\)[\s\S]*opacity:\s*0\.58;/,
    'Actionraden ska kunna skilja mellan primära och tystare knappar inom samma steg utan ny komponentnivå.'
  );
  assertMatchFast(
    stylesSource,
    /\.booking-slot-recommendation\s*\{[\s\S]*border-radius:\s*999px;[\s\S]*color:\s*rgb\(var\(--booking-ios-blue\)\);/,
    'Rekommenderade tider ska få en liten badge i samma lugna iOS-färgskala som övriga bokningssignaler.'
  );
  assertMatchFast(
    stylesSource,
    /\.booking-slot-recommendation\[data-tone="selected"\][\s\S]*color:\s*#9f5f78;/,
    'Valda tider ska kunna få en egen mild badge-ton så operatören ser ordningen även efter urval.'
  );
  assertMatchFast(
    stylesSource,
    /\.booking-slot-spread-note\[data-tone="attention"\]\s+strong[\s\S]*#8b3b2e;/,
    'Spridningsvarningar ska kunna få en diskret varningsaccent utan att skapa en ny tung panel.'
  );
  assertMatchFast(
    appSource,
    /\[data-booking-status-target="\$\{escapeAttribute\(targetStatus\)\}"\]/,
    'Statusfokus ska hitta rätt bokningssteg via den redan existerande statusflödesmarkören.'
  );
  assertMatchFast(
    appSource,
    /normalizedAction === "booking_surface"[\s\S]*focusRecommendedBookingAction\(\);/,
    'Bokningslandningen ska markera rekommenderad knapp i bokningsytan i stället för att utföra åtgärden automatiskt.'
  );
  assertMatchFast(
    appSource,
    /seedBookingSurfaceForCurrentThread\(thread,\s*\{\s*moveActionFocus:\s*false,\s*announce:\s*false\s*\}\);/,
    'Journey-landningen ska återanvända samma seed-helper för bokningsytans delsteg och arbetsblock.'
  );
  assertMatchFast(
    appSource,
    /data-booking-stage-focus-zone="decision_context"[\s\S]*data-booking-stage-focus-zone="handoff_summary"[\s\S]*data-booking-stage-focus-zone="audit_preview"[\s\S]*data-booking-stage-focus-zone="action_row"/,
    'Bokningsytan ska exponera tydliga fokuszoner i markupen så olika delsteg kan landa i rätt arbetsblock.'
  );
  assertMatchFast(
    appSource,
    /if \(message\) \{[\s\S]*setFeedback\(bookingDom\.feedback,\s*"success",\s*message\);[\s\S]*const bookingThread = getBookingWorkThread\(\);[\s\S]*seedBookingSurfaceForCurrentThread\(bookingThread,\s*\{[\s\S]*moveActionFocus:\s*false,[\s\S]*announce:\s*false,[\s\S]*\}\);/,
    'Manuellt öppnad bokningsyta ska också landa i rätt delsteg och arbetsblock, inte bara journey-styrd öppning.'
  );
  assertMatchFast(
    appSource,
    /renderNoteDestination\(destinationKey\);[\s\S]*applyTemplateToActiveDraft\(templateKey\);/,
    'Smart anteckning ska kunna öppnas med både rätt sparplats och rätt mall när patientresan ger ett tydligt defaultläge.'
  );
  assertMatchFast(
    appSource,
    /syncJourneyDrivenWorkspaceLanding\(selectedFocusThread, focusReadState\);[\s\S]*renderRuntimeIntel\(selectedFocusThread, focusReadState\);/,
    'Fokusskalet ska synka första arbetsläge från patientresan innan högerpanelen avslutar rendern.'
  );
  assertMatchFast(
    actionEngineSource,
    /if \(action === "note"\) \{[\s\S]*openRuntimeNote\(\)\.then\(\(\) => true\);[\s\S]*\}/,
    'Snabbactionsmotorn ska faktiskt kunna öppna Smart anteckning när patientresan prioriterar note-läget.'
  );

  assertMatchFast(
    renderersSource,
    /focusWorkrail\.innerHTML = "";/,
    'Renderingen ska kunna tömma arbetsraden separat när ingen live-tråd är vald.'
  );
});

test('reply-studion visar Från-val separat från composefälten och behåller signaturkortet synligt i reply', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');

  assertMatchFast(
    indexSource,
    /data-studio-compose-role="from"/,
    'Från-fältet ska vara explicit markerat så reply-läget kan visa rätt avsändarval utan att blanda in övriga composefält.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-shell:not\(\[data-mode=["']compose["']\]\)\s+\.studio-compose-fields\s*\{[\s\S]*display:\s*grid;[\s\S]*\}/,
    'Reply-läget ska göra Från-väljaren synlig även utanför compose.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-shell:not\(\[data-mode=["']compose["']\]\)\s+\.studio-compose-field:not\(\[data-studio-compose-role=["']from["']\]\)\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Reply-läget ska hålla To/Ämne dolda när bara avsändarvalet behövs.'
  );

  assert.doesNotMatch(
    stylesSource,
    /\.studio-shell:not\(\[data-mode=["']compose["']\]\)\s+\.studio-signature-card\s*\{[\s\S]*display:\s*none;[\s\S]*\}/,
    'Reply-läget ska inte längre dölja signaturkortet när signaturen ska kunna väljas separat från Från-mailboxen.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-editor-top\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-areas:[\s\S]*["']recipient tools["'][\s\S]*["']fields tools["'];[\s\S]*\}/,
    'Studiotoppen ska använda en kontrollerad grid så befintlig bredd nyttjas bättre utan större ytor.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-shell:not\(\[data-mode=["']compose["']\]\)\s+\.studio-compose-fields\s*\{[\s\S]*width:\s*min\(252px,\s*100%\);[\s\S]*grid-template-columns:\s*minmax\(188px,\s*252px\);[\s\S]*\}/,
    'Reply-lägets Från-del ska få lite mer faktisk bredd så kontrollen blir tydligare utan att öppna mailboxpasset.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-control-row\s*\{[\s\S]*grid-template-columns:\s*68px\s+minmax\(0,\s*1fr\);[\s\S]*gap:\s*8px;[\s\S]*\}/,
    'Studiokontrollerna ska ge valytan mer användbar bredd så läsbarhet och kontroll förbättras lokalt i studion.'
  );
});

test('mailbox-dropdownen använder kontrollerad enradslayout med fullbreddsval', () => {
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assertMatchFast(
    stylesSource,
    /\.mailbox-menu-grid\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*\}/,
    'Mailbox-dropdownen ska rendera som en kontrollerad enkelkolumn i stället för wrapade chips.'
  );

  assertMatchFast(
    stylesSource,
    /\.mailbox-option\s*\{[\s\S]*width:\s*100%;[\s\S]*min-height:\s*44px;[\s\S]*\}/,
    'Varje mailboxrad ska ha full bredd och jämn höjd så att inget sticker utanför eller får olika storlek.'
  );

  assertMatchFast(
    stylesSource,
    /\.mailbox-option\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;[\s\S]*\}/,
    'Mailbox-dropdownen ska inte längre rita varje mailboxrad som en egen bubbla runt namnet.'
  );

  assertMatchFast(
    stylesSource,
    /\.mailbox-option-box svg\s*\{[\s\S]*width:\s*11px;[\s\S]*height:\s*11px;[\s\S]*\}/,
    'Checkmarken i mailbox-dropdownen ska vara större och tydligare.'
  );

  assertMatchFast(
    stylesSource,
    /\.mailbox-menu\s*\{[\s\S]*position:\s*fixed;[\s\S]*z-index:\s*1200;[\s\S]*\}/,
    'Mailbox-dropdownen ska renderas som ett riktigt overlay-lager ovanpå UI:t, inte som en vanlig absolut panel i innehållsflödet.'
  );

  assertMatchFast(
    appSource,
    /function syncMailboxDropdownOverlay\(/,
    'Appen ska ha en liten overlay-sync för mailbox-dropdownen så att panelen kan positioneras som ett flytande lager.'
  );
});

test('arbetsytans tre huvudkolumner använder samma stabila panehojd och vänsterscope har ikon-actions', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assertMatchFast(
    stylesSource,
    /\.preview-shell\s*\{[\s\S]*height:\s*var\(--workspace-pane-max-height\);[\s\S]*min-height:\s*var\(--workspace-pane-max-height\);[\s\S]*\}/,
    'Vänsterkolumnen ska låsa till en stabil panehojd så nederkanten inte flyttar sig med antalet synliga mejl.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-surface\s*\{[\s\S]*height:\s*var\(--workspace-pane-max-height\);[\s\S]*min-height:\s*var\(--workspace-pane-max-height\);[\s\S]*\}/,
    'Mittkolumnen ska använda samma stabila panehojd som övriga arbetsytor.'
  );

  assertMatchFast(
    stylesSource,
    /\.focus-intel\s*\{[\s\S]*height:\s*var\(--workspace-pane-max-height\);[\s\S]*min-height:\s*var\(--workspace-pane-max-height\);[\s\S]*\}/,
    'Högerkolumnen ska använda samma stabila panehojd som övriga arbetsytor.'
  );

  assertMatchFast(
    indexSource,
    /data-queue-actions/,
    'Vänsterarbetsytan ska ha en scope-rad för snabbåtgärder (Alla + ikonstripp).'
  );

  assertMatchFast(
    indexSource,
    /data-queue-action-strip/,
    'Scope-raden ska ha en tom stripp där check- och radera-ikoner renderas dynamiskt.'
  );

  assertMatchFast(
    appSource,
    /renderQueueLaneShortcutRows/,
    'Appen ska fylla scope-strippen med handled- och delete-åtgärder via renderQueueLaneShortcutRows.'
  );

  assertMatchFast(
    appSource,
    /handleRuntimeHandledAction/,
    'Snabbåtgärder ska fortfarande nå handled-logiken via action-motorn.'
  );

  assertMatchFast(
    appSource,
    /const runtimeMode = normalizeKey\(state\.runtime\.mode \|\| ""\);[\s\S]*runtimeMode === "offline_history"/,
    'Snabbactions-stripen ska döljas helt i offline_history så att inga extra check/radera-ikoner läcker ovanpå historikcopy.'
  );
});

test('booking engine-ytan visar reservera/bekräfta som förstaklassiga CCO-motorhandlingar', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');
  const stylesSource = fs.readFileSync(STYLES_PATH, 'utf8');
  const appSource = fs.readFileSync(APP_PATH, 'utf8');

  assertMatchFast(
    appSource,
    /data-booking-action="reserve_slots"[\s\S]*Reservera i CCO/,
    'Bokningsytan ska ha en explicit reservera-i-CCO-knapp, inte bara hoppa direkt från tider till bekräftelse.'
  );

  assertMatchFast(
    appSource,
    /label:\s*"Nästa: reservera i CCO"/,
    'Nästa drag ska kunna peka på reservering i CCO-motorn när tider finns men ännu inte hålls i systemet.'
  );

  assertMatchFast(
    appSource,
    /engine_slots_reserved:\s*"CCO motor"/,
    'Motorns egna reservationshändelser ska få en mänsklig etikett i bokningsloggen.'
  );

  assertMatchFast(
    appSource,
    /function getBookingEngineStateReadout\(readout = \{\}\)/,
    'Bokningsytan ska ha en samlad readout för motorstatus så reservation, bekräftelse och tomt läge visas konsekvent.'
  );

  assertMatchFast(
    appSource,
    /data-booking-slot-overview-engine/,
    'Lediga tider-ytan ska ha en liten egen motorreadout nära slotöversikten så reservation och bekräftelse syns där operatören tittar på tiderna.'
  );

  assertMatchFast(
    appSource,
    /data-booking-slot-overview-steps/,
    'Slotöversikten ska ha en liten sekvensrad för välj tider, reservera och bekräfta så motorns steg blir läsbara i samma yta.'
  );

  assertMatchFast(
    appSource,
    /booking-slot-engine-badge/,
    'En vald eller tillgänglig tid som redan hålls i CCO ska märkas upp direkt i slotlistan.'
  );

  assertMatchFast(
    appSource,
    /data-booking-sequence-action/,
    'Sekvensraden ska vara klickbar så operatören kan hoppa till rätt steg i samma bokningsyta.'
  );

  assertMatchFast(
    appSource,
    /function buildBookingEngineSequenceReason\(readout = \{\}, nextActionReadout = \{\}\)/,
    'Sekvensraden ska förklara varför just det rekommenderade bokningssteget leder i det aktuella caset.'
  );

  assertMatchFast(
    appSource,
    /data-booking-slot-overview-reason/,
    'Slotöversikten ska ha en liten varför-nu-rad under sekvensen så nästa steg inte bara markeras utan också motiveras.'
  );

  assertMatchFast(
    appSource,
    /engine_booking_rebooked[\s\S]*Ändrat: en tidigare bekräftad tid ersattes/,
    'Varför-nu-readouten ska kunna förklara ombokning som förändringsorsak när en tidigare tid har ersatts.'
  );

  assertMatchFast(
    appSource,
    /function getBookingEventSlotChange\(event = \{\}\)/,
    'Bokningsytan ska kunna läsa gammal och ny tid från ombokningshändelsen så förändringen blir konkret i UI:t.'
  );

  assertMatchFast(
    appSource,
    /function getBookingLatestRebookReadout\(readout = \{\}\)/,
    'Bokningsytan ska bygga en egen liten ombokningsreadout så samma förändring kan visas både i tiderna och i överlämningen.'
  );

  assertMatchFast(
    appSource,
    /booking-slot-rebook-badge/,
    'Valda tider ska kunna markeras som ersättande tid när ett ombokningsbyte precis har skett.'
  );

  assertMatchFast(
    appSource,
    /label: "Ombokning"/,
    'Överlämningssammanfattningen ska få ett eget ombokningskort när en tidigare bekräftad tid har ersatts.'
  );

  assertMatchFast(
    appSource,
    /function isBookingOfferStaleAfterRebook\(readout = \{\}\)/,
    'Bokningsytan ska kunna avgöra när en ombokning är nyare än senaste Svarstudio-förslag så operatören inte råkar jobba vidare på gamla tider.'
  );

  assertMatchFast(
    appSource,
    /Nästa: uppdatera Svarstudio[\s\S]*Ombokningen är nyare än senaste kundförslaget/,
    'Nästa-draget ska kunna falla tillbaka till uppdaterat kundsvar när ombokningen gjort tidigare Svarstudio-förslag inaktuellt.'
  );

  assertMatchFast(
    appSource,
    /Kundläge: uppdatera kundsvar[\s\S]*Kunden behöver få den nya tiden/,
    'Kundläget ska kunna signalera att kunden måste få en ny tid efter ombokning i stället för att bara fortsätta vänta-läge.'
  );

  assertMatchFast(
    appSource,
    /function buildBookingStudioRefreshLead\(readout = \{\}\)/,
    'Svarstudio ska kunna få en liten omboknings-prefill när senaste kundförslag blivit gammalt.'
  );

  assertMatchFast(
    appSource,
    /function buildBookingStudioContext\(readout = \{\}\)/,
    'Svarstudio ska få ett gemensamt bokningskontextobjekt så ombokning blir konsekvent i ämnesrad, sammanfattning och utkast.'
  );

  assertMatchFast(
    appSource,
    /function getBookingUpdateDefaultToneKey\(thread\)[\s\S]*customer_update[\s\S]*decision_support[\s\S]*follow_up_update[\s\S]*warm[\s\S]*solution_focus[\s\S]*function buildBookingUpdateStudioDraft\(thread,\s*\{\s*toneKey = ""\s*\}\s*=\s*\{\}\s*\)[\s\S]*getBookingUpdateDefaultToneKey\(thread\)/,
    'Svarstudio ska ha en egen utkastbyggare för uppdaterade bokningsförslag och kunna välja en mer lägesmedveten default-ton redan innan operatören ändrar något manuellt.'
  );

  assertMatchFast(
    appSource,
    /Den tidigare tiden \$\{previousLabel\} är inte längre aktuell\.[\s\S]*Jag har i stället uppdaterat ditt förslag till \$\{nextLabel\}\./,
    'Det uppdaterade bokningsutkastet ska kunna skriva ut exakt vilken tidigare tid som ersatts och vilken ny tid kunden nu får.'
  );

  assertMatchFast(
    appSource,
    /activeToneKey = isBookingUpdateMode[\s\S]*getStudioRecommendedToneKey\(studioState\)[\s\S]*"professional"/,
    'När ett bokningsförslag blivit gammalt efter ombokning ska Svarstudio automatiskt landa i rätt variantstyrt tonläge i stället för ett generiskt default-val.'
  );

  assertMatchFast(
    appSource,
    /activeRefineKey = isBookingUpdateMode[\s\S]*getStudioRecommendedRefineKey\(studioState\)[\s\S]*buildStudioRefinedDraft\([\s\S]*studioState\.draftBody[\s\S]*studioState\.activeRefineKey/,
    'När ett bokningsförslag blivit gammalt efter ombokning ska Svarstudio också kunna landa i rätt default-finetune och applicera den direkt i utkastet.'
  );

  assertMatchFast(
    appSource,
    /Uppdatering: den tidigare tiden[\s\S]*Ersätt med[\s\S]*svaret till kunden/,
    'Svarstudio-prefillen ska kunna säga att tidigare tid inte längre gäller och att den nya tiden måste ersätta den i kundsvaret.'
  );

  assertMatchFast(
    appSource,
    /mode: "booking_update"[\s\S]*subject:[\s\S]*"Uppdaterat bokningsförslag"[\s\S]*summaryLabel:[\s\S]*"Läge: Uppdaterat bokningsförslag"/,
    'Ett ombokat case ska fortfarande kunna markeras som uppdaterat bokningsförslag i Svarstudios interna kontext och ämnesrad.'
  );

  assertMatchFast(
    appSource,
    /variant === "follow_up_update"[\s\S]*summaryLabel:[\s\S]*"Läge: Följ upp uppdaterat kundförslag"/,
    'När ombokningen blivit ett väntande uppföljningscase ska Svarstudio kunna bära ett tydligare uppföljningsläge redan i sin sammanfattning.'
  );

  assertMatchFast(
    appSource,
    /variant === "customer_update"[\s\S]*summaryLabel:[\s\S]*"Läge: Ersätt tidigare kundförslag"/,
    'När kunden redan fått ett gammalt förslag ska Svarstudio kunna säga att det handlar om att ersätta ett tidigare kundförslag.'
  );

  assertMatchFast(
    appSource,
    /studioState\.bookingStudioVariant = asText\(studioBookingContext\.variant\)/,
    'Booking update-varianten ska sparas i studio-state så overlayn kan skilja mellan uppdatering, ersättning och uppföljning.'
  );

  assertMatchFast(
    appSource,
    /Ändrat: \$\{studioState\.bookingStudioChangedFrom\} -> \$\{studioState\.bookingStudioChangedTo\}/,
    'Svarstudiots sammanfattningsrad ska kunna visa exakt vilket tidsbyte som ligger bakom ett uppdaterat bokningsförslag.'
  );

  const overlaySource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'runtime-overlay-renderers.js'
    ),
    'utf8'
  );
  const domLiveCompositionSource = fs.readFileSync(DOM_LIVE_COMPOSITION_PATH, 'utf8');

  assertMatchFast(
    overlaySource,
    /bookingStudioMode === "booking_update"/,
    'Overlay-renderern ska känna igen uppdaterat bokningsförslag som eget studio-läge i editorhuvudet.'
  );

  assertMatchFast(
    overlaySource,
    /Läge: Uppdaterat bokningsförslag[\s\S]*Ändrat: \$\{bookingStudioDeltaLabel\}/,
    'Editorhuvudet ska bära både uppdateringsläge och konkret tidsbyte så operatören ser förändringen innan den börjar skriva.'
  );

  assertMatchFast(
    overlaySource,
    /getStudioBookingUpdateWorkModeLabel\(studioState\)[\s\S]*getStudioBookingUpdateWorkModeCopy\(studioState\)[\s\S]*replySummaryParts\.push\(getStudioBookingUpdateWorkModeLabel\(studioState\)\)/,
    'Overlay-renderern ska kunna bära ett gemensamt arbetsläge för uppdaterat bokningssvar genom inline-rad, skrivhjälp och editorsammanfattning.'
  );

  assertMatchFast(
    overlaySource,
    /Bokning uppdaterad/,
    'Policy-/statuspillen i Svarstudio ska kunna visa att utkastet är en bokningsuppdatering och inte ett första förslag.'
  );

  assertMatchFast(
    indexSource,
    /data-studio-editor-inline-update[\s\S]*data-studio-editor-inline-update-label[\s\S]*data-studio-editor-inline-update-copy/,
    'Editorn ska ha en liten inline-rad ovanför textytan där uppdaterad bokningskontext kan visas utan att skapa ett nytt panelager.'
  );

  assertMatchFast(
    indexSource,
    /data-studio-template-helper[\s\S]*data-studio-template-helper-label[\s\S]*data-studio-template-helper-copy/,
    'Snabbmallarna ska ha en liten hjälprad som kan visa att uppdaterat kundförslag är rekommenderat just nu.'
  );

  assertMatchFast(
    indexSource,
    /data-studio-guidance-helper[\s\S]*data-studio-guidance-helper-label[\s\S]*data-studio-guidance-helper-copy/,
    'Ton- och finjusteringsdelen ska ha en liten skrivlägesrad som kan guida operatören i uppdaterat bokningsläge.'
  );

  assertMatchFast(
    indexSource,
    /data-studio-cta-helper[\s\S]*data-studio-cta-helper-label[\s\S]*data-studio-cta-helper-copy/,
    'Editorn ska ha en liten avslutsrad som kan föreslå rätt kund-CTA beroende på om vi uppdaterar, ersätter eller följer upp ett bokningsförslag.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-editor-inline-update[\s\S]*background:[\s\S]*\.studio-editor-inline-update-copy/,
    'Den nya inline-raden ska få en lågmäld egen stil så ombokningssignalen känns inbyggd i editorn och inte som en separat varningspanel.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-template-helper[\s\S]*\.studio-template-helper-label[\s\S]*\.studio-template-helper-copy/,
    'Snabbmallarnas hjälprad ska få en lågmäld stil i samma mailklientspråk som resten av Svarstudio.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-guidance-helper[\s\S]*\.studio-guidance-helper-label[\s\S]*\.studio-guidance-helper-copy/,
    'Skrivlägesraden för ton och finjustering ska få en lågmäld, inbyggd stil i samma språk som resten av Svarstudio.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-cta-helper[\s\S]*\.studio-cta-helper-label[\s\S]*\.studio-cta-helper-copy/,
    'Den nya CTA-raden ska få en lågmäld, inbyggd stil så rekommenderat avslut känns som en del av editorn och inte som en ny panel.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-quick-pill\.is-promoted:not\(\.is-active\)[\s\S]*\.studio-tool-button\.is-promoted:not\(:disabled\)[\s\S]*\.studio-tool-button\.is-promoted-secondary:not\(:disabled\)[\s\S]*\.studio-tool-button\.is-promoted-secondary:not\(:disabled\)::before/,
    'Rekommenderad mall och de två främsta studioverktygen ska få en lågmäld visuell ordning utan att bryta Svarstudions mailklientspråk.'
  );

  assertMatchFast(
    overlaySource,
    /studioEditorInlineUpdate\.hidden = !shouldShowBookingUpdateInline[\s\S]*bookingStudioDeltaLabel[\s\S]*bookingStudioReason/,
    'Overlay-renderern ska bara visa inline-raden när ett bokningssvar faktiskt är uppdaterat och fylla den med både tidsbyte och varförtext.'
  );

  assertMatchFast(
    overlaySource,
    /bookingTemplateButton\.textContent = hasBookingUpdateStudioContext[\s\S]*"Följ upp kundförslag"[\s\S]*"Ersätt kundförslag"[\s\S]*"Bekräfta uppdaterad tid"[\s\S]*"Uppdatera kundförslag"[\s\S]*"Bekräfta bokning"[\s\S]*bookingTemplateButton\.title = hasBookingUpdateStudioContext[\s\S]*kort svarssteg[\s\S]*enda svarspunkt[\s\S]*kompakt kundsvar/i,
    'När bokningen har bokats om ska själva snabbmallen också kunna följa reply-shape, så knappnamn och tooltip matchar hur kompakt completion-svaret är.'
  );

  assertMatchFast(
    appSource,
    /if \(variant === "follow_up_update"\) return "Följ upp kundförslag";[\s\S]*if \(variant === "customer_update"\) return "Ersätt kundförslag";/,
    'Snabbmallen för confirm_booking ska kunna få olika namn beroende på om vi följer upp eller ersätter ett tidigare kundförslag.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedTemplateKey\(studioState\)[\s\S]*return "confirm_booking";/,
    'Svarstudio ska kunna peka ut att bokningsmallen är det rekommenderade startläget när ett uppdaterat kundförslag öppnas.'
  );

  assertMatchFast(
    appSource,
    /function getStudioUsedToolKeys\(studioState\)[\s\S]*usedToolKeys[\s\S]*normalizeKey[\s\S]*filter\(Boolean\)/,
    'Svarstudio ska kunna läsa en normaliserad följd av använda verktyg från ett ställe, så sekvenslogik och avslutsläge inte driver isär mellan olika hjälpfunktioner.'
  );

  assertMatchFast(
    appSource,
    /function hasStudioBookingClosingSequence\(studioState\)[\s\S]*getStudioUsedToolKeys\(studioState\)[\s\S]*regenerate[\s\S]*policy[\s\S]*note/,
    'Svarstudio ska kunna avgöra när ett uppdaterat bokningssvar faktiskt nått ett trovärdigt avslutsläge efter omskrivning och kontroll.'
  );

  assertMatchFast(
    appSource,
    /function getStudioBookingCompletionLabel\(studioState\)[\s\S]*replyShape[\s\S]*Redo att skicka · kort uppföljning[\s\S]*Redo att skicka · kort ersättning[\s\S]*Redo att skicka · kompakt bekräftelse[\s\S]*Redo att skicka · bekräfta ny tid/,
    'Svarstudio ska kunna låta redo-att-skicka-labeln följa reply-shape, så completion-läget känns lika kort eller tydligt som själva svaret.'
  );

  assertMatchFast(
    appSource,
    /function getStudioBookingCompletionCopy\(studioState\)[\s\S]*replyShape[\s\S]*kort beslutssvar[\s\S]*kort ersättningssvar[\s\S]*kompakt bekräftelsesvar/i,
    'Svarstudio ska kunna låta completion-hjälptexten följa samma reply-shape-sanning som själva draften, så UI och text känns lika kompakta.'
  );

  assertMatchFast(
    appSource,
    /function buildStudioBookingCompletionDraftClosing\(thread,\s*studioState\)/,
    'Svarstudio ska kunna bygga olika avslutsstycken i själva utkastet, inklusive ett kortare customer-update-avslut när completion-läget redan är riktigt starkt.'
  );
  assertMatchFast(
    appSource,
    /Bekräfta gärna i samma svar om \$\{nextLabel\} passar, så ersätter jag det tidigare förslaget och låser den nya tiden direkt\. Om den nya tiden inte fungerar hjälper jag dig gärna vidare med ett nytt alternativ i samma tråd\./,
    'Customer-update ska kunna komprimera det starkaste completion-avslutet till ett enda beslutsnära stycke.'
  );
  assertMatchFast(
    appSource,
    /Återkom gärna så snart du kan i samma tråd om \$\{nextLabel\} fungerar, så låser jag ändringen direkt och håller allt samlat här\. Det räcker med ett kort ja i samma tråd, så tar jag resten härifrån utan fler omvägar\./,
    'Follow-up completion ska kunna landa i ett kompakt tvåstyckssvar när det starkaste slutläget redan är uppnått.'
  );
  assertMatchFast(
    appSource,
    /Bekräfta gärna i samma svar om \$\{nextLabel\} passar, så låser jag den nya tiden direkt\. Det räcker med ett enkelt ja i samma tråd, så tar jag resten direkt härifrån\./,
    'Fresh-update completion ska kunna komprimera slutsteget till ett enda kort beslutssvar.'
  );

  assertMatchFast(
    appSource,
    /function buildStudioBookingCompletionDraftBridge\(thread,\s*studioState\)/,
    'Svarstudio ska fortsatt ha en dedikerad bridge-helper för booking-completion.'
  );
  assertMatchFast(
    appSource,
    /hasPolicyChecked[\s\S]*hasNoteOpen[\s\S]*hasGiftAdded/,
    'Bridge-logiken ska väga in policy, note-läge och gåva innan completion-copy väljs.'
  );
  assertMatchFast(
    appSource,
    /follow_up_update[\s\S]*Det är nu bara .* som gäller här[\s\S]*Jag har därför samlat ändringen tydligt här/i,
    'Follow-up completion ska kunna ge en mer beslutsnära bridge-rad.'
  );
  assertMatchFast(
    appSource,
    /customer_update[\s\S]*Det tidigare förslaget med .* gäller alltså inte längre[\s\S]*Det betyder att du nu bara behöver ta ställning/i,
    'Customer-update completion ska kunna tala som en tydlig ersättning av tidigare förslag.'
  );
  assertMatchFast(
    appSource,
    /fresh_update[\s\S]*Det är nu bara .* du behöver ta ställning till/i,
    'Fresh-update completion ska kunna ge en kort ren beslutsrad.'
  );

  assertMatchFast(
    appSource,
    /function getStudioBookingCompletionPrunePatterns\(studioState\)/,
    'Svarstudio ska fortsatt ha en dedikerad prune-helper för booking-completion.'
  );
  assertMatchFast(
    appSource,
    /follow_up_update[\s\S]*Eftersom det här kommer efter ett tidigare kundförslag[\s\S]*Jag vill hellre reda ut ändringen nu/i,
    'Follow-up completion ska kunna känna igen vilka mellanparagrafer som kan klippas bort.'
  );
  assertMatchFast(
    appSource,
    /customer_update[\s\S]*På så sätt behöver du bara ta ställning till den nya tiden[\s\S]*Det viktiga nu är bara om .* passar för dig/i,
    'Customer-update completion ska kunna pruna överflödig historikcopy.'
  );
  assertMatchFast(
    appSource,
    /fresh_update[\s\S]*Det gör att vi kan hålla processen enkel:[\s\S]*Det här är alltså bara en enkel uppdatering/i,
    'Fresh-update completion ska kunna pruna ned svaret till ett enkelt uppdateringsläge.'
  );

  assertMatchFast(
    appSource,
    /function buildStudioBookingCompletionDraftOpening\(thread,\s*studioState\)[\s\S]*follow_up_update[\s\S]*Jag följer därför upp kort här[\s\S]*customer_update[\s\S]*Jag uppdaterar därför beskedet kort här[\s\S]*fresh_update[\s\S]*Kort uppdatering:/i,
    'Svarstudio ska kunna ersätta den tyngre öppningen med en kortare, mer beslutsnära öppningsparagraf när booking_update redan nått ett trovärdigt avslutsläge.'
  );

  assertMatchFast(
    appSource,
    /function getStudioBookingCompletionLeadPrunePatterns\(studioState\)/,
    'Svarstudio ska fortsatt ha en dedikerad prune-funktion för booking-completion-leads.'
  );

  assertMatchFast(
    appSource,
    /variant === "follow_up_update"[\s\S]*Jag följer upp eftersom/i,
    'Follow-up-varianten ska kunna rensa den äldre leaden när completion-öppningen tar över.'
  );

  assertMatchFast(
    appSource,
    /variant === "customer_update"[\s\S]*Sedan mitt tidigare förslag har/i,
    'Customer-update-varianten ska kunna rensa leadcopy från tidigare kundlöfte när completion-öppningen tar över.'
  );

  assertMatchFast(
    appSource,
    /variant === "fresh_update"[\s\S]*\^Den tidigare tiden \.\* är inte längre aktuell\\\./i,
    'Fresh-update-varianten ska kunna släppa leadraden som markerar att den tidigare tiden inte längre gäller.'
  );

  assertMatchFast(
    appSource,
    /variant === "fresh_update"[\s\S]*Jag har uppdaterat ditt bokningsförslag/i,
    'Fresh-update-varianten ska också kunna släppa den äldre uppdateringsleaden när completion-öppningen tar över.'
  );

  assertMatchFast(
    appSource,
    /function buildStudioBookingCompletionIntro\(thread,\s*studioState,\s*introParagraph = ""\)[\s\S]*replyShape[\s\S]*Kort uppföljning här[\s\S]*Kort uppdatering här[\s\S]*det är nu bara den uppdaterade tiden du behöver ta ställning till/i,
    'Svarstudio ska kunna låta intro-/hälsningsparagrafen följa reply-shape, så även toppen av completion-svaret känns rätt lång eller kort för läget.'
  );

  assertMatchFast(
    appSource,
    /function getStudioBookingCompletionCompactionPrunePatterns\(studioState\)[\s\S]*follow_up_update[\s\S]*Jag vill därför fånga upp ändringen tydligt här[\s\S]*customer_update[\s\S]*Jag uppdaterar dig därför direkt i samma tråd[\s\S]*fresh_update[\s\S]*Jag skickar därför den uppdaterade tiden direkt här i samma tråd/i,
    'Svarstudio ska kunna veta när en extra ownership-paragraf kan falla bort helt i completion-läget, så färdiga booking_update-svar blir faktiskt kortare.'
  );

  assertMatchFast(
    appSource,
    /function shouldStudioBookingCompletionUseShortReply\(studioState\)[\s\S]*getStudioBookingCompletionReplyShape\(studioState\) !== "standard_completion"/i,
    'Svarstudio ska kunna låta short-reply-läget följa en gemensam reply-shape-sanning i stället för lös speciallogik.'
  );
  assertMatchFast(
    appSource,
    /function shouldStudioBookingCompletionDropBridge\(studioState\)[\s\S]*getStudioBookingCompletionReplyShape\(studioState\) === "two_paragraph_reply"/i,
    'Svarstudio ska bara droppa bridge helt i de reply-shapes som verkligen ska landa som tvåstyckessvar.'
  );
  assertMatchFast(
    appSource,
    /function getStudioBookingCompletionReplyShape\(studioState\)[\s\S]*follow_up_update[\s\S]*two_paragraph_reply[\s\S]*customer_update[\s\S]*two_paragraph_reply[\s\S]*fresh_update[\s\S]*compact_three_paragraph_reply/i,
    'Completion-kedjan ska kunna skilja mellan verkliga tvåstyckessvar och lite längre, men fortfarande kompakta, completion-svar.'
  );

  assertMatchFast(
    appSource,
    /function buildBookingUpdateStudioStructure\([\s\S]*sectionContent = \{[\s\S]*customerOwnership[\s\S]*followUpOwnership[\s\S]*freshOwnership[\s\S]*sectionOrder =[\s\S]*customer_update[\s\S]*lead", "bridge", "customerAction", "customerOwnership", "customerContext", "customerCadence[\s\S]*follow_up_update[\s\S]*lead", "followUpOwnership", "followUpAction", "followUpContext", "followUpCadence", "followUpSupport[\s\S]*lead", "freshAction", "freshOwnership", "freshContext", "freshCadence[\s\S]*sectionParagraphs =[\s\S]*customer_update[\s\S]*lead", "bridge[\s\S]*customerOwnership", "customerContext[\s\S]*follow_up_update[\s\S]*lead", "followUpOwnership[\s\S]*followUpContext", "followUpCadence[\s\S]*lead[\s\S]*freshAction", "freshOwnership[\s\S]*freshContext", "freshCadence[\s\S]*sectionParagraphs\.forEach\(\(sectionKeys\) => \{[\s\S]*sectionContent\[sectionKey\][\s\S]*body: paragraphs\.join\("\\n\\n"\)/i,
    'Svarstudio ska kunna ge olika grundmallstruktur i uppdaterat bokningssvar, så ersättning, uppföljning och enkel ny uppdatering faktiskt byggs med olika paragrafgrupper och inte bara olika radordning.'
  );

  assertMatchFast(
    appSource,
    /function applyStudioBookingCompletionDraft\(thread,\s*studioState,\s*draft = ""\)/,
    'Svarstudio ska kunna gå hela vägen till kort svar-läge i de starkaste completion-fallen, där både opening och bridge kan släppas så bara intro, komprimerad kärna och avslut återstår.'
  );
  assertMatchFast(
    appSource,
    /const shouldDropBridge = shouldStudioBookingCompletionDropBridge\(studioState\);/,
    'Completion-appliern ska explicit veta när bridge-paragrafen ska tas bort helt.'
  );
  assertMatchFast(
    appSource,
    /\.\.\.\(shouldDropBridge \? \[\] : bridgeParagraphs\),/,
    'Completion-appliern ska kunna rendera kortsvaret utan bridge-paragraf i de starkaste lägena.'
  );

  assertMatchFast(
    appSource,
    /function applyStudioBookingUpdateToolPhaseDraft\(\s*thread,\s*studioState,\s*draft = "",\s*toolKey = ""\s*\)[\s\S]*phasePattern[\s\S]*normalizedTool === "policy"[\s\S]*follow_up_update[\s\S]*snabbt besked på den nya tiden[\s\S]*customer_update[\s\S]*tidigare förslaget släppas[\s\S]*normalizedTool === "gift"[\s\S]*follow_up_update[\s\S]*landa ändringen varmt men tydligt[\s\S]*customer_update[\s\S]*ersätter vi nu bara det tidigare förslaget[\s\S]*normalizedTool === "note"[\s\S]*fånga upp ändringen internt[\s\S]*dokumenterar vi nu bytet internt[\s\S]*normalizedTool === "regenerate"[\s\S]*samlat uppföljt förslag[\s\S]*redan från första raden/i,
    'Svarstudio ska kunna skriva om ett mellan-/slutstycke i utkastet beroende på vilket verktyg som just användes och hur långt operatören kommit i booking_update-sekvensen.'
  );

  assertMatchFast(
    appSource,
    /normalizedTool === "regenerate"[\s\S]*markStudioToolUsed\(studioState,\s*normalizedTool\)[\s\S]*applyStudioBookingUpdateToolPhaseDraft\(\s*thread,\s*studioState,\s*studioState\.draftBody,\s*normalizedTool\s*\)[\s\S]*renderStudioShell\(/,
    'När operatören regenererar ett uppdaterat bokningssvar efter tidigare arbetssteg ska booking_update-läget kunna centrera om draftens mellanstycke innan editorn renderas igen.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedToolOrder\(studioState\)[\s\S]*hasRegenerated[\s\S]*hasPolicyChecked[\s\S]*hasNoteOpen[\s\S]*hasGiftAdded[\s\S]*follow_up_update[\s\S]*hasRegenerated && hasNoteOpen && !hasGiftAdded[\s\S]*gift", "policy", "note", "regenerate[\s\S]*hasRegenerated && hasGiftAdded && !hasPolicyChecked[\s\S]*policy", "gift", "note", "regenerate[\s\S]*customer_update[\s\S]*hasRegenerated && hasNoteOpen && !hasPolicyChecked[\s\S]*policy", "note", "gift", "regenerate[\s\S]*hasRegenerated && hasPolicyChecked && !hasGiftAdded[\s\S]*gift", "policy", "note", "regenerate[\s\S]*hasRegenerated && hasPolicyChecked && !hasNoteOpen[\s\S]*note", "gift", "policy", "regenerate/i,
    'Svarstudio ska kunna bära en mer sekventiell variantstyrd verktygsordning efter första och andra draget, inte bara flytta fram första oanvända verktyget.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedToolReason\(studioState,\s*toolKey = ""\)[\s\S]*hasRegenerated && hasPolicyChecked[\s\S]*fånga vad kunden ska svara på kring den nya tiden[\s\S]*hasRegenerated && hasGiftAdded[\s\S]*gör sista trygghetskontrollen innan du ber om snabbt besked[\s\S]*hasRegenerated && hasNoteOpen[\s\S]*gör sista trygghetskontrollen innan du skickar den nya tiden[\s\S]*hasRegenerated && hasPolicyChecked[\s\S]*lägg till en sista lugn rad/i,
    'Svarstudio ska kunna ge olika nästa-steg-skäl beroende på hur långt operatören redan har kommit i respektive booking_update-variant.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedToolKey\(studioState\)[\s\S]*getStudioRecommendedToolOrder\(studioState\)\[0\] \|\| "";/,
    'Svarstudio ska kunna peka ut att regenerera-verktyget är det rekommenderade första skrivverktyget i uppdaterat bokningsläge.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedToolReason\(studioState,\s*toolKey = ""\)[\s\S]*usedToolKeys[\s\S]*hasRegenerated[\s\S]*hasPolicyChecked[\s\S]*hasNoteOpen[\s\S]*normalizedToolKey === "note"[\s\S]*Nu när utkastet är omskrivet[\s\S]*normalizedToolKey === "policy"[\s\S]*Nu när huvudutkastet är klart[\s\S]*normalizedToolKey === "gift"[\s\S]*Avsluta med en extra trygghetsrad[\s\S]*huvudförslag direkt/i,
    'Det rekommenderade studioverktyget ska kunna bära olika skäl beroende på både läge, verktyg och om flera tidigare steg redan är gjorda.'
  );

  assertMatchFast(
    appSource,
    /normalizedTool === "gift"[\s\S]*markStudioToolUsed\(studioState,\s*normalizedTool\)[\s\S]*applyStudioBookingUpdateToolPhaseDraft\(\s*thread,\s*studioState,\s*studioState\.draftBody,\s*normalizedTool\s*\)[\s\S]*applyStudioBookingCompletionDraft\(/,
    'När operatören lägger till trygghetsraden ska booking_update-läget kunna skriva om draftens mellan-/slutstycke innan det vanliga completion-slutet appliceras.'
  );

  assertMatchFast(
    appSource,
    /normalizedTool === "policy"[\s\S]*markStudioToolUsed\(studioState,\s*normalizedTool\)[\s\S]*applyStudioBookingUpdateToolPhaseDraft\(\s*thread,\s*studioState,\s*studioState\.draftBody,\s*normalizedTool\s*\)[\s\S]*applyStudioBookingCompletionDraft\(/,
    'När policykontrollen går grönt ska booking_update-läget kunna skriva om draftens nästa-steg-stycke utifrån aktuell sekvens innan avslutet sätts.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedToolLeadLabel\(studioState,\s*rank = -1\)[\s\S]*usedToolKeys[\s\S]*Avsluta med detta\.[\s\S]*Fortsätt här nu\.[\s\S]*Sedan detta vid behov\.[\s\S]*Sedan detta\./,
    'Svarstudio ska kunna byta från start-copy till fortsättnings- och avslutscopy när operatören redan gjort flera verktygsdrag.'
  );

  assertMatchFast(
    appSource,
    /function markStudioToolUsed\(studioState,\s*toolKey = ""\)[\s\S]*studioState\.lastToolKey = normalizedToolKey;[\s\S]*studioState\.usedToolKeys = \[\.\.\.usedToolKeys,\s*normalizedToolKey\]\.slice\(-4\);/,
    'Svarstudio ska spara en liten följd av använda verktyg så rekommendationen kan gå vidare från start till fortsättning och avslut.'
  );

  assertMatchFast(
    overlaySource,
    /const bookingReplyShape = hasBookingUpdateStudioContext[\s\S]*getStudioBookingCompletionReplyShape\(studioState\)[\s\S]*Rekommenderat nu · kort uppföljning[\s\S]*Rekommenderat nu · kort ersättning[\s\S]*Rekommenderat nu · kompakt bekräftelse[\s\S]*enda svarspunkt[\s\S]*Håll bekräftelsen kompakt/i,
    'Snabbmallarnas hjälprad ska kunna följa reply-shape, så även mallrekommendationen skiljer mellan kort uppföljning, kort ersättning och kompakt bekräftelse.'
  );

  assertMatchFast(
    overlaySource,
    /getStudioRecommendedTemplateKey\(studioState\)[\s\S]*templateRow\.appendChild\(button\)[\s\S]*button\.classList\.toggle\("is-promoted", isPromoted\)/,
    'Overlay-renderern ska kunna flytta fram den rekommenderade snabbmallen och markera den som startläge i uppdaterat bokningsläge.'
  );

  assertMatchFast(
    overlaySource,
    /getStudioRecommendedToolOrder\(studioState\)[\s\S]*studioInlineToolButtons[\s\S]*editorToolsRow\.appendChild\(button\)[\s\S]*button\.classList\.toggle\("is-promoted", isPromotedPrimary\)[\s\S]*button\.classList\.toggle\("is-promoted-secondary", isPromotedSecondary\)[\s\S]*getStudioRecommendedToolLeadLabel\(studioState,\s*rank\)[\s\S]*button\.dataset\.promotedTitle/,
    'Overlay-renderern ska kunna ordna hela studioverktygsraden efter läge och ge första och andra verktyget rätt fortsättningscopy efter första skrivdraget.'
  );

  assertMatchFast(
    domLiveCompositionSource,
    /noteOpenButtons\.forEach\(\(button\) => \{[\s\S]*getSelectedRuntimeThread[\s\S]*ensureStudioState\(selectedThread\)[\s\S]*markStudioToolUsed\(studioState,\s*"note"\)[\s\S]*applyStudioBookingUpdateToolPhaseDraft\(\s*selectedThread,\s*studioState,\s*studioState\.draftBody,\s*"note"\s*\)[\s\S]*openRuntimeNote\(\)/,
    'När operatören öppnar Anteckning ska Svarstudio både markera verktyget som använt och kunna skriva om draftens fasrad så nästa steg i uppdateringssvaret blir tydligare.'
  );

  assertMatchFast(
    overlaySource,
    /studioCtaHelper\.hidden = !hasBookingUpdateStudioContext[\s\S]*getStudioRecommendedBookingCtaLabel\(studioState\)[\s\S]*getStudioRecommendedBookingCtaCopy\(studioState\)/,
    'Overlay-renderern ska kunna visa en egen CTA-rad i uppdaterat bokningsläge och fylla den från variantstyrd helper-logik.'
  );

  assertMatchFast(
    overlaySource,
    /const completionSummaryLabel = hasStudioBookingClosingSequence\(studioState\)/,
    'Editorn ska kunna räkna fram en completion-specifik summarylabel.'
  );
  assertMatchFast(
    overlaySource,
    /getStudioBookingCompletionLabel\(studioState\)\.replace\(\s*\/\^Redo att skicka ·\\s\*\/i,\s*"Läge: "\s*\)/,
    'Completion-summaryn ska kunna översätta Redo att skicka till en Läge-signal.'
  );
  assertMatchFast(
    overlaySource,
    /replySummaryParts\.unshift\([\s\S]*completionSummaryLabel[\s\S]*bookingStudioSummaryLabel/,
    'Completion-summaryn ska kunna lyftas först i den kompakta summaryraden.'
  );
  assertMatchFast(
    overlaySource,
    /replySummaryParts\.push\([\s\S]*getStudioRecommendedBookingCtaLabel\(studioState\)\.replace\(\s*\/\^Avsluta nu ·\\s\*\/i,\s*"Avslut: "\s*\)/,
    'Summaryraden ska fortfarande kunna bära ett rekommenderat avslut sist i samma rad.'
  );

  assertMatchFast(
    overlaySource,
    /regenerateButton\.title = hasBookingUpdateStudioContext[\s\S]*regenerera med rätt avslut för detta läge\./,
    'Regenerate-verktyget ska kunna bära variantmedveten tooltip så det blir tydligt att nytt utkast också får rätt avslut för läget.'
  );

  assertMatchFast(
    overlaySource,
    /studioGuidanceHelper\.hidden = !hasBookingUpdateStudioContext[\s\S]*studioGuidanceHelperLabel\.textContent = hasBookingUpdateStudioContext[\s\S]*getStudioBookingUpdateWorkModeLabel\(studioState\)[\s\S]*studioGuidanceHelperCopy\.textContent = hasBookingUpdateStudioContext[\s\S]*getStudioBookingUpdateWorkModeCopy\(studioState\)/,
    'Ton- och finjusteringsdelen ska kunna ge en gemensam arbetslägeshjälp som följer aktuell booking_update-variant i stället för en hårdkodad generisk text.'
  );

  assertMatchFast(
    overlaySource,
    /const bookingReplyShape = hasBookingUpdateStudioContext[\s\S]*getStudioBookingCompletionReplyShape\(studioState\)[\s\S]*Kort uppföljning nu:[\s\S]*uppdaterade tiden i samma tråd[\s\S]*Kort ersättning nu:[\s\S]*enda svarspunkten i samma tråd[\s\S]*Kompakt bekräftelse nu:[\s\S]*uppdaterade tiden i samma tråd[\s\S]*Kort uppföljning i fokus\.[\s\S]*Kunden behöver bara svara på den uppdaterade tiden[\s\S]*Kort ersättning i fokus\.[\s\S]*enda svarspunkten[\s\S]*Kompakt bekräftelse i fokus\.[\s\S]*Landa direkt i den uppdaterade tiden\./,
    'Toppen av editorn ska kunna låta next-action och why-in-focus följa reply-shape även i tunnare fallback-fall, så booking_update-kontexten förblir kompakt utan delta-label.'
  );

  assertMatchFast(
    overlaySource,
    /studioNextActionTitle\.textContent = isComposeMode[\s\S]*bookingStudioVariant === "follow_up_update"[\s\S]*Kort uppföljning till kund[\s\S]*bookingStudioVariant === "customer_update"[\s\S]*Kort ersättning till kund[\s\S]*bookingReplyShape === "compact_three_paragraph_reply"[\s\S]*Kompakt bekräftelse till kund[\s\S]*"Uppdatera kundförslag"[\s\S]*"Skriv nytt mejl"/,
    'Compose-rubriken ska kunna följa reply-shape, så operatören inte möts av ett generiskt “Skriv nytt mejl” när completion-läget redan är kort uppföljning, kort ersättning eller kompakt bekräftelse.'
  );

  assertMatchFast(
    overlaySource,
    /studioPrimarySuggestionLabel\.textContent = isComposeMode[\s\S]*bookingStudioVariant === "follow_up_update"[\s\S]*Följ upp kort[\s\S]*bookingStudioVariant === "customer_update"[\s\S]*Ersätt kort[\s\S]*bookingReplyShape === "compact_three_paragraph_reply"[\s\S]*Bekräfta kort[\s\S]*Skriv till \$\{composeRecipient\}[\s\S]*Fyll i mottagare/,
    'Primärförslagsraden ska kunna följa reply-shape, så compose-läget inte faller tillbaka till generisk skrivcopy när booking_update redan är nere i kort uppföljning, kort ersättning eller kompakt bekräftelse.'
  );

  assertMatchFast(
    overlaySource,
    /studioIncomingLabel\.textContent = isComposeMode[\s\S]*bookingStudioVariant === "follow_up_update"[\s\S]*Kort uppföljning:[\s\S]*bookingStudioVariant === "customer_update"[\s\S]*Kort ersättning:[\s\S]*bookingReplyShape === "compact_three_paragraph_reply"[\s\S]*Kompakt bekräftelse:[\s\S]*Skrivkontext:/,
    'Compose-kontextetiketten ska kunna följa reply-shape, så även raden ovanför själva compose-innehållet håller samma korta arbetsläge i booking_update.'
  );

  assertMatchFast(
    overlaySource,
    /studioEditorInlineUpdateCopy\.textContent = shouldShowBookingUpdateInline[\s\S]*Kort uppföljning: kunden behöver bara svara på den nya tiden i samma tråd[\s\S]*Kort ersättning: gör den nya tiden till enda svarspunkt i tråden[\s\S]*Kompakt bekräftelse: landa direkt i den nya tiden\./,
    'Inline-raden ovanför editorn ska också kunna följa reply-shape, så compose-lägets översta hjälprad inte faller tillbaka till generisk booking-reason när completion-svaret redan är kompakt.'
  );
  assertMatchFast(
    overlaySource,
    /studioEditorInlineUpdateLabel\.textContent = shouldShowBookingUpdateInline[\s\S]*bookingReplyShape === "two_paragraph_reply"[\s\S]*Läge: kort uppföljning[\s\S]*Läge: kort ersättning[\s\S]*bookingReplyShape === "compact_three_paragraph_reply"[\s\S]*Läge: kompakt bekräftelse/,
    'Inline-radens label ska också kunna följa reply-shape i fallback-lägen, så översta compose-raden inte halkar tillbaka till generisk summary-label.'
  );

  assertMatchFast(
    overlaySource,
    /compactRuntimeCopy\([\s\S]*bookingReplyShape === "two_paragraph_reply"[\s\S]*Kort uppdatering: den nya tiden är nu den enda kunden behöver svara på\.[\s\S]*bookingReplyShape === "compact_three_paragraph_reply"[\s\S]*Kompakt bekräftelse: landa direkt i den nya tiden\.[\s\S]*Håll svaret kort och gör den nya tiden till enda svarspunkt i tråden\.[\s\S]*Be om ett kort svar på den nya tiden i samma tråd\.[\s\S]*Be om ett kort ja på den nya tiden i samma tråd\./,
    'Reply-shape QA ska täcka fallback-copy också, så inline-, template- och CTA-hjälpare inte glider tillbaka till generisk booking-text när renderingen blir tunnare.'
  );

  assertMatchFast(
    overlaySource,
    /studioToneButtons\.forEach\(\(button\) => \{[\s\S]*button\.classList\.toggle\("is-recommended", isRecommended\)/,
    'Tonknapparna ska kunna markera vilken ton som är rekommenderad i aktuellt uppdateringsläge.'
  );

  assertMatchFast(
    overlaySource,
    /studioRefineButtons\.forEach\(\(button\) => \{[\s\S]*button\.classList\.toggle\("is-recommended", isRecommended\)/,
    'Finjusteringsknapparna ska kunna markera vilken finjustering som är rekommenderad i aktuellt uppdateringsläge.'
  );

  assertMatchFast(
    stylesSource,
    /\.studio-choice-row-tone \.studio-choice\.is-recommended:not\(\.is-active\),[\s\S]*\.studio-choice-row-finetune \.studio-choice\.is-recommended:not\(\.is-active\)/,
    'Rekommenderade ton- och finjusteringsknappar ska få en subtil egen markering utan att bli lika starka som aktiva val.'
  );

  assertMatchFast(
    appSource,
    /function getStudioResolvedTemplateLabel\(studioState, templateKey = ""\)/,
    'Svarstudio ska kunna visa ett situationsstyrt mallnamn när samma template key betyder uppdatera kundförslag i stället för vanlig bokningsbekräftelse.'
  );

  assertMatchFast(
    appSource,
    /function getStudioBookingUpdateWorkModeLabel\(studioState\)[\s\S]*replyShape[\s\S]*Arbetsläge · kort uppföljning[\s\S]*Arbetsläge · kort ersättning[\s\S]*Arbetsläge · kompakt bekräftelse[\s\S]*Arbetsläge · skicka uppdaterad tid/i,
    'Svarstudio ska kunna låta arbetslägesnamnet följa reply-shape, så bokningsläget känns lika kompakt eller tydligt som själva completion-svaret.'
  );

  assertMatchFast(
    appSource,
    /function getStudioBookingUpdateWorkModeCopy\(studioState\)[\s\S]*replyShape[\s\S]*snabbt svar på den nya tiden utan extra omvägar[\s\S]*enda svarspunkt i tråden[\s\S]*kompakt bekräftelse på den nya tiden[\s\S]*ja-nej-steg/i,
    'Svarstudio ska kunna låta arbetslägescopyt följa reply-shape, så hjälpraden över editorn matchar hur kompakt completion-svaret faktiskt är.'
  );

  assertMatchFast(
    overlaySource,
    /studioGuidanceHelperCopy\.textContent = hasBookingUpdateStudioContext[\s\S]*bookingReplyShape === "two_paragraph_reply"[\s\S]*Håll svaret kort och låt den nya tiden bli enda svarspunkt i tråden\.[\s\S]*bookingReplyShape === "compact_three_paragraph_reply"[\s\S]*Håll svaret kompakt och landa direkt i den nya tiden\./,
    'Guidance-hjälpens fallback-copy ska också kunna följa reply-shape, så hjälpraden inte faller tillbaka till generisk booking-update-ton i tunnare completion-lägen.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedToneKey\(studioState\)[\s\S]*if \(variant === "customer_update"\) return "decision_support";[\s\S]*if \(variant === "follow_up_update"\) return "warm";[\s\S]*return "solution_focus";/,
    'Svarstudio ska kunna föreslå olika tonlägen beroende på om vi ersätter ett tidigare kundförslag, följer upp en väntande ombokning eller bara skickar en enkel uppdatering.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedRefineKey\(studioState\)[\s\S]*if \(variant === "follow_up_update"\) return "sharper";[\s\S]*if \(variant === "customer_update"\) return "shorter";/,
    'Svarstudio ska kunna föreslå olika finjusteringar beroende på om ombokningen främst behöver uppföljning eller ett tydligare ersättningsbudskap.'
  );

  assertMatchFast(
    appSource,
    /function applyStudioTemplateSelection\(templateKey\)[\s\S]*activeRefineKey = isStudioBookingUpdateMode\(studioState\)[\s\S]*getStudioRecommendedRefineKey\(studioState\)[\s\S]*buildStudioRefinedDraft\([\s\S]*function applyStudioTrackSelection\(trackKey\)[\s\S]*activeRefineKey = isStudioBookingUpdateMode\(studioState\)[\s\S]*getStudioRecommendedRefineKey\(studioState\)[\s\S]*buildStudioRefinedDraft\(/,
    'När operatören laddar mall eller spår i uppdaterat bokningsläge ska Svarstudio kunna behålla samma rekommenderade finjustering och skriva om utkastet direkt i stället för att nollställa startläget.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedBookingCtaLabel\(studioState\)[\s\S]*replyShape[\s\S]*Avsluta nu · be om kort svar[\s\S]*Avsluta nu · ersätt med nytt svar[\s\S]*Avsluta nu · bekräfta kort[\s\S]*Avsluta nu · stäng tydligt[\s\S]*follow_up_update[\s\S]*Avsluta nu · följ upp snabbt[\s\S]*customer_update[\s\S]*Avsluta nu · ersätt tydligt/,
    'Svarstudio ska kunna låta avsluts-CTA:n följa reply-shape, så kompakta slutlägen får lika kompakta handlingsetiketter.'
  );

  assertMatchFast(
    appSource,
    /function getStudioRecommendedBookingCtaCopy\(studioState\)/,
    'Svarstudio ska fortsatt ha en dedikerad CTA-hjälptext för uppdaterade bokningsavslut.'
  );

  assertMatchFast(
    appSource,
    /kort svarssteg[\s\S]*låsas direkt i samma tråd/i,
    'Follow-up-läget ska kunna bära en kortare CTA-hjälptext när reply-shape komprimeras.'
  );

  assert.ok(
    /enda svarspunkt/i.test(appSource) &&
      (/tidigare förslaget kan släppas direkt/i.test(appSource) ||
        /gamla förslaget ersätts utan mer friktion/i.test(appSource)),
    'Customer-update-läget ska kunna tala som en rak ersättning av tidigare kundlöfte.'
  );

  assertMatchFast(
    appSource,
    /kort bekräftelsesteg[\s\S]*låsas direkt i samma tråd/i,
    'Fresh-update-läget ska kunna hålla CTA-hjälptexten kompakt när reply-shape tillåter det.'
  );

  assertMatchFast(
    appSource,
    /låsas innan tempot faller/i,
    'Den mer aktiva uppföljningsvarianten ska kunna bära ett tydligt tempoargument i CTA-hjälptexten.'
  );

  assertMatchFast(
    appSource,
    /summaryParts\.push\([\s\S]*studioState\.bookingStudioChangedFrom && studioState\.bookingStudioChangedTo[\s\S]*Ändrat:[\s\S]*const bookingCompletionLabel = getStudioBookingCompletionLabel\(studioState\);[\s\S]*summaryParts\.push\(bookingCompletionLabel\);/,
    'Den kompakta studiosammanfattningen ska kunna säga både vad som ändrats och när uppdaterat bokningssvar faktiskt är redo att skickas.'
  );

  assertMatchFast(
    appSource,
    /normalizedTool === "gift"[\s\S]*markStudioToolUsed\(studioState,\s*normalizedTool\)[\s\S]*hasStudioBookingClosingSequence\(studioState\)[\s\S]*getStudioBookingCompletionCopy\(studioState\)/,
    'När operatören lägger till sista trygghetsraden i ett uppdaterat bokningssvar ska feedbacken kunna växla till ett tydligt redo-att-skicka-läge.'
  );

  assertMatchFast(
    appSource,
    /normalizedTool === "gift"[\s\S]*markStudioToolUsed\(studioState,\s*normalizedTool\)[\s\S]*applyStudioBookingCompletionDraft\(\s*thread,\s*studioState,\s*studioState\.draftBody\s*\)/,
    'När sista trygghetsraden läggs till i ett uppdaterat bokningssvar ska själva draftslutet också kunna skrivas om till ett tydligt avslut.'
  );

  assertMatchFast(
    appSource,
    /normalizedTool === "policy"[\s\S]*markStudioToolUsed\(studioState,\s*normalizedTool\)[\s\S]*policy\.tone !== "warning"[\s\S]*hasStudioBookingClosingSequence\(studioState\)[\s\S]*getStudioBookingCompletionCopy\(studioState\)/,
    'När policykontrollen går grönt efter omskrivning ska Svarstudio kunna signalera att uppdaterat bokningssvar nu faktiskt är klart att stänga och skicka.'
  );

  assertMatchFast(
    appSource,
    /normalizedTool === "policy"[\s\S]*policy\.tone !== "warning"[\s\S]*applyStudioBookingCompletionDraft\(\s*thread,\s*studioState,\s*studioState\.draftBody\s*\)/,
    'När policykontrollen går grönt efter omskrivning ska Svarstudio kunna skriva om själva avslutsraden i utkastet till ett tydligare redo-att-skicka-slut.'
  );

  assertMatchFast(
    appSource,
    /normalizedRefine === "sharper"[\s\S]*ensureStudioState\(thread\)[\s\S]*applyStudioBookingCompletionDraft\(thread,\s*studioState,\s*sharpenedDraft\)/,
    'Skarpare-finjusteringen ska kunna bära med sig samma redo-att-skicka-avslut när uppdaterat bokningssvar redan nått avslutsläget.'
  );

  assertMatchFast(
    appSource,
    /function isStudioBookingUpdateMode\(studioState\)/,
    'Svarstudio ska ha en liten hjälpfunktion för att låta verktygsfeedback förstå när den jobbar i uppdaterat kundsvar-läge.'
  );

  assertMatchFast(
    appSource,
    /Tonfiltret "\$\{studioState\.activeToneKey\}" applicerades för uppdaterat kundsvar\./,
    'Tonfilter-feedbacken ska säga uttryckligen när den appliceras på ett uppdaterat kundsvar efter ombokning.'
  );

  assertMatchFast(
    appSource,
    /Finjusteringen "\$\{studioState\.activeRefineKey\}" applicerades för uppdaterat kundsvar\./,
    'Finjusteringsfeedbacken ska säga uttryckligen när den appliceras på ett uppdaterat kundsvar efter ombokning.'
  );

  assertMatchFast(
    appSource,
    /Uppdaterat kundförslag regenererades från ombokningskontext\./,
    'Regenerate-verktyget ska kunna tala om när det just regenererat ett uppdaterat kundförslag i stället för ett vanligt bokningsutkast.'
  );

  assertMatchFast(
    appSource,
    /function emphasizeBookingUpdateLead\(thread, draft = ""\)/,
    'Svarstudio ska kunna lyfta fram själva uppdateringsraden när ett ombokat case regenereras eller skärps.'
  );

  assertMatchFast(
    appSource,
    /function buildBookingUpdateStudioStructure\(\s*thread,\s*\{\s*toneKey = "solution_focus",\s*mode = "default"\s*\}\s*=\s*\{\}\s*\)/,
    'Svarstudio ska ha en gemensam strukturbyggare för uppdaterade bokningsutkast så att default- och regenerate-lägen inte glider isär.'
  );

  assertMatchFast(
    appSource,
    /function buildBookingUpdateRegeneratedDraft\(thread\)/,
    'Regenerate ska kunna ha en egen struktur för uppdaterade bokningsförslag i stället för att alltid falla tillbaka till samma track-utkast.'
  );

  assertMatchFast(
    appSource,
    /const followUpSupport =[\s\S]*Om den nya tiden inte fungerar hjälper jag dig gärna vidare med ett nytt alternativ i samma tråd\./,
    'När ett uppdaterat bokningsförslag redan blivit ett uppföljningscase ska regenerate kunna lägga till en tydlig fortsatt hjälp-rad.'
  );

  assertMatchFast(
    appSource,
    /const bridgeLine =[\s\S]*Det tidigare förslaget med \$\{previousLabel\} behöver därför ersättas av \$\{nextLabel\}\./,
    'När kunden redan fått ett äldre tidförslag ska regenerate kunna bygga ett tydligt ersättningsstycke mitt i draften.'
  );

  assertMatchFast(
    appSource,
    /normalizedMode === "regenerate"[\s\S]*Svara gärna i samma tråd om \$\{nextLabel\} fungerar, så ersätter jag det tidigare förslaget direkt\./,
    'När regenerate används i ersätt tidigare kundförslag-läget ska CTA-raden kunna bli tydligare och mer explicit ersättningsstyrd.'
  );

  assertMatchFast(
    appSource,
    /normalizedMode === "regenerate"[\s\S]*Återkom gärna så snart du kan i samma tråd om den uppdaterade tiden fungerar, så säkrar jag ändringen direkt\./,
    'När regenerate används i uppföljningsläget ska CTA-raden kunna bli mer direkt och tidskänslig än standardutkastet.'
  );

  assertMatchFast(
    appSource,
    /function getBookingUpdateStudioProfile\(thread\)/,
    'Svarstudio ska kunna välja olika uppdateringsutkast beroende på om ombokningen är färsk, redan skickad till kund eller kräver uppföljning.'
  );

  assertMatchFast(
    appSource,
    /status === "waiting_customer" && waitHours >= 24[\s\S]*variant: "follow_up_update"/,
    'Ombokningar som redan väntat länge hos kund ska kunna landa i ett tydligare uppföljningsläge i stället för samma generiska uppdateringsutkast.'
  );

  assertMatchFast(
    appSource,
    /Sedan mitt tidigare förslag har tiden \$\{previousLabel\} utgått\.[\s\S]*Den nya tiden jag nu kan erbjuda är \$\{nextLabel\}\./,
    'När kunden redan fått ett äldre förslag ska uppdateringsutkastet kunna tala som en faktisk ersättning av tidigare kundlöfte.'
  );

  assertMatchFast(
    appSource,
    /Jag följer upp eftersom tiden \$\{previousLabel\} har ändrats sedan mitt tidigare förslag\.[\s\S]*Den nya tiden jag kan hålla åt dig är \$\{nextLabel\}\./,
    'Vid mer akut väntar-kund-läge ska uppdateringsutkastet kunna bli mer uppföljningsdrivet i själva leaden.'
  );

  assertMatchFast(
    appSource,
    /Uppdatering: tidigare tid \$\{previousLabel\} har ersatts av \$\{nextLabel\}\./,
    'Regenerate-spåret ska kunna sätta en tydlig första rad som säger vilken tidigare tid som ersatts av vilken ny tid.'
  );

  assertMatchFast(
    appSource,
    /function getBookingUpdateRegeneratedFeedback\(studioState\)[\s\S]*variant === "follow_up_update"[\s\S]*"Uppföljning på uppdaterat kundförslag regenererades\."[\s\S]*variant === "customer_update"[\s\S]*"Ersättningsförslag regenererades från tidigare kundlöfte\."/,
    'Regenerate-feedbacken ska kunna säga olika saker beroende på om operatören följer upp en väntande ombokning eller ersätter ett tidigare kundförslag.'
  );

  assertMatchFast(
    appSource,
    /Bekräfta gärna i samma svar om den uppdaterade tiden passar, så låser jag ändringen direkt\./,
    'Finjusteringen Skarpare ska bli mer ombokningsspecifik när tidigare tid har ersatts.'
  );

  assertMatchFast(
    appSource,
    /Återkom gärna så snart du kan om den uppdaterade tiden fungerar, så låser jag ändringen direkt\./,
    'Skarpare-läget ska kunna bli mer tidskänsligt när ombokningen redan ligger i ett uppföljningsläge hos kunden.'
  );

  assertMatchFast(
    appSource,
    /status === "waiting_customer"[\s\S]*kunden har väntat[\s\S]*kundsvar inväntas/,
    'Varför-nu-readouten ska bli tydligare i väntar-kund-läget och visa att tempot eller kundsvaret har förändrats.'
  );
});
