const test = require('node:test');
const assert = require('node:assert/strict');

const { parseMailMime } = require('../../src/ops/ccoMailMimeParser');

test('parseMailMime väljer rik html för reply-heavy human mail med quoted-printable html', () => {
  const parsed = parseMailMime(
    [
      'MIME-Version: 1.0',
      'Content-Type: multipart/alternative; boundary="reply-boundary"',
      '',
      '--reply-boundary',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'Hej Egzona,',
      '',
      'Kan vi boka om till fredag?',
      '',
      'Med vänlig hälsning',
      'Vincent',
      '',
      'Från: Contact <contact@hairtpclinic.com>',
      'Datum: 2026-04-07',
      'Till: Vincent <vincent@example.com>',
      'Ämne: Sv: Ombokning',
      '--reply-boundary',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      '<div>Hej Egzona,</div>=0D=0A<div>Kan vi boka om till fredag?</div>=0D=0A<div>Med v=C3=A4nlig h=C3=A4lsning<br />Vincent</div>=0D=0A<blockquote><div>Fr=C3=A5n: Contact &lt;contact@hairtpclinic.com&gt;</div></blockquote>',
      '--reply-boundary--',
    ].join('\r\n')
  );

  assert.equal(parsed.preferredBodyKind, 'html');
  assert.match(String(parsed.body.preferredHtml || ''), /Kan vi boka om till fredag/i);
  assert.match(String(parsed.body.preferredText || ''), /Med vänlig hälsning/i);
  assert.equal(parsed.assets.inlineAssets.length, 0);
  assert.equal(parsed.assets.attachments.length, 0);
  assert.equal(parsed.diagnostics.htmlPartCount, 1);
  assert.equal(parsed.diagnostics.textPartCount, 1);
});

test('parseMailMime extraherar inline asset metadata för booking system mail', () => {
  const parsed = parseMailMime(
    [
      'MIME-Version: 1.0',
      'Content-Type: multipart/related; boundary="booking-boundary"',
      '',
      '--booking-boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<html><body><table><tr><td><img src="cid:booking-logo@arcana" alt="Logo" /></td><td>Bokningsbekräftelse</td></tr></table></body></html>',
      '--booking-boundary',
      'Content-Type: image/png; name="booking-logo.png"',
      'Content-ID: <booking-logo@arcana>',
      'Content-Disposition: inline; filename="booking-logo.png"',
      'Content-Transfer-Encoding: base64',
      '',
      'QUJDREVGRw==',
      '--booking-boundary--',
    ].join('\r\n')
  );

  assert.equal(parsed.preferredBodyKind, 'html');
  assert.equal(parsed.assets.inlineAssets.length, 1);
  assert.equal(parsed.assets.attachments.length, 0);
  assert.equal(parsed.assets.inlineAssets[0].contentId, 'booking-logo@arcana');
  assert.equal(parsed.assets.inlineAssets[0].referencedInPreferredHtml, true);
  assert.equal(parsed.assets.htmlCidReferences.includes('booking-logo@arcana'), true);
  assert.equal(parsed.diagnostics.inlineAssetCount, 1);
});

test('parseMailMime extraherar både inline assets och attachments för html/table/asset-heavy mail', () => {
  const parsed = parseMailMime(
    [
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="mixed-boundary"',
      '',
      '--mixed-boundary',
      'Content-Type: multipart/related; boundary="related-boundary"',
      '',
      '--related-boundary',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<html><body><table><tr><td><img src="cid:hero@arcana" alt="Hero" /></td><td>Din rapport</td></tr></table></body></html>',
      '--related-boundary',
      'Content-Type: image/jpeg; name="hero.jpg"',
      'Content-ID: <hero@arcana>',
      'Content-Disposition: inline; filename="hero.jpg"',
      'Content-Transfer-Encoding: base64',
      '',
      '/9j/4AAQSkZJRgABAQAAAQABAAD/',
      '--related-boundary--',
      '--mixed-boundary',
      'Content-Type: application/pdf; name="report.pdf"',
      'Content-Disposition: attachment; filename="report.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      'JVBERi0xLjQKJQ==',
      '--mixed-boundary--',
    ].join('\r\n')
  );

  assert.equal(parsed.preferredBodyKind, 'html');
  assert.equal(parsed.assets.inlineAssets.length, 1);
  assert.equal(parsed.assets.attachments.length, 1);
  assert.equal(parsed.assets.attachments[0].filename, 'report.pdf');
  assert.equal(parsed.assets.attachments[0].disposition, 'attachment');
  assert.equal(parsed.diagnostics.attachmentCount, 1);
  assert.equal(parsed.diagnostics.partCount, 3);
});

test('parseMailMime tom strang ger tomt preferred body', () => {
  const parsed = parseMailMime('');
  assert.equal(parsed.preferredBodyKind, 'empty');
  assert.equal(parsed.body.preferredText, '');
  assert.equal(parsed.body.preferredHtml, null);
  assert.equal(parsed.assets.inlineAssets.length, 0);
  assert.equal(parsed.assets.attachments.length, 0);
  assert.equal(parsed.diagnostics.partCount, 0);
});

test('parseMailMime enkel text/plain utan multipart', () => {
  const raw = ['Subject: Test', 'From: sender@example.com', '', 'Line one', 'Line two'].join('\n');
  const parsed = parseMailMime(raw);
  assert.equal(parsed.preferredBodyKind, 'text');
  assert.equal(parsed.body.preferredText, 'Line one\nLine two');
  assert.equal(parsed.body.preferredHtml, null);
  assert.equal(parsed.diagnostics.textPartCount, 1);
  assert.equal(parsed.diagnostics.htmlPartCount, 0);
});

test('parseMailMime utan dubbel radbrytning ger tomt body', () => {
  const parsed = parseMailMime('Subject: Bara rubrik utan kropp');
  assert.equal(parsed.preferredBodyKind, 'empty');
  assert.equal(parsed.body.preferredText, '');
});
