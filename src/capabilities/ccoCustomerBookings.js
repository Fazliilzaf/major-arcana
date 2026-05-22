'use strict';

/**
 * CcoCustomerBookings (CL4) — slå upp bokningar för en kund-email.
 *
 * Returnerar:
 *   - customerEmail
 *   - upcomingBookings: kommande bokningar (sorterade på startsAt asc)
 *   - recentVisits: senaste completed-bokningar (max 5, sorterat desc)
 *   - cancelledBookings: cancelled de senaste 6 mån
 *   - lastVisitDays: dagar sedan senaste completed (eller null)
 *   - nextBookingInDays: dagar till nästa upcoming (eller null)
 *   - vipScore: 0-100 baserat på antal completed + cancellations
 */

const { ROLE_OWNER, ROLE_STAFF } = require('../security/roles');
const { BaseCapability } = require('./baseCapability');

function asObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function normalizeText(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function safeDateMs(v) {
  if (!v) return NaN;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : NaN;
}

function daysBetween(targetMs, fromMs = Date.now()) {
  if (!Number.isFinite(targetMs) || !Number.isFinite(fromMs)) return null;
  return Math.round((targetMs - fromMs) / (24 * 3600 * 1000));
}

function computeVipScore(allBookings) {
  const completed = allBookings.filter((b) => b.status === 'completed').length;
  const cancelled = allBookings.filter((b) => b.status === 'cancelled' || b.status === 'no_show').length;
  // 1 completed = 10 poäng, max 100. Cancellation drar -5.
  return Math.max(0, Math.min(100, completed * 10 - cancelled * 5));
}

class CcoCustomerBookingsCapability extends BaseCapability {
  static name = 'CcoCustomerBookings';
  static version = '1.0.0';
  static allowedRoles = [ROLE_OWNER, ROLE_STAFF];
  static allowedChannels = ['admin'];
  static requiresInputRisk = false;
  static requiresOutputRisk = false;
  static requiresPolicyFloor = false;
  static persistStrategy = 'none';
  static auditStrategy = 'always';

  static inputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['customerEmail'],
    properties: {
      customerEmail: { type: 'string', minLength: 3, maxLength: 240 },
    },
  };

  static outputSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['data', 'metadata', 'warnings'],
    properties: {
      data: { type: 'object', additionalProperties: true },
      metadata: {
        type: 'object',
        additionalProperties: false,
        required: ['capability', 'version', 'channel', 'tenantId'],
        properties: {
          capability: { type: 'string', minLength: 1, maxLength: 120 },
          version: { type: 'string', minLength: 1, maxLength: 40 },
          channel: { type: 'string', minLength: 1, maxLength: 40 },
          tenantId: { type: 'string', minLength: 1, maxLength: 120 },
          requestId: { type: 'string', maxLength: 120 },
          correlationId: { type: 'string', maxLength: 120 },
        },
      },
      warnings: {
        type: 'array',
        maxItems: 8,
        items: { type: 'string', minLength: 1, maxLength: 240 },
      },
    },
  };

  async execute(context = {}) {
    const safeContext = asObject(context);
    const input = asObject(safeContext.input);
    const tenantId = normalizeText(safeContext.tenantId) || 'okand';
    const customerEmail = normalizeText(input.customerEmail).toLowerCase();
    const warnings = [];

    if (!customerEmail) {
      warnings.push('customerEmail saknas.');
      return {
        data: { customerEmail: '', upcomingBookings: [], recentVisits: [] },
        metadata: this._buildMetadata(safeContext),
        warnings,
      };
    }

    const store = safeContext.clientoBookingStore;
    if (!store || typeof store.getBookingsForCustomer !== 'function') {
      warnings.push('clientoBookingStore saknas — returnerar tom data.');
      return {
        data: {
          customerEmail,
          upcomingBookings: [],
          recentVisits: [],
          cancelledBookings: [],
          lastVisitDays: null,
          nextBookingInDays: null,
          vipScore: 0,
        },
        metadata: this._buildMetadata(safeContext),
        warnings,
      };
    }

    const all = store.getBookingsForCustomer({ tenantId, customerEmail });
    const nowMs = Date.now();
    const sixMonthsAgoMs = nowMs - 180 * 24 * 3600 * 1000;

    const upcoming = all
      .filter((b) => {
        const ms = safeDateMs(b.startsAt);
        return Number.isFinite(ms) && ms >= nowMs && b.status !== 'cancelled' && b.status !== 'no_show';
      })
      .sort((a, b) => safeDateMs(a.startsAt) - safeDateMs(b.startsAt));

    const completed = all
      .filter((b) => b.status === 'completed')
      .sort((a, b) => safeDateMs(b.startsAt) - safeDateMs(a.startsAt));

    const cancelled = all
      .filter((b) => {
        const ms = safeDateMs(b.startsAt);
        return (
          (b.status === 'cancelled' || b.status === 'no_show') &&
          Number.isFinite(ms) &&
          ms >= sixMonthsAgoMs
        );
      })
      .sort((a, b) => safeDateMs(b.startsAt) - safeDateMs(a.startsAt));

    const lastVisit = completed[0];
    const lastVisitDays = lastVisit
      ? daysBetween(safeDateMs(lastVisit.startsAt))
      : null;
    const nextBookingDays = upcoming[0]
      ? daysBetween(safeDateMs(upcoming[0].startsAt))
      : null;
    const vipScore = computeVipScore(all);

    return {
      data: {
        customerEmail,
        upcomingBookings: upcoming.slice(0, 10),
        recentVisits: completed.slice(0, 5),
        cancelledBookings: cancelled.slice(0, 5),
        lastVisitDays,
        nextBookingInDays: nextBookingDays,
        vipScore,
        totalBookings: all.length,
      },
      metadata: this._buildMetadata(safeContext),
      warnings,
    };
  }

  _buildMetadata(safeContext) {
    return {
      capability: CcoCustomerBookingsCapability.name,
      version: CcoCustomerBookingsCapability.version,
      channel: normalizeText(safeContext.channel) || 'admin',
      tenantId: normalizeText(safeContext.tenantId) || 'okand',
      requestId: normalizeText(safeContext.requestId) || '',
      correlationId: normalizeText(safeContext.correlationId) || '',
    };
  }
}

module.exports = {
  CcoCustomerBookingsCapability,
  ccoCustomerBookingsCapability: CcoCustomerBookingsCapability,
};
