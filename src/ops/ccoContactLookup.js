'use strict';

/**
 * ccoContactLookup — lätt uppslag "finns den här mottagaren redan?" för
 * dublettvarningen i Nytt mail. Ren läsning via patientMasterStore; avslöjar
 * bara staff-vänlig metadata (namn/id), aldrig hela kontaktposten.
 *
 * Ren funktion med injicerad store — enkel att enhetstesta.
 */

function text(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeEmail(v) {
  const s = text(v).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
}

/**
 * @param {{tenantId?:string, email:string}} ref
 * @param {{patientMasterStore:object}} stores
 * @returns {Promise<{exists:boolean, customerId?:string, displayName?:string|null,
 *          source?:string|null, reason?:string}>}
 */
async function lookupContactByEmail(ref = {}, stores = {}) {
  const tenantId = text(ref.tenantId) || 'hairtpclinic';
  const email = normalizeEmail(ref.email);
  const { patientMasterStore } = stores;

  if (!email) return { exists: false, reason: 'invalid_email' };
  if (typeof patientMasterStore?.findPatientByEmail !== 'function') {
    return { exists: false, reason: 'store_unavailable' };
  }

  const contact = await patientMasterStore.findPatientByEmail({ tenantId, email });
  if (!contact) return { exists: false };

  return {
    exists: true,
    customerId: text(contact.id) || text(contact.patientId) || null,
    displayName: text(contact.displayName) || null,
    source: text(contact.source) || null,
  };
}

module.exports = { lookupContactByEmail };
