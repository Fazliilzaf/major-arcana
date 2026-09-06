/**
 * P0-004 B-4 — OWNER Role Management UI (Staff Portal).
 *
 * En självständig modul (som staff-portal-session.js) som ger OWNER en minimal
 * arbetsyta för att:
 *   - bjuda in staff med explicit kanonisk roll (KONSULT/PERSONAL/FINANCE/
 *     REVISOR; OPERATOR endast explicit för legacy-migration)
 *   - byta en befintlig staff-medlems roll
 *
 * UI är INTE auktoritativ: all auth sker i backend (OWNER-only + fail-closed).
 * Roll-/tilläggsdata hämtas från backend (/api/v1/staff/me, /api/v1/users/staff).
 * Ingen demo-roll-sanning.
 */
(function (root) {
  'use strict';

  const ROLE_LABELS = {
    OWNER: 'Ägare',
    KONSULT: 'Läkare / Konsult',
    PERSONAL: 'Personal / Sjuksköterska',
    FINANCE: 'Ekonomi',
    REVISOR: 'Revisor',
    OPERATOR: 'Legacy / Operatör',
  };

  // Roller en owner får välja vid invite/rollbyte. OPERATOR bara för explicit
  // legacy-migration — aldrig default.
  const ASSIGNABLE_ROLES = ['KONSULT', 'PERSONAL', 'FINANCE', 'REVISOR', 'OPERATOR'];

  function normalizeRoleChoice(value) {
    if (typeof value !== 'string') return '';
    const upper = value.trim().toUpperCase();
    return ASSIGNABLE_ROLES.includes(upper) ? upper : '';
  }

  /**
   * Bygger invite-payload. Saknad/ogiltig roll → null (UI-förhindrad + backend
   * fail-closed). Returnerar canonical role (uppercase) som backend kräver.
   */
  function buildInvitePayload({ email, password, role } = {}) {
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedPassword = typeof password === 'string' ? password : '';
    const normalizedRole = normalizeRoleChoice(role);
    if (!normalizedEmail || !normalizedPassword || !normalizedRole) return null;
    return { email: normalizedEmail, password: normalizedPassword, role: normalizedRole };
  }

  function esc(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (ch) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[ch]
    );
  }

  function roleOptions(selected) {
    return ASSIGNABLE_ROLES.map((r) => {
      const sel = r === selected ? ' selected' : '';
      const legacyNote = r === 'OPERATOR' ? ' (legacy)' : '';
      return `<option value="${esc(r)}"${sel}>${esc(ROLE_LABELS[r] || r)}${legacyNote}</option>`;
    }).join('');
  }

  /**
   * Monterar rollhanteringen i `container`. `deps`:
   *   - apiFetch(url, opts) → Response-liknande (status + json())
   *   - getToken() → bearer-token
   *   - onChange()  → valfri, anropas när ägarläget ändras
   */
  function mount({ container, apiFetch, getToken, onChange } = {}) {
    if (!container || typeof apiFetch !== 'function' || typeof getToken !== 'function') return;

    function status(message, isError) {
      if (!container.querySelector('.rm-status')) return;
      const el = container.querySelector('.rm-status');
      el.textContent = message || '';
      el.className = 'rm-status' + (isError ? ' is-error' : '');
    }

    async function authFetch(url, opts = {}) {
      const headers = Object.assign({}, opts.headers || {});
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (opts.body) headers['Content-Type'] = 'application/json';
      return apiFetch(url, Object.assign({}, opts, { headers }));
    }

    async function loadStaffList() {
      const res = await authFetch('/api/v1/users/staff');
      if (!res || res.status === 401 || res.status === 403) {
        // Sessionen kan ha ogiltigförklarats (rollbyte). Maskera inte det.
        status('Saknar behörighet — ladda om för att hämta aktuell session.', true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      renderStaffList(Array.isArray(body) ? body : body?.members || body?.users || []);
    }

    function renderStaffList(members) {
      const list = container.querySelector('.rm-staff-list');
      if (!list) return;
      if (!members.length) {
        list.innerHTML = '<p class="rm-empty">Ingen personal ännu.</p>';
        return;
      }
      list.innerHTML = members
        .map((m) => {
          const membership = m?.membership || m || {};
          const user = m?.user || m || {};
          const email = user.email || membership.email || membership.userId || '';
          const role = String(membership.role || '').toUpperCase();
          const id = membership.id || membership.membershipId || '';
          return (
            `<div class="rm-row" data-membership-id="${esc(id)}">` +
            `<span class="rm-email">${esc(email)}</span>` +
            `<select class="rm-role-select">${roleOptions(role)}</select>` +
            `<button class="rm-save" type="button">Spara roll</button>` +
            `</div>`
          );
        })
        .join('');

      list.querySelectorAll('.rm-row').forEach((row) => {
        const membershipId = row.getAttribute('data-membership-id');
        row.querySelector('.rm-save').addEventListener('click', async () => {
          const role = normalizeRoleChoice(row.querySelector('.rm-role-select').value);
          if (!role) {
            status('Välj en roll.', true);
            return;
          }
          status('Sparar…');
          const res = await authFetch(`/api/v1/users/staff/${encodeURIComponent(membershipId)}`, {
            method: 'PATCH',
            body: JSON.stringify({ role }),
          });
          if (!res || res.status !== 200) {
            const body = await res?.json().catch(() => ({}));
            status(body?.error || 'Kunde inte spara roll.', true);
            return;
          }
          status('Roll uppdaterad.');
          await loadStaffList();
        });
      });
    }

    async function init() {
      const me = await authFetch('/api/v1/staff/me');
      if (!me || me.status !== 200) {
        container.hidden = true;
        if (onChange) onChange({ role: null, isOwner: false });
        return;
      }
      const body = await me.json().catch(() => ({}));
      const role = String(body?.role || '').toLowerCase();
      const isOwner = role === 'owner';
      container.hidden = !isOwner;
      if (onChange) onChange({ role, isOwner });
      if (!isOwner) return;
      await loadStaffList();
    }

    // Formulär-wiring
    const form = container.querySelector('.rm-invite-form');
    if (form) {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const email = form.querySelector('.rm-email-input')?.value || '';
        const password = form.querySelector('.rm-password-input')?.value || '';
        const role = form.querySelector('.rm-role-input')?.value || '';
        const payload = buildInvitePayload({ email, password, role });
        if (!payload) {
          status('E-post, lösenord och roll krävs.', true);
          return;
        }
        status('Bjuder in…');
        const res = await authFetch('/api/v1/users/staff', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res || (res.status !== 200 && res.status !== 201)) {
          const body = await res?.json().catch(() => ({}));
          status(body?.error || 'Kunde inte bjuda in.', true);
          return;
        }
        status('Inbjuden.');
        form.reset();
        await loadStaffList();
      });
    }

    init();
  }

  const api = { ROLE_LABELS, ASSIGNABLE_ROLES, normalizeRoleChoice, buildInvitePayload, mount };
  root.ArcanaStaffRoleManagement = api;
  /* eslint-disable-next-line no-undef */
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
