function normalizeHost(host) {
  return String(host ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
}

function stripWww(host) {
  const normalized = normalizeHost(host);
  return normalized.startsWith('www.') ? normalized.slice(4) : normalized;
}

function resolveBrandFromMap(host, brandByHost) {
  const normalized = normalizeHost(host);
  if (!normalized) return null;
  if (!brandByHost || typeof brandByHost !== 'object') return null;

  const direct =
    brandByHost[normalized] ||
    brandByHost[stripWww(normalized)] ||
    brandByHost[`www.${stripWww(normalized)}`];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  for (const [pattern, brand] of Object.entries(brandByHost)) {
    if (!pattern || typeof pattern !== 'string') continue;
    if (!pattern.startsWith('*.')) continue;
    const root = pattern.slice(2).trim().toLowerCase(); // "example.com"
    if (!root) continue;

    const matches =
      normalized === root || normalized.endsWith(`.${root}`);

    if (matches) {
      if (typeof brand === 'string' && brand.trim()) return brand.trim();
    }
  }

  return null;
}

function resolveBrandForHost(host, { defaultBrand, brandByHost } = {}) {
  const normalized = normalizeHost(host);
  const fallback = defaultBrand || 'hair-tp-clinic';

  if (!normalized) return fallback;

  const mapped = resolveBrandFromMap(normalized, brandByHost);
  if (mapped) return mapped;

  const hostNoWww = stripWww(normalized);
  if (hostNoWww.endsWith('curatiio.se') || hostNoWww.includes('curatiio')) {
    return 'curatiio';
  }
  if (
    hostNoWww.endsWith('hairtpclinic.se') ||
    hostNoWww.includes('hairtpclinic') ||
    hostNoWww.includes('hair-tp')
  ) {
    return 'hair-tp-clinic';
  }

  return fallback;
}

module.exports = { resolveBrandForHost, resolveBrandFromMap, normalizeHost };
