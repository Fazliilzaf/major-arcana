'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CATALOG_FILES = Object.freeze({
  clientoServices: 'migration/cliento-service-catalog.json',
  meridiqServices: 'migration/meridiq-service-catalog.json',
  serviceTripleMap: 'migration/service-triple-map.json',
  clientoResources: 'migration/cliento/resource-catalog.json',
  clientoAddons: 'migration/cliento/addon-catalog.json',
  meridiqConsents: 'migration/meridiq/consent-catalog.json',
  meridiqBindings: 'migration/meridiq/service-bindings-catalog.json',
});

function readJsonIfExists(repoRoot, relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  try {
    const raw = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function loadLegacyCatalogBundle({ repoRoot = process.cwd() } = {}) {
  const bundle = {};
  for (const [key, relativePath] of Object.entries(CATALOG_FILES)) {
    bundle[key] = readJsonIfExists(repoRoot, relativePath);
  }

  const clientoCount = Array.isArray(bundle.clientoServices?.services)
    ? bundle.clientoServices.services.length
    : 0;
  const meridiqCount = Array.isArray(bundle.meridiqServices?.services)
    ? bundle.meridiqServices.services.length
    : 0;
  const tripleCount = Array.isArray(bundle.serviceTripleMap?.entries)
    ? bundle.serviceTripleMap.entries.length
    : Array.isArray(bundle.serviceTripleMap?.mappings)
      ? bundle.serviceTripleMap.mappings.length
      : Array.isArray(bundle.serviceTripleMap)
        ? bundle.serviceTripleMap.length
        : 0;

  return {
    exportedAt: new Date().toISOString(),
    counts: {
      clientoServices: clientoCount,
      meridiqServices: meridiqCount,
      serviceTripleMap: tripleCount,
      clientoResources: Array.isArray(bundle.clientoResources?.resources)
        ? bundle.clientoResources.resources.length
        : 0,
      clientoAddons: Array.isArray(bundle.clientoAddons?.addons)
        ? bundle.clientoAddons.addons.length
        : 0,
      meridiqConsents: Array.isArray(bundle.meridiqConsents?.consents)
        ? bundle.meridiqConsents.consents.length
        : 0,
      meridiqBindings: Array.isArray(bundle.meridiqBindings?.bindings)
        ? bundle.meridiqBindings.bindings.length
        : 0,
    },
    catalogs: bundle,
  };
}

module.exports = {
  CATALOG_FILES,
  loadLegacyCatalogBundle,
};
