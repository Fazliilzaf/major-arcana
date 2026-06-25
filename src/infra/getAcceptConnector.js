'use strict';

/**
 * GetAccept e-sign-connector (UTGÅENDE). Cred-gatad som Graph: helt inert utan
 * API-token/enabled → alla metoder svarar { ok:false, disabled:true } utan att
 * nätverka. Inga hemligheter i koden — token kommer från env via config.
 *
 * Skapa: createGetAcceptConnector({ apiToken, baseUrl, enabled, timeoutMs,
 *   senderEmail, fetchImpl }). fetchImpl injiceras i test (mockad fetch).
 *
 * GetAccept REST v1: Bearer-auth, POST /documents (skapa + auto-skicka för
 * signering), GET /documents/:id (status).
 */

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createGetAcceptConnector(options = {}) {
  const apiToken = normalizeText(options.apiToken);
  const baseUrl = (normalizeText(options.baseUrl) || 'https://api.getaccept.com/v1').replace(
    /\/+$/,
    ''
  );
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
  const senderEmail = normalizeText(options.senderEmail);
  const enabled = options.enabled === true && Boolean(apiToken);
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

  /**
   * Skapa + skicka dokument för signering.
   * @returns {{ok, documentId?, signUrl?, status?, disabled?, error?}}
   */
  async function sendDocument({
    documentName,
    recipientName,
    recipientEmail,
    fileName,
    fileContentBase64,
    fileUrl,
    autoSend = true,
  } = {}) {
    if (!isConfigured()) return { ok: false, disabled: true };
    if (!normalizeText(recipientEmail)) return { ok: false, error: 'recipientEmail krävs.' };
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
    };
    if (fileContentBase64) {
      payload.file = {
        name: normalizeText(fileName) || 'dokument.pdf',
        content: fileContentBase64,
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
      documentId: normalizeText(d.id || d.document_id),
      signUrl: normalizeText(d.sign_url || d.document_url || d.url),
      status: normalizeText(d.status) || 'sent',
      data: d,
    };
  }

  /** Hämta dokumentstatus (signed/completed/viewed/…). */
  async function getDocumentStatus(documentId) {
    const id = normalizeText(documentId);
    if (!id) return { ok: false, error: 'documentId krävs.' };
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

  return { isConfigured, sendDocument, getDocumentStatus, request };
}

module.exports = { createGetAcceptConnector };
