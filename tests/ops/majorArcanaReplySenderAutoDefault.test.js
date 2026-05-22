const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app.js'
);

const DOM_COMPOSITION_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-dom-live-composition.js'
);

const INDEX_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'index.html'
);

const OVERLAY_RENDERERS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'runtime-overlay-renderers.js'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(startIndex, -1, `Kunde inte hitta ${functionName} i källfilen.`);

  let parameterDepth = 0;
  let bodyStart = -1;
  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parameterDepth += 1;
    if (character === ')') parameterDepth -= 1;
    if (character === '{' && parameterDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert.notEqual(bodyStart, -1, `Kunde inte hitta funktionskroppen för ${functionName}.`);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === '{') depth += 1;
    if (character === '}') depth -= 1;
    if (depth === 0) {
      return source.slice(startIndex, index + 1);
    }
  }

  throw new Error(`Kunde inte extrahera ${functionName} från källfilen.`);
}

test('reply sender auto-default härleds från thread mailbox i stället för global Contact-default', () => {
  const source = fs.readFileSync(APP_PATH, 'utf8');
  const identityTokensSource = extractFunctionSource(
    source,
    'getStudioSignatureProfileIdentityTokens'
  );
  const availableProfilesSource = extractFunctionSource(source, 'getStudioAvailableSignatureProfiles');
  const resolveSource = extractFunctionSource(source, 'resolveStudioSignatureProfile');
  const profileSource = extractFunctionSource(source, 'getStudioSignatureProfile');
  const replyDefaultSource = extractFunctionSource(source, 'getStudioReplyDefaultSignatureProfile');
  const operatorProfileSource = extractFunctionSource(source, 'getStudioOperatorSignatureProfile');
  const composeStateSource = extractFunctionSource(source, 'createComposeStudioState');

  const buildHelpers = new Function(
    'state',
    'STUDIO_SIGNATURE_PROFILES',
    'buildStudioSignatureProfileFromMailbox',
    'getRuntimeMailboxCapability',
    'getStudioSourceMailboxId',
    'normalizeKey',
    'normalizeMailboxId',
    'asArray',
    'asText',
    'CCO_DEFAULT_SIGNATURE_PROFILE',
    'getStudioDefaultSenderMailboxId',
    `${identityTokensSource}
${availableProfilesSource}
${resolveSource}
${profileSource}
${operatorProfileSource}
${replyDefaultSource}
${composeStateSource}
return {
  getStudioSignatureProfileIdentityTokens,
  getStudioAvailableSignatureProfiles,
  resolveStudioSignatureProfile,
  getStudioOperatorSignatureProfile,
  getStudioSignatureProfile,
  getStudioReplyDefaultSignatureProfile,
  createComposeStudioState,
};`
  );

  const STUDIO_SIGNATURE_PROFILES = [
    {
      id: 'fazli',
      aliases: ['fazli'],
      email: 'fazli@hairtpclinic.com',
    },
    {
      id: 'egzona',
      aliases: ['egzona'],
      email: 'egzona@hairtpclinic.com',
    },
  ];

  const state = {
    runtime: {
      defaultSignatureProfile: 'fazli',
    },
    settingsRuntime: {
      profileEmail: '',
    },
    customMailboxes: [],
  };

  const normalizeKey = (value) => String(value || '').trim().toLowerCase();
  const normalizeMailboxId = (value) => normalizeKey(value);
  const asArray = (value) => (Array.isArray(value) ? value : []);
  const asText = (value, fallback = '') => {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  };

  const helpers = buildHelpers(
    state,
    STUDIO_SIGNATURE_PROFILES,
    () => null,
    (mailboxId) => {
      if (normalizeMailboxId(mailboxId) === 'fazli@hairtpclinic.com') {
        return { signatureProfileId: 'fazli' };
      }
      return null;
    },
    (thread) => normalizeMailboxId(thread?.mailboxAddress || ''),
    normalizeKey,
    normalizeMailboxId,
    asArray,
    asText,
    'fazli',
    (thread, { composeMode = false } = {}) =>
      composeMode ? 'contact@hairtpclinic.com' : normalizeMailboxId(thread?.mailboxAddress || '')
  );

  assert.equal(
    helpers.getStudioReplyDefaultSignatureProfile({
      mailboxAddress: 'kons@hairtpclinic.com',
    }).id,
    'fazli',
    'Reply default ska falla tillbaka till godkänd Fazli-signatur när ingen personspecifik profil finns.'
  );

  assert.equal(
    helpers.getStudioReplyDefaultSignatureProfile({
      mailboxAddress: 'fazli@hairtpclinic.com',
    }).id,
    'fazli',
    'Reply default ska kunna följa mailboxens capability-signatur när sådan finns.'
  );

  state.settingsRuntime.profileEmail = 'fazli@hairtpclinic.com';
  assert.equal(
    helpers.getStudioReplyDefaultSignatureProfile({
      mailboxAddress: 'contact@hairtpclinic.com',
    }).id,
    'fazli',
    'Reply default ska kunna följa operatorns personsignatur även när mailboxen är en shared routingmailbox.'
  );

  assert.equal(
    helpers.getStudioReplyDefaultSignatureProfile({
      mailboxAddress: 'kons@hairtpclinic.com',
    }).id,
    'fazli',
    'Reply default ska kunna följa operatorns personsignatur även när mailboxen är en shared routingmailbox.'
  );

  assert.equal(
    helpers.createComposeStudioState().selectedSignatureId,
    'fazli',
    'Compose default ska kunna följa operatorns personsignatur när den finns i studio-profilen.'
  );
});

test('reply-studion håller Från och Signatur separata utanför truth-driven wave 1', () => {
  const appSource = fs.readFileSync(APP_PATH, 'utf8');
  const domSource = fs.readFileSync(DOM_COMPOSITION_PATH, 'utf8');

  assert.match(
    appSource,
    /const operatorSignatureProfile = getStudioOperatorSignatureProfile\(\);[\s\S]*if \(operatorSignatureProfile\) return operatorSignatureProfile;[\s\S]*return mailboxSignatureProfile;/,
    'Reply-defaulten ska nu bara välja mellan operatorns godkända personsignatur och godkänd mailbox-fallback.'
  );
  assert.match(
    appSource,
    /const operatorSignatureProfile = getStudioOperatorSignatureProfile\(\);[\s\S]*const selectedSignature = \(\s*operatorSignatureProfile \|\|[\s\S]*getStudioSignatureProfile\(state\.runtime\.defaultSignatureProfile\)\s*\)\.id;/,
    'Compose default ska kunna föredra operatorns personsignatur utan att ändra Från-mailboxen.'
  );
  assert.match(
    appSource,
    /const selectedSignature = getStudioReplyDefaultSignatureProfile\(thread\)\.id;/,
    'createStudioState ska fortsatt härleda reply-signaturen från den öppnade trådens mailbox.'
  );
  assert.match(
    appSource,
    /const senderMailboxId = getStudioDefaultSenderMailboxId\(thread\);[\s\S]*composeMailboxId: senderMailboxId,/,
    'Reply-state ska bära mailboxens sender-default separat från den valda signaturen.'
  );
  assert.match(
    appSource,
    /replyContextThreadId: asText\(thread\?\.id\),/,
    'Reply-state ska bära en separat replyContextThreadId så en gammal signaturstate inte kan läcka in när studion öppnas på ny tråd.'
  );
  assert.match(
    appSource,
    /resolveStudioSignatureProfile\(state\.studio\.selectedSignatureId\) \|\|\s*getStudioReplyDefaultSignatureProfile\(thread\)/,
    'ensureStudioState ska falla tillbaka till mailboxspecifik reply-default i stället för global Contact-default.'
  );
  assert.match(
    appSource,
    /const hasReplyContextMismatch =[\s\S]*replyContextThreadId[\s\S]*!runtimeConversationIdsMatch\(replyContextThreadId, thread\.id\);/,
    'ensureStudioState ska upptäcka när reply-studions signaturstate tillhör en gammal tråd.'
  );
  assert.match(
    appSource,
    /state\.studio\.composeMailboxId = canonicalizeRuntimeMailboxId\([\s\S]*state\.studio\.composeMailboxId \|\| getStudioDefaultSenderMailboxId\(thread\)/,
    'ensureStudioState ska normalisera sender-mailboxen utan att synka om den från signaturvalet.'
  );
  assert.match(
    appSource,
    /function getStudioSignatureOverride\(signatureId = "", senderMailboxId = ""\)/,
    'app.js ska kunna bygga en explicit signatur-override för mailbox-admin-profiler när signaturen väljs separat från Från-mailboxen.'
  );
  assert.match(
    appSource,
    /email:\s*normalizeMailboxId\(signatureProfile\.email \|\| signatureProfile\.senderMailboxId\)/,
    'Mailbox-admin-signaturer ska bära sin egen signerar-e-post i override-objektet så personlig signatur inte faller tillbaka till avsändarmailboxens mejlrad.'
  );
  assert.match(
    domSource,
    /const nextMailboxId = canonicalizeRuntimeMailboxId\(event\.target\.value\);[\s\S]*studioState\.composeMailboxId = nextMailboxId;/,
    'Från-väljaren i studion ska uppdatera sender-mailboxen direkt i reply-läget.'
  );
  assert.match(
    domSource,
    /const signatureButton =[\s\S]*closest\("\[data-studio-signature\]"\)[\s\S]*studioState\.selectedSignatureId = signatureProfile\.id;/,
    'Reply-signaturklick ska fortsätta byta vald signatur utan att ta över sender-mailboxen.'
  );
  assert.doesNotMatch(
    domSource,
    /composeMailboxId = getStudioSignatureProfile\(signatureId\)\.email/,
    'Signaturvalet ska inte längre tvinga sender-mailboxen till signaturens egen e-post.'
  );
  assert.doesNotMatch(
    domSource,
    /composeMailboxId = getStudioSenderMailboxId\(/,
    'DOM-bindningen ska inte längre återkoppla signaturvalet till sender-mailboxen i reply-läge.'
  );
});

test('reply-studion håller Från/Signatur-sammanfattningen i signatursektionen i stället för i editorfoten', () => {
  const indexSource = fs.readFileSync(INDEX_PATH, 'utf8');

  assert.match(
    indexSource,
    /<div class="studio-editor-meta" data-studio-editor-meta>\s*<span data-studio-editor-wordcount>36 ord<\/span>\s*<\/div>/,
    'Editorfoten ska nu hållas ren och bara bära ordantalet i stället för Från\/Signatur-sammanfattningen.'
  );

  assert.match(
    indexSource,
    /studio-signature-summary[\s\S]*data-studio-editor-summary/,
    'Från/Signatur-sammanfattningen ska ligga i signatursektionen där den hör hemma.'
  );
});

test('reply-studions sammanfattning visar Från, Signatur och Nästa steg i samma skrivkontext', () => {
  const overlaySource = fs.readFileSync(OVERLAY_RENDERERS_PATH, 'utf8');

  assert.match(
    overlaySource,
    /const nextStepLabel = isComposeMode[\s\S]*replySummaryParts\.push\(`Nästa steg: \$\{nextStepLabel\}`\);[\s\S]*studioEditorSummary\.textContent = isComposeMode/,
    'Reply-sammanfattningen ska bära nästa steg ihop med Från och Signatur i samma skrivrad.'
  );

  assert.match(
    overlaySource,
    /replySummaryParts\.join\(" · "\)/,
    'Reply-sammanfattningen ska hållas som en sammanhållen, läsbar rad i skrivläget.'
  );
});

test('reply completion stänger studion efter send och uppdaterar tråden till invänta svar', () => {
  const asyncSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'runtime-async-orchestration.js'
    ),
    'utf8'
  );
  const threadOpsSource = fs.readFileSync(
    path.join(
      __dirname,
      '..',
      '..',
      'public',
      'major-arcana-preview',
      'runtime-thread-ops.js'
    ),
    'utf8'
  );

  assert.match(
    asyncSource,
    /patchStudioThreadAfterSend\(thread,\s*studioState\.draftBody,\s*sendResult\);[\s\S]*setStudioFeedback\([\s\S]*"Svar skickat från nya CCO\."[\s\S]*setStudioOpen\(false\);[\s\S]*setContextCollapsed\(false\);/,
    'Reply completion ska fortsätta uppdatera tråden, ge feedback och stänga studion innan användaren återvänder till köytan.'
  );

  assert.match(
    threadOpsSource,
    /current\.waitingLabel = "Inväntar svar";[\s\S]*current\.statusLabel = "Besvarad";[\s\S]*current\.nextActionLabel = "Invänta svar";[\s\S]*current\.nextActionSummary = nextActionSummary;/,
    'Efter send ska tråden tydligt markeras som besvarad och peka mot nästa vänteläge i samma arbetsloop.'
  );
});
