/**
 * Major Arcana Preview — Tenant Admin Console (MT7 + MT9).
 *
 * Två separata modaler:
 *   • Tenant-lista — anropar TenantList-capability och visar alla kliniker
 *   • Help-panel — FAQ + kontakt-länk
 *
 * Triggers:
 *   • Cmd+K → "Tenant-konsol" eller "Hjälp & support"
 *   • window.MajorArcanaPreviewTenantAdmin.openConsole() / openHelp()
 */
(() => {
  'use strict';

  let consoleBackdrop = null;
  let helpBackdrop = null;

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function injectStyles() {
    if (document.getElementById('cco-tadmin-styles')) return;
    const s = document.createElement('style');
    s.id = 'cco-tadmin-styles';
    s.textContent = `
.cco-tadmin-backdrop, .cco-help-backdrop {
  position: fixed; inset: 0; z-index: 9992;
  background: rgba(20,18,16,0.55);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 10vh;
}
.cco-tadmin-backdrop[hidden], .cco-help-backdrop[hidden] { display: none; }
.cco-tadmin, .cco-help {
  width: min(720px, 92vw); background: #fbf7f1;
  border-radius: 16px; box-shadow: 0 24px 80px rgba(0,0,0,0.32);
  overflow: hidden; border: 1px solid rgba(0,0,0,0.07);
}
.cco-tadmin-header, .cco-help-header {
  padding: 16px 20px; border-bottom: 1px solid rgba(0,0,0,0.06);
  display: flex; align-items: center; justify-content: space-between;
}
.cco-tadmin-title, .cco-help-title {
  font-size: 14px; font-weight: 600; color: #2b251f; margin: 0;
}
.cco-tadmin-list { max-height: 60vh; overflow-y: auto; padding: 8px 14px; }
.cco-tadmin-item {
  display: grid; grid-template-columns: 1fr auto auto;
  gap: 10px; padding: 10px 12px;
  border-bottom: 1px solid rgba(0,0,0,0.05);
  align-items: center;
}
.cco-tadmin-tenant-id { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px; color: #2b251f; }
.cco-tadmin-tenant-brand { font-size: 11px; color: rgba(80,60,40,0.7); }
.cco-tadmin-plan {
  font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 999px;
  background: rgba(80,60,40,0.08); color: #5d4a3c; text-transform: uppercase;
}
.cco-tadmin-plan.is-pro { background: rgba(80,100,180,0.14); color: #3a4a8a; }
.cco-tadmin-plan.is-enterprise { background: rgba(40,130,90,0.16); color: #1f6e4a; }
.cco-tadmin-status {
  font-size: 10px; padding: 3px 8px; border-radius: 999px;
}
.cco-tadmin-status.is-active { background: rgba(40,130,90,0.14); color: #1f6e4a; }
.cco-tadmin-status.is-disabled { background: rgba(180,50,50,0.14); color: #a82828; }
.cco-tadmin-empty, .cco-help-empty { padding: 32px; text-align: center; color: rgba(80,60,40,0.55); font-size: 13px; }
.cco-tadmin-toolbar { padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.06); display: flex; gap: 8px; }
.cco-tadmin-btn {
  padding: 8px 14px; border: 0; border-radius: 8px;
  background: #2b251f; color: #fbf7f1;
  font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
}
.cco-help-section { padding: 16px 20px; }
.cco-help-section h4 { margin: 0 0 6px; font-size: 13px; color: #2b251f; }
.cco-help-section p { margin: 0 0 14px; font-size: 13px; color: rgba(80,60,40,0.75); line-height: 1.5; }
.cco-help-shortcuts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px; }
.cco-help-shortcuts span { padding: 4px 8px; background: rgba(80,60,40,0.06); border-radius: 6px; }
.cco-help-contact {
  margin: 14px 20px 18px;
  padding: 14px;
  background: rgba(80,100,180,0.08); border-radius: 10px;
  font-size: 12px; color: #3a4a8a;
}
.cco-icon-btn { width: 28px; height: 28px; border-radius: 6px; border: 0; background: transparent; cursor: pointer; color: rgba(80,60,40,0.6); font-size: 16px; }
.cco-icon-btn:hover { background: rgba(80,60,40,0.08); color: #2b251f; }
`.trim();
    document.head.appendChild(s);
  }

  // ─── MT7: Tenant Console ───
  async function fetchTenants() {
    const tokenSources = [
      window.localStorage?.getItem?.('cco.adminToken'),
      window.__CCO_DEV_TOKEN__,
    ].filter(Boolean);
    const token = tokenSources[0];
    try {
      const response = await fetch('/api/v1/capabilities/TenantList/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(token && token !== '__preview_local__' ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ input: { includeDisabled: true, limit: 50 } }),
      });
      if (!response.ok) return [];
      const text = await response.text();
      const payload = text ? JSON.parse(text) : {};
      const data = payload?.output?.data || payload?.data || {};
      return data.tenants || [];
    } catch (_e) {
      return [];
    }
  }

  async function renderConsole() {
    const tenants = await fetchTenants();
    const list = consoleBackdrop?.querySelector('[data-tadmin-list]');
    if (!list) return;
    if (tenants.length === 0) {
      list.innerHTML = '<div class="cco-tadmin-empty">Inga tenants än. Klicka "Skapa ny" för att starta onboarding-wizarden.</div>';
      return;
    }
    let html = '';
    for (const t of tenants) {
      const planClass = t.planTier === 'pro' ? 'is-pro' : t.planTier === 'enterprise' ? 'is-enterprise' : '';
      const statusClass = t.disabled ? 'is-disabled' : 'is-active';
      const statusLabel = t.disabled ? 'Deaktiverad' : 'Aktiv';
      html += `<div class="cco-tadmin-item">
        <div>
          <div class="cco-tadmin-tenant-id">${escapeHtml(t.tenantId)}</div>
          <div class="cco-tadmin-tenant-brand">${escapeHtml(t.brand || '—')}</div>
        </div>
        <span class="cco-tadmin-plan ${planClass}">${escapeHtml(t.planTier || 'free')}</span>
        <span class="cco-tadmin-status ${statusClass}">${escapeHtml(statusLabel)}</span>
      </div>`;
    }
    list.innerHTML = html;
  }

  function openConsole() {
    injectStyles();
    if (!consoleBackdrop) {
      consoleBackdrop = document.createElement('div');
      consoleBackdrop.className = 'cco-tadmin-backdrop';
      consoleBackdrop.setAttribute('hidden', '');
      consoleBackdrop.innerHTML = `
        <div class="cco-tadmin" role="dialog" aria-modal="true" aria-label="Tenant-konsol">
          <div class="cco-tadmin-header">
            <h3 class="cco-tadmin-title">Tenant-konsol — översikt över alla kliniker</h3>
            <button class="cco-icon-btn" data-tadmin-close aria-label="Stäng">×</button>
          </div>
          <div class="cco-tadmin-toolbar">
            <button class="cco-tadmin-btn" data-tadmin-new>+ Skapa ny tenant</button>
            <button class="cco-tadmin-btn" data-tadmin-refresh style="background:rgba(80,60,40,0.10);color:#2b251f">Uppdatera</button>
          </div>
          <div class="cco-tadmin-list" data-tadmin-list><div class="cco-tadmin-empty">Laddar tenants…</div></div>
        </div>
      `;
      document.body.appendChild(consoleBackdrop);
      consoleBackdrop.addEventListener('click', (e) => { if (e.target === consoleBackdrop) closeConsole(); });
      consoleBackdrop.querySelector('[data-tadmin-close]').addEventListener('click', closeConsole);
      consoleBackdrop.querySelector('[data-tadmin-refresh]').addEventListener('click', renderConsole);
      consoleBackdrop.querySelector('[data-tadmin-new]').addEventListener('click', () => {
        const wizard = window.MajorArcanaPreviewOnboardingWizard;
        if (wizard?.open) {
          closeConsole();
          wizard.open();
        }
      });
    }
    consoleBackdrop.removeAttribute('hidden');
    renderConsole();
  }

  function closeConsole() {
    if (consoleBackdrop) consoleBackdrop.setAttribute('hidden', '');
  }

  // ─── MT9: Help panel ───
  function openHelp() {
    injectStyles();
    if (!helpBackdrop) {
      helpBackdrop = document.createElement('div');
      helpBackdrop.className = 'cco-help-backdrop';
      helpBackdrop.setAttribute('hidden', '');
      helpBackdrop.innerHTML = `
        <div class="cco-help" role="dialog" aria-modal="true" aria-label="Hjälp">
          <div class="cco-help-header">
            <h3 class="cco-help-title">Hjälp & support</h3>
            <button class="cco-icon-btn" data-help-close aria-label="Stäng">×</button>
          </div>
          <div class="cco-help-section">
            <h4>Snabbgenvägar</h4>
            <div class="cco-help-shortcuts">
              <span><strong>⌘K</strong> Kommandopalett</span>
              <span><strong>⌘/</strong> Sök överallt</span>
              <span><strong>⌘⇧S</strong> Spara aktuell vy</span>
              <span><strong>⌘⇧V</strong> Sparade vyer</span>
              <span><strong>J / K</strong> Bläddra i kö</span>
              <span><strong>R / N / S / D</strong> Svara/Nytt/Senare/Radera</span>
              <span><strong>P</strong> Hantera avbrott</span>
              <span><strong>?</strong> Visa kortkommandon</span>
            </div>
          </div>
          <div class="cco-help-section">
            <h4>Vanliga frågor</h4>
            <p><strong>Hur återställer jag en raderad tråd?</strong><br>
            Tryck Cmd+K → "Återställ tråd" eller använd ångra-knappen i bottom-bar inom 30 sek.</p>
            <p><strong>Var ändrar jag tonläge för AI-utkast?</strong><br>
            Studio → Åtgärder → välj ton (Professionell, Varm, Lösningsfokus, Empatisk).</p>
            <p><strong>Hur funkar AI-summary?</strong><br>
            Cmd+K → "Sammanfatta tråd" — fungerar lokalt eller via OpenAI om konfigurerat.
            Hallucinationsskydd markerar fakta som inte finns i källtråden.</p>
          </div>
          <div class="cco-help-contact">
            <strong>Behöver du mer hjälp?</strong><br>
            Maila <a href="mailto:support@hairtpclinic.com" style="color:#3a4a8a">support@hairtpclinic.com</a>
            eller använd Anteckningar → "Be om hjälp" i CCO.
          </div>
        </div>
      `;
      document.body.appendChild(helpBackdrop);
      helpBackdrop.addEventListener('click', (e) => { if (e.target === helpBackdrop) closeHelp(); });
      helpBackdrop.querySelector('[data-help-close]').addEventListener('click', closeHelp);
    }
    helpBackdrop.removeAttribute('hidden');
  }

  function closeHelp() {
    if (helpBackdrop) helpBackdrop.setAttribute('hidden', '');
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewTenantAdmin = Object.freeze({
      openConsole,
      closeConsole,
      openHelp,
      closeHelp,
    });
  }
})();
