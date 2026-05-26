'use strict';

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeFortnoxPatientRef(input = {}, existing = {}) {
  const safe = asObject(input);
  const prev = asObject(existing);
  return {
    customerId: normalizeText(safe.customerId || prev.customerId),
    customerNumber: normalizeText(safe.customerNumber || prev.customerNumber || safe.customerId),
    syncedAt: normalizeText(safe.syncedAt || prev.syncedAt),
    lastError: normalizeText(safe.lastError || prev.lastError),
    source: normalizeText(safe.source || prev.source) || 'arcana',
  };
}

function buildFortnoxCustomerPayload(patient = {}) {
  const safe = asObject(patient);
  const name = normalizeText(safe.displayName) || [safe.firstName, safe.lastName].filter(Boolean).join(' ');
  const personnummer = normalizeText(safe.personnummer).replace(/-/g, '');
  const payload = {
    Customer: {
      Name: name || 'Okänd patient',
      Email: normalizeText(safe.primaryEmail) || undefined,
      Phone1: normalizeText(safe.primaryPhone) || undefined,
      Type: 'PRIVATE',
      Active: true,
    },
  };
  if (personnummer) {
    payload.Customer.OrganisationNumber = personnummer;
  }
  return payload;
}

function extractCustomerNumber(customerPayload = {}) {
  const customer = asObject(customerPayload.Customer || customerPayload);
  return normalizeText(customer.CustomerNumber || customer.customerNumber);
}

async function findExistingCustomerNumber(fortnoxClient, patient = {}) {
  const email = normalizeText(patient.primaryEmail);
  const personnummer = normalizeText(patient.personnummer).replace(/-/g, '');
  if (email) {
    const listed = await fortnoxClient.listCustomers({ email });
    const match = (listed?.Customers || []).find(
      (row) => normalizeText(row.Email).toLowerCase() === email.toLowerCase()
    );
    if (match) return extractCustomerNumber(match);
  }
  if (personnummer) {
    const listed = await fortnoxClient.listCustomers({ organisationNumber: personnummer });
    const match = (listed?.Customers || [])[0];
    if (match) return extractCustomerNumber(match);
  }
  return '';
}

async function syncPatientToFortnox({
  patient,
  patientMasterStore,
  fortnoxClient,
  tenantId,
  actorUserId = '',
} = {}) {
  if (!patient || !patientMasterStore?.upsertPatient || !fortnoxClient) {
    const error = new Error('Patient eller Fortnox-klient saknas.');
    error.statusCode = 503;
    throw error;
  }
  const patientId = normalizeText(patient.id);
  if (!patientId) {
    const error = new Error('patientId saknas.');
    error.statusCode = 400;
    throw error;
  }

  const existingRef = normalizeFortnoxPatientRef(asObject(patient.fortnox));
  let customerNumber = existingRef.customerNumber;
  const payload = buildFortnoxCustomerPayload(patient);

  try {
    if (customerNumber) {
      payload.Customer.CustomerNumber = customerNumber;
      await fortnoxClient.updateCustomer(customerNumber, payload);
    } else {
      customerNumber = await findExistingCustomerNumber(fortnoxClient, patient);
      if (customerNumber) {
        payload.Customer.CustomerNumber = customerNumber;
        await fortnoxClient.updateCustomer(customerNumber, payload);
      } else {
        const created = await fortnoxClient.createCustomer(payload);
        customerNumber = extractCustomerNumber(created);
      }
    }

    if (!customerNumber) {
      const error = new Error('Fortnox returnerade inget kundnummer.');
      error.statusCode = 502;
      throw error;
    }

    const updated = await patientMasterStore.upsertPatient({
      tenantId,
      id: patientId,
      fortnox: normalizeFortnoxPatientRef({
        customerId: customerNumber,
        customerNumber,
        syncedAt: new Date().toISOString(),
        lastError: '',
        source: 'fortnox_sync',
      }),
    });

    return {
      action: existingRef.customerNumber ? 'updated' : 'linked',
      customerNumber,
      patient: updated,
    };
  } catch (error) {
    await patientMasterStore.upsertPatient({
      tenantId,
      id: patientId,
      fortnox: normalizeFortnoxPatientRef({
        ...existingRef,
        lastError: normalizeText(error.message) || 'Fortnox sync failed',
        syncedAt: new Date().toISOString(),
      }),
    });
    throw error;
  }
}

async function linkPatientFortnoxCustomer({
  patientMasterStore,
  tenantId,
  patientId,
  customerNumber,
} = {}) {
  const normalizedNumber = normalizeText(customerNumber);
  if (!normalizedNumber) {
    const error = new Error('customerNumber krävs.');
    error.statusCode = 400;
    throw error;
  }
  const patient = await patientMasterStore.getPatient({ tenantId, patientId });
  if (!patient) {
    const error = new Error('Patient hittades inte.');
    error.statusCode = 404;
    throw error;
  }
  return patientMasterStore.upsertPatient({
    tenantId,
    id: patientId,
    fortnox: normalizeFortnoxPatientRef({
      ...asObject(patient.fortnox),
      customerId: normalizedNumber,
      customerNumber: normalizedNumber,
      syncedAt: new Date().toISOString(),
      lastError: '',
      source: 'manual_link',
    }),
  });
}

module.exports = {
  buildFortnoxCustomerPayload,
  extractCustomerNumber,
  linkPatientFortnoxCustomer,
  normalizeFortnoxPatientRef,
  syncPatientToFortnox,
};
