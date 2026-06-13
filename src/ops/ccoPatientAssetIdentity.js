function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value) {
  return normalizeText(value).replace(/[^\d+]+/g, '');
}

function normalizeName(value) {
  return normalizeText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushUnique(list, value) {
  const normalized = normalizeText(value);
  if (normalized && !list.includes(normalized)) list.push(normalized);
}

function normalizeCustomerState(value) {
  if (value?.customerState && typeof value.customerState === 'object') return value.customerState;
  return value && typeof value === 'object' ? value : null;
}

function tenantCandidates(tenantId) {
  const base = normalizeText(tenantId);
  const rows = [base];
  if (base.includes('-')) rows.push(base.replace(/-/g, '_'));
  if (base.includes('_')) rows.push(base.replace(/_/g, '-'));
  rows.push('hair-tp-clinic', 'hair_tp', 'hairtp-clinic');
  return [...new Set(rows.filter(Boolean))];
}

async function collectCustomerAliases({ patient, tenantId, customerStore }) {
  const aliases = [];
  const emails = new Set(
    [
      patient?.primaryEmail,
      patient?.cliento?.primaryEmail,
      patient?.pipedrive?.primaryEmail,
      ...asArray(patient?.emails),
      ...asArray(patient?.cliento?.emails),
      ...asArray(patient?.pipedrive?.emails),
    ]
      .map(normalizeEmail)
      .filter(Boolean)
  );
  const phones = new Set(
    [
      patient?.primaryPhone,
      patient?.cliento?.primaryPhone,
      patient?.pipedrive?.primaryPhone,
      ...asArray(patient?.phones),
      ...asArray(patient?.cliento?.phones),
      ...asArray(patient?.pipedrive?.phones),
    ]
      .map(normalizePhone)
      .filter(Boolean)
  );
  const name = normalizeName(
    patient?.displayName || patient?.fullName || patient?.name || patient?.cliento?.name
  );
  if (!customerStore?.peekTenantCustomerState || (!emails.size && !phones.size && !name)) {
    return aliases;
  }

  let storeTenantIds = [];
  if (typeof customerStore.listTenantIds === 'function') {
    try {
      storeTenantIds = await customerStore.listTenantIds();
    } catch (_error) {
      storeTenantIds = [];
    }
  }
  const tenantsToScan = [
    ...tenantCandidates(tenantId || patient?.tenantId),
    ...storeTenantIds.map(normalizeText),
  ].filter(Boolean);
  const uniqueTenantsToScan = [...new Set(tenantsToScan)];
  const exactNameMatches = [];

  for (const candidateTenant of uniqueTenantsToScan) {
    let customerState = null;
    try {
      customerState = normalizeCustomerState(
        await customerStore.peekTenantCustomerState({ tenantId: candidateTenant })
      );
    } catch (_error) {
      customerState = null;
    }
    if (!customerState) continue;

    const directory = customerState.directory || {};
    const details = customerState.details || {};
    const identities = customerState.identityByKey || {};
    const primaryEmailByKey = customerState.primaryEmailByKey || {};

    for (const key of Object.keys(directory)) {
      const detail = details[key] || {};
      const identity = identities[key] || {};
      const rowEmails = [
        primaryEmailByKey[key],
        identity.customerEmail,
        identity.verifiedPersonalEmailNormalized,
        ...asArray(detail.emails),
      ]
        .map(normalizeEmail)
        .filter(Boolean);
      const rowPhones = [detail.phone, identity.customerPhone, identity.verifiedPhoneE164]
        .map(normalizePhone)
        .filter(Boolean);

      const emailMatch = rowEmails.some((email) => emails.has(email));
      const phoneMatch = rowPhones.some((phone) => phones.has(phone));
      if (emailMatch || phoneMatch) {
        pushUnique(aliases, key);
        pushUnique(aliases, identity.canonicalCustomerId);
        pushUnique(aliases, identity.customerKey);
      }
    }

    if (!aliases.length && name) {
      Object.keys(directory)
        .filter((key) => normalizeName(directory[key]?.name) === name)
        .forEach((key) => exactNameMatches.push(key));
    }
  }
  // Name-only fallback is intentionally narrow: only one exact unique match across all scanned stores.
  if (!aliases.length && exactNameMatches.length) {
    const uniqueNameMatches = [...new Set(exactNameMatches)];
    if (uniqueNameMatches.length === 1) pushUnique(aliases, uniqueNameMatches[0]);
  }
  return aliases;
}

async function resolvePatientAssetIds({ patientId, patient, tenantId, customerStore }) {
  const ids = [];
  pushUnique(ids, patientId);
  pushUnique(ids, patient?.id);
  pushUnique(ids, patient?.cliento?.sourceId);
  pushUnique(ids, patient?.cliento?.canonicalCustomerId);
  pushUnique(ids, patient?.cliento?.customerKey);

  const aliases = await collectCustomerAliases({ patient, tenantId, customerStore });
  aliases.forEach((id) => pushUnique(ids, id));
  return ids;
}

function inferAssetFileType(asset) {
  const category = normalizeText(asset?.category).toLowerCase();
  const mime = normalizeText(asset?.mimeType).toLowerCase();
  const name = normalizeText(asset?.originalFileName || asset?.displayName).toLowerCase();
  if (category.startsWith('photo_') || mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/.test(name)) return 'video';
  if (category === 'journal' || mime === 'application/pdf' || /\.pdf$/.test(name))
    return 'journal_pdf';
  return 'document';
}

function assetToPatientFile(asset) {
  const id = normalizeText(asset?.id);
  const fileName = normalizeText(asset?.displayName || asset?.originalFileName) || 'Fil';
  const fileType = inferAssetFileType(asset);
  const isRenderable = ['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset?.status);
  const documentDate = normalizeText(asset?.documentDate).slice(0, 10);
  const cleanDocumentDate = /^\d{4}-\d{2}-\d{2}$/.test(documentDate) ? documentDate : null;
  return {
    id,
    assetId: id,
    source: 'patient_asset',
    sourceSystem: asset?.sourceSystem || null,
    patientId: asset?.patientId || '',
    encounterId: asset?.encounterId || null,
    category: asset?.category || '',
    fileType,
    fileName,
    name: fileName,
    title: fileName,
    originalFileName: asset?.originalFileName || fileName,
    relativePath: asset?.originalDrivePath || asset?.relativePath || fileName,
    mimeType: asset?.mimeType || '',
    contentType: asset?.mimeType || '',
    fileSize: asset?.fileSize || null,
    documentDate: cleanDocumentDate,
    importedAt: asset?.importedAt || null,
    occasionContext: cleanDocumentDate
      ? {
          timelineKey: cleanDocumentDate,
          date: cleanDocumentDate,
          source: 'patient_asset.documentDate',
        }
      : null,
    viewUrl:
      isRenderable && id ? `/api/v1/cco/assets/${encodeURIComponent(id)}/download?inline=1` : '',
    thumbnailUrl:
      isRenderable && asset?.thumbnailKey && id
        ? `/api/v1/cco/assets/${encodeURIComponent(id)}/thumbnail`
        : '',
    thumbnailLink:
      isRenderable && asset?.thumbnailKey && id
        ? `/api/v1/cco/assets/${encodeURIComponent(id)}/thumbnail`
        : '',
    hasThumbnail: Boolean(asset?.thumbnailKey),
    status: asset?.status || '',
  };
}

module.exports = {
  assetToPatientFile,
  resolvePatientAssetIds,
};
