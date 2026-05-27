'use strict';

/**
 * CM AI Extractor — OCR + field extraction via OpenAI GPT-4o vision.
 *
 * Tar emot:
 * - PDF (konverterad till bild eller text)
 * - Bild (kvitto/faktura-foto)
 * - Mailtext (om ingen PDF/bild finns)
 *
 * Returnerar strukturerad data:
 * supplier, invoiceNumber, date, amount, VAT, category, etc.
 *
 * Env: OPENAI_API_KEY (required)
 */

function normalizeText(v) { return typeof v === 'string' ? v.trim() : ''; }

const EXTRACTION_PROMPT = `Du är en AI-assistent specialiserad på att extrahera ekonomisk information från fakturor, kvitton och resedokument.

Analysera dokumentet och extrahera följande fält (returnera JSON):

{
  "documentType": "invoice|receipt|travel|flight_ticket|hotel|taxi|subscription|purchase_confirmation|credit_invoice|reminder_invoice|unknown",
  "supplier": "leverantörens namn",
  "orgNumber": "organisationsnummer om synligt",
  "invoiceNumber": "fakturanummer",
  "receiptNumber": "kvittonummer",
  "orderNumber": "ordernummer/bokningsnummer",
  "date": "YYYY-MM-DD",
  "dueDate": "YYYY-MM-DD (förfallodatum, bara för fakturor)",
  "amountExVat": 0,
  "vatAmount": 0,
  "vatRate": 0.25,
  "amountIncVat": 0,
  "currency": "SEK",
  "paymentMethod": "kort|faktura|swish|bankgiro|okänd",
  "ocrNumber": "OCR-nummer för betalning",
  "bankgiro": "bankgiro/plusgiro",
  "iban": "IBAN om synligt",
  "category": "föreslå kategori (t.ex. kontorsmaterial, resor, programvara, behandlingsmaterial, lokal, marknadsföring)",
  "lineItems": [{"description": "", "quantity": 1, "unitPrice": 0, "total": 0}],
  "confidenceScore": 0-100,
  "notes": "eventuella osäkerheter eller kommentarer"
}

Regler:
- Returnera BARA valid JSON, ingen annan text.
- Om du inte kan läsa ett fält, sätt null.
- confidenceScore: 90-100 = säker, 70-89 = trolig, <70 = osäker.
- Belopp i öre/cent ska konverteras till kronor.
- Om dokumentet inte är ekonomiskt, returnera documentType: "unknown" och confidenceScore: 0.`;

async function extractFromImage(imageBase64, mimeType = 'image/jpeg') {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY saknas' };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extrahera ekonomisk information från detta dokument:' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { ok: false, error: `OpenAI API ${res.status}`, details: err.slice(0, 200) };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = parseJsonResponse(content);
    return { ok: true, extraction: parsed, raw: content, model: 'gpt-4o-mini', tokens: data.usage };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function extractFromText(text) {
  const apiKey = normalizeText(process.env.OPENAI_API_KEY);
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY saknas' };

  const trimmedText = normalizeText(text).slice(0, 8000);
  if (!trimmedText) return { ok: false, error: 'Tom text' };

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: EXTRACTION_PROMPT },
          { role: 'user', content: `Extrahera ekonomisk information från denna text:\n\n${trimmedText}` },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!res.ok) {
      return { ok: false, error: `OpenAI API ${res.status}` };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = parseJsonResponse(content);
    return { ok: true, extraction: parsed, raw: content, model: 'gpt-4o-mini', tokens: data.usage };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function parseJsonResponse(content) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(content);
  } catch {
    return { documentType: 'unknown', confidenceScore: 0, notes: 'Kunde inte tolka AI-svaret', rawResponse: content.slice(0, 500) };
  }
}

async function extractDocument({ imageBase64, mimeType, text, source = 'unknown' }) {
  let result;

  if (imageBase64) {
    result = await extractFromImage(imageBase64, mimeType || 'image/jpeg');
  } else if (text) {
    result = await extractFromText(text);
  } else {
    return { ok: false, error: 'Varken bild eller text tillhandahållen' };
  }

  if (result.ok && result.extraction) {
    result.extraction.source = source;
    result.extraction.extractedAt = new Date().toISOString();
  }

  return result;
}

module.exports = { extractDocument, extractFromImage, extractFromText, EXTRACTION_PROMPT };
