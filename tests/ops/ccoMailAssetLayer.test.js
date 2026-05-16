const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCanonicalMailAssets,
  extractInlineAssetReferences,
  getCanonicalMailAssetFamily,
} = require('../../src/ops/ccoMailAssetLayer');

test('getCanonicalMailAssetFamily classifies attachment vs inline vs external', () => {
  assert.equal(
    getCanonicalMailAssetFamily({
      disposition: 'attachment',
      kind: 'attachment',
      contentType: 'application/pdf',
    }),
    'attachment',
  );
  assert.equal(
    getCanonicalMailAssetFamily({
      disposition: 'inline',
      kind: 'image',
      contentType: 'image/png',
    }),
    'inline',
  );
  assert.equal(
    getCanonicalMailAssetFamily({
      disposition: 'inline',
      render: { state: 'external_https' },
    }),
    'external',
  );
});

test('extractInlineAssetReferences detects cid, https, and data URLs', () => {
  const html = `
    <p><img src="cid:part1/part2@x" alt="Logo" /></p>
    <img src="https://cdn.example.com/x.png" />
    <img src="data:image/png;base64,AAAA" />
  `;
  const refs = extractInlineAssetReferences(html);
  assert.equal(refs.length, 3);
  assert.equal(refs[0].referenceType, 'cid_reference');
  assert.ok(refs[0].cidCandidates.includes('part1'));
  assert.equal(refs[1].referenceType, 'external_https');
  assert.equal(refs[2].referenceType, 'embedded_data_url');
  assert.equal(refs[2].contentType, 'image/png');
});

test('buildCanonicalMailAssets links cid img to inline attachment by contentId', () => {
  const bodyHtml = '<div><img src="cid:logo@inline" alt="L" /></div>';
  const attachments = [
    {
      id: 'att-1',
      name: 'logo.png',
      contentType: 'image/png',
      contentId: 'logo@inline',
      isInline: true,
      size: 12,
      contentBytesAvailable: true,
    },
  ];
  const out = buildCanonicalMailAssets({
    graphMessageId: 'gm-1',
    bodyHtml,
    attachments,
    sourceStore: 'truth',
  });

  assert.ok(out.assetSummary.assetCount >= 1);
  const matched = out.assets.find((a) => a.contentId === 'logo@inline');
  assert.ok(matched);
  assert.equal(matched.disposition, 'inline');
  assert.ok(matched.references.some((r) => r.referenceType === 'cid_reference'));
  assert.ok(out.assetSummary.downloadableCount >= 1);
});

test('buildCanonicalMailAssets counts families for mixed inline and file attachment', () => {
  const out = buildCanonicalMailAssets({
    bodyHtml: '',
    attachments: [
      {
        id: 'f1',
        name: 'doc.pdf',
        contentType: 'application/pdf',
        isInline: false,
        size: 100,
      },
      {
        id: 'f2',
        name: 'pic.jpg',
        contentType: 'image/jpeg',
        isInline: true,
        size: 50,
        contentBytesAvailable: false,
      },
    ],
    sourceStore: 'truth',
  });
  assert.ok(out.assetSummary.familyCounts.attachment >= 1);
  assert.ok(out.assetSummary.familyCounts.inline >= 1);
});
