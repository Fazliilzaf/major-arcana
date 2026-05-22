const fs = require('node:fs/promises');
const path = require('node:path');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCycleTimestampMs(cycle) {
  const launchedAt = Date.parse(String(cycle?.launch?.launchedAt || cycle?.launchedAt || ''));
  if (Number.isFinite(launchedAt)) return launchedAt;
  const updatedAt = Date.parse(String(cycle?.updatedAt || ''));
  if (Number.isFinite(updatedAt)) return updatedAt;
  return 0;
}

function pickReusableCycleId(cycles = [], tenantId = '') {
  const normalizedTenant = normalizeText(tenantId);
  const list = (Array.isArray(cycles) ? cycles : [])
    .filter((cycle) => {
      if (normalizedTenant && normalizeText(cycle?.tenantId) !== normalizedTenant) return false;
      return normalizeText(cycle?.id);
    })
    .slice();

  const pickLatest = (status) => {
    const filtered = list
      .filter((cycle) => normalizeText(cycle?.status).toLowerCase() === status)
      .sort((a, b) => parseCycleTimestampMs(b) - parseCycleTimestampMs(a));
    return normalizeText(filtered[0]?.id || '');
  };

  return pickLatest('launched') || pickLatest('launch_ready') || '';
}

async function loadReusableCycleId(filePathOrOptions = '', tenantIdArg = '') {
  const options =
    filePathOrOptions && typeof filePathOrOptions === 'object'
      ? filePathOrOptions
      : {
          filePath: filePathOrOptions,
          tenantId: tenantIdArg,
        };
  const filePath = normalizeText(options?.filePath || '');
  const tenantId = normalizeText(options?.tenantId || tenantIdArg || '');
  const resolved = path.resolve(filePath || path.join('data', 'release-governance.json'));
  try {
    const raw = JSON.parse(await fs.readFile(resolved, 'utf8'));
    const cycles = Array.isArray(raw?.cycles) ? raw.cycles : [];
    return pickReusableCycleId(cycles, tenantId);
  } catch {
    return '';
  }
}

module.exports = {
  pickReusableCycleId,
  loadReusableCycleId,
};
