const { resolveTimelineSort } = require('./ccoAssetTimelineSort');

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

function normalizeDigits(value) {
  return normalizeText(value).replace(/\D+/g, '');
}

// ORD-85 — identitetsprojektionens ENDA sanning.
//
// Populationen som skickas till collectAssetStoreAliases används bara till två
// unikhetsräkningar: "finns exakt en patient med det här personnumret" och
// samma sak för namnet. Hela patientregistret materialiserades i 517 MB för att
// svara på det.
//
// Projektionen kör de här två funktionerna över den fullständiga posten och
// sparar bara resultatet — två normaliserade strängar per patient. Konsumenten
// nedan kör SAMMA funktioner. Lägger någon till ett fält i fallback-kedjan
// ändras båda sidor samtidigt, för det finns bara en kedja.
//
// Alternativet var en källnivå-vakt som larmar när kedjorna glider isär. En
// vakt hade sagt "gå och fixa projektionen också". Det här gör att det inte
// finns något att fixa. Samma resonemang som lämnade getQueueLaneThreads orörd
// i ORD-82: en sanning, ett ställe.
// OBS: || och INTE ??. Skillnaden är inte kosmetisk här.
//
// ?? faller bara vidare på null/undefined. || faller vidare även på tom sträng,
// och tomma strängar är vanliga i importerad data — displayName byggs från
// Cliento- och Drive-importer.
//
// Med ?? hade en patient med displayName: '' och cliento.name: 'David Dahl'
// gett '' i stället för 'david dahl'. Och tomt namn matchar alla andra tomma
// namn, så patienten går från "unik via cliento-namnet" till "en av många
// tomma" — nameIsUnique blir false, aliasen försvinner, och bilderna slutar
// synas på kundkortet. Ingen krasch, inget larm.
function patientIdentityPnr(row) {
  return normalizeDigits(row?.personnummer || row?.personalNumber || row?.pnr);
}

function patientIdentityName(row) {
  return normalizeName(row?.displayName || row?.fullName || row?.name || row?.cliento?.name);
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

function collectAssetStoreAliases({ patient, patientPopulation, tenantId, assetStore }) {
  const aliases = [];
  if (!assetStore || typeof assetStore.listItemsForEnrichment !== 'function') return aliases;
  const pnr = normalizeDigits(patient?.personnummer || patient?.personalNumber || patient?.pnr);
  const name = normalizeName(
    patient?.displayName || patient?.fullName || patient?.name || patient?.cliento?.name
  );
  if (!pnr && !name) return aliases;

  const rows = assetStore.listItemsForEnrichment(tenantId) || [];
  const acceptedStatuses = new Set(['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO']);
  const renderableRows = rows.filter((row) => row?.patientId && acceptedStatuses.has(row.status));
  const exactNamePatientIds = new Set();
  const population = asArray(patientPopulation);
  // Läser via de delade hjälparna. Populationen kan vara antingen fullständiga
  // patientposter eller ORD-85:s projektion — projektionen bär redan resultatet
  // i samma fältnamn, så båda formerna fungerar utan gren här.
  const pnrIsUnique =
    pnr.length >= 8 && population.filter((row) => patientIdentityPnr(row) === pnr).length === 1;
  const nameIsUnique =
    Boolean(name) && population.filter((row) => patientIdentityName(row) === name).length === 1;

  for (const row of renderableRows) {
    const fields = [
      row.originalDrivePath,
      row.relativePath,
      row.originalFileName,
      row.displayName,
      row.documentTitle,
    ].filter(Boolean);
    const haystack = fields.join(' / ');
    const haystackDigits = normalizeDigits(haystack);
    if (
      pnr &&
      pnr.length >= 8 &&
      (!population.length || pnrIsUnique) &&
      haystackDigits.includes(pnr)
    ) {
      pushUnique(aliases, row.patientId);
      continue;
    }
    if (!name) continue;
    const exactSegmentMatch = haystack
      .split(/[\\/]/)
      .map(normalizeName)
      .some((segment) => segment === name || segment.startsWith(`${name} `));
    if (exactSegmentMatch) exactNamePatientIds.add(row.patientId);
  }

  if (population.length && (pnrIsUnique || nameIsUnique)) {
    const canonicalPatientId = normalizeText(patient?.id);
    resolveCanonicalPatientsForAssetAliases({
      patients: population,
      assets: renderableRows,
    })
      .filter((mapping) => mapping.canonicalPatientId === canonicalPatientId)
      .forEach((mapping) => pushUnique(aliases, mapping.assetPatientId));
    exactNamePatientIds.forEach((id) => pushUnique(aliases, id));
  } else if (!aliases.length && !population.length && exactNamePatientIds.size === 1) {
    pushUnique(aliases, [...exactNamePatientIds][0]);
  }

  return aliases;
}

function resolveCanonicalPatientsForAssetAliases({ patients, assets }) {
  const patientRows = asArray(patients)
    .map((patient) => ({
      patient,
      patientId: normalizeText(patient?.id),
      pnr: normalizeDigits(patient?.personnummer || patient?.personalNumber || patient?.pnr),
      name: normalizeName(
        patient?.displayName || patient?.fullName || patient?.name || patient?.cliento?.name
      ),
    }))
    .filter((row) => row.patientId && (row.pnr.length >= 8 || row.name));
  const canonicalPatientIds = new Set(
    asArray(patients)
      .map((patient) => normalizeText(patient?.id))
      .filter(Boolean)
  );
  const assetsByAlias = new Map();
  for (const asset of asArray(assets)) {
    const alias = normalizeText(asset?.patientId);
    if (!alias) continue;
    if (!assetsByAlias.has(alias)) assetsByAlias.set(alias, []);
    assetsByAlias.get(alias).push(asset);
  }

  return [...assetsByAlias.entries()].map(([assetPatientId, aliasAssets]) => {
    if (canonicalPatientIds.has(assetPatientId)) {
      return {
        assetPatientId,
        canonicalPatientId: assetPatientId,
        reason: 'direct_patient_id',
        candidatePatientIds: [assetPatientId],
      };
    }
    const fields = aliasAssets.flatMap((asset) =>
      [
        asset?.originalDrivePath,
        asset?.relativePath,
        asset?.originalFileName,
        asset?.displayName,
        asset?.documentTitle,
      ].filter(Boolean)
    );
    const haystack = fields.join(' / ');
    const haystackDigits = normalizeDigits(haystack);
    const segments = haystack.split(/[\\/]/).map(normalizeName).filter(Boolean);
    const pnrMatches = patientRows.filter(
      (row) => row.pnr.length >= 8 && haystackDigits.includes(row.pnr)
    );
    const nameMatches = patientRows.filter(
      (row) =>
        row.name &&
        segments.some((segment) => segment === row.name || segment.startsWith(`${row.name} `))
    );
    const matches = pnrMatches.length ? pnrMatches : nameMatches;
    const uniquePatientIds = [...new Set(matches.map((row) => row.patientId))];
    return {
      assetPatientId,
      canonicalPatientId: uniquePatientIds.length === 1 ? uniquePatientIds[0] : null,
      reason:
        uniquePatientIds.length > 1
          ? 'ambiguous_path_identity'
          : uniquePatientIds.length === 0
            ? 'unresolved_path_identity'
            : pnrMatches.length
              ? 'personnummer_path'
              : 'exact_name_path',
      candidatePatientIds: uniquePatientIds,
    };
  });
}

function resolveCanonicalPatientsForAssets({ patients, assets }) {
  const patientRows = asArray(patients)
    .map((patient) => ({
      patientId: normalizeText(patient?.id),
      pnr: normalizeDigits(patient?.personnummer || patient?.personalNumber || patient?.pnr),
      name: normalizeName(
        patient?.displayName || patient?.fullName || patient?.name || patient?.cliento?.name
      ),
    }))
    .filter((row) => row.patientId);
  const canonicalPatientIds = new Set(patientRows.map((row) => row.patientId));
  const patientsById = new Map(patientRows.map((row) => [row.patientId, row]));
  const patientsByPnrSuffix = new Map();
  const patientsByExactName = new Map();
  const patientsByFirstNameToken = new Map();
  for (const row of patientRows) {
    if (row.pnr.length >= 8) {
      const suffix = row.pnr.slice(-8);
      if (!patientsByPnrSuffix.has(suffix)) patientsByPnrSuffix.set(suffix, []);
      patientsByPnrSuffix.get(suffix).push(row);
    }
    if (row.name) {
      if (!patientsByExactName.has(row.name)) patientsByExactName.set(row.name, []);
      patientsByExactName.get(row.name).push(row);
      const firstToken = row.name.split(' ')[0];
      if (!patientsByFirstNameToken.has(firstToken)) patientsByFirstNameToken.set(firstToken, []);
      patientsByFirstNameToken.get(firstToken).push(row);
    }
  }

  return asArray(assets).map((asset) => {
    const assetPatientId = normalizeText(asset?.patientId);
    const assetId = normalizeText(asset?.id);
    if (canonicalPatientIds.has(assetPatientId)) {
      return {
        assetId,
        assetPatientId,
        canonicalPatientId: assetPatientId,
        reason: 'direct_patient_id',
        candidatePatientIds: [assetPatientId],
      };
    }

    const fields = [
      asset?.originalDrivePath,
      asset?.relativePath,
      asset?.originalFileName,
      asset?.displayName,
      asset?.documentTitle,
    ].filter(Boolean);
    const haystack = fields.join(' / ');
    const haystackDigits = normalizeDigits(haystack);
    const segments = haystack.split(/[\\/]/).map(normalizeName).filter(Boolean);
    const pnrPatientIds = new Set();
    for (let index = 0; index <= haystackDigits.length - 8; index += 1) {
      const suffix = haystackDigits.slice(index, index + 8);
      for (const row of patientsByPnrSuffix.get(suffix) || []) {
        if (haystackDigits.includes(row.pnr)) pnrPatientIds.add(row.patientId);
      }
    }
    const exactNamePatientIds = new Set();
    for (const segment of segments) {
      for (const row of patientsByExactName.get(segment) || []) {
        exactNamePatientIds.add(row.patientId);
      }
    }
    const pnrMatches = [...pnrPatientIds].map((id) => patientsById.get(id)).filter(Boolean);
    const exactNameMatches = [...exactNamePatientIds]
      .map((id) => patientsById.get(id))
      .filter(Boolean);
    const prefixNameMatches =
      pnrMatches.length || exactNameMatches.length
        ? []
        : [
            ...new Map(
              segments.flatMap((segment) => {
                const firstToken = segment.split(' ')[0];
                return (patientsByFirstNameToken.get(firstToken) || [])
                  .filter((row) => segment.startsWith(`${row.name} `))
                  .map((row) => [row.patientId, row]);
              })
            ).values(),
          ];
    const matches = pnrMatches.length
      ? pnrMatches
      : exactNameMatches.length
        ? exactNameMatches
        : prefixNameMatches;
    const candidatePatientIds = [...new Set(matches.map((row) => row.patientId))];
    return {
      assetId,
      assetPatientId,
      canonicalPatientId: candidatePatientIds.length === 1 ? candidatePatientIds[0] : null,
      reason:
        candidatePatientIds.length > 1
          ? 'ambiguous_path_identity'
          : candidatePatientIds.length === 0
            ? 'unresolved_path_identity'
            : pnrMatches.length
              ? 'personnummer_path'
              : exactNameMatches.length
                ? 'exact_name_path'
                : 'name_prefix_path',
      candidatePatientIds,
    };
  });
}

async function resolvePatientAssetIds({
  patientId,
  patient,
  patientPopulation,
  tenantId,
  customerStore,
  assetStore,
}) {
  const ids = [];
  pushUnique(ids, patientId);
  pushUnique(ids, patient?.id);
  pushUnique(ids, patient?.cliento?.sourceId);
  pushUnique(ids, patient?.cliento?.canonicalCustomerId);
  pushUnique(ids, patient?.cliento?.customerKey);

  const aliases = await collectCustomerAliases({ patient, tenantId, customerStore });
  aliases.forEach((id) => pushUnique(ids, id));
  const assetAliases = collectAssetStoreAliases({
    patient,
    patientPopulation,
    tenantId,
    assetStore,
  });
  assetAliases.forEach((id) => pushUnique(ids, id));
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
  let fileName = normalizeText(asset?.displayName || asset?.originalFileName) || 'Fil';
  const fileType = inferAssetFileType(asset);
  const isRenderable = ['VISIBLE_ON_PATIENT_CARD', 'VERIFIED_IN_CCO'].includes(asset?.status);
  const documentDate = normalizeText(asset?.documentDate).slice(0, 10);
  const cleanDocumentDate = /^\d{4}-\d{2}-\d{2}$/.test(documentDate) ? documentDate : null;
  const captureDate = normalizeText(asset?.captureDate).slice(0, 10);
  const cleanCaptureDate = /^\d{4}-\d{2}-\d{2}$/.test(captureDate) ? captureDate : null;
  const timeline = resolveTimelineSort(asset || {});
  if (
    (fileType === 'image' || fileType === 'video') &&
    timeline.date &&
    cleanDocumentDate &&
    timeline.date !== cleanDocumentDate
  ) {
    fileName = fileName.replace(/^\d{4}-\d{2}-\d{2}(\s*·\s*)/, `${timeline.date}$1`);
  }
  const technicalInfo =
    asset?.technicalInfo && typeof asset.technicalInfo === 'object' ? asset.technicalInfo : {};
  const selectedFor = asArray(asset?.selectedFor || technicalInfo.selectedFor)
    .map(normalizeText)
    .filter(Boolean);
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
    durationSeconds: Number.isFinite(Number(technicalInfo.durationSeconds))
      ? Number(technicalInfo.durationSeconds)
      : null,
    uploadedAt: technicalInfo.uploadedAt || asset?.importedAt || null,
    documentDate: cleanDocumentDate,
    captureDate: cleanCaptureDate,
    captureDateTime: asset?.captureDateTime || null,
    timelineDate: timeline.date || null,
    timelineSortKey: timeline.sortKey || null,
    timelineDateSource: timeline.field ? `patient_asset.${timeline.field}` : null,
    captureDateSource: asset?.captureDateSource || null,
    captureDateConfidence: asset?.captureDateConfidence || null,
    captureDateMismatch: Boolean(asset?.captureDateMismatch),
    captureCameraMake: asset?.captureCameraMake || null,
    captureCameraModel: asset?.captureCameraModel || null,
    patientCardSection: asset?.patientCardSection || null,
    imageStage: asset?.imageStage || null,
    imageType: asset?.imageType || null,
    bodyArea: asset?.bodyArea || null,
    angle: asset?.angle || null,
    selectedFor,
    sourceAnnotationId: technicalInfo.sourceAnnotationId || null,
    sourceAssetId: technicalInfo.sourceAssetId || asset?.sourceRecordId || null,
    offerReady:
      (asset?.imageStage === 'annotated' ||
        Boolean(technicalInfo.sourceAnnotationId) ||
        String(asset?.version || '').toLowerCase() === 'annotated-v1') &&
      (selectedFor.includes('offer') || selectedFor.includes('treatment_plan')),
    importedAt: asset?.importedAt || null,
    occasionContext: timeline.date
      ? {
          timelineKey: timeline.date,
          date: timeline.date,
          sortKey: timeline.sortKey,
          source: timeline.field ? `patient_asset.${timeline.field}` : 'patient_asset.timeline',
          documentDate: cleanDocumentDate,
          captureDate: cleanCaptureDate,
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
  // ORD-85: delade av identitetsprojektionen i ccoPatientMasterStore.
  // En sanning, ett ställe — se kommentaren vid definitionen.
  patientIdentityPnr,
  patientIdentityName,
  collectAssetStoreAliases,
  resolveCanonicalPatientsForAssetAliases,
  resolveCanonicalPatientsForAssets,
  resolvePatientAssetIds,
};
