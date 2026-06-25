'use strict';

/**
 * GetAccept e-sign-connector (UTGAENDE). Cred-gatad som Graph: helt inert utan
 * API-token/enabled. Inga hemligheter i koden - token kommer fran env/config.
 *
 * Skapa: createGetAcceptConnector({ apiToken, baseUrl, enabled, timeoutMs,
 *   senderEmail, fetchImpl }). fetchImpl injiceras i test.
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isEnabled(value) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalizeText(value).toLowerCase());
}

function toBase64(buffer) {
  if (!buffer) return '';
  if (Buffer.isBuffer(buffer)) return buffer.toString('base64');
  return Buffer.from(buffer).toString('base64');
}

function createGetAcceptConnector(options = {}) {
  const apiToken = normalizeText(options.apiToken);
  const baseUrl = (
    normalizeText(options.baseUrl || options.apiBaseUrl) || 'https://api.getaccept.com/v1'
  ).replace(/\/+$/, '');
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
  const senderEmail = normalizeText(options.senderEmail);
  const enabledFlag = options.enabled === true || isEnabled(options.enabled);
  const enabled = enabledFlag && Boolean(apiToken);
  const fetchImpl =
    typeof options.fetchImpl === 'function'
      ? options.fetchImpl
      : typeof fetch === 'function'
        ? fetch
        : null;

  function isConfigured() {
    return enabled && typeof fetchImpl === 'function';
  }

  async function request(path, { method = 'GET', body } = {}) {
    if (!isConfigured()) {
      return {
        ok: false,
        disabled: true,
        error: 'GetAccept ej konfigurerad (token/enabled saknas).',
      };
    }
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetchImpl(baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller ? controller.signal : undefined,
      });
      const text = typeof res.text === 'function' ? await res.text() : '';
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (_e) {
        data = { raw: text };
      }
      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: (data && (data.error || data.message)) || `HTTP ${res.status}`,
          data,
        };
      }
      return { ok: true, status: res.status, data };
    } catch (error) {
      return {
        ok: false,
        error:
          error && error.name === 'AbortError'
            ? 'timeout'
            : (error && error.message) || 'request_failed',
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function sendDocument({
    documentName,
    recipientName,
    recipientEmail,
    fileName,
    fileContentBase64,
    fileUrl,
    autoSend = true,
    metadata = {},
  } = {}) {
    if (!isConfigured()) return { ok: false, disabled: true };
    if (!normalizeText(recipientEmail)) return { ok: false, error: 'recipientEmail kravs.' };
    const nameParts = normalizeText(recipientName).split(/\s+/).filter(Boolean);
    const payload = {
      name: normalizeText(documentName) || 'Dokument',
      is_automatic_sending: autoSend === true,
      sender: senderEmail ? { email: senderEmail } : undefined,
      recipients: [
        {
          email: normalizeText(recipientEmail),
          first_name: nameParts[0] || normalizeText(recipientEmail),
          last_name: nameParts.slice(1).join(' '),
          role: 'signer',
        },
      ],
      meta: metadata && typeof metadata === 'object' ? metadata : undefined,
    };
    if (fileContentBase64) {
      payload.file = {
        name: normalizeText(fileName) || 'dokument.pdf',
        content: fileContentBase64,
        content_type: 'application/pdf',
      };
    } else if (normalizeText(fileUrl)) {
      payload.file = {
        name: normalizeText(fileName) || 'dokument.pdf',
        url: normalizeText(fileUrl),
      };
    }
    const res = await request('/documents', { method: 'POST', body: payload });
    if (!res.ok) return res;
    const d = res.data || {};
    return {
      ok: true,
      documentId: normalizeText(d.id || d.document_id || d.documentId),
      signUrl: normalizeText(d.sign_url || d.signUrl || d.document_url || d.url),
      status: normalizeText(d.status) || 'sent',
      data: d,
    };
  }

  async function sendOfferDocument({
    documentId = '',
    fileName = 'offert.pdf',
    pdfBuffer = null,
    recipient = {},
    signUrl = '',
    metadata = {},
  } = {}) {
    const result = await sendDocument({
      documentName: normalizeText(metadata.title) || fileName,
      recipientName: normalizeText(recipient.name),
      recipientEmail: normalizeText(recipient.email),
      fileName,
      fileContentBase64: toBase64(pdfBuffer),
      autoSend: true,
      metadata: {
        source: 'major_arcana',
        documentId: normalizeText(documentId),
        signUrl: normalizeText(signUrl),
        ...metadata,
      },
    });
    if (!result.ok) {
      const error = new Error(result.error || 'GetAccept send misslyckades.');
      error.result = result;
      error.statusCode = result.status || 502;
      throw error;
    }
    return {
      provider: 'getaccept',
      documentId: result.documentId,
      signUrl: result.signUrl,
      status: result.status,
      raw: result.data,
    };
  }

  async function getDocumentStatus(documentId) {
    const id = normalizeText(documentId);
    if (!id) return { ok: false, error: 'documentId kravs.' };
    const res = await request(`/documents/${encodeURIComponent(id)}`);
    if (!res.ok) return res;
    const d = res.data || {};
    return {
      ok: true,
      documentId: id,
      status: normalizeText(d.status),
      signedAt: normalizeText(d.signed_at || d.completed_at),
      data: d,
    };
  }

  return {
    enabled: enabledFlag,
    available: isConfigured(),
    isConfigured,
    sendDocument,
    sendOfferDocument,
    getDocumentStatus,
    request,
  };
}

function createRuntimeGetAcceptConnector(env = process.env) {
  return createGetAcceptConnector({
    enabled: env.GETACCEPT_ENABLED,
    apiToken: env.GETACCEPT_API_TOKEN,
    apiBaseUrl: env.GETACCEPT_API_BASE_URL,
    senderEmail: env.GETACCEPT_SENDER_EMAIL,
  });
}

module.exports = {
  createGetAcceptConnector,
  createRuntimeGetAcceptConnector,
};
