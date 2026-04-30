/**
 * Major Arcana Preview — Onboarding Wizard (MT3).
 *
 * 4-stegs setup-flow för nya kliniker:
 *   1. Brand & namn (logo + färger)
 *   2. Mailbox-koppling (Microsoft Graph)
 *   3. Writing-identity (signatur, tonläge)
 *   4. Klar (visa sammanfattning + skapa tenant)
 *
 * Triggers:
 *   • Cmd+K → "Starta onboarding-wizard"
 *   • window.MajorArcanaPreviewOnboardingWizard.open()
 *
 * Stub-implementering: visar hela flödet men anropar inga riktiga API:er än.
 * Skickar tenant-config till TenantCreate-capability i sista steget.
 */
(() => {
  'use strict';

  let backdrop = null;
  let dialog = null;
  let currentStep = 0;
  const totalSteps = 4;
  const wizardState = {
    tenantId: '',
    brand: '',
    primaryColor: '#a8744c',
    accentColor: '#2b251f',
    mailbox: '',
    graphConnected: false,
    signature: '',
    tone: 'professional',
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function injectStyles() {
    if (document.getElementById('cco-wizard-styles')) return;
    const s = document.createElement('style');
    s.id = 'cco-wizard-styles';
    s.textContent = `
.cco-wizard-backdrop {
  position: fixed; inset: 0; z-index: 9993;
  background: rgba(20,18,16,0.55);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 8vh;
}
.cco-wizard-backdrop[hidden] { display: none; }
.cco-wizard {
  width: min(640px, 92vw); background: #fbf7f1;
  border-radius: 16px; box-shadow: 0 24px 80px rgba(0,0,0,0.32);
  overflow: hidden; border: 1px solid rgba(0,0,0,0.07);
}
.cco-wizard-progress {
  display: flex; padding: 12px 18px; gap: 6px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
  background: rgba(80,60,40,0.04);
}
.cco-wizard-step-pill {
  flex: 1; height: 4px; border-radius: 2px;
  background: rgba(80,60,40,0.15);
}
.cco-wizard-step-pill.is-done { background: #4a8268; }
.cco-wizard-step-pill.is-active { background: #2b251f; }
.cco-wizard-body { padding: 20px 24px; }
.cco-wizard-step-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: rgba(80,60,40,0.55); margin-bottom: 6px;
}
.cco-wizard-title { font-size: 20px; margin: 0 0 4px; color: #2b251f; }
.cco-wizard-subtitle { font-size: 13px; color: rgba(80,60,40,0.7); margin: 0 0 18px; }
.cco-wizard-field { margin-bottom: 14px; }
.cco-wizard-field label { display: block; font-size: 11px; font-weight: 600; color: rgba(80,60,40,0.65); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
.cco-wizard-field input, .cco-wizard-field select {
  width: 100%; padding: 10px 12px; border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.10); background: #fff;
  font-family: inherit; font-size: 14px; color: #2b251f;
}
.cco-wizard-color-row { display: flex; gap: 10px; }
.cco-wizard-color-row > div { flex: 1; }
.cco-wizard-actions {
  display: flex; gap: 8px; padding: 14px 24px 18px;
  border-top: 1px solid rgba(0,0,0,0.06);
  background: rgba(80,60,40,0.03);
}
.cco-wizard-btn {
  padding: 10px 18px; border: 0; border-radius: 999px;
  font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
  background: rgba(80,60,40,0.10); color: #2b251f;
}
.cco-wizard-btn.is-primary { background: #2b251f; color: #fbf7f1; margin-left: auto; }
.cco-wizard-btn.is-primary:hover { background: #1a1612; }
.cco-wizard-summary { font-size: 13px; line-height: 1.6; color: #3a312a; }
.cco-wizard-summary code { background: rgba(80,60,40,0.06); padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 11px; }
`.trim();
    document.head.appendChild(s);
  }

  function renderProgressBar() {
    let html = '<div class="cco-wizard-progress">';
    for (let i = 0; i < totalSteps; i++) {
      const cls = i < currentStep ? 'is-done' : i === currentStep ? 'is-active' : '';
      html += `<div class="cco-wizard-step-pill ${cls}"></div>`;
    }
    html += '</div>';
    return html;
  }

  function renderStep() {
    const stepHtml = [
      // Steg 1: Brand
      `<div class="cco-wizard-step-label">Steg 1 av ${totalSteps}</div>
       <h2 class="cco-wizard-title">Brand & namn</h2>
       <p class="cco-wizard-subtitle">Vad heter din klinik och vilka färger ska CCO ha?</p>
       <div class="cco-wizard-field">
         <label>Tenant-ID (kort identifierare, kebab-case)</label>
         <input type="text" data-wizard-field="tenantId" placeholder="acme-clinic" value="${escapeHtml(wizardState.tenantId)}" />
       </div>
       <div class="cco-wizard-field">
         <label>Klinikens visningsnamn</label>
         <input type="text" data-wizard-field="brand" placeholder="Acme Hårklinik" value="${escapeHtml(wizardState.brand)}" />
       </div>
       <div class="cco-wizard-color-row">
         <div class="cco-wizard-field">
           <label>Primärfärg</label>
           <input type="color" data-wizard-field="primaryColor" value="${escapeHtml(wizardState.primaryColor)}" />
         </div>
         <div class="cco-wizard-field">
           <label>Accentfärg</label>
           <input type="color" data-wizard-field="accentColor" value="${escapeHtml(wizardState.accentColor)}" />
         </div>
       </div>`,
      // Steg 2: Mailbox
      `<div class="cco-wizard-step-label">Steg 2 av ${totalSteps}</div>
       <h2 class="cco-wizard-title">Mailbox-koppling</h2>
       <p class="cco-wizard-subtitle">Anslut Microsoft Graph eller IMAP. Vi läser bara — inget skickas utan ditt godkännande.</p>
       <div class="cco-wizard-field">
         <label>Primär mailbox-adress</label>
         <input type="email" data-wizard-field="mailbox" placeholder="kons@acme.com" value="${escapeHtml(wizardState.mailbox)}" />
       </div>
       <p class="cco-wizard-subtitle">
         <em>Steg 2 i framtiden:</em> Microsoft OAuth-flow som ger CCO Mail.Read + Mail.Send-scopes.
         För nu: manuellt fält. Wizarden kör en stub-anslutning.
       </p>`,
      // Steg 3: Writing-identity
      `<div class="cco-wizard-step-label">Steg 3 av ${totalSteps}</div>
       <h2 class="cco-wizard-title">Writing-identity</h2>
       <p class="cco-wizard-subtitle">Hur ska AI-utkasten låta? Du kan ändra senare i inställningar.</p>
       <div class="cco-wizard-field">
         <label>E-postsignatur (textversion)</label>
         <input type="text" data-wizard-field="signature" placeholder="Med vänliga hälsningar, Acme Hårklinik" value="${escapeHtml(wizardState.signature)}" />
       </div>
       <div class="cco-wizard-field">
         <label>Tonläge</label>
         <select data-wizard-field="tone">
           <option value="professional" ${wizardState.tone === 'professional' ? 'selected' : ''}>Professionell</option>
           <option value="warm" ${wizardState.tone === 'warm' ? 'selected' : ''}>Varm</option>
           <option value="solution" ${wizardState.tone === 'solution' ? 'selected' : ''}>Lösningsfokuserad</option>
           <option value="empathic" ${wizardState.tone === 'empathic' ? 'selected' : ''}>Empatisk & klinisk</option>
         </select>
       </div>`,
      // Steg 4: Klar
      `<div class="cco-wizard-step-label">Steg 4 av ${totalSteps}</div>
       <h2 class="cco-wizard-title">Granska och slutför</h2>
       <p class="cco-wizard-subtitle">Kontrollera att allt stämmer. Du kan ändra senare i inställningar.</p>
       <div class="cco-wizard-summary">
         <strong>Tenant:</strong> <code>${escapeHtml(wizardState.tenantId || '(saknas)')}</code><br>
         <strong>Brand:</strong> ${escapeHtml(wizardState.brand || '(saknas)')}<br>
         <strong>Färger:</strong> ${escapeHtml(wizardState.primaryColor)} / ${escapeHtml(wizardState.accentColor)}<br>
         <strong>Mailbox:</strong> ${escapeHtml(wizardState.mailbox || '(saknas)')}<br>
         <strong>Tonläge:</strong> ${escapeHtml(wizardState.tone)}<br>
         <strong>Signatur:</strong> ${escapeHtml(wizardState.signature || '(saknas)')}
       </div>
       <p class="cco-wizard-subtitle" style="margin-top:14px">När du klickar "Skapa tenant" anropas TenantCreate-capability och ny klinik registreras.</p>`,
    ][currentStep] || '';

    const isLast = currentStep === totalSteps - 1;
    const html = `${renderProgressBar()}
      <div class="cco-wizard-body">${stepHtml}</div>
      <div class="cco-wizard-actions">
        ${currentStep > 0 ? '<button class="cco-wizard-btn" data-wizard-back>Tillbaka</button>' : ''}
        <button class="cco-wizard-btn is-primary" data-wizard-next>
          ${isLast ? 'Skapa tenant' : 'Nästa →'}
        </button>
      </div>`;

    dialog.innerHTML = html;

    dialog.querySelectorAll('[data-wizard-field]').forEach((input) => {
      input.addEventListener('input', (e) => {
        const field = input.getAttribute('data-wizard-field');
        wizardState[field] = e.target.value;
      });
    });
    dialog.querySelector('[data-wizard-back]')?.addEventListener('click', () => {
      currentStep = Math.max(0, currentStep - 1);
      renderStep();
    });
    dialog.querySelector('[data-wizard-next]')?.addEventListener('click', () => {
      if (isLast) {
        submit();
      } else {
        currentStep = Math.min(totalSteps - 1, currentStep + 1);
        renderStep();
      }
    });
  }

  async function submit() {
    const tokenSources = [
      window.localStorage?.getItem?.('cco.adminToken'),
      window.__CCO_DEV_TOKEN__,
    ].filter(Boolean);
    const token = tokenSources[0];
    try {
      const response = await fetch('/api/v1/capabilities/TenantCreate/run', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(token && token !== '__preview_local__' ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          input: {
            tenantId: wizardState.tenantId,
            brand: wizardState.brand,
            defaultMailbox: wizardState.mailbox,
            planTier: 'free',
            featureFlags: {},
          },
        }),
      });
      const text = await response.text();
      let payload = {};
      try { payload = text ? JSON.parse(text) : {}; } catch (_e) {}
      const data = payload?.output?.data || payload?.data || {};
      if (data.alreadyExists) {
        alert(`Tenant "${data.tenantId}" finns redan. Välj annat ID.`);
      } else if (response.ok) {
        alert(`✓ Tenant "${data.tenantId}" skapad!`);
        close();
      } else {
        alert(`Fel: ${payload?.error || response.status}`);
      }
    } catch (error) {
      alert(`Fel: ${error.message || 'okänt'}`);
    }
  }

  function open() {
    if (!backdrop) {
      injectStyles();
      backdrop = document.createElement('div');
      backdrop.className = 'cco-wizard-backdrop';
      backdrop.setAttribute('hidden', '');
      dialog = document.createElement('div');
      dialog.className = 'cco-wizard';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      backdrop.appendChild(dialog);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      document.body.appendChild(backdrop);
    }
    currentStep = 0;
    backdrop.removeAttribute('hidden');
    renderStep();
  }

  function close() {
    if (backdrop) backdrop.setAttribute('hidden', '');
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewOnboardingWizard = Object.freeze({
      open, close, getState: () => ({ ...wizardState }),
    });
  }
})();
