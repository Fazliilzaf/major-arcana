'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchMessagePdfAttachments } = require('../../scripts/lib/halsoHdGraphInbox');

test('fetchMessagePdfAttachments returns decoded non-inline PDFs only', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/attachments?$select=')) {
      return {
        ok: true,
        json: async () => ({
          value: [
            { id: 'pdf-1', name: 'Halsodeklaration.pdf', contentType: 'application/pdf', size: 9, isInline: false },
            { id: 'inline-1', name: 'logo.pdf', contentType: 'application/pdf', size: 9, isInline: true },
            { id: 'image-1', name: 'photo.jpg', contentType: 'image/jpeg', size: 9, isInline: false },
          ],
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        id: 'pdf-1',
        name: 'Halsodeklaration.pdf',
        contentType: 'application/pdf',
        contentBytes: Buffer.from('%PDF-test').toString('base64'),
      }),
    };
  };

  try {
    const result = await fetchMessagePdfAttachments('token', 'halso@hairtpclinic.com', 'message-1');
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'pdf-1');
    assert.equal(result[0].body.toString(), '%PDF-test');
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
