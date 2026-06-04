/**
 * CCO cache policy — Fas 3 staleTime / gcTime classes.
 */
(() => {
  'use strict';

  if (window.__ARCANA_CCO_CACHE_POLICY__) return;
  window.__ARCANA_CCO_CACHE_POLICY__ = true;

  const SEC = 1000;
  const MIN = 60 * SEC;

  const POLICY = Object.freeze({
    STATIC: Object.freeze({ staleTime: 30 * MIN, gcTime: 60 * MIN }),
    WORKLIST: Object.freeze({ staleTime: 45 * SEC, gcTime: 3 * MIN }),
    PATIENT_LIST: Object.freeze({ staleTime: 2 * MIN, gcTime: 10 * MIN }),
    PATIENT_DETAIL: Object.freeze({ staleTime: 90 * SEC, gcTime: 5 * MIN }),
    JOURNAL: Object.freeze({ staleTime: 0, gcTime: 2 * MIN }),
    CALENDAR: Object.freeze({ staleTime: 60 * SEC, gcTime: 5 * MIN }),
    ANALYTICS: Object.freeze({ staleTime: 5 * MIN, gcTime: 15 * MIN }),
    BOOTSTRAP: Object.freeze({ staleTime: 45 * SEC, gcTime: 2 * MIN }),
    REF_DATA: Object.freeze({ staleTime: 10 * MIN, gcTime: 30 * MIN }),
  });

  window.ArcanaCcoCachePolicy = POLICY;
})();
