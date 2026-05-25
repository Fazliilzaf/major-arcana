'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');

const SWISH_API_VERSION = 'v2';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildInstructionUuid() {
  return crypto.randomUUID().replace(/-/g, '').toUpperCase();
}

function extractPaymentIdFromLocation(locationHeader = '') {
  const location = normalizeText(locationHeader);
  if (!location) return '';
  const segments = location.split('/').filter(Boolean);
  return normalizeText(segments[segments.length - 1]);
}

function buildSwishDeepLink({ paymentRequestToken, callbackUrl } = {}) {
  const token = normalizeText(paymentRequestToken);
  if (!token) return '';
  const params = new URLSearchParams();
  params.set('token', token);
  if (callbackUrl) {
    params.set('callbackurl', normalizeText(callbackUrl));
  }
  return `swish://paymentrequest?${params.toString()}`;
}

function swishTlsMaterialConfigured(config = {}) {
  const p12Path = normalizeText(config.swishP12Path);
  const certPath = normalizeText(config.swishCertPath);
  const keyPath = normalizeText(config.swishKeyPath);
  return Boolean(p12Path || (certPath && keyPath));
}

function swishConfigured(config = {}) {
  return Boolean(
    config.swishEnabled &&
      normalizeText(config.swishApiBaseUrl) &&
      normalizeText(config.swishCallbackUrl) &&
      swishTlsMaterialConfigured(config)
  );
}

function readTlsMaterial(config = {}) {
  const p12Path = normalizeText(config.swishP12Path);
  if (p12Path) {
    return {
      pfx: fs.readFileSync(p12Path),
      passphrase: normalizeText(config.swishCertPassphrase) || undefined,
      ca: normalizeText(config.swishCaPath) ? fs.readFileSync(config.swishCaPath) : undefined,
    };
  }
  const certPath = normalizeText(config.swishCertPath);
  const keyPath = normalizeText(config.swishKeyPath);
  if (!certPath || !keyPath) {
    const error = new Error('Swish TLS-certifikat saknas.');
    error.statusCode = 503;
    throw error;
  }
  return {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
    passphrase: normalizeText(config.swishCertPassphrase) || undefined,
    ca: normalizeText(config.swishCaPath) ? fs.readFileSync(config.swishCaPath) : undefined,
  };
}

let cachedAgentKey = '';
let cachedAgent = null;

function getSwishAgent(config = {}) {
  const key = [
    normalizeText(config.swishP12Path),
    normalizeText(config.swishCertPath),
    normalizeText(config.swishKeyPath),
    normalizeText(config.swishCaPath),
  ].join('|');
  if (cachedAgent && cachedAgentKey === key) {
    return cachedAgent;
  }
  cachedAgentKey = key;
  cachedAgent = new https.Agent({
    ...readTlsMaterial(config),
    minVersion: 'TLSv1.2',
    keepAlive: true,
  });
  return cachedAgent;
}

function requestSwish(config, { method, path, body } = {}) {
  const baseUrl = normalizeText(config.swishApiBaseUrl).replace(/\/+$/, '');
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  const payload = body ? `${JSON.stringify(body)}\n` : null;

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: normalizeText(method) || 'GET',
        agent: getSwishAgent(config),
        headers: payload
          ? {
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : {
              Accept: 'application/json',
            },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = {};
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch {
              parsed = { raw };
            }
          }
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: parsed,
            });
            return;
          }
          const message =
            normalizeText(parsed?.message) ||
            normalizeText(parsed?.errorMessage) ||
            normalizeText(parsed?.ErrorInformation?.message) ||
            `Swish API ${res.statusCode}`;
          const error = new Error(message);
          error.statusCode = res.statusCode;
          error.metadata = parsed;
          error.headers = res.headers;
          reject(error);
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function createSwishClient(config = {}) {
  if (!swishConfigured(config)) {
    const error = new Error('Swish är inte konfigurerat på servern.');
    error.statusCode = 503;
    throw error;
  }

  return {
    buildInstructionUuid,
    createPaymentRequest({
      instructionUUID = buildInstructionUuid(),
      payeeAlias,
      amount,
      currency = 'SEK',
      message,
      callbackUrl = config.swishCallbackUrl,
      payerAlias = '',
      payeePaymentReference = '',
    } = {}) {
      const payload = {
        payeeAlias: normalizeText(payeeAlias),
        amount: normalizeText(amount),
        currency: normalizeText(currency) || 'SEK',
        message: normalizeText(message),
        callbackUrl: normalizeText(callbackUrl),
      };
      const payer = normalizeText(payerAlias);
      const reference = normalizeText(payeePaymentReference);
      if (payer) payload.payerAlias = payer;
      if (reference) payload.payeePaymentReference = reference;

      return requestSwish(config, {
        method: 'PUT',
        path: `/api/${SWISH_API_VERSION}/paymentrequests/${instructionUUID}`,
        body: payload,
      }).then((response) => ({
        instructionUUID,
        paymentRequestToken: normalizeText(response.headers.paymentrequesttoken),
        location: normalizeText(response.headers.location),
        statusCode: response.statusCode,
      }));
    },
    getPaymentRequest(paymentId) {
      const id = normalizeText(paymentId);
      return requestSwish(config, {
        method: 'GET',
        path: `/api/${SWISH_API_VERSION}/paymentrequests/${encodeURIComponent(id)}`,
      }).then((response) => response.body);
    },
    testConnection() {
      const probeId = '00000000000000000000000000000000';
      return requestSwish(config, {
        method: 'GET',
        path: `/api/${SWISH_API_VERSION}/paymentrequests/${probeId}`,
      })
        .then(() => ({ ok: true, detail: 'unexpected_success' }))
        .catch((error) => {
          if (Number(error.statusCode) === 404) {
            return { ok: true, detail: 'certificate_ok' };
          }
          throw error;
        });
    },
  };
}

module.exports = {
  SWISH_API_VERSION,
  buildInstructionUuid,
  buildSwishDeepLink,
  createSwishClient,
  extractPaymentIdFromLocation,
  swishConfigured,
  swishTlsMaterialConfigured,
};
