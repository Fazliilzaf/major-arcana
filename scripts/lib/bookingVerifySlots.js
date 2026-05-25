'use strict';

/**
 * Hitta ledig bokningsslot för prod-verify — public API eller CCO (auth).
 */
async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function defaultDateRange() {
  const from = process.env.FROM || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const to = process.env.TO || new Date(Date.now() + 86400000 * 21).toISOString().slice(0, 10);
  return { from, to };
}

function pickFirstSlot(body) {
  const slots = Array.isArray(body?.slots) ? body.slots : [];
  return slots[0] || null;
}

async function isPublicWebBookingEnabled(base, host) {
  const { status, body } = await getJson(
    `${base}/api/public/booking-engine/catalog?host=${encodeURIComponent(host)}`
  );
  if (body?.error === 'public_web_booking_disabled') return false;
  return status === 200 && Array.isArray(body?.services);
}

async function findPublicSlot(base, host, from, to, srvIds = 'consultation-online') {
  const { body } = await getJson(
    `${base}/api/public/booking-engine/availability?host=${encodeURIComponent(host)}&fromDate=${from}&toDate=${to}&srvIds=${encodeURIComponent(srvIds)}`
  );
  return pickFirstSlot(body);
}

async function findCcoSlot(base, token, from, to, srvIds = 'consultation-online') {
  const conversationId = `verify-slot-${Date.now()}`;
  const qs = new URLSearchParams({
    fromDate: from,
    toDate: to,
    srvIds,
    conversationId,
    excludeConversationId: conversationId,
  });
  const { body } = await getJson(`${base}/api/v1/cco-booking-engine/availability?${qs}`, {
    Authorization: `Bearer ${token}`,
  });
  return pickFirstSlot(body);
}

async function findVerifyBookingSlot({ base, host, token, srvIds = 'consultation-online' } = {}) {
  const safeBase = String(base || '').replace(/\/+$/, '');
  const safeHost = host || 'hairtpclinic.com';
  const { from, to } = defaultDateRange();

  const publicEnabled = await isPublicWebBookingEnabled(safeBase, safeHost);
  if (publicEnabled) {
    const slot = await findPublicSlot(safeBase, safeHost, from, to, srvIds);
    if (slot) return { slot, via: 'public', publicEnabled: true };
  }

  if (token) {
    const slot = await findCcoSlot(safeBase, token, from, to, srvIds);
    if (slot) return { slot, via: 'cco', publicEnabled: false };
  }

  return { slot: null, via: publicEnabled ? 'public' : 'cco', publicEnabled };
}

module.exports = {
  findVerifyBookingSlot,
  isPublicWebBookingEnabled,
  defaultDateRange,
};
