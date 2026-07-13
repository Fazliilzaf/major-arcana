'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function nameKey(value) {
  const text = normalizeText(value).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.split(' ').length < 2) return '';
  return text;
}

function extractPersonNameFromFileName(fileName = '') {
  const base = normalizeText(fileName).replace(/\.pdf$/i, '');
  const dated = base.match(/^(.+?)\s+\d{4}-\d{2}-\d{2}(?:\s+\d{2}-\d{2}-\d{2})?$/i);
  if (dated) return normalizeText(dated[1]);
  const smart = base.match(/^(.+?)\s+(?:offert|quote|avtal|smart)/i);
  if (smart) return normalizeText(smart[1]);
  return '';
}

function buildPipedrivePeopleNameIndex(peopleRows = []) {
  const byName = new Map();
  for (const row of peopleRows) {
    const personId = normalizeText(row.ID);
    const name = normalizeText(row.Namn);
    const key = nameKey(name);
    if (!personId || !key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(personId);
  }
  return { byName };
}

function buildPipedrivePatientIndex(patients = [], { tenantId = 'hair-tp-clinic' } = {}) {
  const byPersonId = new Map();
  const byDealId = new Map();
  const byName = new Map();
  const byEmail = new Map();
  const byPhone = new Map();

  for (const patient of patients) {
    if (!patient || typeof patient !== 'object') continue;
    if (tenantId && normalizeText(patient.tenantId) && patient.tenantId !== tenantId) continue;
    const pipedrive = asObject(patient.pipedrive);
    const personId = normalizeText(pipedrive.personId);
    if (personId) {
      byPersonId.set(personId, patient);
      byPersonId.set(String(Number(personId)), patient);
    }
    for (const deal of asArray(pipedrive.deals)) {
      const dealId = normalizeText(asObject(deal).dealId);
      if (!dealId) continue;
      byDealId.set(dealId, patient);
      byDealId.set(String(Number(dealId)), patient);
    }
    for (const candidate of [
      patient.displayName,
      pipedrive.name,
      `${patient.firstName || ''} ${patient.lastName || ''}`,
    ]) {
      const key = nameKey(candidate);
      if (!key) continue;
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(patient);
    }
    for (const email of [
      patient.primaryEmail,
      ...asArray(patient.emails),
      pipedrive.primaryEmail,
      ...asArray(pipedrive.emails),
    ]) {
      const key = normalizeText(email).toLowerCase();
      if (!key) continue;
      if (!byEmail.has(key)) byEmail.set(key, []);
      byEmail.get(key).push(patient);
    }
    for (const phone of [
      patient.primaryPhone,
      ...asArray(patient.phones),
      pipedrive.primaryPhone,
      ...asArray(pipedrive.phones),
    ]) {
      const digits = normalizeText(phone).replace(/\D/g, '');
      const key = digits.length >= 9 ? digits.slice(-9) : digits;
      if (!key) continue;
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key).push(patient);
    }
  }

  return { byPersonId, byDealId, byName, byEmail, byPhone };
}

function resolvePersonIdFromFileName(fileName = '', peopleIndex = {}) {
  const extracted = extractPersonNameFromFileName(fileName);
  const key = nameKey(extracted);
  if (!key) return { personId: null, method: 'filename_no_name', extractedName: extracted };
  const ids = peopleIndex.byName?.get(key) || [];
  const unique = [...new Set(ids.map(normalizeText).filter(Boolean))];
  if (unique.length === 1) {
    return { personId: unique[0], method: 'pipedrive_people_csv', extractedName: extracted };
  }
  if (unique.length > 1) {
    return {
      personId: null,
      method: 'pipedrive_people_ambiguous',
      extractedName: extracted,
      candidateCount: unique.length,
    };
  }
  return { personId: null, method: 'pipedrive_people_no_match', extractedName: extracted };
}

function resolvePatientByFileName(fileName = '', index = {}) {
  const extracted = extractPersonNameFromFileName(fileName);
  const key = nameKey(extracted);
  if (!key) return { patientId: null, confidence: 'low', method: 'filename_no_name' };
  const matches = index.byName?.get(key) || [];
  if (matches.length === 1) {
    return {
      patientId: matches[0].id,
      confidence: 'high',
      method: 'smartdoc_filename',
      extractedName: extracted,
    };
  }
  if (matches.length > 1) {
    return {
      patientId: null,
      confidence: 'low',
      method: 'filename_ambiguous',
      extractedName: extracted,
      candidateCount: matches.length,
    };
  }
  return {
    patientId: null,
    confidence: 'low',
    method: 'filename_no_match',
    extractedName: extracted,
  };
}

function resolvePatientForManifestItem(item = {}, index = {}, peopleIndex = {}) {
  const personId = normalizeText(item.personId);
  const dealId = normalizeText(item.dealId);
  const { byPersonId, byDealId } = index;

  if (personId && byPersonId?.has(personId)) {
    return {
      patientId: byPersonId.get(personId).id,
      confidence: 'high',
      method: 'pipedrive_person_id',
    };
  }
  if (dealId && byDealId?.has(dealId)) {
    return { patientId: byDealId.get(dealId).id, confidence: 'high', method: 'pipedrive_deal_id' };
  }

  const fromPeopleCsv = resolvePersonIdFromFileName(item.fileName, peopleIndex);
  if (fromPeopleCsv.personId && byPersonId?.has(fromPeopleCsv.personId)) {
    return {
      patientId: byPersonId.get(fromPeopleCsv.personId).id,
      confidence: 'high',
      method: 'smartdoc_name_to_pipedrive_person',
      pipedrivePersonId: fromPeopleCsv.personId,
      extractedName: fromPeopleCsv.extractedName,
    };
  }

  const fromName = resolvePatientByFileName(item.fileName, index);
  if (fromName.patientId) return fromName;

  return {
    patientId: null,
    confidence: 'low',
    method: fromPeopleCsv.method || fromName.method || 'no_match',
    extractedName: fromPeopleCsv.extractedName || fromName.extractedName || null,
  };
}

function mapDocumentKindToAssetMeta(documentKind = 'other') {
  const kind = normalizeText(documentKind).toLowerCase() || 'other';
  if (kind === 'offer') {
    return {
      category: 'other',
      patientCardSection: 'offert',
      subCategory: 'pipedrive_offer',
      displayName: 'Pipedrive-offert',
    };
  }
  if (kind === 'agreement') {
    return {
      category: 'agreement',
      patientCardSection: 'samtycken_avtal',
      subCategory: 'pipedrive_agreement',
      displayName: 'Pipedrive-avtal',
    };
  }
  return {
    category: 'other',
    patientCardSection: 'ovrigt',
    subCategory: 'pipedrive_document',
    displayName: 'Pipedrive-dokument',
  };
}

function buildChecksumIndex(assetsState = {}) {
  const byChecksum = new Map();
  const bySourceRecordId = new Map();
  for (const asset of Object.values(asObject(assetsState.items))) {
    const checksum = normalizeText(asset.checksum);
    if (checksum) byChecksum.set(checksum, asset);
    if (normalizeText(asset.sourceSystem) === 'pipedrive_import') {
      const sourceRecordId = normalizeText(asset.sourceRecordId);
      if (sourceRecordId) bySourceRecordId.set(sourceRecordId, asset);
    }
  }
  return { byChecksum, bySourceRecordId };
}

module.exports = {
  buildPipedrivePatientIndex,
  buildPipedrivePeopleNameIndex,
  resolvePersonIdFromFileName,
  resolvePatientForManifestItem,
  resolvePatientByFileName,
  extractPersonNameFromFileName,
  mapDocumentKindToAssetMeta,
  buildChecksumIndex,
};
