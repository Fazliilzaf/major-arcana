/**
 * Mobil staff boot — tidig shell, uppskjuten app.bundle, deep link-prefetch.
 * Körs synkront från <head> innan body/HTML-blockerande bundle.
 */
(function mobileStaffBoot() {
  'use strict';

  function isMobileViewport() {
    try {
      return window.matchMedia('(max-width: 768px)').matches;
    } catch {
      return false;
    }
  }

  function isMobileCustomersRoute() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const view = String(params.get('view') || 'customers').trim();
      return view === 'customers';
    } catch {
      return false;
    }
  }

  function parseDeepLink() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      const view = String(params.get('view') || 'customers').trim();
      const patientId = String(params.get('patientId') || '').trim();
      if (view !== 'customers' || !patientId) return null;
      return { patientId };
    } catch {
      return null;
    }
  }

  function readStaffToken() {
    try {
      return (
        localStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        sessionStorage.getItem('ARCANA_ADMIN_TOKEN') ||
        ''
      );
    } catch {
      return '';
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function primeMobileShellEarly() {
    document.documentElement.setAttribute('data-cco-mobile-shell', 'on');
    document.documentElement.setAttribute('data-cco-mobile-tabbar', 'on');
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav) {
        window.__ARCANA_MOBILE_SHELL_PRIME_MS__ = performance.now() - nav.startTime;
      }
    } catch {
      /* best-effort */
    }
  }

  function markDeepLinkPrime(patientId) {
    window.__ARCANA_MOBILE_DEEPLINK_PRIME__ = patientId;
    window.__ARCANA_DEEPLINK_PRIME_MS__ = performance.now();
    document.documentElement.setAttribute('data-cco-patient-detail', 'on');
  }

  function signalDetailReady(patientId) {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      if (nav && !window.__ARCANA_DEEPLINK_DETAIL_READY_MS__) {
        window.__ARCANA_DEEPLINK_DETAIL_READY_MS__ = performance.now() - nav.startTime;
      }
    } catch {
      /* best-effort */
    }
    try {
      window.dispatchEvent(
        new CustomEvent('arcana-deeplink-detail-ready', { detail: { patientId } })
      );
    } catch {
      /* best-effort */
    }
  }

  function hydratePatientRail(payload, patientId) {
    const rail = document.querySelector('[data-patient-master-rail]');
    if (!rail || !payload?.card) return false;

    const card = payload.card;
    const name = escapeHtml(card.displayName || 'Okänd kund');
    const initials = escapeHtml((card.displayName || '?').slice(0, 2).toUpperCase());
    const pnr = escapeHtml(card.personnummer || 'Saknar personnummer');
    const email = escapeHtml(card.primaryEmail || 'Saknar e-post');
    const phone = escapeHtml(card.primaryPhone || 'Saknar telefon');
    const fileCount = Number(card.fileSummary?.totalFiles || 0);

    rail.innerHTML = `
      <section class="patient-master-card" data-patient-detail>
        <article class="focus-customer-hero patient-master-hero patient-master-hero-sticky">
          <div class="focus-customer-hero-main">
            <div class="focus-customer-avatar">${initials}</div>
            <div class="focus-customer-copy">
              <h2>${name}</h2>
              <p class="patient-master-hero-id">${pnr}</p>
              <div class="focus-customer-contact-line">
                <span>${email}</span>
                <span>${phone}</span>
              </div>
            </div>
          </div>
        </article>
        <div class="patient-master-tabs" role="tablist">
          <button type="button" class="patient-master-tab" data-patient-tab="profil">Profil</button>
          <button type="button" class="patient-master-tab is-active" data-patient-tab="journal">Journal</button>
          <button type="button" class="patient-master-tab" data-patient-tab="tidslinje">Tidslinje</button>
          ${
            fileCount > 0
              ? '<button type="button" class="patient-master-tab" data-patient-tab="filer">Filer</button>'
              : ''
          }
        </div>
        <div class="patient-master-tab-panel hidden" data-patient-tab-panel="profil"></div>
        <div class="patient-master-tab-panel" data-patient-tab-panel="journal">
          <div class="patient-master-journal-intro">
            <h4>Journalverktyg</h4>
            <p class="patient-master-muted">Ta bild direkt i konsultationen, markera zoner och skapa offert här.</p>
          </div>
          <div class="patient-master-journal-toolbar">
            <label class="customers-utility-button patient-master-camera-button patient-master-upload-button">
              Ta bild
              <input type="file" accept="image/*" capture="environment" hidden data-patient-photo-camera />
            </label>
          </div>
        </div>
        <div class="patient-master-tab-panel hidden" data-patient-tab-panel="tidslinje"></div>
        <div class="patient-master-tab-panel hidden" data-patient-tab-panel="filer"></div>
      </section>
    `;

    document.documentElement.setAttribute('data-cco-patient-detail', 'on');
    window.__ARCANA_DEEPLINK_HYDRATED__ = patientId;
    window.__ARCANA_DEEPLINK_HYDRATED_PAYLOAD__ = payload;
    signalDetailReady(patientId);
    return true;
  }

  function hydrateWhenRailReady(payload, patientId) {
    if (hydratePatientRail(payload, patientId)) return;
    const observer = new MutationObserver(() => {
      if (hydratePatientRail(payload, patientId)) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        observer.disconnect();
        hydratePatientRail(payload, patientId);
      },
      { once: true }
    );
  }

  function prefetchPatientDetail(patientId, token) {
    if (window.__ARCANA_PATIENT_PREFETCH__ || window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__) return;
    window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__ = true;
    fetch(
      new URL(
        `/api/v1/cco-patient-master/patient?patientId=${encodeURIComponent(patientId)}&includeDriveFiles=0`,
        window.location.origin
      ).toString(),
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload || window.__ARCANA_PATIENT_PREFETCH__) return;
        window.__ARCANA_PATIENT_PREFETCH__ = { patientId, payload };
        hydrateWhenRailReady(payload, patientId);
      })
      .catch(() => {})
      .finally(() => {
        window.__ARCANA_DEEPLINK_PREFETCH_INFLIGHT__ = false;
      });
  }

  if (!isMobileViewport()) return;

  if (isMobileCustomersRoute()) {
    window.__ARCANA_DEFER_APP_BUNDLE__ = true;
    primeMobileShellEarly();
  }

  const deepLink = parseDeepLink();
  if (deepLink) {
    markDeepLinkPrime(deepLink.patientId);
    const token = readStaffToken();
    if (token.length > 8) {
      prefetchPatientDetail(deepLink.patientId, token);
    }
  }
})();
