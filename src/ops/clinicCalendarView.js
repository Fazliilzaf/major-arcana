'use strict';

/**
 * Clinic Calendar / Day View.
 *
 * Builds a per-resource, per-day calendar from bookings and encounters.
 * Used by staff to see today's schedule and upcoming appointments.
 */

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}
function nowIso() {
  return new Date().toISOString();
}

function buildDayView({ date, bookingEngineStore, encounterStore, tenantId }) {
  const targetDate = normalizeText(date) || nowIso().slice(0, 10);
  const state = bookingEngineStore?._state;
  if (!state) return { date: targetDate, slots: [], resources: [] };

  const resources = (state.resources || []).filter((r) => r.active !== false);
  const bookings = (state.bookings || []).filter(
    (b) => b.status !== 'cancelled' && b.slot?.date === targetDate
  );
  const reservations = (state.reservations || []).filter(
    (r) => r.status !== 'cancelled' && r.status !== 'expired' && r.slot?.date === targetDate
  );

  const allSlots = [...bookings, ...reservations].sort((a, b) =>
    (a.slot?.time || '').localeCompare(b.slot?.time || '')
  );

  const byResource = {};
  for (const resource of resources) {
    byResource[resource.id] = {
      resourceId: resource.id,
      resourceLabel: resource.label,
      role: resource.role || 'Behandlare',
      slots: [],
    };
  }

  for (const slot of allSlots) {
    const resourceId = normalizeText(slot.resourceId || slot.slot?.resourceId);
    const entry = {
      id: slot.bookingId || slot.reservationId || slot.id,
      type: slot.bookingId ? 'booking' : 'reservation',
      time: slot.slot?.time || '',
      endTime: slot.slot?.endTime || '',
      serviceId: slot.serviceId || slot.slot?.serviceId || '',
      serviceLabel: slot.serviceLabel || slot.slot?.serviceLabel || '',
      patientName: normalizeText(slot.customerName || slot.contact?.name || ''),
      patientPhone: normalizeText(slot.customerPhone || slot.contact?.phone || ''),
      status: slot.status || 'confirmed',
      encounterId: slot.encounterId || '',
      notes: slot.notes || '',
    };

    if (resourceId && byResource[resourceId]) {
      byResource[resourceId].slots.push(entry);
    } else {
      if (!byResource._unassigned) {
        byResource._unassigned = {
          resourceId: '_unassigned',
          resourceLabel: 'Ej tilldelad',
          role: '',
          slots: [],
        };
      }
      byResource._unassigned.slots.push(entry);
    }
  }

  const resourceSchedules = Object.values(byResource).filter(
    (r) => r.slots.length > 0 || resources.some((res) => res.id === r.resourceId)
  );

  return {
    date: targetDate,
    totalSlots: allSlots.length,
    confirmedBookings: bookings.length,
    pendingReservations: reservations.length,
    resources: resourceSchedules,
  };
}

function buildWeekView({ startDate, bookingEngineStore, encounterStore, tenantId }) {
  const start = new Date(normalizeText(startDate) || nowIso().slice(0, 10));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayView = buildDayView({ date: dateStr, bookingEngineStore, encounterStore, tenantId });
    days.push({
      date: dateStr,
      weekday: d.toLocaleDateString('sv-SE', { weekday: 'short' }),
      ...dayView,
    });
  }
  return { startDate: start.toISOString().slice(0, 10), days };
}

module.exports = { buildDayView, buildWeekView };
