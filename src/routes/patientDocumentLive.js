'use strict';

const express = require('express');
const fs = require('fs');
const {
  OFFERT_SLUG,
  normalizePhase,
  resolveLiveDocumentAbsolutePath,
  resolveLiveDocumentRelativePath,
  buildLiveManifest,
} = require('../ops/patientDocumentLiveRegistry');
const {
  resolveSignConfig,
  buildSignManifest,
  isE8SignRegistry,
} = require('../ops/patientDocumentSignRegistry');

function injectLiveBootScript(html, { registryId, phase, patientId, signConfig }) {
  const payload = JSON.stringify({
    registryId,
    phase: OFFERT_SLUG[registryId] ? normalizePhase(phase) : null,
    patientId: String(patientId || '').trim() || null,
  });
  const parts = [`<script>window.__ARCANA_PATIENT_DOC_LIVE__=${payload};</script>`];
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

function createPatientDocumentLiveRouter({ previewRoot, transformPreviewHtml, getAssetHash }) {
  const router = express.Router();

  router.get('/api/v1/cco/patient-documents/live/manifest', (_req, res) => {
    res.json({
      ok: true,
      count: buildLiveManifest().length,
      documents: buildLiveManifest(),
      sign: {
        e8Count: buildSignManifest().length,
        documents: buildSignManifest(),
      },
    });
  });

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
    const signConfig = isE8SignRegistry(registryId)
      ? resolveSignConfig(registryId, { phase })
      : null;
    html = injectLiveBootScript(html, { registryId, phase, patientId, signConfig });
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
    return res.status(200).send(html);
  });

  void previewRoot;
  return router;
}

module.exports = { createPatientDocumentLiveRouter };
