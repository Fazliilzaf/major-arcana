'use strict';

/**
 * Extraherar text från HD-PDF (Phase 1 m365_halso).
 */
const pdfParse = require('pdf-parse');

async function extractPdfText(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, reason: 'empty_buffer', text: '' };
  }
  try {
    const result = await pdfParse(buffer);
    const text = typeof result?.text === 'string' ? result.text.trim() : '';
    if (!text) return { ok: false, reason: 'no_text_extracted', text: '' };
    return { ok: true, text, pageCount: result.numpages || 0 };
  } catch (error) {
    return {
      ok: false,
      reason: 'pdf_parse_error',
      text: '',
      error: error.message || String(error),
    };
  }
}

module.exports = {
  extractPdfText,
};
