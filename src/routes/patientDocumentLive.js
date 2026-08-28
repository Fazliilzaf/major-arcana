'use strict';

const express = require('express');
const fs = require('fs');
const {
  OFFERT_SLUG,
  normalizePhase,
  resolveLiveDocumentAbsolutePath,
  resolveLiveDocumentRelativePath,
  buildLiveManifest,
  isStaffLiveRegistry,
  listStaffLiveRegistryIds,
  renderPatientDocDevIndexHtml,
} = require('../ops/patientDocumentLiveRegistry');
const {
  resolveSignConfig,
  buildSignManifest,
  isE8SignRegistry,
} = require('../ops/patientDocumentSignRegistry');
const {
  getServiceSpec,
  resolveServicePrice,
  listServiceSpecs,
} = require('../ops/ccoTjanstespecifikationStore');

function injectLiveBootScript(html, { registryId, phase, patientId, signConfig, staffAudience }) {
  const payload = JSON.stringify({
    registryId,
    phase: OFFERT_SLUG[registryId] ? normalizePhase(phase) : null,
    patientId: String(patientId || '').trim() || null,
    audience: staffAudience ? 'staff' : 'patient',
  });
  const parts = [`<script>window.__ARCANA_PATIENT_DOC_LIVE__=${payload};</script>`];
  if (staffAudience) {
    parts.push('<script>window.__ARCANA_PATIENT_DOC_STAFF__=true;</script>');
  }
  if (signConfig) {
    parts.push(
      `<script>window.__ARCANA_PATIENT_DOC_SIGN__=${JSON.stringify(signConfig)};</script>`
    );
  }
  const script = parts.join('\n');
  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}\n</head>`);
  }
  return `${script}\n${html}`;
}

function injectPatientDocShellScript(html, getAssetHash) {
  if (!html.includes('patient-document-shell.js')) {
    const rel = './app/patient-document-shell.js';
    const hash = typeof getAssetHash === 'function' ? getAssetHash(rel)?.hash || 'e8' : 'e8';
    const tag = `<script src="${rel}?v=${hash}"></script>`;
    if (html.includes('</body>')) {
      return html.replace('</body>', `${tag}\n</body>`);
    }
    return `${html}\n${tag}`;
  }
  return html;
}

function sendPatientDocumentLiveManifest(_req, res) {
  res.json({
    ok: true,
    count: buildLiveManifest().length,
    documents: buildLiveManifest(),
    sign: {
      e8Count: buildSignManifest().length,
      documents: buildSignManifest(),
    },
    staff: {
      e9Count: listStaffLiveRegistryIds().length,
      registryIds: listStaffLiveRegistryIds(),
    },
  });
}

/**
 * Kopplar offertens `data-service-id` till tjänstespecifikationen: varje span
 * med `data-service-id="<apiId>"` får sitt pris resolverat ur storen i stället
 * för inklistrad text. Ändras priset i tjänstekatalogen ändras det här, på ett
 * ställe — dokumentet bär bara referensen.
 */
function resolveServicePricesInHtml(html) {
  if (typeof html !== 'string' || !html.includes('data-service-id=')) return html;
  return html.replace(
    /<span([^>]*?\bdata-service-id="(\d+)"[^>]*)>([^<]*)<\/span>/g,
    (match, attrs, serviceId) => {
      const price = resolveServicePrice(serviceId);
      if (!price) return match;
      return `<span${attrs}>${price}</span>`;
    }
  );
}

function sendServiceSpecs(_req, res) {
  const services = listServiceSpecs();
  res.json({ ok: true, count: services.length, services });
}

function sendServiceSpec(req, res) {
  const serviceId = String(req.params.serviceId || '').trim();
  const spec = getServiceSpec(serviceId);
  if (!spec) {
    return res.status(404).json({ ok: false, error: 'Okänd serviceId' });
  }
  res.json({
    ok: true,
    serviceId,
    price: spec.priceLabel,
    priceKr: spec.priceKr,
    ...spec,
  });
}

/** Public metadata — must mount before /api/v1/cco photo-review global auth. */
function registerPatientDocumentLiveManifestRoute(app) {
  app.get('/api/v1/cco/patient-documents/live/manifest', sendPatientDocumentLiveManifest);
}

function sendPatientDocDevIndex(req, res, getAssetHash) {
  const shellHash =
    typeof getAssetHash === 'function'
      ? getAssetHash('./app/patient-document-shell.js')?.hash || 'e8'
      : 'e8';
  const html = renderPatientDocDevIndexHtml({ shellHash });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('X-Arcana-Patient-Doc-Dev-Index', 'e5');
  return res.status(200).send(html);
}

function createPatientDocumentLiveRouter({ previewRoot, transformPreviewHtml, getAssetHash }) {
  const router = express.Router();

  router.get('/api/v1/cco/patient-documents/live/manifest', sendPatientDocumentLiveManifest);

  router.get('/api/v1/cco/service-specs', sendServiceSpecs);
  router.get('/api/v1/cco/service-specs/:serviceId', sendServiceSpec);

  router.get(
    ['/major-arcana-preview/patient-doc/', '/major-arcana-preview/patient-doc/index.html'],
    (req, res) => sendPatientDocDevIndex(req, res, getAssetHash)
  );

  router.get('/major-arcana-preview/patient-doc/:registryId', (req, res) => {
    const registryId = String(req.params.registryId || '').trim();
    const phase = normalizePhase(req.query.phase);
    const patientId = String(req.query.patientId || '').trim();
    const absPath = resolveLiveDocumentAbsolutePath(registryId, { phase });
    if (!absPath) {
      return res.status(404).type('text/plain; charset=utf-8').send('Okänt registryId');
    }
    let rawHtml;
    try {
      rawHtml = fs.readFileSync(absPath, 'utf8');
    } catch {
      return res.status(404).type('text/plain; charset=utf-8').send('Dokument saknas');
    }

    let html = typeof transformPreviewHtml === 'function' ? transformPreviewHtml(rawHtml) : rawHtml;
    html = resolveServicePricesInHtml(html);
    const signConfig = isE8SignRegistry(registryId)
      ? resolveSignConfig(registryId, { phase })
      : null;
    const staffAudience = isStaffLiveRegistry(registryId);
    html = injectLiveBootScript(html, { registryId, phase, patientId, signConfig, staffAudience });
    if (signConfig) {
      html = injectPatientDocShellScript(html, getAssetHash);
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('X-Arcana-Patient-Doc-Registry', registryId);
    res.setHeader(
      'X-Arcana-Patient-Doc-File',
      resolveLiveDocumentRelativePath(registryId, { phase }) || ''
    );
    if (signConfig?.handler) {
      res.setHeader('X-Arcana-Patient-Doc-Sign-Handler', signConfig.handler);
    }
    if (staffAudience) {
      res.setHeader('X-Arcana-Patient-Doc-Audience', 'staff');
      res.setHeader('X-Arcana-Patient-Doc-Staff-Badge', 'Personal');
    }
    return res.status(200).send(html);
  });

  void previewRoot;
  return router;
}

module.exports = {
  createPatientDocumentLiveRouter,
  registerPatientDocumentLiveManifestRoute,
  sendPatientDocumentLiveManifest,
  sendPatientDocDevIndex,
  sendServiceSpecs,
  sendServiceSpec,
  resolveServicePricesInHtml,
};
