const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertMatchFast } = require('../helpers/assertMatchFast');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'major-arcana-preview', 'app.js');

test('bookingytan bär backendens arbetsläge in i öppet case och blockerad sortering', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assertMatchFast(
    source,
    /function buildBookingWorkflowSignalReadout\(readout = \{\}\) \{[\s\S]*const buildSignal = \(\{[\s\S]*sourceLabel[\s\S]*sourceMode[\s\S]*signalAt[\s\S]*if \(postConfirmation\)[\s\S]*post_confirmation_reply[\s\S]*post_confirmation_follow_up_active[\s\S]*post_confirmation_follow_up_due[\s\S]*if \(waitingCustomer\)[\s\S]*customer_reply[\s\S]*follow_up_active[\s\S]*follow_up_due[\s\S]*waiting_stale[\s\S]*waiting_monitor/s,
    'Förväntade en gemensam signal-helper som kan peka ut vilken kundsignal eller uppföljning som håller booking-caset levande, både före och efter bekräftelse.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowSignalEvent(readout = {})') &&
      source.includes('const signalReadout = buildBookingWorkflowSignalReadout(readout);') &&
      source.includes(
        'candidateEvents.find((event) => asText(event?.createdAt) === asText(signalReadout.signalAt))'
      ) &&
      source.includes('customer_reply_received') &&
      source.includes('customer_replied') &&
      source.includes('follow_up_scheduled') &&
      source.includes('follow_up_opened') &&
      source.includes('signalReadout.sourceLabel') &&
      source.includes('signalReadout.meta'),
    'Förväntade en gemensam helper som kan översätta booking-signal till konkret logghändelse och proveniens i auditytan.'
  );

  assert.ok(
    source.includes(
      'function getBookingWorkflowSignalTimelineContext(readout = {}, signalEvent = null)'
    ) &&
      source.includes('phase: "post_confirmation"') &&
      source.includes('phase: "waiting_customer"') &&
      source.includes('phase: "active_booking"'),
    'Förväntade en timeline-helper som kan förklara i vilken fas den aktiva signalhändelsen hör hemma.'
  );

  assert.ok(
    source.includes('function getBookingEventProvenanceReadout(event = {}, readout = {})') &&
      source.includes('source === "cco_history_store"') &&
      source.includes('History-enrichment: kundsvar') &&
      source.includes('History-enrichment: uppföljning') &&
      source.includes('titleCaseMailbox(mailboxId)') &&
      source.includes('messageId.slice(0, 8)') &&
      source.includes('CCO-motor') &&
      source.includes('Svarstudio') &&
      source.includes('Extern bekräftelse') &&
      source.includes('Lokal bookinglogg'),
    'Förväntade en helper som kan förklara om den aktiva bokningssignalen kommer från lokal logg, CCO-motor, Svarstudio eller history-enrichment.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowSignalMessageReadout(event = {}, readout = {})') &&
      source.includes('normalizeKey(provenance?.sourceKind) !== "history"') &&
      source.includes('customer_replied: "Kundsvar"') &&
      source.includes('reply_later: "Reply later"') &&
      source.includes('messageId.slice(0, 8)') &&
      source.includes('Den aktiva kundsignalen kommer från kundhistoriken.') &&
      source.includes('Den aktiva uppföljningen kommer från kundhistoriken.'),
    'Förväntade en helper som kan lyfta själva historikpunkten när aktiv signal kommer från mailboxhistoriken.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowSignalMomentReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalAtLabel = formatBookingEventTime(signalEvent.signalAt);') &&
      source.includes('label: "Arbetsogonblick"') &&
      source.includes(
        'signalTimeline ? `${signalTimeline.label} · ${signalAtLabel}` : signalAtLabel'
      ),
    'Förväntade en helper som bär den konkreta tidpunkten för den aktiva bokningssignalen in i öppet case.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowActiveRowReadout(readout = {})') &&
      source.includes('label: "Aktiv rad"') &&
      source.includes('value: `${rowLabel} · ${rowValue}`') &&
      source.includes('filter: signalEvent.filter || ""'),
    'Förväntade en helper som lyfter den aktiva loggraden in i summaryytan så toppen och bookingloggen pekar på samma arbetskälla.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowSignalActionCue(readout = {})') &&
      source.includes('act_now_overdue: {') &&
      source.includes('value: "Svara nu"') &&
      source.includes('reengage_now: {') &&
      source.includes('value: "Följ upp nu"') &&
      source.includes('monitor: {') &&
      source.includes('value: "Bevaka"') &&
      source.includes('ready_to_close: {') &&
      source.includes('value: "Stäng efter kontroll"'),
    'Förväntade en helper som översätter aktiv signalrad till ett kort arbetscue i öppet booking-case.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowSignalWorkReadout(readout = {})') &&
      source.includes('label: "Nästa drag"') &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const blocker = readout?.blocker && typeof readout.blocker === "object" ? readout.blocker : null;'
      ) &&
      source.includes('[signalActionCue?.value, nextActionLabel].filter(Boolean).join(" · ")'),
    'Förväntade en helper som gör den aktiva signalraden till ett kompakt nästa-drag-readout i bookingloggen.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowWorkSourceReadout(readout = {})') &&
      source.includes('const activeRowReadout = getBookingWorkflowActiveRowReadout(readout);') &&
      source.includes(
        'const signalPointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(readout);'
      ) &&
      source.includes(
        'const signalMomentReadout = getBookingWorkflowSignalMomentReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes('label: "Arbetskälla"') &&
      source.includes('value: activeRowReadout.value') &&
      source.includes('signalPointAnchorReadout?.value') &&
      source.includes(
        '[signalWorkPointReadout?.value, signalPointAnchorReadout?.value, signalMomentReadout?.value, signalWorkReadout?.value]'
      ),
    'Förväntade en helper som gör den aktiva raden till en gemensam arbetskälla för både summary och logg.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowPointAnchorReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const pointRowAnchor = formatBookingVisibleLogText(signalEvent.value || signalEvent.label, "Bokningshändelse");'
      ) &&
      source.includes('const pointFilterLabel = signalEvent.filter') &&
      source.includes('const pointThreadReference =') &&
      source.includes('const pointThreadOriginLabel =') &&
      source.includes('label: "Radankare"') &&
      source.includes(
        'value: [pointThreadReference, pointRowAnchor].filter(Boolean).join(" · ") || pointRowAnchor'
      ) &&
      source.includes(
        'meta: [pointThreadOriginLabel, pointFilterLabel, pointTime].filter(Boolean).join(" · ")'
      ),
    'Förväntade en helper som gör den vinnande signalen till ett konkret radankare mellan summary och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowThreadPointReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const pointRowAnchor = formatBookingVisibleLogText(') &&
      source.includes('signalEvent.value || signalEvent.label,') &&
      source.includes('"Bokningshändelse"') &&
      source.includes('const pointFilterLabel = signalEvent.filter') &&
      source.includes('getBookingEventFilterLabel(signalEvent.filter, readout)') &&
      source.includes('const pointThreadOriginLabel =') &&
      source.includes('const pointMailboxLabel = signalMessageReadout?.mailboxLabel || "";') &&
      source.includes('const pointMessageLabel = signalMessageReadout?.messageLabel || "";') &&
      source.includes('const pointThreadReference =') &&
      source.includes('const pointThreadOrigin =') &&
      source.includes('const pointThreadMeta =') &&
      source.includes('label: "Trådpunkt"') &&
      source.includes(
        'value: [pointThreadOriginLabel, pointMailboxLabel, pointMessageLabel, pointTime]'
      ) &&
      source.includes(
        'meta: [signalTimeline?.label, pointThreadOrigin, pointFilterLabel, pointRowAnchor, pointThreadMeta]'
      ),
    'Förväntade en helper som gör den vinnande signalen till en konkret trådpunkt när historikspåret bär arbetet.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowHistoryRowReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const pointRowAnchor = formatBookingVisibleLogText(') &&
      source.includes('const pointFilterLabel = signalEvent.filter') &&
      source.includes('const pointThreadOriginLabel =') &&
      source.includes('const pointThreadReference =') &&
      source.includes('label: "Historikrad"') &&
      source.includes(
        'value: [pointThreadOriginLabel, pointThreadReference, pointRowAnchor].filter(Boolean).join(" · ")'
      ) &&
      source.includes(
        'meta: [signalTimeline?.label, pointFilterLabel, pointTime].filter(Boolean).join(" · ")'
      ),
    'Förväntade en helper som gör historikdrivna vinnarsignaler till en explicit historikrad mellan summary och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerSignalReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes('const historyRowReadout = getBookingWorkflowHistoryRowReadout(readout);') &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const customerSignalLabel =') &&
      source.includes('const customerSignalReference =') &&
      source.includes('label: "Kundsignalrad"') &&
      source.includes(
        'value: [customerSignalLabel, customerSignalReference, historyRowReadout?.value]'
      ) &&
      source.includes(
        'meta: [signalTimeline?.label, signalActionCue?.value, signalMessageReadout?.meta]'
      ),
    'Förväntade en helper som gör den vinnande kundsignalen till en explicit kundsignalrad över summary och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerEventReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes('const historyRowReadout = getBookingWorkflowHistoryRowReadout(readout);') &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const customerEventLabel =') &&
      source.includes('const customerEventValue =') &&
      source.includes('const customerEventReference =') &&
      source.includes('const customerEventTime = formatBookingEventTime(signalEvent.signalAt);') &&
      source.includes('label: "Kundhändelse"') &&
      source.includes('customerEventValue !== customerEventLabel ? customerEventValue : ""') &&
      source.includes('meta: [') &&
      source.includes('historyRowReadout?.value') &&
      source.includes('signalMessageReadout?.meta'),
    'Förväntade en helper som gör den vinnande kundsignalen till en explicit kundhändelse över summary och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowMessagePointReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const historyRowReadout = getBookingWorkflowHistoryRowReadout(readout);') &&
      source.includes(
        'const messagePointLabel = signalMessageReadout?.label || signalEvent.label;'
      ) &&
      source.includes('const messagePointMailbox = signalMessageReadout?.mailboxLabel || "";') &&
      source.includes('const messagePointMessage = signalMessageReadout?.messageLabel || "";') &&
      source.includes('const messagePointReference =') &&
      source.includes('const messagePointTime = formatBookingEventTime(signalEvent.signalAt);') &&
      source.includes('label: "Meddelandepunkt"') &&
      source.includes('value: [') &&
      source.includes('messagePointMailbox') &&
      source.includes('messagePointMessage') &&
      source.includes('meta: [') &&
      source.includes('historyRowReadout?.value') &&
      source.includes('signalMessageReadout?.meta'),
    'Förväntade en helper som gör den vinnande kundsignalen till en explicit meddelandepunkt över summary och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowMessageRowReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const historyRowReadout = getBookingWorkflowHistoryRowReadout(readout);') &&
      source.includes('const pointRowAnchor = formatBookingVisibleLogText(') &&
      source.includes('"Meddelanderad"') &&
      source.includes(
        'const messageRowLabel = signalMessageReadout?.label || signalEvent.label;'
      ) &&
      source.includes('const messageRowReference =') &&
      source.includes('const messageRowTime = formatBookingEventTime(signalEvent.signalAt);') &&
      source.includes('label: "Meddelanderad"') &&
      source.includes(
        'value: [messageRowLabel, messageRowReference, pointRowAnchor].filter(Boolean).join(" · ")'
      ) &&
      source.includes(
        'meta: [signalTimeline?.label, historyRowReadout?.value, messageRowTime, signalMessageReadout?.meta]'
      ),
    'Förväntade en helper som gör den vinnande kundsignalen till en explicit meddelanderad över summary och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowHistoryWorkRowReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes('const historyRowReadout = getBookingWorkflowHistoryRowReadout(readout);') &&
      source.includes('const messageRowReadout = getBookingWorkflowMessageRowReadout(readout);') &&
      source.includes('const workSourceReadout = getBookingWorkflowWorkSourceReadout(readout);') &&
      source.includes('label: "Arbetsrad"') &&
      source.includes(
        'value: [historyWorkRowLabel, historyWorkRowReference, pointRowAnchor].filter(Boolean).join(" · ")'
      ) &&
      source.includes('messageRowReadout?.value') &&
      source.includes('historyRowReadout?.value') &&
      source.includes('workSourceReadout?.value'),
    'Förväntade en helper som gör den vinnande historikraden till en gemensam arbetsrad mellan summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowHistoryWorkRowIdentityReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes('const historyRowReadout = getBookingWorkflowHistoryRowReadout(readout);') &&
      source.includes('const messageRowReadout = getBookingWorkflowMessageRowReadout(readout);') &&
      source.includes(
        'const pointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes('label: "Radidentitet"') &&
      source.includes(
        'value: [rowIdentityLabel, rowIdentityReference, rowIdentityAnchor].filter(Boolean).join(" · ")'
      ) &&
      source.includes('historyRowReadout?.value') &&
      source.includes('messageRowReadout?.value') &&
      source.includes('pointAnchorReadout?.value'),
    'Förväntade en helper som gör den vinnande arbetsraden till en tydligare radidentitet över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowHistoryWorkRowReferenceReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const historyWorkRowReadout = getBookingWorkflowHistoryWorkRowReadout(readout);'
      ) &&
      source.includes(
        'const historyWorkRowIdentityReadout = getBookingWorkflowHistoryWorkRowIdentityReadout(readout);'
      ) &&
      source.includes(
        'const pointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes('label: "Radreferens"') &&
      source.includes(
        'value: [rowReferenceLabel, rowReferenceMailbox, rowReferenceMessage, rowReferenceReference]'
      ) &&
      source.includes('historyWorkRowReadout?.value') &&
      source.includes('historyWorkRowIdentityReadout?.value') &&
      source.includes('pointAnchorReadout?.value'),
    'Förväntade en helper som gör den vinnande arbetsraden till en tydligare radreferens över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowHistoryWorkRowTraceReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const historyWorkRowReadout = getBookingWorkflowHistoryWorkRowReadout(readout);'
      ) &&
      source.includes(
        'const historyWorkRowReferenceReadout = getBookingWorkflowHistoryWorkRowReferenceReadout(readout);'
      ) &&
      source.includes(
        'const pointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes('label: "Radspår"') &&
      source.includes(
        'value: [rowTraceLabel, rowTraceReference, rowTraceAnchor].filter(Boolean).join(" · ")'
      ) &&
      source.includes('historyWorkRowReadout?.value') &&
      source.includes('historyWorkRowReferenceReadout?.value') &&
      source.includes('pointAnchorReadout?.value'),
    'Förväntade en helper som gör den vinnande arbetsraden till ett tydligare radspår över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowHistoryChainReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerEventReadout = getBookingWorkflowCustomerEventReadout(readout);'
      ) &&
      source.includes(
        'const signalMessagePointReadout = getBookingWorkflowMessagePointReadout(readout);'
      ) &&
      source.includes(
        'const historyWorkRowTraceReadout = getBookingWorkflowHistoryWorkRowTraceReadout(readout);'
      ) &&
      source.includes(
        'const historyWorkRowReferenceReadout = getBookingWorkflowHistoryWorkRowReferenceReadout(readout);'
      ) &&
      source.includes('label: "Historikkedja"') &&
      source.includes(
        'value: [historyChainLabel, historyChainEvent, historyChainReference, historyChainTrace]'
      ) &&
      source.includes('signalCustomerEventReadout?.meta') &&
      source.includes('signalMessagePointReadout?.meta') &&
      source.includes('historyWorkRowReferenceReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till en tydligare historikkedja över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerThreadReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalThreadPointReadout = getBookingWorkflowThreadPointReadout(readout);'
      ) &&
      source.includes(
        'const signalMessagePointReadout = getBookingWorkflowMessagePointReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryChainReadout = getBookingWorkflowHistoryChainReadout(readout);'
      ) &&
      source.includes('label: "Kundtråd"') &&
      source.includes(
        'value: [customerThreadLabel, customerThreadOrigin, customerThreadReference, customerThreadChain]'
      ) &&
      source.includes('signalThreadPointReadout?.meta') &&
      source.includes('signalMessagePointReadout?.meta') &&
      source.includes('signalHistoryChainReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till en tydligare kundtråd över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerDialogueReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerThreadReadout = getBookingWorkflowCustomerThreadReadout(readout);'
      ) &&
      source.includes(
        'const signalCustomerEventReadout = getBookingWorkflowCustomerEventReadout(readout);'
      ) &&
      source.includes(
        'const signalMessageRowReadout = getBookingWorkflowMessageRowReadout(readout);'
      ) &&
      source.includes('label: "Kunddialog"') &&
      source.includes('value: [') &&
      source.includes('customerDialogueLabel,') &&
      source.includes('customerDialogueEvent,') &&
      source.includes('customerDialogueThread,') &&
      source.includes('customerDialogueRow,') &&
      source.includes('signalCustomerThreadReadout?.meta') &&
      source.includes('signalCustomerEventReadout?.meta') &&
      source.includes('signalMessageRowReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till en tydligare kunddialog över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerDialoguePointReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerDialogueReadout = getBookingWorkflowCustomerDialogueReadout(readout);'
      ) &&
      source.includes(
        'const signalMessagePointReadout = getBookingWorkflowMessagePointReadout(readout);'
      ) &&
      source.includes(
        'const signalMessageRowReadout = getBookingWorkflowMessageRowReadout(readout);'
      ) &&
      source.includes('label: "Dialogpunkt"') &&
      source.includes('value: [') &&
      source.includes('customerDialoguePointLabel,') &&
      source.includes('customerDialoguePointOrigin,') &&
      source.includes('customerDialoguePointMessage,') &&
      source.includes('customerDialoguePointRow,') &&
      source.includes('signalCustomerDialogueReadout?.meta') &&
      source.includes('signalMessagePointReadout?.meta') &&
      source.includes('signalMessageRowReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till en tydligare dialogpunkt över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerReplyPointReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerDialogueReadout = getBookingWorkflowCustomerDialogueReadout(readout);'
      ) &&
      source.includes(
        'const signalCustomerDialoguePointReadout = getBookingWorkflowCustomerDialoguePointReadout(readout);'
      ) &&
      source.includes(
        'const signalMessagePointReadout = getBookingWorkflowMessagePointReadout(readout);'
      ) &&
      source.includes('label: "Svarspunkt"') &&
      source.includes(
        'value: [replyPointLabel, replyPointOrigin, replyPointMessage].filter(Boolean).join(" · ")'
      ) &&
      source.includes('signalCustomerDialogueReadout?.meta') &&
      source.includes('signalCustomerDialoguePointReadout?.meta') &&
      source.includes('signalMessagePointReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till en tydligare svarspunkt över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerReplyReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerReplyPointReadout = getBookingWorkflowCustomerReplyPointReadout(readout);'
      ) &&
      source.includes(
        'const signalCustomerEventReadout = getBookingWorkflowCustomerEventReadout(readout);'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes('label: "Kundsvar"') &&
      source.includes('value: [replyLabel, replyValue, replyPoint].filter(Boolean).join(" · ")') &&
      source.includes('signalCustomerEventReadout?.meta') &&
      source.includes('signalCustomerReplyPointReadout?.meta') &&
      source.includes('signalMessageReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till ett tydligare kundsvar över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerResponseReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerReplyReadout = getBookingWorkflowCustomerReplyReadout(readout);'
      ) &&
      source.includes(
        'const signalCustomerDialoguePointReadout = getBookingWorkflowCustomerDialoguePointReadout(readout);'
      ) &&
      source.includes(
        'const signalMessageRowReadout = getBookingWorkflowMessageRowReadout(readout);'
      ) &&
      source.includes('label: "Kundrespons"') &&
      source.includes(
        'value: [responseLabel, responseValue, responseRow].filter(Boolean).join(" · ")'
      ) &&
      source.includes('signalCustomerReplyReadout?.meta') &&
      source.includes('signalCustomerDialoguePointReadout?.meta') &&
      source.includes('signalMessageRowReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till en tydligare kundrespons över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerReactionReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerResponseReadout = getBookingWorkflowCustomerResponseReadout(readout);'
      ) &&
      source.includes(
        'const signalCustomerEventReadout = getBookingWorkflowCustomerEventReadout(readout);'
      ) &&
      source.includes(
        'const signalMessagePointReadout = getBookingWorkflowMessagePointReadout(readout);'
      ) &&
      source.includes('label: "Kundreaktion"') &&
      source.includes(
        'value: [reactionLabel, reactionValue, reactionPoint].filter(Boolean).join(" · ")'
      ) &&
      source.includes('signalCustomerResponseReadout?.meta') &&
      source.includes('signalCustomerEventReadout?.meta') &&
      source.includes('signalMessagePointReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till en tydligare kundreaktion över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerResponseModeReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerReactionReadout = getBookingWorkflowCustomerReactionReadout(readout);'
      ) &&
      source.includes(
        'const signalCustomerResponseReadout = getBookingWorkflowCustomerResponseReadout(readout);'
      ) &&
      source.includes(
        'const signalCustomerReplyPointReadout = getBookingWorkflowCustomerReplyPointReadout(readout);'
      ) &&
      source.includes('const nextActionReadout = buildBookingNextActionReadout(readout);') &&
      source.includes('label: "Responsläge"') &&
      source.includes(
        'value: [responseModeLabel, responseModeValue, responseModePoint].filter(Boolean).join(" · ")'
      ) &&
      source.includes('nextActionReadout?.label') &&
      source.includes('signalCustomerReactionReadout?.meta') &&
      source.includes('signalCustomerResponseReadout?.meta') &&
      source.includes('signalCustomerReplyPointReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till ett tydligare responsläge över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerProcessingModeReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerResponseModeReadout = getBookingWorkflowCustomerResponseModeReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(readout);'
      ) &&
      source.includes('const nextActionReadout = buildBookingNextActionReadout(readout);') &&
      source.includes('label: "Bearbetningsläge"') &&
      source.includes(
        'value: [processingModeLabel, processingModeValue, processingModeSource].filter(Boolean).join(" · ")'
      ) &&
      source.includes('nextActionReadout?.label') &&
      source.includes('signalCustomerResponseModeReadout?.meta') &&
      source.includes('signalWorkReadout?.meta') &&
      source.includes('signalWorkSourceReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till ett tydligare bearbetningsläge över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerActionModeReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerProcessingModeReadout = getBookingWorkflowCustomerProcessingModeReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(readout);'
      ) &&
      source.includes('const nextActionReadout = buildBookingNextActionReadout(readout);') &&
      source.includes('label: "Åtgärdsläge"') &&
      source.includes(
        'value: [actionModeLabel, actionModeValue, actionModePoint].filter(Boolean).join(" · ")'
      ) &&
      source.includes('nextActionReadout?.meta') &&
      source.includes('signalCustomerProcessingModeReadout?.meta') &&
      source.includes('signalWorkReadout?.meta') &&
      source.includes('signalWorkPointReadout?.meta'),
    'Förväntade en helper som gör den vinnande historiksignalen till ett tydligare åtgärdsläge över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowCustomerActionReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'if (normalizeKey(signalProvenance?.sourceKind) !== "history") return null;'
      ) &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalCustomerActionModeReadout = getBookingWorkflowCustomerActionModeReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(readout);'
      ) &&
      source.includes('const nextActionReadout = buildBookingNextActionReadout(readout);') &&
      source.includes('label: "Operativ åtgärd"') &&
      source.includes(
        'value: [actionLabel, actionValue, actionSource].filter(Boolean).join(" · ")'
      ) &&
      source.includes('signalCustomerActionModeReadout?.meta') &&
      source.includes('signalWorkReadout?.meta') &&
      source.includes('signalWorkSourceReadout?.meta'),
    'Förväntade en helper som gör det history-drivna kundläget till en tydlig operativ åtgärd över summary, audit och timeline.'
  );

  assert.ok(
    source.includes('function getBookingWorkflowWorkPointReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes(
        'const signalMessageReadout = getBookingWorkflowSignalMessageReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const signalProvenance = getBookingEventProvenanceReadout(signalEvent, readout);'
      ) &&
      source.includes(
        'const pointRowAnchor = formatBookingVisibleLogText(signalEvent.value || signalEvent.label, "Bokningshändelse");'
      ) &&
      source.includes('const pointFilterLabel = signalEvent.filter') &&
      source.includes('getBookingEventFilterLabel(signalEvent.filter, readout)') &&
      source.includes('const pointThreadReference =') &&
      source.includes('signalMessageReadout?.referenceLabel') &&
      source.includes('signalProvenance?.referenceLabel') &&
      source.includes('const pointThreadOriginLabel =') &&
      source.includes('signalMessageReadout?.label') &&
      source.includes('signalProvenance?.label') &&
      source.includes('const pointThreadOriginMeta =') &&
      source.includes('signalMessageReadout?.meta') &&
      source.includes('signalProvenance?.meta') &&
      source.includes('const pointThreadOrigin =') &&
      source.includes('signalMessageReadout?.value') &&
      source.includes(
        '[signalProvenance?.label, pointThreadReference].filter(Boolean).join(" · ")'
      ) &&
      source.includes('label: "Arbetspunkt"') &&
      source.includes(
        'value: [pointLabel, pointThreadOrigin !== pointLabel ? pointThreadOrigin : "", pointTime]'
      ) &&
      source.includes(
        'meta: [signalTimeline?.label, pointThreadOriginLabel, pointThreadOriginMeta, pointFilterLabel, pointRowAnchor]'
      ),
    'Förväntade en helper som gör den vinnande signalen till en mer exakt arbetspunkt mellan summary och timeline.'
  );

  assertMatchFast(
    source,
    /function buildBookingDecisionSourceReadout\(readout = \{\}\) \{[\s\S]*const signalReadout = buildBookingWorkflowSignalReadout\(readout\);[\s\S]*const signalEvent = getBookingWorkflowSignalEvent\(readout\);[\s\S]*const signalProvenance = signalEvent \? getBookingEventProvenanceReadout\(signalEvent, readout\) : null;[\s\S]*const signalMessageReadout = signalEvent \? getBookingWorkflowSignalMessageReadout\(signalEvent, readout\) : null;[\s\S]*label: signalReadout \? "Beslutskälla: backend \+ kundsignal" : "Beslutskälla: backend-blockering"[\s\S]*signalMessageReadout\?\.value \|\| signalSourceSummary/,
    'Förväntade att beslutskällan använder den gemensamma booking-signalen när backendens blocker redan vet vilken kundsignal som driver nästa steg.'
  );

  assertMatchFast(
    source,
    /function buildBookingSourceReadout\(thread\) \{[\s\S]*const focusedReadout = getBookingReadoutForThread\(thread\);[\s\S]*const signalReadout = buildBookingWorkflowSignalReadout\(focusedReadout\);[\s\S]*const signalEvent = getBookingWorkflowSignalEvent\(focusedReadout\);[\s\S]*const signalProvenance = signalEvent \? getBookingEventProvenanceReadout\(signalEvent, focusedReadout\) : null;[\s\S]*const signalMessageReadout = signalEvent[\s\S]*getBookingWorkflowSignalMessageReadout\(signalEvent, focusedReadout\)[\s\S]*signalMessageReadout\?\.value \|\| signalSourceSummary/,
    'Förväntade att källreadouten bär vidare samma booking-signal så öppet case kan förklara varför ett längre case fortfarande är aktivt.'
  );

  assertMatchFast(
    source,
    /function buildBookingDecisionFocusCard\(thread, readout = \{\}, stageContext = \{\}, previousSignal = ""\) \{[\s\S]*const signalReadout = buildBookingWorkflowSignalReadout\(readout\);[\s\S]*const signalEvent = getBookingWorkflowSignalEvent\(readout\);[\s\S]*const signalProvenance = signalEvent \? getBookingEventProvenanceReadout\(signalEvent, readout\) : null;[\s\S]*const signalMessageReadout = signalEvent \? getBookingWorkflowSignalMessageReadout\(signalEvent, readout\) : null;[\s\S]*signalMessageReadout\?\.label \|\| signalReadout\?\.sourceLabel \|\| signalProvenance\?\.label[\s\S]*signalMessageReadout\?\.meta[\s\S]*signalSourceSummary/,
    'Förväntade att fokuskortet kan bära både arbetsläge och konkret signalproveniens när booking-caset lever vidare över tid.'
  );

  assertMatchFast(
    source,
    /function getJourneyBookingModuleContext\(thread\) \{[\s\S]*preferredStatusStep === "confirmed_external" && postConfirmation[\s\S]*act_now_overdue:[\s\S]*status: "needs_action"[\s\S]*monitor:[\s\S]*status: "waiting_customer"/,
    'Förväntade en gemensam journey-helper som håller bokningsmodulen aktiv när confirmed_external fortfarande lever vidare efter bekräftelsen.'
  );

  assertMatchFast(
    source,
    /const bookingModuleContext = getJourneyBookingModuleContext\(thread\);[\s\S]*if \(backendPatient360\?\.attention && backendPatient360\?\.modules\) \{[\s\S]*if \(moduleId === "booking"\) \{[\s\S]*detail: bookingModuleContext\.detail,[\s\S]*status: normalizeKey\(bookingModuleContext\.status[\s\S]*nextAction: asText\(bookingModuleContext\.nextAction, value\.nextAction\)/,
    'Förväntade att även backend-hydrerad patientresa låter bokningsmodulen läsa den nya längre-case-liv-sanningen i stället för att fastna i stale confirmed_external-status.'
  );

  assertMatchFast(
    source,
    /id: "booking",[\s\S]*detail: bookingModuleContext\.detail,[\s\S]*status: normalizeKey\(bookingModuleContext\.status[\s\S]*nextAction: bookingModuleContext\.nextAction,[\s\S]*confidence: bookingModuleContext\.confidence/,
    'Förväntade att den lokala patientresans bokningsmodul använder den gemensamma booking-konteksten för status, detail och nästa steg.'
  );

  assertMatchFast(
    source,
    /if \(activeModuleId === "booking"\) \{[\s\S]*const bookingModuleContext = getJourneyBookingModuleContext\(thread\);[\s\S]*summary: bookingModuleContext\.summary,/,
    'Förväntade att journey-driven workspace action för Bokning använder den längre booking-sanningen i sin summary, inte en generisk kandidat-tid-copy.'
  );

  assertMatchFast(
    source,
    /postConfirmation:\s*state\.booking\.engineSummary\?\.postConfirmation[\s\S]*readout\.postConfirmation[\s\S]*bookingCase\.postConfirmation/,
    'Förväntade att booking-readoutet bär med backendens postConfirmation-sanning in i öppet case.'
  );

  assertMatchFast(
    source,
    /function getBookingPostConfirmationContext\(readout = \{\}\)/,
    'Förväntade en gemensam helper för postConfirmation så öppet case kan läsa livet efter confirmed_external utan lokal heuristik.'
  );

  assertMatchFast(
    source,
    /recommendedActionState:\s*asText\([\s\S]*state\.booking\.engineSummary\?\.recommendedActionState[\s\S]*bookingCase\.recommendedActionState[\s\S]*\)/,
    'Förväntade att booking-readoutet prioriterar backendens recommendedActionState före äldre fallbackkällor.'
  );

  assertMatchFast(
    source,
    /recommendedActionReason:\s*asText\([\s\S]*state\.booking\.engineSummary\?\.recommendedActionReason[\s\S]*bookingCase\.recommendedActionReason[\s\S]*\)/,
    'Förväntade att booking-readoutet bär med backendens recommendedActionReason in i öppet case.'
  );

  assertMatchFast(
    source,
    /function getBookingRecommendationStatePriority\(recommendedActionState = ""\)/,
    'Förväntade en gemensam helper som mappar backendens arbetsläge till frontend-prioritet.'
  );

  assertMatchFast(
    source,
    /if \(activeSort === "blocked"\) \{[\s\S]*const blockerDelta = getBookingCaseBlockerScore\(b\) - getBookingCaseBlockerScore\(a\);[\s\S]*const recommendationDelta =[\s\S]*getBookingRecommendationStatePriority\(b\?\.recommendedActionState\) -[\s\S]*getBookingRecommendationStatePriority\(a\?\.recommendedActionState\);[\s\S]*if \(recommendationDelta\) return recommendationDelta;[\s\S]*\}/,
    'Förväntade att blockerad sortering bryter likaläge med backendens arbetsläge innan updatedAt.'
  );

  assertMatchFast(
    source,
    /const recommendation = getBookingRecommendationMeta\(readout\);[\s\S]*const metaByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*meta:\s*metaByRecommendationState\[recommendationState\][\s\S]*recommendation\.reason/,
    'Förväntade att nästa steg-readouten använder backendens arbetsläge och orsak för att beskriva varför operatören ska agera nu.'
  );

  assertMatchFast(
    source,
    /function getJourneyPreferredBookingSurfaceZone\(statusStep = "", readout = \{\}\) \{[\s\S]*if \(normalizedStatus === "confirmed_external"\) \{[\s\S]*if \(postConfirmation && recommendationState && recommendationState !== "ready_to_close"\) \{[\s\S]*if \(recommendationState === "monitor"\) return "handoff_summary";[\s\S]*return "action_row";[\s\S]*\}[\s\S]*return "audit_preview";/,
    'Förväntade att journey-fokus i ett confirmed_external-case kan gå till action row eller handoff summary när efterbekräftelse-livet fortfarande är aktivt.'
  );

  assertMatchFast(
    source,
    /if \(normalizedStatus === "confirmed_external"\) \{[\s\S]*const postConfirmation = getBookingPostConfirmationContext\(readout\);[\s\S]*const postConfirmationContextByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*if \(postConfirmation && postConfirmationContextByRecommendationState\[recommendationState\]\) \{[\s\S]*return postConfirmationContextByRecommendationState\[recommendationState\];[\s\S]*\}/,
    'Förväntade att confirmed_external-stagecontext nu kan läsa backendens postConfirmation-läge före den generiska stängningscopy:n.'
  );

  assertMatchFast(
    source,
    /if \(normalizedStatus === "confirmed_external"\) \{[\s\S]*const postConfirmation = getBookingPostConfirmationContext\(readout\);[\s\S]*const refStatusByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*if \(postConfirmation && refStatusByRecommendationState\[recommendationState\]\)/,
    'Förväntade att confirmed_external-stagemicrocopy nu kan läsa postConfirmation-sanning före det generiska stängningsläget.'
  );

  assertMatchFast(
    source,
    /function buildBookingHealthReadout\(readout = \{\}\) \{[\s\S]*const recommendation = getBookingRecommendationMeta\(readout\);[\s\S]*const waitingHealthByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*act_now:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*if \(waitingHealthByRecommendationState\[recommendationState\]\) \{[\s\S]*return waitingHealthByRecommendationState\[recommendationState\];[\s\S]*\}/,
    'Förväntade att hälsa-readouten använder backendens arbetsläge för waiting_customer i stället för enbart generisk 24h-logik.'
  );

  assertMatchFast(
    source,
    /if \(status === "confirmed_external" \|\| asText\(readout\.confirmedExternalAt\)\) \{[\s\S]*const postConfirmation = getBookingPostConfirmationContext\(readout\);[\s\S]*const healthByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*if \(postConfirmation && healthByRecommendationState\[recommendationState\]\) \{[\s\S]*return healthByRecommendationState\[recommendationState\];[\s\S]*\}/,
    'Förväntade att confirmed_external-hälsan kan återöppnas av backendens postConfirmation-läge i stället för att alltid vara redo att stängas.'
  );

  assertMatchFast(
    source,
    /function buildBookingDecisionSourceReadout\(readout = \{\}\) \{[\s\S]*const recommendation = getBookingRecommendationMeta\(readout\);[\s\S]*const signalReadout = buildBookingWorkflowSignalReadout\(readout\);[\s\S]*const recommendationLabel = formatBookingRecommendationStateLabel\(recommendation\.state\);[\s\S]*label: signalReadout \? "Beslutskälla: backend \+ kundsignal" : "Beslutskälla: backend-blockering"[\s\S]*signalReadout\.meta[\s\S]*recommendation\.reason/,
    'Förväntade att beslutskällan visar backendens arbetsläge och orsak när sådan sanning redan finns i readoutet.'
  );

  assertMatchFast(
    source,
    /if \(normalizedStatus === "waiting_customer"\) \{[\s\S]*const waitingContextByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*if \(waitingContextByRecommendationState\[recommendationState\]\) \{[\s\S]*return waitingContextByRecommendationState\[recommendationState\];[\s\S]*\}/,
    'Förväntade att waiting_customer-stagecontext nu styrs av backendens recommendedActionState i stället för ett generiskt vänteläge.'
  );

  assertMatchFast(
    source,
    /const refStatusByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*act_now:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*refStatus:\s*refStatusByRecommendationState\[recommendationState\]/,
    'Förväntade att stage-mikrocopy för waiting_customer använder backendens arbetsläge för refStatus-copy.'
  );

  assertMatchFast(
    source,
    /if \(status === "confirmed_external" \|\| asText\(readout\.confirmedExternalAt\)\) \{[\s\S]*const postConfirmation = getBookingPostConfirmationContext\(readout\);[\s\S]*if \(postConfirmation && asText\(postConfirmation\.action\)\) \{[\s\S]*label: `Nästa: \$\{nextActionLabel\}`[\s\S]*action: asText\(postConfirmation\.action\)/,
    'Förväntade att nästa steg-readouten i confirmed_external kan återöppnas av postConfirmation innan den faller tillbaka till stängning.'
  );

  assertMatchFast(
    source,
    /state\.booking\.engineSummary\?\.postConfirmation[\s\S]*state\.booking\.case\?\.postConfirmation[\s\S]*state\.booking\.readout\?\.postConfirmation/,
    'Förväntade att runtime-sync också bär backendens postConfirmation-sanning vidare när öppet case uppdateras live.'
  );

  assertMatchFast(
    source,
    /function buildBookingDecisionFocusCard\(thread, readout = \{\}, stageContext = \{\}, previousSignal = ""\) \{[\s\S]*const postConfirmation = getBookingPostConfirmationContext\(readout\);[\s\S]*label: postConfirmation \? "Efter bekräftelse" : "Arbetsläge"/,
    'Förväntade att fokuskortet markerar efterbekräftelse som eget arbetsläge när backend redan bär den sanningen.'
  );

  assertMatchFast(
    source,
    /function getBookingEngineStateReadout\(readout = \{\}\) \{[\s\S]*const recommendation = getBookingRecommendationMeta\(readout\);[\s\S]*const postConfirmation = getBookingPostConfirmationContext\(readout\);[\s\S]*if \(confirmedBooking\) \{[\s\S]*if \(postConfirmation\) \{[\s\S]*valueByRecommendationState[\s\S]*recommendation\.reason/,
    'Förväntade att CCO motor-readouten kan visa efterbekräftelse-läge när ett confirmed_external-case fortfarande lever vidare.'
  );

  assertMatchFast(
    source,
    /function buildBookingEngineSlotContext\(readout = \{\}\) \{[\s\S]*const recommendation = getBookingRecommendationMeta\(readout\);[\s\S]*const postConfirmation = getBookingPostConfirmationContext\(readout\);[\s\S]*if \(confirmedBooking\) \{[\s\S]*if \(postConfirmation\) \{[\s\S]*titleByRecommendationState[\s\S]*recommendation\.reason/,
    'Förväntade att slotkontexten i öppet case kan bära efterbekräftelse-sanning i stället för att bara säga Bekräftad i CCO.'
  );

  assertMatchFast(
    source,
    /const waitingReasonByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*act_now:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*status === "waiting_customer"[\s\S]*waitingReasonByRecommendationState\[recommendationState\]/,
    'Förväntade att Varför nu-kedjan använder backendens arbetsläge när booking-case redan är i waiting_customer.'
  );

  assertMatchFast(
    source,
    /const postConfirmationReasonByRecommendationState = \{[\s\S]*act_now_overdue:[\s\S]*act_now:[\s\S]*reengage_now:[\s\S]*monitor:[\s\S]*\};[\s\S]*if \(status === "confirmed_external" && postConfirmation && postConfirmationReasonByRecommendationState\[recommendationState\]\) \{[\s\S]*signalReadout\?\.meta \|\| postConfirmationReasonByRecommendationState\[recommendationState\]\.meta[\s\S]*\}[\s\S]*if \(status === "waiting_customer" && signalReadout && waitingReasonByRecommendationState\[recommendationState\]\)/,
    'Förväntade att Varför nu-kedjan kan tala backendens efterbekräftelse-sanning i stället för att falla tillbaka till generisk blockerlabel.'
  );

  assert.ok(
    source.includes('function buildBookingStructuredAuditLines(thread, readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes(
        'const signalProvenance = signalEvent ? getBookingEventProvenanceReadout(signalEvent, readout) : null;'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(readout);'
      ) &&
      source.includes('Aktiv signal:') &&
      source.includes('Signalfas:') &&
      source.includes('Signalproveniens:') &&
      source.includes('Arbetscue:') &&
      source.includes('Arbetspunkt:') &&
      source.includes('Radankare:') &&
      source.includes('Trådpunkt:') &&
      source.includes('Arbetsrad:') &&
      source.includes('Radidentitet:') &&
      source.includes('Radreferens:') &&
      source.includes('Radspår:') &&
      source.includes('Historikkedja:') &&
      source.includes('Kundtråd:') &&
      source.includes('Kunddialog:') &&
      source.includes('Dialogpunkt:') &&
      source.includes('Svarspunkt:') &&
      source.includes('Kundsvar:') &&
      source.includes('Kundrespons:') &&
      source.includes('Kundreaktion:') &&
      source.includes('Responsläge:') &&
      source.includes('Bearbetningsläge:') &&
      source.includes('Operativ åtgärd:') &&
      source.includes('Åtgärdsläge:') &&
      source.includes('Arbetskälla:') &&
      source.includes('Nästa drag:') &&
      source.includes('Signalsource:') &&
      source.includes('Signalreferens:'),
    'Förväntade att den strukturerade bokningsloggen bär aktiv signal, signalproveniens och arbetskälla när ett längre case hålls levande av kund- eller uppföljningssignal.'
  );

  assert.ok(
    source.includes('function buildBookingAuditPreviewRows(thread, readout = {})') &&
      source.includes('label: "Signal"') &&
      source.includes('label: "Källa"') &&
      source.includes('label: "Arbetscue"') &&
      source.includes('label: "Arbetspunkt"') &&
      source.includes('label: "Radankare"') &&
      source.includes('label: "Trådpunkt"') &&
      source.includes('label: "Arbetsrad"') &&
      source.includes('label: "Radidentitet"') &&
      source.includes('label: "Radreferens"') &&
      source.includes('label: "Radspår"') &&
      source.includes('label: "Historikkedja"') &&
      source.includes('label: "Kundtråd"') &&
      source.includes('label: "Kunddialog"') &&
      source.includes('label: "Dialogpunkt"') &&
      source.includes('label: "Svarspunkt"') &&
      source.includes('label: "Kundsvar"') &&
      source.includes('label: "Kundrespons"') &&
      source.includes('label: "Kundreaktion"') &&
      source.includes('label: "Responsläge"') &&
      source.includes('label: "Bearbetningsläge"') &&
      source.includes('label: "Operativ åtgärd"') &&
      source.includes('label: "Åtgärdsläge"') &&
      source.includes('label: "Arbetskälla"') &&
      source.includes('label: "Nästa drag"') &&
      source.includes(
        'signalTimeline ? `${signalEvent.value} · ${signalTimeline.label}` : signalEvent.value'
      ),
    'Förväntade att audit-previewraderna visar den konkreta aktiva signalen i stället för att bara falla tillbaka till senaste allmänna loggrad.'
  );

  assert.ok(
    source.includes(
      'function buildBookingAuditPreviewCopy(thread, readout = {}, mode = "short")'
    ) &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes('signalTimeline ? ` · ${signalTimeline.label}` : ""') &&
      source.includes(
        'signalProvenance.referenceLabel ? ` · ${signalProvenance.referenceLabel}` : ""'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalPointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes(
        'const signalThreadPointReadout = getBookingWorkflowThreadPointReadout(readout);'
      ) &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(readout);'
      ) &&
      source.includes('Arbetscue: ${signalActionCue.value}') &&
      source.includes('${signalWorkPointReadout.label}: ${signalWorkPointReadout.value}') &&
      source.includes('${signalPointAnchorReadout.label}: ${signalPointAnchorReadout.value}') &&
      source.includes('${signalThreadPointReadout.label}: ${signalThreadPointReadout.value}') &&
      source.includes(
        '${signalHistoryWorkRowReadout.label}: ${signalHistoryWorkRowReadout.value}'
      ) &&
      source.includes(
        '${signalHistoryWorkRowIdentityReadout.label}: ${signalHistoryWorkRowIdentityReadout.value}'
      ) &&
      source.includes(
        '${signalHistoryWorkRowReferenceReadout.label}: ${signalHistoryWorkRowReferenceReadout.value}'
      ) &&
      source.includes(
        '${signalHistoryWorkRowTraceReadout.label}: ${signalHistoryWorkRowTraceReadout.value}'
      ) &&
      source.includes('${signalHistoryChainReadout.label}: ${signalHistoryChainReadout.value}') &&
      source.includes(
        '${signalCustomerThreadReadout.label}: ${signalCustomerThreadReadout.value}'
      ) &&
      source.includes(
        '${signalCustomerDialogueReadout.label}: ${signalCustomerDialogueReadout.value}'
      ) &&
      source.includes(
        '${signalCustomerDialoguePointReadout.label}: ${signalCustomerDialoguePointReadout.value}'
      ) &&
      source.includes(
        '${signalCustomerReplyPointReadout.label}: ${signalCustomerReplyPointReadout.value}'
      ) &&
      source.includes('${signalCustomerReplyReadout.label}: ${signalCustomerReplyReadout.value}') &&
      source.includes(
        '${signalCustomerResponseReadout.label}: ${signalCustomerResponseReadout.value}'
      ) &&
      source.includes(
        '${signalCustomerReactionReadout.label}: ${signalCustomerReactionReadout.value}'
      ) &&
      source.includes(
        '${signalCustomerResponseModeReadout.label}: ${signalCustomerResponseModeReadout.value}'
      ) &&
      source.includes(
        '${signalCustomerProcessingModeReadout.label}: ${signalCustomerProcessingModeReadout.value}'
      ) &&
      source.includes(
        '${signalCustomerActionReadout.label}: ${signalCustomerActionReadout.value}'
      ) &&
      source.includes(
        '${signalCustomerActionModeReadout.label}: ${signalCustomerActionModeReadout.value}'
      ) &&
      source.includes('${signalWorkSourceReadout.label}: ${signalWorkSourceReadout.value}') &&
      source.includes('${signalWorkReadout.label}: ${signalWorkReadout.value}') &&
      source.includes('Källa: ${signalProvenance.label}'),
    'Förväntade att kortkopian i bookingloggen bär samma signalproveniens som resten av auditytan.'
  );

  assert.ok(
    source.includes('function renderBookingEventTimeline(bookingDom, readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalPointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes(
        'const signalThreadPointReadout = getBookingWorkflowThreadPointReadout(readout);'
      ) &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(readout);'
      ) &&
      source.includes('const provenance = getBookingEventProvenanceReadout(event, readout);') &&
      source.includes('class="is-active-signal"') &&
      source.includes('Aktiv signal ·') &&
      source.includes('Källa ·') &&
      source.includes('Proveniens ·') &&
      source.includes('Arbetscue ·') &&
      source.includes('Radankare ·') &&
      source.includes('Trådpunkt ·') &&
      source.includes('Arbetsrad ·') &&
      source.includes('Radidentitet ·') &&
      source.includes('Radreferens ·') &&
      source.includes('Radspår ·') &&
      source.includes('Historikkedja ·') &&
      source.includes('Kundtråd ·') &&
      source.includes('Kunddialog ·') &&
      source.includes('Dialogpunkt ·') &&
      source.includes('Svarspunkt ·') &&
      source.includes('Kundsvar ·') &&
      source.includes('Kundrespons ·') &&
      source.includes('Kundreaktion ·') &&
      source.includes('Responsläge ·') &&
      source.includes('Bearbetningsläge ·') &&
      source.includes('Operativ åtgärd ·') &&
      source.includes('Åtgärdsläge ·') &&
      source.includes('Arbetspunkt ·') &&
      source.includes('Arbetskälla ·') &&
      source.includes('Nästa drag ·'),
    'Förväntade att själva bokningstidslinjen markerar den aktiva signalhändelsen och förklarar varför just den raden driver arbetet.'
  );

  assert.ok(
    source.includes('function buildBookingDecisionSourceReadout(readout = {})') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = signalEvent ? getBookingEventProvenanceReadout(signalEvent, readout) : null;'
      ) &&
      source.includes(
        'const signalMessageReadout = signalEvent ? getBookingWorkflowSignalMessageReadout(signalEvent, readout) : null;'
      ) &&
      source.includes(
        'const signalMomentReadout = getBookingWorkflowSignalMomentReadout(readout);'
      ) &&
      source.includes('const activeRowReadout = getBookingWorkflowActiveRowReadout(readout);') &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalPointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes(
        'const signalThreadPointReadout = getBookingWorkflowThreadPointReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryRowReadout = getBookingWorkflowHistoryRowReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryWorkRowReadout = getBookingWorkflowHistoryWorkRowReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(readout);'
      ) &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(readout);'
      ) &&
      source.includes('const signalSourceSummary = signalProvenance?.referenceLabel') &&
      source.includes('signalMessageReadout?.value || signalSourceSummary') &&
      source.includes('signalHistoryRowReadout?.value') &&
      source.includes('signalHistoryWorkRowReadout?.value') &&
      source.includes('signalActionCue?.value') &&
      source.includes('signalWorkSourceReadout?.value'),
    'Förväntade att beslutskällan bär upp signalproveniens, referens, nästa drag och arbetskälla redan i öppet case, inte först nere i auditloggen.'
  );

  assert.ok(
    source.includes(
      'function buildBookingDecisionFocusCard(thread, readout = {}, stageContext = {}, previousSignal = "")'
    ) &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalProvenance = signalEvent ? getBookingEventProvenanceReadout(signalEvent, readout) : null;'
      ) &&
      source.includes(
        'const signalMessageReadout = signalEvent ? getBookingWorkflowSignalMessageReadout(signalEvent, readout) : null;'
      ) &&
      source.includes(
        'const signalMomentReadout = getBookingWorkflowSignalMomentReadout(readout);'
      ) &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes(
        'const signalPointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes(
        'const signalThreadPointReadout = getBookingWorkflowThreadPointReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryRowReadout = getBookingWorkflowHistoryRowReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryWorkRowReadout = getBookingWorkflowHistoryWorkRowReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(readout);'
      ) &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(readout);'
      ) &&
      source.includes(
        'signalMessageReadout?.label || signalReadout?.sourceLabel || signalProvenance?.label'
      ) &&
      source.includes('signalSourceSummary') &&
      source.includes('signalHistoryRowReadout?.value') &&
      source.includes('signalHistoryWorkRowReadout?.value') &&
      source.includes('signalActionCue?.value') &&
      source.includes('signalWorkSourceReadout?.value'),
    'Förväntade att fokuskortet i öppet case bär både arbetsläge, historikproveniens, nästa drag och arbetskälla när ett långt bokningscase fortfarande lever.'
  );

  assert.ok(
    source.includes('function buildBookingSourceReadout(thread)') &&
      source.includes('const signalEvent = getBookingWorkflowSignalEvent(focusedReadout);') &&
      source.includes(
        'const signalProvenance = signalEvent ? getBookingEventProvenanceReadout(signalEvent, focusedReadout) : null;'
      ) &&
      source.includes('const signalMessageReadout = signalEvent') &&
      source.includes(
        'const signalMomentReadout = getBookingWorkflowSignalMomentReadout(focusedReadout);'
      ) &&
      source.includes(
        'const activeRowReadout = getBookingWorkflowActiveRowReadout(focusedReadout);'
      ) &&
      source.includes(
        'const signalActionCue = getBookingWorkflowSignalActionCue(focusedReadout);'
      ) &&
      source.includes(
        'const signalPointAnchorReadout = getBookingWorkflowPointAnchorReadout(focusedReadout);'
      ) &&
      source.includes(
        'const signalThreadPointReadout = getBookingWorkflowThreadPointReadout(focusedReadout);'
      ) &&
      source.includes(
        'const signalHistoryRowReadout = getBookingWorkflowHistoryRowReadout(focusedReadout);'
      ) &&
      source.includes(
        'const signalHistoryWorkRowReadout = getBookingWorkflowHistoryWorkRowReadout(focusedReadout);'
      ) &&
      source.includes(
        'const signalWorkReadout = getBookingWorkflowSignalWorkReadout(focusedReadout);'
      ) &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(focusedReadout);'
      ) &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(focusedReadout);'
      ) &&
      source.includes('const signalSourceSummary = signalProvenance?.referenceLabel') &&
      source.includes('signalMessageReadout?.value || signalSourceSummary') &&
      source.includes('signalHistoryRowReadout?.value') &&
      source.includes('signalHistoryWorkRowReadout?.value') &&
      source.includes('signalActionCue?.value') &&
      source.includes('signalWorkSourceReadout?.value'),
    'Förväntade att källreadouten i bookingytan bär upp mailbox-/meddelandeproveniens, nästa drag och arbetskälla när backendens aktiva signal kommer från historiken.'
  );

  assert.ok(
    source.includes(
      'function buildBookingDecisionCards(thread, readout = {}, stageContext = {})'
    ) &&
      source.includes(
        'const signalPointAnchorReadout = getBookingWorkflowPointAnchorReadout(readout);'
      ) &&
      source.includes(
        'const signalThreadPointReadout = getBookingWorkflowThreadPointReadout(readout);'
      ) &&
      source.includes('const signalWorkReadout = getBookingWorkflowSignalWorkReadout(readout);') &&
      source.includes(
        'const signalWorkPointReadout = getBookingWorkflowWorkPointReadout(readout);'
      ) &&
      source.includes(
        'const signalWorkSourceReadout = getBookingWorkflowWorkSourceReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryWorkRowReadout = getBookingWorkflowHistoryWorkRowReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryWorkRowIdentityReadout = getBookingWorkflowHistoryWorkRowIdentityReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryWorkRowReferenceReadout = getBookingWorkflowHistoryWorkRowReferenceReadout(readout);'
      ) &&
      source.includes(
        'const signalHistoryWorkRowTraceReadout = getBookingWorkflowHistoryWorkRowTraceReadout(readout);'
      ) &&
      source.includes('signalPointAnchorReadout?.value,') &&
      source.includes('signalThreadPointReadout?.value,') &&
      source.includes('signalHistoryWorkRowReadout?.value,') &&
      source.includes('signalHistoryWorkRowIdentityReadout?.value,') &&
      source.includes('signalHistoryWorkRowReferenceReadout?.value,') &&
      source.includes('signalHistoryWorkRowTraceReadout?.value,') &&
      source.includes('signalCustomerActionModeReadout?.value,') &&
      source.includes('signalCustomerActionReadout?.value,') &&
      source.includes('signalActionCue?.value,') &&
      source.includes('signalWorkReadout?.value,') &&
      source.includes('signalWorkPointReadout?.value,') &&
      source.includes('signalWorkSourceReadout?.value,') &&
      source.includes('label: signalWorkSourceReadout.label') &&
      source.includes('value: signalWorkSourceReadout.value') &&
      source.includes('signalWorkSourceReadout.meta') &&
      source.includes('getBookingRecommendationMeta(readout).reason') &&
      source.includes('signalHistoryWorkRowTraceReadout?.value') &&
      source.includes('signalCustomerActionModeReadout?.value') &&
      source.includes('signalActionCue?.value') &&
      source.includes('stageContext.heroMeta'),
    'Förväntade att decision-griden i öppet case låter Signal, Nu och ett eget Arbetskälla-kort bära nästa drag, arbetskälla och den vinnande historikradens spår från den aktiva raden.'
  );

  assertMatchFast(
    source,
    /if \(status === "confirmed_external" \|\| asText\(readout\.confirmedExternalAt\)\) \{[\s\S]*const postConfirmation = getBookingPostConfirmationContext\(readout\);[\s\S]*if \(postConfirmation\) \{[\s\S]*postMode === "post_confirmation_reply"[\s\S]*postMode === "post_confirmation_follow_up_active"[\s\S]*postMode === "post_confirmation_follow_up_due"/,
    'Förväntade att kundläge-readouten i confirmed_external kan visa kundsvar och uppföljning efter bekräftelsen i stället för enbart extern bekräftelse.'
  );

  assertMatchFast(
    source,
    /function getBookingRecommendedActionForState\(recommendedActionState = ""\)/,
    'Förväntade en gemensam helper som översätter backendens arbetsläge till rätt bokningsaction i frontend.'
  );

  assertMatchFast(
    source,
    /const normalizedRecommendation =[\s\S]*getBookingRecommendedActionForState\(recommendation\.state\)[\s\S]*const waitingRecommendationStep =[\s\S]*normalizedRecommendation === "insert_studio"[\s\S]*normalizedRecommendation === "schedule_followup"[\s\S]*normalizedRecommendation === "confirm_external"[\s\S]*normalizedRecommendation === "waiting_customer"/,
    'Förväntade att sekvensstegen kan läsa waiting-customer-arbetslägen som riktiga nästa drag, inte bara rå action från workflow-summaryn.'
  );

  assertMatchFast(
    source,
    /label: "Bekräfta",[\s\S]*state:[\s\S]*hasReservations \|\| waitingRecommendationStep[\s\S]*isRecommended: normalizedRecommendation === "confirm_external" \|\| waitingRecommendationStep/,
    'Förväntade att bokningssekvensens sista steg markeras som aktivt/rekommenderat även när backend säger kundsvar, bevaka eller följ upp i waiting_customer.'
  );

  assertMatchFast(
    source,
    /function buildBookingWaitingActionEmphasis\(readout = \{\}, recommendedAction = ""\)/,
    'Förväntade en helper som låter backendens waiting-läge styra action-hint och knappvikter i öppet case.'
  );

  assertMatchFast(
    source,
    /function buildBookingRecommendedActionPrompt\(readout = \{\}, recommendedAction = ""\)/,
    'Förväntade en helper som låter backendens arbetsläge styra hoppknappens label, title och feedback i öppet case.'
  );

  assertMatchFast(
    source,
    /function buildBookingDecisionFocusCard\(thread, readout = \{\}, stageContext = \{\}, previousSignal = ""\)/,
    'Förväntade en helper som låter decision cards läsa backendens arbetsläge innan de faller tillbaka till generell risk/SLA-kontext.'
  );

  assertMatchFast(
    source,
    /if \(hasSelectedSlots && bookingDom\.actionHint && waitingActionEmphasis\?\.hint\) \{[\s\S]*bookingDom\.actionHint\.textContent = waitingActionEmphasis\.hint;[\s\S]*bookingDom\.actionHint\.dataset\.tone = "attention";/,
    'Förväntade att waiting_customer-urgency får äga action-hinten även när tider redan är valda.'
  );

  assertMatchFast(
    source,
    /if \(waitingActionEmphasis\?\.roles\?\.\[actionKey\]\) \{[\s\S]*button\.dataset\.stageRole = waitingActionEmphasis\.roles\[actionKey\];[\s\S]*\}[\s\S]*if \(waitingActionEmphasis\?\.titles\?\.\[actionKey\]\) \{[\s\S]*button\.title = waitingActionEmphasis\.titles\[actionKey\];/,
    'Förväntade att waiting_customer-arbetsläget kan styra både knappvikt och knapphjälp i bookingytans actionrad.'
  );

  assertMatchFast(
    source,
    /const recommendationPrompt = buildBookingRecommendedActionPrompt\(readout, nextAction\.action\);[\s\S]*bookingDom\.nextActionJump\.dataset\.bookingRecommendationState = normalizeKey\([\s\S]*readout\.recommendedActionState[\s\S]*\)[\s\S]*bookingDom\.nextActionJump\.textContent = nextAction\.action[\s\S]*recommendationPrompt\.label[\s\S]*bookingDom\.nextActionJump\.title = nextAction\.action[\s\S]*recommendationPrompt\.title/,
    'Förväntade att hoppknappen i öppet case använder backendens arbetsläge för label, title och recommendation-state.'
  );

  assertMatchFast(
    source,
    /const recommendationPrompt = buildBookingRecommendedActionPrompt\(readout, recommendedAction\);[\s\S]*setFeedback\([\s\S]*recommendationPrompt\.announce \|\| "Rekommenderad knapp är markerad\. Ingen åtgärd utfördes\."[\s\S]*\)/,
    'Förväntade att markera-rekommenderad-knapp-flödet använder backendens arbetsläge för själva feedbackmeddelandet.'
  );

  assert.ok(
    source.includes('const signalEvent = getBookingWorkflowSignalEvent(readout);') &&
      source.includes(
        'const signalTimeline = getBookingWorkflowSignalTimelineContext(readout, signalEvent);'
      ) &&
      source.includes(
        'const signalProvenance = signalEvent ? getBookingEventProvenanceReadout(signalEvent, readout) : null;'
      ) &&
      source.includes(
        'const signalMessageReadout = signalEvent ? getBookingWorkflowSignalMessageReadout(signalEvent, readout) : null;'
      ) &&
      source.includes('const signalSourceSummary = signalProvenance?.referenceLabel') &&
      source.includes(
        'const signalMomentReadout = getBookingWorkflowSignalMomentReadout(readout);'
      ) &&
      source.includes('const activeRowReadout = getBookingWorkflowActiveRowReadout(readout);') &&
      source.includes('const signalActionCue = getBookingWorkflowSignalActionCue(readout);') &&
      source.includes('const signalCard = signalEvent') &&
      source.includes('label: "Signal"') &&
      source.includes('signalMessageReadout?.value || signalEvent.value') &&
      source.includes('signalTimeline?.label') &&
      source.includes('signalMessageReadout?.meta || signalEvent.meta') &&
      source.includes('signalSourceSummary') &&
      source.includes('signalMomentReadout?.value') &&
      source.includes('activeRowReadout?.value') &&
      source.includes('signalActionCue?.value') &&
      source.includes(
        'const focusCard = buildBookingDecisionFocusCard(thread, readout, stageContext, previousSignal);'
      ) &&
      source.includes('liveSignalCard || focusCard') &&
      source.includes('return dedupeCards([nowCard, focusCard, customerCard, preferenceCard]);'),
    'Förväntade att öppet case-summaryt bär en konkret signalrad i decision grid med samma proveniens, arbetsögonblick, aktiva loggrad och arbetscue som bookingloggen.'
  );

  assertMatchFast(
    source,
    /if \(bookingDom\.decisionSource\) \{[\s\S]*const decisionSource = buildBookingDecisionSourceReadout\(readout\);[\s\S]*activeJourneyLabel[\s\S]*decisionSource\.meta/,
    'Förväntade att beslutskällan behåller sin meta även när journey-label läggs ovanpå i öppet case.'
  );
});

test('telefonbokningsläget lyfter valt slot, extern bekräftelse och audit högre upp i bookingytan', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assert.ok(
    source.includes('function getBookingPhoneWorkflowSummary(readout = {})') &&
      source.includes('function getBookingPhoneLatestActivityReadout(readout = {})') &&
      source.includes('function getBookingPhoneCustomerWaitReadout(readout = {})') &&
      source.includes('function getBookingPhoneStudioReadout(readout = {})') &&
      source.includes('function buildBookingPhoneWorkflowProgressMarkup(phoneWorkflow = {})') &&
      source.includes('1. Kontekst') &&
      source.includes('2. Tid') &&
      source.includes('3. Bekräftelse') &&
      source.includes(
        'const latestEvent = asArray(readout.allEvents || readout.events).at(-1) || null;'
      ) &&
      source.includes('const customerWait = buildBookingCustomerWaitReadout(readout);') &&
      source.includes('normalizedStatus === "waiting_customer"') &&
      source.includes('Boolean(customerWait.action)') &&
      source.includes(
        'const offerEvent = getLatestBookingEvent(readout, ["offer_draft_inserted"]);'
      ) &&
      source.includes('const staleOfferAfterRebook = isBookingOfferStaleAfterRebook(readout);') &&
      source.includes(
        'const offerProvenance = offerEvent ? getBookingEventProvenanceReadout(offerEvent, readout) : null;'
      ) &&
      source.includes(
        'const slotCarry = selectedSlots.slice(0, 3).map((slot) => formatBookingSlot(slot));'
      ) &&
      source.includes('const carrySummary =') &&
      source.includes('const studioActivitySummary = offerEvent') &&
      source.includes('Senaste studiohändelse') &&
      source.includes('Ingen studiohändelse loggad ännu.') &&
      source.includes('Förslaget bär ett spann från') &&
      source.includes('Den här tiden bärs i kundförslaget just nu.') &&
      source.includes('const countLabel =') &&
      source.includes('title: "Förslaget väntar på Svarstudio"') &&
      source.includes('{ label: countLabel, tone: "count" }') &&
      source.includes('{ label: "Ej infogat ännu", tone: "studio" }') &&
      source.includes('{ label: "Föråldrat förslag", tone: "attention" }') &&
      source.includes('slotCarry,') &&
      source.includes('carrySummary,') &&
      source.includes('activitySummary: studioActivitySummary,') &&
      source.includes('action: "insert_studio"') &&
      source.includes(
        'const provenance = getBookingEventProvenanceReadout(latestEvent, readout);'
      ) &&
      source.includes('const eventTitleByType = {') &&
      source.includes('external_confirmation_marked: "Extern bekräftelse markerad"') &&
      source.includes(
        'primaryLabel: isConfirmed ? "Välj ny tid" : selectedSlot ? "Bekräftad i Cliento" : "Boka via telefon"'
      ) &&
      source.includes('secondaryLabel: selectedSlot ? "Välj annan tid" : "Öppna tider"') &&
      source.includes('confirmationTitle') &&
      source.includes('confirmationCopy') &&
      source.includes('nextTitle') &&
      source.includes('nextCopy') &&
      source.includes('selectedAudit') &&
      source.includes('confirmedAudit'),
    'Förväntade en helper som översätter booking-readoutet till ett tydligt telefonbokningsläge med vald tid, extern bekräftelse, guidance och audit.'
  );

  assertMatchFast(
    source,
    /<section class="booking-phone-workflow" data-booking-phone-workflow aria-label="Telefonbokning">[\s\S]*data-booking-phone-title[\s\S]*data-booking-phone-progress[\s\S]*data-booking-phone-slot[\s\S]*data-booking-phone-selected-audit[\s\S]*data-booking-phone-confirmed-audit[\s\S]*data-booking-phone-activity-title[\s\S]*data-booking-phone-activity-meta[\s\S]*data-booking-phone-wait-title[\s\S]*data-booking-phone-wait-meta[\s\S]*data-booking-phone-primary[\s\S]*data-booking-phone-secondary[\s\S]*data-booking-phone-studio-title[\s\S]*data-booking-phone-studio-meta[\s\S]*data-booking-phone-studio-badges[\s\S]*data-booking-phone-studio-slots[\s\S]*data-booking-phone-studio-summary[\s\S]*data-booking-phone-studio-activity[\s\S]*data-booking-phone-confirmation-title[\s\S]*data-booking-phone-confirmation-copy[\s\S]*data-booking-phone-next-title[\s\S]*data-booking-phone-next-copy/,
    'Förväntade att bookingytan renderar ett eget telefonbokningskort nära toppen med stegstatus, slotstatus, extern bekräftelse, senaste bookinghändelse, kundvänteläge, Svarstudio-läge, guidance och audit sammanhållna.'
  );

  assertMatchFast(
    source,
    /const phoneWorkflow = getBookingPhoneWorkflowSummary\(readout\);[\s\S]*bookingDom\.phoneTitle[\s\S]*bookingDom\.phoneState[\s\S]*bookingDom\.phoneProgress[\s\S]*buildBookingPhoneWorkflowProgressMarkup\(phoneWorkflow\)[\s\S]*bookingDom\.phoneSlot[\s\S]*bookingDom\.phoneSelectedAudit[\s\S]*bookingDom\.phoneConfirmedAudit[\s\S]*const phoneActivity = getBookingPhoneLatestActivityReadout\(readout\);[\s\S]*bookingDom\.phoneActivityTitle[\s\S]*bookingDom\.phoneActivityMeta[\s\S]*const phoneWait = getBookingPhoneCustomerWaitReadout\(readout\);[\s\S]*bookingDom\.phoneWaitTitle[\s\S]*bookingDom\.phoneWaitMeta[\s\S]*const phoneStudio = getBookingPhoneStudioReadout\(readout\);[\s\S]*bookingDom\.phoneStudioTitle[\s\S]*bookingDom\.phoneStudioMeta[\s\S]*bookingDom\.phoneStudioBadges[\s\S]*bookingDom\.phoneStudioSlots[\s\S]*bookingDom\.phoneStudioSummary[\s\S]*bookingDom\.phoneStudioActivity[\s\S]*bookingDom\.phoneConfirmationTitle[\s\S]*bookingDom\.phoneConfirmationCopy[\s\S]*bookingDom\.phoneNextTitle[\s\S]*bookingDom\.phoneNextCopy[\s\S]*bookingDom\.phonePrimary[\s\S]*bookingDom\.phoneSecondary/,
    'Förväntade att rendern faktiskt hydratiserar telefonbokningskortet från booking-readoutet, inklusive en tydlig progressionsrad, en kompakt senaste-händelse-yta, ett synligt kundvänteläge och ett eget Svarstudio-läge i stället för att lämna läget statiskt.'
  );

  assertMatchFast(
    source,
    /if \(action === "phone_booking"\) \{[\s\S]*state\.booking\.phoneMode = "phone";[\s\S]*loadBookingRefData\(\{ force: true \}\)|loadBookingRefData\(\{ force: true \}\)|loadBookingRefData\(\{ force: true \}\)|loadBookingRefData\(\{ force: true \}\)/,
    'Förväntade att Boka via telefon öppnar ett uttryckligt telefonbokningsläge och säkrar referensdata innan tiderna används.'
  );

  assertMatchFast(
    source,
    /if \(action === "confirm_external"\) \{[\s\S]*state\.booking\.phoneMode = "phone";[\s\S]*type: "external_confirmation_marked"[\s\S]*label: "Bekräftad i Cliento"/,
    'Förväntade att extern bekräftelse i telefonflödet också lämnar ett tydligt auditspår i bokningsloggen.'
  );

  assert.ok(
    source.includes(
      'function getBookingSlotContextSummary(bookingDom = getBookingDom(), readout = {})'
    ) &&
      source.includes('dateLabel') &&
      source.includes('resourceLabel') &&
      source.includes('serviceLabel') &&
      source.includes(
        'isReady: Boolean(request.fromDate && request.toDate && request.resIds && request.srvIds)'
      ) &&
      source.includes('function renderBookingPhoneSlotEntry(bookingDom, readout = {})') &&
      source.includes(
        'rankBookingAvailableSlots(state.booking.availableSlots, readout).slice(0, 3)'
      ) &&
      source.includes('renderBookingRefSelect(') &&
      source.includes('bookingDom.phoneResourceSelect') &&
      source.includes('bookingDom.phoneServiceSelect') &&
      source.includes('bookingDom.phoneFrom') &&
      source.includes('bookingDom.phoneTo') &&
      source.includes('bookingDom.phoneSlotEntryWhy') &&
      source.includes('bookingDom.phoneSlotEntrySelection') &&
      source.includes('bookingDom.phoneSlotEntrySelectionTitle') &&
      source.includes('bookingDom.phoneSlotEntrySelectionDetail') &&
      source.includes('bookingDom.phoneSlotEntrySelectionMeta') &&
      source.includes('renderBookingPhonePostConfirmationState(bookingDom, readout)') &&
      source.includes('bookingDom.phonePostConfirmation') &&
      source.includes('bookingDom.phonePostConfirmationTitle') &&
      source.includes('bookingDom.phonePostConfirmationCopy') &&
      source.includes('bookingDom.phonePostConfirmationAction') &&
      source.includes('bookingDom.phoneActivityCard') &&
      source.includes('bookingDom.phoneActivityTitle') &&
      source.includes('bookingDom.phoneActivityMeta') &&
      source.includes('bookingDom.phoneWaitCard') &&
      source.includes('bookingDom.phoneWaitTitle') &&
      source.includes('bookingDom.phoneWaitMeta') &&
      source.includes('bookingDom.phoneWaitAction') &&
      source.includes('bookingDom.phoneStudio') &&
      source.includes('bookingDom.phoneStudioTitle') &&
      source.includes('bookingDom.phoneStudioMeta') &&
      source.includes('bookingDom.phoneStudioBadges') &&
      source.includes('bookingDom.phoneStudioSlots') &&
      source.includes('bookingDom.phoneStudioSummary') &&
      source.includes('bookingDom.phoneStudioAction') &&
      source.includes('Efter bekräftelse') &&
      source.includes('Den här tiden gäller nu') &&
      source.includes('Tiden är säkrad externt') &&
      source.includes('topSlot?.recommendation?.rankLabel || "Bäst just nu"') &&
      source.includes('getBookingSlotTimeBand(slot)') &&
      source.includes('bookingDom.phoneSlotEntryState') &&
      source.includes('bookingDom.phoneSlotEntryContext') &&
      source.includes('bookingDom.phoneSlotEntryList'),
    'Förväntade en särskild helper som lyfter datumspann, behandlare, behandling och tre snabba tider direkt in i telefonkortet, inklusive inline-kontroller, tydligt valt-slot-läge och varför den starkaste tiden ligger först.'
  );

  assertMatchFast(
    source,
    /data-booking-phone-activity-card[\s\S]*data-booking-phone-activity-title[\s\S]*data-booking-phone-activity-meta[\s\S]*data-booking-phone-wait-card[\s\S]*data-booking-phone-wait-title[\s\S]*data-booking-phone-wait-meta[\s\S]*data-booking-phone-wait-action[\s\S]*data-booking-phone-studio-title[\s\S]*data-booking-phone-studio-meta[\s\S]*data-booking-phone-studio-badges[\s\S]*data-booking-phone-studio-slots[\s\S]*data-booking-phone-studio-summary[\s\S]*data-booking-phone-studio-activity[\s\S]*data-booking-phone-studio-action[\s\S]*data-booking-phone-slot-entry[\s\S]*Snabbval i samtalet[\s\S]*data-booking-phone-slot-entry-meta[\s\S]*data-booking-phone-slot-entry-state[\s\S]*data-booking-phone-slot-entry-controls[\s\S]*data-booking-phone-slot-from[\s\S]*data-booking-phone-slot-to[\s\S]*data-booking-phone-slot-resource-select[\s\S]*data-booking-phone-slot-service-select[\s\S]*data-booking-phone-slot-context[\s\S]*data-booking-phone-slot-entry-why[\s\S]*data-booking-phone-slot-entry-list[\s\S]*Justera urval[\s\S]*data-booking-phone-slot-selection[\s\S]*data-booking-phone-slot-selection-title[\s\S]*data-booking-phone-slot-selection-detail[\s\S]*data-booking-phone-slot-selection-meta[\s\S]*data-booking-phone-post-confirmation[\s\S]*data-booking-phone-post-confirmation-title[\s\S]*data-booking-phone-post-confirmation-copy[\s\S]*data-booking-phone-post-confirmation-action/,
    'Förväntade att telefonkortet renderar en egen senaste-händelse-yta, ett synligt kundvänteläge med direkt nästa-knapp, ett eget Svarstudio-läge, en snabbyta för slotval, inline-kontroller för bokningskontext, ett tydligt bäst-just-nu-lager, en egen vald-slot-yta och ett efter-bekräftelse-läge med direkt nästa-knapp så att operatören slipper gå hela vägen ner till avancerat läge först.'
  );

  assertMatchFast(
    source,
    /renderBookingRefDataControls\(bookingDom\);[\s\S]*renderAvailableBookingSlots\(bookingDom, stageMicrocopy, readout\);[\s\S]*renderBookingPhoneSlotEntry\(bookingDom, readout\);/,
    'Förväntade att telefonkortets snabblista hydratiseras efter referensdata och tillgängliga tider, så den alltid speglar det aktuella bookingurvalet.'
  );

  assertMatchFast(
    source,
    /document\.addEventListener\("change", \(event\) => \{[\s\S]*\[data-booking-phone-slot-resource-select], \[data-booking-phone-slot-service-select][\s\S]*bookingDom\.resourceSelect\.value = bookingDom\.phoneResourceSelect\.value[\s\S]*bookingDom\.serviceSelect\.value = bookingDom\.phoneServiceSelect\.value[\s\S]*captureBookingSlotRequestDraft\(bookingDom\)/,
    'Förväntade att telefonkortets behandlar- och behandlingsval synkar tillbaka till den riktiga bokningsdraften.'
  );

  assertMatchFast(
    source,
    /document\.addEventListener\("input", \(event\) => \{[\s\S]*\[data-booking-phone-slot-from], \[data-booking-phone-slot-to][\s\S]*bookingDom\.slotFrom\.value = bookingDom\.phoneFrom\.value[\s\S]*bookingDom\.slotTo\.value = bookingDom\.phoneTo\.value[\s\S]*captureBookingSlotRequestDraft\(bookingDom\)/,
    'Förväntade att telefonkortets datumspann styr samma slot-draft som det avancerade bokningsläget använder.'
  );
});

test('kundlänken kan inferera booking default landing utan booking=1 när booking redan är den tydliga arbetsytan', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');

  assertMatchFast(
    source,
    /function shouldInferBookingWorkspaceFromPortalCustomer\(\) \{[\s\S]*portalCustomerKey[\s\S]*resolveShellView\(state\.ui\.view\) !== "conversations"[\s\S]*return true;[\s\S]*\}/,
    'Förväntade en särskild inferensregel som gör kundlåsta conversations-länkar booking-first utan att kräva booking=1 i URL:en.'
  );

  assertMatchFast(
    source,
    /function scheduleBookingSurfaceFromUrl\(\) \{[\s\S]*const wantsBookingSurface = urlWantsBookingWorkspace\(\);[\s\S]*const wantsInferredBookingSurface =[\s\S]*shouldInferBookingWorkspaceFromPortalCustomer\(\);[\s\S]*if \(!wantsBookingSurface && !wantsInferredBookingSurface\) return;[\s\S]*Bokningsytan öppnades direkt för kundens aktiva booking-case\./,
    'Förväntade att direktlänksrutinen även kan öppna bookingytan från en ren kundlänk när booking redan är den tydliga första arbetsytan.'
  );
});
