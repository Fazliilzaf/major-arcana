'use strict';

/**
 * Ordination (recept) → SharePoint/e-recept-publisher.
 *
 * Överbryggar dokumenttypen "ordination_recept" (hairtp-document-types.catalog.json
 * + patientDocumentLiveRegistry) till Microsoft Graph SharePoint-connector
 * (microsoftGraphSharePointRecept.js). När en ordination godkänns och ett recept
 * skapas, anropas `publishReceptDocument` och receptet laddas upp i SharePoint.
 *
 * FAIL-SOFT: returnerar alltid ett strukturerat resultat och kastar ALDRIG för
 * saknad config — `{ ok:false, reason:'not_configured' }` när connector saknas /
 * inte konfigurerad. En lyckad call falskas aldrig: bara en verklig
 * connector-uppladdning ger `ok:true`.
 */

const DEFAULT_REGISTRY_ID = 'ordination_recept';
const DEFAULT_FOLDER_PATH = 'recept';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[-]+|[-]+$/g, '');
}

function defaultReceptFileName({
  patientId = '',
  patientName = '',
  registryId = DEFAULT_REGISTRY_ID,
  suffix = '.pdf',
  now = new Date(),
} = {}) {
  const base = slugify(registryId) || 'ordination-recept';
  const nameSlug = slugify(patientName) || 'patient';
  const idSlug = normalizeText(patientId) ? `-${slugify(patientId)}` : '';
  const iso = new Date(now).toISOString();
  const date = iso.slice(0, 10);
  // Klockslag i filnamnet: två recept samma dag får olika namn — en PUT på
  // samma sökväg skulle annars tyst ersätta det första receptet.
  const hhmm = iso.slice(11, 13) + iso.slice(14, 16);
  return `${base}-${nameSlug}${idSlug}-${date}-${hhmm}${suffix}`;
}

function createOrdinationReceptSharePointPublisher({
  connector = null,
  connectorFactory = null,
  documentProvider = null,
  folderPath = DEFAULT_FOLDER_PATH,
  logger = console,
} = {}) {
  let _connector = connector;

  function resolveConnector() {
    if (_connector) return _connector;
    if (typeof connectorFactory === 'function') {
      try {
        _connector = connectorFactory();
      } catch (_err) {
        _connector = null;
      }
    }
    return _connector;
  }

  function isConfigured() {
    const resolved = resolveConnector();
    return Boolean(
      resolved && typeof resolved.isConfigured === 'function' && resolved.isConfigured() === true
    );
  }

  function notConfiguredResult() {
    return {
      ok: false,
      reason: 'not_configured',
      provider: 'sharepoint_e_recept',
      registryId: DEFAULT_REGISTRY_ID,
      folderPath: normalizeText(folderPath) || DEFAULT_FOLDER_PATH,
    };
  }

  function safeLog(method, message) {
    try {
      if (logger?.[method]) logger[method](message);
    } catch (_err) {
      // Logger får aldrig fälla publishen.
    }
  }

  /** Resolverar recept-dokumentets innehåll via documentProvider (om injicerad). */
  async function resolveDocument({ patientId, patientName, fileName, content, mimeType }) {
    if (content) {
      return {
        content,
        fileName: normalizeText(fileName) || defaultReceptFileName({ patientId, patientName }),
        mimeType: normalizeText(mimeType) || 'application/pdf',
      };
    }
    if (typeof documentProvider === 'function') {
      const provided = await documentProvider({ patientId, patientName, fileName, mimeType });
      if (provided && provided.content) {
        return {
          content: provided.content,
          fileName:
            normalizeText(provided.fileName) || defaultReceptFileName({ patientId, patientName }),
          mimeType:
            normalizeText(provided.mimeType) || normalizeText(mimeType) || 'application/pdf',
        };
      }
    }
    return null;
  }

  /**
   * Laddar upp ett recept till SharePoint/e-recept. Fail-soft.
   */
  async function publishReceptDocument({
    patientId,
    patientName = '',
    registryId = DEFAULT_REGISTRY_ID,
    fileName,
    content,
    mimeType,
    folderPath: folderPathOverride = '',
  } = {}) {
    const resolved = resolveConnector();
    if (!resolved || typeof resolved.uploadReceptDocument !== 'function') {
      return notConfiguredResult();
    }
    if (!isConfigured()) return notConfiguredResult();

    const resolvedDoc = await resolveDocument({
      patientId,
      patientName,
      fileName,
      content,
      mimeType,
    });
    if (!resolvedDoc) {
      return {
        ok: false,
        reason: 'content_missing',
        provider: 'sharepoint_e_recept',
        registryId: normalizeText(registryId) || DEFAULT_REGISTRY_ID,
      };
    }

    const path =
      normalizeText(folderPathOverride) || normalizeText(folderPath) || DEFAULT_FOLDER_PATH;
    try {
      // Mappen måste finnas innan PUT:en — annars misslyckas uppladdningen
      // tyst (fail-soft) tills någon provisionerar den manuellt.
      if (typeof resolved.ensureReceptFolder === 'function') {
        const folder = await resolved.ensureReceptFolder({ folderPath: path });
        if (folder?.ok !== true) {
          return {
            ok: false,
            reason: folder?.reason || 'folder_unavailable',
            provider: 'sharepoint_e_recept',
            registryId: normalizeText(registryId) || DEFAULT_REGISTRY_ID,
            detail: folder || null,
          };
        }
      }
      const uploaded = await resolved.uploadReceptDocument({
        fileName: resolvedDoc.fileName,
        content: resolvedDoc.content,
        mimeType: resolvedDoc.mimeType,
        folderPath: path,
      });
      if (uploaded?.ok !== true) {
        return {
          ok: false,
          reason: uploaded?.reason || 'sharepoint_upload_failed',
          provider: 'sharepoint_e_recept',
          registryId: normalizeText(registryId) || DEFAULT_REGISTRY_ID,
          detail: uploaded || null,
        };
      }
      return {
        ok: true,
        provider: 'sharepoint_e_recept',
        registryId: normalizeText(registryId) || DEFAULT_REGISTRY_ID,
        folderPath: allowEmpty(path),
        itemId: uploaded.itemId || null,
        fileName: uploaded.fileName || resolvedDoc.fileName,
        mimeType: uploaded.mimeType || resolvedDoc.mimeType,
        webUrl: uploaded.webUrl || null,
        publishedAt: uploaded.uploadedAt || new Date().toISOString(),
      };
    } catch (error) {
      safeLog(
        'warn',
        `[ordination-recept] SharePoint-uppladdning misslyckades: ${error?.message || error}`
      );
      return {
        ok: false,
        reason: 'sharepoint_error',
        provider: 'sharepoint_e_recept',
        registryId: normalizeText(registryId) || DEFAULT_REGISTRY_ID,
        error: error?.message || 'sharepoint_error',
      };
    }
  }

  /**
   * Hämtar ett recept från SharePoint (Buffer). Fail-soft.
   */
  async function fetchReceptDocument({
    patientId,
    patientName = '',
    registryId = DEFAULT_REGISTRY_ID,
    fileName,
    folderPath: folderPathOverride = '',
  } = {}) {
    const resolved = resolveConnector();
    if (!resolved || typeof resolved.fetchReceptDocument !== 'function') {
      return notConfiguredResult();
    }
    if (!isConfigured()) return notConfiguredResult();

    const resolvedFileName =
      normalizeText(fileName) || defaultReceptFileName({ patientId, patientName, registryId });
    const path =
      normalizeText(folderPathOverride) || normalizeText(folderPath) || DEFAULT_FOLDER_PATH;
    try {
      const fetched = await resolved.fetchReceptDocument({
        fileName: resolvedFileName,
        folderPath: path,
      });
      if (fetched?.ok !== true) {
        return {
          ok: false,
          reason: fetched?.reason || 'sharepoint_fetch_failed',
          provider: 'sharepoint_e_recept',
          detail: fetched || null,
        };
      }
      return {
        ok: true,
        provider: 'sharepoint_e_recept',
        fileName: fetched.fileName,
        mimeType: fetched.mimeType,
        content: fetched.content,
        size: fetched.size,
        fetchedAt: fetched.fetchedAt || new Date().toISOString(),
      };
    } catch (error) {
      safeLog(
        'warn',
        `[ordination-recept] SharePoint-uppladdning/återhämtning misslyckades: ${error?.message || error}`
      );
      return {
        ok: false,
        reason: 'sharepoint_error',
        provider: 'sharepoint_e_recept',
        error: error?.message || 'sharepoint_error',
      };
    }
  }

  /**
   * Hälsa/status: är SharePoint e-recept konfigurerat och nåbart? Fail-soft.
   */
  async function getReceptStatus({ folderPath: folderPathOverride = '' } = {}) {
    const resolved = resolveConnector();
    if (!resolved || typeof resolved.getSharePointSite !== 'function') {
      return notConfiguredResult();
    }
    if (!isConfigured()) return notConfiguredResult();
    try {
      const site = await resolved.getSharePointSite();
      if (site?.ok !== true) {
        return {
          ok: false,
          reason: site?.reason || 'sharepoint_unavailable',
          provider: 'sharepoint_e_recept',
          detail: site || null,
        };
      }
      const path =
        normalizeText(folderPathOverride) || normalizeText(folderPath) || DEFAULT_FOLDER_PATH;
      const folder = await resolved.ensureReceptFolder({ folderPath: path });
      return {
        ok: true,
        provider: 'sharepoint_e_recept',
        configured: true,
        siteId: site.siteId || null,
        displayName: site.displayName || null,
        webUrl: site.webUrl || null,
        folder:
          folder?.ok === true ? { created: folder.created, webUrl: folder.webUrl || null } : null,
      };
    } catch (error) {
      safeLog(
        'warn',
        `[ordination-recept] SharePoint-status misslyckades: ${error?.message || error}`
      );
      return {
        ok: false,
        reason: 'sharepoint_error',
        provider: 'sharepoint_e_recept',
        error: error?.message || 'sharepoint_error',
      };
    }
  }

  return {
    registryId: DEFAULT_REGISTRY_ID,
    defaultFolderPath: DEFAULT_FOLDER_PATH,
    defaultReceptFileName,
    resolveConnector,
    isConfigured,
    publishReceptDocument,
    fetchReceptDocument,
    getReceptStatus,
  };
}

function allowEmpty(value) {
  return normalizeText(value) || '';
}

module.exports = {
  createOrdinationReceptSharePointPublisher,
  defaultReceptFileName,
  slugify,
  DEFAULT_REGISTRY_ID,
  DEFAULT_FOLDER_PATH,
};
