'use strict';

/**
 * ccoPortalNudgeIngestionHook — tunn adapter som kopplar mail-ingestionens
 * per-mail-processor till portal-nudge-servicen. När ett inkommande mail matchas
 * mot en känd kund förbereder den en portal-länk-nudge (needs_approval-utkast).
 *
 * VIKTIGT:
 *   - Injiceras som en VALFRI side-effect i pipelinen (samma mönster som
 *     documentTriage/clientoBookingIngest). Saknas den beter sig ingestionen
 *     exakt som förr.
 *   - SKICKAR ALDRIG själv. preparePortalNudge skapar bara ett needs_approval-
 *     utkast; personal godkänner i den vanliga kedjan.
 *   - Idempotens + "redan aktiv"-check ligger i servicen, så att köra den på
 *     varje matchat inbound är säkert (en kund nudgas bara en gång).
 *   - Stores resolveras LAZY (getStores) vid anropstillfället så boot-ordningen
 *     mellan sync-servicen och portal-storarna inte spelar någon roll.
 */

const { preparePortalNudge } = require('./ccoPortalNudge');

function createPortalNudgeIngestionHook({ getStores, baseUrl = null, logger = console } = {}) {
  if (typeof getStores !== 'function') return null;

  return {
    async onInboundMatched({ tenantId, customerId, customerEmail } = {}) {
      const stores = getStores() || {};
      const { accessStore, draftStore, nudgeStore, messageStore = null } = stores;
      // Saknas någon nyckelstore (t.ex. ännu inte wire:ad) → gör inget.
      if (!accessStore || !draftStore || !nudgeStore) {
        return { status: 'skipped', reason: 'stores_unavailable' };
      }
      const result = await preparePortalNudge(
        {
          tenantId,
          customerId,
          customerEmail: customerEmail || undefined,
          baseUrl: baseUrl || process.env.PUBLIC_BASE_URL,
          channel: 'email',
          actor: { userId: 'automation:portal-nudge-inbound' },
        },
        { accessStore, draftStore, nudgeStore, messageStore }
      );
      if (result.status === 'prepared') {
        logger?.log?.(
          `[portal-nudge] förberett utkast=${result.draftId} för kund=${customerId} (inbound)`
        );
      }
      return result;
    },
  };
}

module.exports = { createPortalNudgeIngestionHook };
