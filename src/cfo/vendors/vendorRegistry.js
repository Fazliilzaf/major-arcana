'use strict';

/**
 * Vendor invoice fetcher registry.
 *
 * Varje adapter exponerar samma gränssnitt:
 *  - name: string
 *  - isConfigured(): boolean
 *  - fetchInvoices({ fromDate, toDate }): Promise<InvoiceCandidate[]>
 *
 * InvoiceCandidate:
 *  {
 *    supplier: string,
 *    description: string,
 *    amountSek: number,
 *    vatSek: number | null,
 *    date: string (YYYY-MM-DD),
 *    invoiceNumber: string | null,
 *    currency: string,
 *    raw: object,
 *    sourceUrl: string | null,
 *  }
 */

function createVendorRegistry(config = {}, { connectorStore = null } = {}) {
  const adapters = [];

  // Google Ads Billing API
  try {
    const { createGoogleAdsAdapter } = require('./googleAds');
    const googleAds = createGoogleAdsAdapter({ ...(config.googleAds || {}), connectorStore });
    adapters.push(googleAds);
  } catch (err) {
    console.warn('[vendorRegistry] kunde inte ladda Google Ads-adapter:', err?.message);
  }

  function listConfigured({ fromDate, toDate } = {}) {
    return adapters.filter((a) => {
      try {
        return typeof a.isConfigured === 'function' && a.isConfigured({ fromDate, toDate });
      } catch (err) {
        console.warn(`[vendorRegistry] ${a.name || '?'} isConfigured kastade:`, err?.message);
        return false;
      }
    });
  }

  function listAll() {
    return adapters.map((a) => ({
      name: a.name,
      configured: typeof a.isConfigured === 'function' ? a.isConfigured() : false,
    }));
  }

  return {
    adapters,
    listConfigured,
    listAll,
  };
}

module.exports = { createVendorRegistry };
