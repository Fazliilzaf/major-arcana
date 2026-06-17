'use strict';

const { isClientoBookingMail, parseClientoWebBookingMail } = require('./clientoBookingMailParser');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso() {
  return new Date().toISOString();
}

function createCcoClientoBookingIngest({
  config = {},
  clientoBookingStore = null,
  logger = console,
} = {}) {
  if (!clientoBookingStore) {
    throw new Error('createCcoClientoBookingIngest requires clientoBookingStore');
  }

  function isClientoWebBookingMessage(rawMessage) {
    return isClientoBookingMail(rawMessage);
  }

  async function processRawMessage({
    rawMessage = {},
    mode = 'read_only',
    tenantId = '',
    store = null,
    persist = true,
  } = {}) {
    const parsed = parseClientoWebBookingMail(rawMessage);
    if (!parsed) {
      return { skipped: true, reason: 'not_cliento_booking_mail', rawMessage };
    }
    if (!parsed.ok) {
      logger?.warn?.(
        `[cliento-booking-ingest] parse incomplete message=${rawMessage.id || 'unknown'} reason=${parsed.reason}`
      );
      return { skipped: true, reason: parsed.reason, parsed, rawMessage };
    }

    const resolvedTenantId =
      normalizeText(tenantId) ||
      normalizeText(config.defaultTenantId) ||
      normalizeText(config.defaultTenant) ||
      'hair-tp-clinic';

    if (mode === 'dry_run') {
      return {
        skipped: false,
        dryRun: true,
        parsed,
        tenantId: resolvedTenantId,
        rawMessage,
      };
    }

    const booking = await clientoBookingStore.upsertBooking({
      tenantId: resolvedTenantId,
      booking: {
        bookingId: parsed.bookingId,
        customerEmail: parsed.customerEmail,
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        serviceLabel: parsed.serviceLabel,
        staffName: parsed.staffName,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        status: parsed.status,
        source: parsed.source,
        notes: parsed.notes,
      },
    });

    if (typeof clientoBookingStore.flush === 'function') {
      await clientoBookingStore.flush();
    }

    if (store && typeof store.appendAudit === 'function') {
      await store.appendAudit(
        {
          type: 'cliento_web_booking_imported',
          rawMessageId: rawMessage.id || null,
          bookingId: parsed.bookingId,
          customerEmail: parsed.customerEmail,
          startsAt: parsed.startsAt,
          importedAt: nowIso(),
        },
        { persist }
      );
    }

    logger?.log?.(
      `[cliento-booking-ingest] upsert booking=${parsed.bookingId} email=${parsed.customerEmail} startsAt=${parsed.startsAt}`
    );

    return {
      skipped: false,
      imported: true,
      booking,
      parsed,
      tenantId: resolvedTenantId,
      rawMessage,
    };
  }

  return {
    isClientoWebBookingMessage,
    processRawMessage,
  };
}

module.exports = {
  createCcoClientoBookingIngest,
};
