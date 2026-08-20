'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { buildCustomerDossier } = require('../../src/ops/ccoCustomerDossier');
const { createCcoBookingEngineStore } = require('../../src/ops/ccoBookingEngineStore');

test('dossier inkluderar bokningar fran bookingEngineStore', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-customer-dossier-'));
  try {
    const engineStore = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'engine.json'),
    });

    await engineStore.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-1',
      customerEmail: 'anna@test.se',
      customerName: 'Anna',
      canonicalPatientId: 'patient-anna',
      slot: {
        resourceId: 'res-1',
        serviceId: 'consultation-physical',
        startsAt: '2026-09-01T09:00:00.000Z',
        endsAt: '2026-09-01T09:30:00.000Z',
      },
      serviceLabel: 'Konsultation',
      status: 'confirmed',
    });

    const dossier = await buildCustomerDossier(
      { tenantId: 'tenant-a', patientId: 'patient-anna' },
      {
        patientMasterStore: {
          async getPatient({ patientId }) {
            if (patientId === 'patient-anna') {
              return {
                id: 'patient-anna',
                displayName: 'Anna Andersson',
                emails: ['anna@example.com'],
              };
            }
            return null;
          },
        },
        bookingEngineStore: engineStore,
      }
    );

    assert.equal(dossier.bookings.count, 1);
    assert.equal(dossier.bookings.upcoming.length, 1);
    assert.equal(dossier.bookings.upcoming[0].service, 'Fysisk konsultation');
    assert.equal(dossier.bookings.upcoming[0].startsAt, '2026-09-01T09:00:00.000Z');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test('dossier slar samman legacy- och engine-bokningar utan dubbletter', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'arcana-customer-dossier-merge-'));
  try {
    const engineStore = await createCcoBookingEngineStore({
      filePath: path.join(tempDir, 'engine.json'),
    });

    await engineStore.confirmBooking({
      tenantId: 'tenant-a',
      workspaceId: 'major-arcana-preview',
      conversationId: 'conv-engine-2',
      customerEmail: 'bertil@test.se',
      customerName: 'Bertil',
      canonicalPatientId: 'patient-bertil',
      slot: {
        resourceId: 'res-1',
        serviceId: 'consultation-physical',
        startsAt: '2026-09-02T10:00:00.000Z',
        endsAt: '2026-09-02T10:30:00.000Z',
      },
      serviceLabel: 'Konsultation',
      status: 'confirmed',
    });

    const legacyStore = {
      async getBookingsForCustomer({ patientId }) {
        if (patientId === 'patient-bertil') {
          return [
            {
              bookingId: 'legacy-1',
              serviceLabel: 'Gammal bokning',
              startsAt: '2026-09-01T09:00:00.000Z',
              status: 'confirmed',
            },
          ];
        }
        return [];
      },
    };

    const dossier = await buildCustomerDossier(
      { tenantId: 'tenant-a', patientId: 'patient-bertil' },
      {
        patientMasterStore: {
          async getPatient() {
            return { id: 'patient-bertil', displayName: 'Bertil', emails: ['bertil@example.com'] };
          },
        },
        bookingStore: legacyStore,
        bookingEngineStore: engineStore,
      }
    );

    assert.equal(dossier.bookings.count, 2);
    assert.equal(dossier.bookings.upcoming.length, 2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
