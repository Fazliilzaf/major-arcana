/**
 * Major Arcana Preview — 2FA Setup-UI (SF4 fyller S9).
 *
 * Setup-flow för TOTP-baserad 2FA:
 *   1. Visa QR-kod (otpauth:// URI) — användare scannar med authenticator-app
 *   2. Användare anger 6-siffrig kod för verifiering
 *   3. Backend verifierar koden + sparar TOTP-secret för user
 *
 * Backend-funktionerna verifyTotpCode + generateTotpToken finns i
 * src/security/authStore.js. För full setup behövs:
 *   • POST /api/v1/auth/2fa/setup → returnerar otpauth-URI + secret
 *   • POST /api/v1/auth/2fa/verify → verifierar 6-siffrig kod
 *
 * QR-koden ritas via Google Charts API som data-URI fallback (för att
 * undvika tung qrcode-lib). Vid offline visas otpauth-URI som textfält.
 */
(() => {
  'use strict';

  let backdrop = null;

  function injectStyles() {
    if (document.getElementById('cco-2fa-styles')) return;
    const s = document.createElement('style');
    s.id = 'cco-2fa-styles';
    s.textContent = `
.cco-2fa-backdrop {
  position: fixed; inset: 0; z-index: 9991;
  background: rgba(20,18,16,0.55);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 8vh;
}
.cco-2fa-backdrop[hidden] { display: none; }
.cco-2fa {
  width: min(480px, 92vw); background: #fbf7f1;
  border-radius: 16px; box-shadow: 0 24px 80px rgba(0,0,0,0.32);
  overflow: hidden; border: 1px solid rgba(0,0,0,0.07);
}
.cco-2fa-header { padding: 16px 20px; border-bottom: 1px solid rgba(0,0,0,0.06); }
.cco-2fa-title { font-size: 14px; font-weight: 600; color: #2b251f; margin: 0; }
.cco-2fa-subtitle { font-size: 12px; color: rgba(80,60,40,0.65); margin-top: 4px; }
.cco-2fa-body { padding: 20px 24px; }
.cco-2fa-step { display: flex; gap: 10px; margin-bottom: 14px; align-items: flex-start; }
.cco-2fa-step-num {
  flex-shrink: 0;
  width: 22px; height: 22px;
  border-radius: 50%;
  background: #2b251f; color: #fbf7f1;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600;
}
.cco-2fa-step-text { font-size: 13px; color: #3a312a; line-height: 1.5; }
.cco-2fa-qr-wrap {
  display: flex; flex-direction: column; align-items: center;
  padding: 14px;
  background: #fff;
  border-radius: 10px; border: 1px solid rgba(0,0,0,0.06);
  margin: 12px 0;
}
.cco-2fa-qr-img { width: 192px; height: 192px; image-rendering: pixelated; }
.cco-2fa-secret {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px; color: rgba(80,60,40,0.7);
  background: rgba(80,60,40,0.06);
  padding: 8px 12px; border-radius: 6px;
  word-break: break-all; user-select: all;
  margin-top: 10px;
}
.cco-2fa-input {
  width: 100%; padding: 12px 14px;
  font-family: ui-monospace, monospace;
  font-size: 18px; letter-spacing: 0.4em;
  text-align: center;
  border: 1px solid rgba(0,0,0,0.10); border-radius: 8px;
  background: #fff; color: #2b251f;
}
.cco-2fa-input.is-valid { border-color: #4a8268; }
.cco-2fa-input.is-invalid { border-color: #b03232; }
.cco-2fa-actions {
  display: flex; gap: 8px; padding: 14px 24px 18px;
  border-top: 1px solid rgba(0,0,0,0.06);
  background: rgba(80,60,40,0.03);
}
.cco-2fa-btn {
  padding: 10px 18px; border: 0; border-radius: 999px;
  font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.cco-2fa-btn-cancel { background: rgba(80,60,40,0.10); color: #2b251f; }
.cco-2fa-btn-primary { background: #2b251f; color: #fbf7f1; margin-left: auto; }
.cco-2fa-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.cco-2fa-status {
  font-size: 12px; padding: 8px 12px; border-radius: 6px; margin-top: 10px;
}
.cco-2fa-status.is-success { background: rgba(40,130,90,0.12); color: #1f6e4a; }
.cco-2fa-status.is-error { background: rgba(180,50,50,0.12); color: #a82828; }
`.trim();
    document.head.appendChild(s);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function buildQrUrl(otpauthUri) {
    // Fallback: använd Google Charts API för QR-rendering
    // (Inline QR-libs är 30+ KB; detta håller modulen minimal.)
    return `https://chart.googleapis.com/chart?chs=192x192&cht=qr&chl=${encodeURIComponent(otpauthUri)}&choe=UTF-8`;
  }

  async function startSetup() {
    const tokenSources = [
      window.localStorage?.getItem?.('cco.adminToken'),
      window.__CCO_DEV_TOKEN__,
    ].filter(Boolean);
    const token = tokenSources[0];
    try {
      const response = await fetch('/api/v1/auth/2fa/setup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(token && token !== '__preview_local__' ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!response.ok) {
        // Stub-fallback: backend-endpoint inte implementerad än, använd dummy-data
        return {
          otpauthUri: 'otpauth://totp/CCO:demo@hairtpclinic.com?secret=JBSWY3DPEHPK3PXP&issuer=CCO',
          secret: 'JBSWY3DPEHPK3PXP',
          stub: true,
        };
      }
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (_e) {
      return {
        otpauthUri: 'otpauth://totp/CCO:demo@hairtpclinic.com?secret=JBSWY3DPEHPK3PXP&issuer=CCO',
        secret: 'JBSWY3DPEHPK3PXP',
        stub: true,
      };
    }
  }

  async function verifyCode(code) {
    const tokenSources = [
      window.localStorage?.getItem?.('cco.adminToken'),
      window.__CCO_DEV_TOKEN__,
    ].filter(Boolean);
    const token = tokenSources[0];
    try {
      const response = await fetch('/api/v1/auth/2fa/verify', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'content-type': 'application/json',
          ...(token && token !== '__preview_local__' ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code }),
      });
      if (response.ok) {
        const text = await response.text();
        return text ? JSON.parse(text) : { verified: true };
      }
      // Stub-fallback: backend ej implementerad — godkänn 6-siffrig kod
      if (/^\d{6}$/.test(code)) return { verified: true, stub: true };
      return { verified: false, error: 'invalid_code' };
    } catch (_e) {
      // Stub-fallback
      if (/^\d{6}$/.test(code)) return { verified: true, stub: true };
      return { verified: false, error: 'network_error' };
    }
  }

  async function open() {
    injectStyles();
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'cco-2fa-backdrop';
      backdrop.setAttribute('hidden', '');
      backdrop.innerHTML = `
        <div class="cco-2fa" role="dialog" aria-modal="true" aria-label="2FA-setup">
          <div class="cco-2fa-header">
            <h3 class="cco-2fa-title">Aktivera tvåfaktorautentisering</h3>
            <div class="cco-2fa-subtitle">Skydda admin-rollen med en authenticator-app</div>
          </div>
          <div class="cco-2fa-body" data-2fa-body>
            <div class="cco-2fa-status">Laddar setup…</div>
          </div>
          <div class="cco-2fa-actions">
            <button class="cco-2fa-btn cco-2fa-btn-cancel" data-2fa-cancel>Avbryt</button>
            <button class="cco-2fa-btn cco-2fa-btn-primary" data-2fa-verify disabled>Verifiera</button>
          </div>
        </div>
      `;
      document.body.appendChild(backdrop);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
      backdrop.querySelector('[data-2fa-cancel]').addEventListener('click', close);
    }
    backdrop.removeAttribute('hidden');
    const body = backdrop.querySelector('[data-2fa-body]');
    const verifyBtn = backdrop.querySelector('[data-2fa-verify]');
    body.innerHTML = '<div class="cco-2fa-status">Laddar setup…</div>';

    const setup = await startSetup();
    if (!setup) {
      body.innerHTML = '<div class="cco-2fa-status is-error">Setup misslyckades — försök igen.</div>';
      return;
    }
    const stubNote = setup.stub
      ? '<div class="cco-2fa-status">Demo-läge: backend-endpoint /api/v1/auth/2fa/setup behöver kopplas in. Verifieringen accepterar valfri 6-siffrig kod tills dess.</div>'
      : '';
    body.innerHTML = `
      <div class="cco-2fa-step">
        <span class="cco-2fa-step-num">1</span>
        <span class="cco-2fa-step-text">Öppna en authenticator-app (Google Authenticator, 1Password, Authy m.fl.) och scanna QR-koden:</span>
      </div>
      <div class="cco-2fa-qr-wrap">
        <img class="cco-2fa-qr-img" src="${buildQrUrl(setup.otpauthUri)}" alt="QR-kod" />
        <div class="cco-2fa-secret" title="Klicka för att kopiera">${escapeHtml(setup.secret)}</div>
      </div>
      <div class="cco-2fa-step">
        <span class="cco-2fa-step-num">2</span>
        <span class="cco-2fa-step-text">Ange den 6-siffriga kod som visas i appen:</span>
      </div>
      <input type="text" class="cco-2fa-input" data-2fa-code maxlength="6" inputmode="numeric" autocomplete="off" placeholder="000000" />
      <div class="cco-2fa-status" data-2fa-result hidden></div>
      ${stubNote}
    `;

    const codeInput = body.querySelector('[data-2fa-code]');
    const resultEl = body.querySelector('[data-2fa-result]');
    codeInput.addEventListener('input', () => {
      const value = codeInput.value.replace(/\D/g, '').slice(0, 6);
      codeInput.value = value;
      verifyBtn.disabled = value.length !== 6;
      codeInput.classList.remove('is-valid', 'is-invalid');
    });
    codeInput.focus();

    verifyBtn.onclick = async () => {
      const code = codeInput.value.trim();
      if (!/^\d{6}$/.test(code)) return;
      verifyBtn.disabled = true;
      resultEl.hidden = false;
      resultEl.className = 'cco-2fa-status';
      resultEl.textContent = 'Verifierar…';
      const result = await verifyCode(code);
      if (result?.verified) {
        codeInput.classList.add('is-valid');
        resultEl.className = 'cco-2fa-status is-success';
        resultEl.textContent = result.stub
          ? '✓ Demo-verifiering OK (stub-läge — koppla in backend för verklig 2FA).'
          : '✓ 2FA aktiverad! Du måste ange koden vid varje inloggning.';
        setTimeout(close, 2500);
      } else {
        codeInput.classList.add('is-invalid');
        resultEl.className = 'cco-2fa-status is-error';
        resultEl.textContent = '✗ Felaktig kod. Försök igen.';
        verifyBtn.disabled = false;
      }
    };
  }

  function close() {
    if (backdrop) backdrop.setAttribute('hidden', '');
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreview2faSetup = Object.freeze({
      open,
      close,
      verifyCode,
    });
  }
})();
