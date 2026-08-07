'use strict';

/**
 * ORD-99 — bilagor/signaturbilder ska synas även när meddelandekroppen är tom.
 *
 * Mätning i prod (2026-08-07, window.__ccoOpenFlowDiagnostics.bodyMetrics)
 * visade meddelanden med attachmentCount: 5 men bodyHtmlLength: 0 — servern
 * skickar bilagemetadata, men det finns ingen html-kropp att bädda in dem i.
 *
 * `renderMessageAttachments` filtrerade bort varje bilaga som server-flaggan
 * `isInline` pekade ut som inbäddad — även när det inte fanns någon html att
 * bädda in den i. Följden: alla fem bilagor försvann tyst. Inte inbäddade
 * (ingen html), inte listade som chip (filtrerade som "inline").
 *
 * Testet extraherar de RIKTIGA funktionerna ur källan (ingen stub av
 * renderingslogiken) och kör dem mot en meddelandeform identisk med det
 * uppmätta läget: tom bodyHtml, fem bilagor, en av dem isInline: true.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SHELL_PATH = path.join(
  __dirname,
  '..',
  '..',
  'public',
  'major-arcana-preview',
  'app',
  'cco-conversations-v2-shell.js'
);

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const startIndex = source.indexOf(signature);
  assert.notEqual(
    startIndex,
    -1,
    `Kunde inte hitta ${functionName} i cco-conversations-v2-shell.js.`
  );

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
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(startIndex, index + 1);
    }
  }
  throw new Error(`Kunde inte hitta slutet på ${functionName}.`);
}

function buildRenderer(source) {
  const names = [
    'text',
    'esc',
    'messageBodyHtml',
    'attachmentCandidates',
    'attachmentName',
    'attachmentType',
    'attachmentIsImage',
    'attachmentUrl',
    'attachmentIsInline',
    'renderMessageAttachments',
  ];
  const combined = names.map((name) => extractFunctionSource(source, name)).join('\n');
  return new Function(`${combined}; return renderMessageAttachments;`)();
}

test('renderMessageAttachments visar bilagor som chips när bodyHtml saknas, aven om de ar flaggade isInline', () => {
  const source = fs.readFileSync(SHELL_PATH, 'utf8');
  const renderMessageAttachments = buildRenderer(source);

  const message = {
    messageId: 'msg-1',
    graphMessageId: 'msg-1',
    mailboxId: 'info@hairtpclinic.com',
    primaryBody: { html: '', text: 'kort text' },
    attachments: [
      {
        id: 'att-1',
        name: 'profilfoto.png',
        contentType: 'image/png',
        isInline: true,
        contentId: 'sig-photo',
        openUrl: '/api/v1/cco/runtime/mail-asset/content?attachmentId=att-1',
      },
      {
        id: 'att-2',
        name: 'foretagslogotyp.png',
        contentType: 'image/png',
        isInline: true,
        contentId: 'sig-logo',
        openUrl: '/api/v1/cco/runtime/mail-asset/content?attachmentId=att-2',
      },
      {
        id: 'att-3',
        name: 'kvitto.pdf',
        contentType: 'application/pdf',
        isInline: false,
        openUrl: '/api/v1/cco/runtime/mail-asset/content?attachmentId=att-3',
      },
    ],
  };

  const html = renderMessageAttachments(message);

  assert.match(
    html,
    /profilfoto\.png/,
    'inline-flaggad signaturbild ska synas som chip utan html-kropp'
  );
  assert.match(
    html,
    /foretagslogotyp\.png/,
    'inline-flaggad logotyp ska synas som chip utan html-kropp'
  );
  assert.match(html, /kvitto\.pdf/, 'vanlig fil-bilaga ska fortfarande synas');
  assert.equal(
    (html.match(/data-v2-attachment-index="/g) || []).length,
    3,
    'alla tre bilagor ska renderas, ingen tapp'
  );
});

test('renderMessageAttachments doljer fortfarande genuint inbaddade bilagor NAR html finns och refererar dem', () => {
  const source = fs.readFileSync(SHELL_PATH, 'utf8');
  const renderMessageAttachments = buildRenderer(source);

  const message = {
    messageId: 'msg-2',
    graphMessageId: 'msg-2',
    mailboxId: 'info@hairtpclinic.com',
    primaryBody: {
      html: '<p>Hej</p><img src="cid:sig-photo">',
      text: 'Hej',
    },
    attachments: [
      {
        id: 'att-1',
        name: 'profilfoto.png',
        contentType: 'image/png',
        isInline: true,
        contentId: 'sig-photo',
        openUrl: '/api/v1/cco/runtime/mail-asset/content?attachmentId=att-1',
      },
      {
        id: 'att-3',
        name: 'kvitto.pdf',
        contentType: 'application/pdf',
        isInline: false,
        openUrl: '/api/v1/cco/runtime/mail-asset/content?attachmentId=att-3',
      },
    ],
  };

  const html = renderMessageAttachments(message);

  // Bevisar att beteendet för det NORMALA fallet (rik html som faktiskt
  // refererar bilagan via cid:) är oförändrat — det är bara "html saknas
  // helt"-fallet som nu visar chips. Regressionsskydd mot att guarden blir
  // för bred och börjar dubbelrendera genuint inbäddade bilder som chips.
  assert.doesNotMatch(
    html,
    /profilfoto\.png/,
    'genuint cid-refererad inline-bild ska INTE dubbelrenderas som chip'
  );
  assert.match(html, /kvitto\.pdf/, 'icke-inline bilaga ska fortfarande synas som chip');
});
