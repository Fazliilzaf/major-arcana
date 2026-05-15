const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCanonicalMailDocument, extractTextFromHtml } = require('../../src/ops/ccoMailDocument');

test('extractTextFromHtml normaliserar enkel mail-html till lasbar text', () => {
  const text = extractTextFromHtml(
    '<div>Hej<br><strong>Exona</strong></div><div>Med vänlig hälsning<br>Vincent</div>'
  );

  assert.match(text, /Hej/);
  assert.match(text, /Exona/);
  assert.match(text, /Med vänlig hälsning/);
  assert.match(text, /Vincent/);
});

test('buildCanonicalMailDocument bygger ett phase_2 mailDocument med canonical asset layer', () => {
  const document = buildCanonicalMailDocument({
    messageId: 'msg-1',
    conversationId: 'conv-1',
    mailboxId: 'contact@hairtpclinic.com',
    mailboxAddress: 'contact@hairtpclinic.com',
    userPrincipalName: 'contact@hairtpclinic.com',
    subject: 'Ombokning',
    direction: 'inbound',
    sentAt: '2026-04-08T09:00:00.000Z',
    bodyPreview: 'Kort preview',
    bodyHtml:
      '<table><tr><td>Hej Exona</td></tr><tr><td>Med vänlig hälsning<br />Vincent</td></tr></table>',
    senderEmail: 'vincent@example.com',
    senderName: 'Vincent',
    recipients: ['contact@hairtpclinic.com'],
    replyToRecipients: ['vincent@example.com'],
    hasAttachments: true,
    attachments: [
      {
        id: 'att-1',
        name: 'logo.png',
        contentType: 'image/png',
        contentId: 'logo-1',
        isInline: true,
        size: 1280,
        contentBytesAvailable: true,
      },
      {
        id: 'att-2',
        name: 'price-list.pdf',
        contentType: 'application/pdf',
        isInline: false,
        size: 20480,
      },
    ],
    mime: {
      version: 'phase_b',
      kind: 'mail_mime_metadata',
      source: 'graph_message_mime',
      fetchState: 'fetched',
      available: true,
      mimeBacked: true,
      contentType: 'message/rfc822',
      triggerReasons: ['tabular_html', 'inline_cid_reference'],
      sizeBytes: 4096,
      signals: {
        hasMimeVersion: true,
        hasMultipart: true,
        hasTextHtmlPart: true,
        hasTextPlainPart: true,
        hasInlineCidReferences: true,
        hasInlineDisposition: true,
        hasAttachmentDisposition: false,
      },
      parsed: {
        preferredBodyKind: 'html',
        body: {
          preferredHtml:
            '<table><tr><td>Hej Exona</td></tr><tr><td><img src="cid:logo-1" alt="Logo" /></td></tr><tr><td>Med vänlig hälsning<br />Vincent</td></tr></table>',
          preferredText: 'Hej Exona\n\nMed vänlig hälsning\nVincent',
          htmlPartId: '1.1',
          textPartId: '1.2',
        },
        assets: {
          inlineAssets: [
            {
              partId: '1.3',
              contentType: 'image/png',
              disposition: 'inline',
              filename: 'logo.png',
              contentId: 'logo-1',
              transferEncoding: 'base64',
              decodedSizeBytes: 1280,
              referencedInPreferredHtml: true,
              sourceType: 'mime_part_inline',
            },
          ],
          attachments: [],
          htmlCidReferences: ['logo-1'],
        },
        diagnostics: {
          partCount: 3,
          htmlPartCount: 1,
          textPartCount: 1,
          inlineAssetCount: 1,
          attachmentCount: 0,
        },
      },
    },
  }, { sourceStore: 'mailbox_truth_store' });

  assert.equal(document.version, 'phase_2');
  assert.equal(document.kind, 'mail_document');
  assert.equal(document.sourceStore, 'mailbox_truth_store');
  assert.equal(document.messageId, 'msg-1');
  assert.equal(document.primaryBodyHtml.includes('<table>'), true);
  assert.match(document.primaryBodyText, /Hej Exona/);
  assert.equal(document.from.email, 'vincent@example.com');
  assert.equal(document.to[0].email, 'contact@hairtpclinic.com');
  assert.equal(document.replyTo[0].email, 'vincent@example.com');
  assert.equal(document.hasAttachments, true);
  assert.equal(document.assets.length, 2);
  assert.equal(document.attachments.length, 2);
  assert.equal(document.inlineAssets.length, 1);
  assert.equal(document.assetSummary.assetCount, 2);
  assert.equal(document.assetSummary.attachmentCount, 2);
  assert.deepEqual(document.assetSummary.familyCounts, {
    attachment: 1,
    inline: 1,
    external: 0,
  });
  assert.equal(document.assetSummary.downloadableCount, 2);
  assert.equal(
    document.assets.some((asset) => asset.assetId === 'att-1' && asset.family === 'inline'),
    true
  );
  assert.equal(
    document.assets.some((asset) => asset.assetId === 'att-2' && asset.family === 'attachment'),
    true
  );
  assert.equal(document.inlineAssets[0].render.state, 'attachment_content_available');
  assert.equal(document.inlineAssets[0].download.available, true);
  assert.ok(document.assetRegistry['att-1']);
  assert.equal(document.sourceDepth, 'mime');
  assert.equal(document.mimeAvailable, true);
  assert.equal(document.mimeBacked, true);
  assert.equal(document.mime.contentType, 'message/rfc822');
  assert.equal(document.mime.parsed.preferredBodyKind, 'html');
  assert.equal(document.fidelity.mimePreferredBodyKind, 'html');
  assert.equal(document.fidelity.bodyDepth, 'html');
  assert.equal(document.fidelity.sourceDepth, 'mime');
  assert.equal(document.fidelity.hasStructuredHtml, true);
  assert.equal(document.fidelity.hasRenderableInlineAssets, true);
  assert.equal(document.fidelity.mimeAvailable, true);
});

test('buildCanonicalMailDocument faller tillbaka till previewtext nar html saknas', () => {
  const document = buildCanonicalMailDocument({
    messageId: 'msg-2',
    subject: 'Kort mail',
    direction: 'outbound',
    bodyPreview: 'Vi kan erbjuda fredag.',
    senderEmail: 'contact@hairtpclinic.com',
    recipients: ['patient@example.com'],
  });

  assert.equal(document.primaryBodyHtml, null);
  assert.equal(document.primaryBodyText, 'Vi kan erbjuda fredag.');
  assert.equal(document.previewText, 'Vi kan erbjuda fredag.');
  assert.equal(document.fidelity.bodyDepth, 'text');
});

test('buildCanonicalMailDocument bygger inline assets fran bodyHtml-referenser utan attachment metadata', () => {
  const document = buildCanonicalMailDocument(
    {
      messageId: 'msg-3',
      subject: 'Extern grafisk footer',
      bodyHtml:
        '<div><img src="https://cdn.example.com/logo.png" alt="Clinic logo" /><img src="data:image/png;base64,QUJD" alt="Badge" /></div>',
      bodyPreview: 'Extern logo',
    },
    { sourceStore: 'graph_runtime_fallback' }
  );

  assert.equal(document.version, 'phase_2');
  assert.equal(document.assets.length, 2);
  assert.equal(document.inlineAssets.length, 2);
  assert.deepEqual(document.assetSummary.familyCounts, {
    attachment: 0,
    inline: 1,
    external: 1,
  });
  assert.equal(document.assetSummary.renderableInlineCount, 2);
  assert.equal(
    document.assets.some(
      (asset) => asset.render.state === 'external_https' && asset.family === 'external'
    ),
    true
  );
  assert.equal(
    document.assets.some(
      (asset) => asset.render.state === 'embedded_in_body_html' && asset.family === 'inline'
    ),
    true
  );
});

test('buildCanonicalMailDocument skiljer deklarerad attachment-flagga från faktisk attachment-metadata', () => {
  const document = buildCanonicalMailDocument(
    {
      messageId: 'msg-legacy-attachment-flag',
      subject: 'Bifogad order nummer 273699',
      hasAttachments: true,
      bodyHtml:
        '<div>Hej<br><img src="cid:image001.jpg@01DCBA9E.EEC6D740" alt="Beskrivning: Hettich, Grön logo" /></div>',
      bodyPreview: 'Hej',
    },
    { sourceStore: 'mailbox_truth_store' }
  );

  assert.equal(document.declaredHasAttachments, true);
  assert.equal(document.hasAttachments, false);
  assert.equal(document.attachments.length, 0);
  assert.equal(document.assetSummary.metadataAttachmentCount, 0);
  assert.equal(document.assetSummary.declaredHasAttachments, true);
  assert.equal(document.assetSummary.declaredHasAttachmentsWithoutMetadata, true);
  assert.deepEqual(document.assetSummary.familyCounts, {
    attachment: 0,
    inline: 1,
    external: 0,
  });
});

test('buildCanonicalMailDocument foredrar MIME-backed body och asset metadata nar det ar rikare an message body', () => {
  const document = buildCanonicalMailDocument(
    {
      messageId: 'msg-4',
      subject: 'Bokningsbekräftelse',
      bodyHtml: '<div>Bokning bekräftad</div>',
      bodyPreview: 'Bokning bekräftad',
      mime: {
        version: 'phase_b',
        kind: 'mail_mime_metadata',
        source: 'graph_message_mime',
        fetchState: 'fetched',
        available: true,
        mimeBacked: true,
        contentType: 'message/rfc822',
        triggerReasons: ['tabular_html', 'html_images', 'attachment_backed_html'],
        sizeBytes: 8192,
        signals: {
          hasMimeVersion: true,
          hasMultipart: true,
          hasTextHtmlPart: true,
          hasTextPlainPart: true,
          hasInlineCidReferences: true,
          hasInlineDisposition: true,
          hasAttachmentDisposition: false,
        },
        parsed: {
          preferredBodyKind: 'html',
          body: {
            preferredHtml:
              '<table><tr><td><img src="cid:booking-logo@arcana" alt="Logo" /></td><td>Bokningsbekräftelse<br />Fredag 10:00</td></tr></table>',
            preferredText: 'Bokningsbekräftelse\nFredag 10:00',
            htmlPartId: '1.1',
            textPartId: '1.2',
          },
          assets: {
            inlineAssets: [
              {
                partId: '1.3',
                contentType: 'image/png',
                disposition: 'inline',
                filename: 'booking-logo.png',
                contentId: 'booking-logo@arcana',
                transferEncoding: 'base64',
                decodedSizeBytes: 1024,
                referencedInPreferredHtml: true,
                sourceType: 'mime_part_inline',
              },
            ],
            attachments: [],
            htmlCidReferences: ['booking-logo@arcana'],
          },
          diagnostics: {
            partCount: 3,
            htmlPartCount: 1,
            textPartCount: 1,
            inlineAssetCount: 1,
            attachmentCount: 0,
          },
        },
      },
    },
    { sourceStore: 'graph_runtime_fallback' }
  );

  assert.match(String(document.primaryBodyHtml || ''), /cid:booking-logo@arcana/i);
  assert.match(String(document.primaryBodyText || ''), /Fredag 10:00/);
  assert.equal(document.assets.length, 1);
  assert.equal(document.inlineAssets.length, 1);
  assert.equal(document.inlineAssets[0].contentId, 'booking-logo@arcana');
  assert.equal(document.inlineAssets[0].family, 'inline');
  assert.equal(document.inlineAssets[0].download.available, false);
  assert.equal(document.assetSummary.inlineAssetCount, 1);
  assert.deepEqual(document.assetSummary.familyCounts, {
    attachment: 0,
    inline: 1,
    external: 0,
  });
});

test('extractTextFromHtml tom eller blank strang ger tom text', () => {
  assert.equal(extractTextFromHtml(''), '');
  assert.equal(extractTextFromHtml('   \n\t  '), '');
});

test('extractTextFromHtml decodar vanliga html-entiteter', () => {
  const text = extractTextFromHtml('<p>A&nbsp;&amp;&nbsp;B &lt;tag&gt;</p>');
  assert.equal(text, 'A & B <tag>');
});

test('extractTextFromHtml decodar decimal och hex numeriska entiteter', () => {
  const decimal = extractTextFromHtml('<span>&#8364;</span>');
  assert.equal(decimal, '€');
  const hex = extractTextFromHtml('<span>&#x20ac;</span>');
  assert.equal(hex, '€');
});

test('extractTextFromHtml listpunkter fran li-element', () => {
  const text = extractTextFromHtml('<ul><li>Första</li><li>Andra</li></ul>');
  assert.equal(text, '• Första\n• Andra');
});

test('buildCanonicalMailDocument normaliserar okänd direction till inbound', () => {
  const document = buildCanonicalMailDocument({
    messageId: 'msg-dir-unknown',
    subject: 'S',
    direction: 'sideways',
    bodyPreview: 'Preview',
  });
  assert.equal(document.direction, 'inbound');
});

test('buildCanonicalMailDocument accepterar outbound med varierande casing', () => {
  const document = buildCanonicalMailDocument({
    messageId: 'msg-dir-out',
    subject: 'Utgående',
    direction: 'OUTBOUND',
    bodyPreview: 'Hej',
    senderEmail: 'klinik@example.com',
    recipients: ['kund@example.com'],
  });
  assert.equal(document.direction, 'outbound');
});
