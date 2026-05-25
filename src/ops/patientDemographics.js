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

const ID_VERIFICATION_STATUSES = Object.freeze(['unverified', 'pending', 'verified', 'rejected']);

function normalizeIdVerification(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  const statusRaw = normalizeText(safe.status || prev.status).toLowerCase();
  const status = ID_VERIFICATION_STATUSES.includes(statusRaw) ? statusRaw : 'unverified';
  return {
    status,
    documentType: normalizeText(safe.documentType || prev.documentType) || '',
    verifiedAt: normalizeText(safe.verifiedAt || prev.verifiedAt) || null,
    verifiedBy: normalizeText(safe.verifiedBy || prev.verifiedBy) || '',
    note: normalizeText(safe.note || prev.note) || '',
  };
}

function normalizeNextOfKin(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  return {
    name: normalizeText(safe.name || prev.name) || '',
    relation: normalizeText(safe.relation || prev.relation) || '',
    phone: normalizeText(safe.phone || prev.phone) || '',
    email: normalizeText(safe.email || prev.email) || '',
  };
}

function normalizeAddressEntry(entry = {}) {
  const safe = asObject(entry);
  return {
    type: normalizeText(safe.type) || 'home',
    line1: normalizeText(safe.line1) || '',
    line2: normalizeText(safe.line2) || '',
    postalCode: normalizeText(safe.postalCode) || '',
    city: normalizeText(safe.city) || '',
    country: normalizeText(safe.country) || 'SE',
  };
}

function normalizeAddresses(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  const source = asArray(safe.items ?? safe.addresses ?? prev.items ?? prev.addresses);
  const items = source.map(normalizeAddressEntry).filter((row) => row.line1 || row.city || row.postalCode);
  return { items };
}

function normalizePatientDemographics(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  return {
    idVerification: normalizeIdVerification(safe.idVerification, prev.idVerification),
    nextOfKin: normalizeNextOfKin(safe.nextOfKin, prev.nextOfKin),
    importantNote: normalizeText(safe.importantNote ?? prev.importantNote) || '',
    addresses: normalizeAddresses(safe.addresses, prev.addresses),
  };
}

function buildDemographicsReadout(demographics = {}) {
  const safe = asObject(demographics);
  const idVerification = normalizeIdVerification(safe.idVerification);
  const nextOfKin = normalizeNextOfKin(safe.nextOfKin);
  const addresses = normalizeAddresses(safe.addresses);
  return {
    idVerificationStatus: idVerification.status,
    idVerificationDocumentType: idVerification.documentType,
    idVerificationVerifiedAt: idVerification.verifiedAt,
    nextOfKinName: nextOfKin.name,
    nextOfKinPhone: nextOfKin.phone,
    importantNote: normalizeText(safe.importantNote) || '',
    addressCount: addresses.items.length,
    primaryAddress: addresses.items[0] || null,
    addresses: addresses.items,
  };
}

module.exports = {
  ID_VERIFICATION_STATUSES,
  normalizeIdVerification,
  normalizeNextOfKin,
  normalizeAddresses,
  normalizePatientDemographics,
  buildDemographicsReadout,
};
