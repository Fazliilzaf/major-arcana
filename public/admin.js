(function () {
  const API_BASE = '/api/v1';
  const TOKEN_KEY = 'ARCANA_ADMIN_TOKEN';

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || '',
    role: '',
    tenantId: '',
    pendingLoginTicket: '',
    availableTenants: [],
    templates: [],
    versions: [],
    sessions: [],
    selectedTemplateId: '',
    selectedVersionId: '',
    staffMembers: [],
    calibrationSuggestion: null,
    riskFilters: {
      minRiskLevel: 3,
      ownerDecision: '',
    },
  };

  const els = {
    loginPanel: document.getElementById('loginPanel'),
    dashboardPanel: document.getElementById('dashboardPanel'),
    emailInput: document.getElementById('emailInput'),
    passwordInput: document.getElementById('passwordInput'),
    tenantInput: document.getElementById('tenantInput'),
    tenantSelectionPanel: document.getElementById('tenantSelectionPanel'),
    tenantSelectionSelect: document.getElementById('tenantSelectionSelect'),
    completeTenantSelectionBtn: document.getElementById('completeTenantSelectionBtn'),
    loginBtn: document.getElementById('loginBtn'),
    loginStatus: document.getElementById('loginStatus'),
    sessionMeta: document.getElementById('sessionMeta'),
    tenantSwitchSelect: document.getElementById('tenantSwitchSelect'),
    switchTenantBtn: document.getElementById('switchTenantBtn'),
    refreshBtn: document.getElementById('refreshBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    templatesTotal: document.getElementById('templatesTotal'),
    templatesActive: document.getElementById('templatesActive'),
    riskTotal: document.getElementById('riskTotal'),
    riskOpen: document.getElementById('riskOpen'),
    categoryBadges: document.getElementById('categoryBadges'),
    riskBadges: document.getElementById('riskBadges'),
    riskTableBody: document.getElementById('riskTableBody'),
    auditList: document.getElementById('auditList'),
    staffEmailInput: document.getElementById('staffEmailInput'),
    staffPasswordInput: document.getElementById('staffPasswordInput'),
    createStaffBtn: document.getElementById('createStaffBtn'),
    refreshStaffBtn: document.getElementById('refreshStaffBtn'),
    staffStatus: document.getElementById('staffStatus'),
    staffTableBody: document.getElementById('staffTableBody'),
    sessionsScopeSelect: document.getElementById('sessionsScopeSelect'),
    sessionsIncludeRevoked: document.getElementById('sessionsIncludeRevoked'),
    loadSessionsBtn: document.getElementById('loadSessionsBtn'),
    sessionsStatus: document.getElementById('sessionsStatus'),
    sessionsTableBody: document.getElementById('sessionsTableBody'),
    riskLabCategory: document.getElementById('riskLabCategory'),
    riskLabScope: document.getElementById('riskLabScope'),
    riskLabContent: document.getElementById('riskLabContent'),
    riskLabVariables: document.getElementById('riskLabVariables'),
    runRiskPreviewBtn: document.getElementById('runRiskPreviewBtn'),
    riskLabStatus: document.getElementById('riskLabStatus'),
    riskLabResult: document.getElementById('riskLabResult'),
    orchestratorPromptInput: document.getElementById('orchestratorPromptInput'),
    runOrchestratorBtn: document.getElementById('runOrchestratorBtn'),
    orchestratorStatus: document.getElementById('orchestratorStatus'),
    orchestratorResult: document.getElementById('orchestratorResult'),
    fetchCalibrationSuggestionBtn: document.getElementById('fetchCalibrationSuggestionBtn'),
    applyCalibrationSuggestionBtn: document.getElementById('applyCalibrationSuggestionBtn'),
    calibrationNoteInput: document.getElementById('calibrationNoteInput'),
    calibrationStatus: document.getElementById('calibrationStatus'),
    calibrationResult: document.getElementById('calibrationResult'),
    reportDaysInput: document.getElementById('reportDaysInput'),
    runPilotReportBtn: document.getElementById('runPilotReportBtn'),
    reportStatus: document.getElementById('reportStatus'),
    pilotReportResult: document.getElementById('pilotReportResult'),
    refreshMailInsightsBtn: document.getElementById('refreshMailInsightsBtn'),
    previewMailSeedsBtn: document.getElementById('previewMailSeedsBtn'),
    applyMailSeedsBtn: document.getElementById('applyMailSeedsBtn'),
    mailSeedsCategory: document.getElementById('mailSeedsCategory'),
    mailSeedsLimit: document.getElementById('mailSeedsLimit'),
    mailSeedsNamePrefix: document.getElementById('mailSeedsNamePrefix'),
    mailInsightsStatus: document.getElementById('mailInsightsStatus'),
    mailInsightsResult: document.getElementById('mailInsightsResult'),
    refreshMonitorBtn: document.getElementById('refreshMonitorBtn'),
    monitorPanelStatus: document.getElementById('monitorPanelStatus'),
    monitorResult: document.getElementById('monitorResult'),
    loadStateManifestBtn: document.getElementById('loadStateManifestBtn'),
    createStateBackupBtn: document.getElementById('createStateBackupBtn'),
    listStateBackupsBtn: document.getElementById('listStateBackupsBtn'),
    previewPruneBackupsBtn: document.getElementById('previewPruneBackupsBtn'),
    runPruneBackupsBtn: document.getElementById('runPruneBackupsBtn'),
    restoreBackupFileInput: document.getElementById('restoreBackupFileInput'),
    previewStateRestoreBtn: document.getElementById('previewStateRestoreBtn'),
    runStateRestoreBtn: document.getElementById('runStateRestoreBtn'),
    opsStatus: document.getElementById('opsStatus'),
    opsResult: document.getElementById('opsResult'),
    riskMinFilter: document.getElementById('riskMinFilter'),
    riskOwnerDecisionFilter: document.getElementById('riskOwnerDecisionFilter'),
    applyRiskFilterBtn: document.getElementById('applyRiskFilterBtn'),
    assistantName: document.getElementById('assistantName'),
    toneStyle: document.getElementById('toneStyle'),
    brandProfile: document.getElementById('brandProfile'),
    riskModifier: document.getElementById('riskModifier'),
    templateEmailSignature: document.getElementById('templateEmailSignature'),
    templateAllowlistOverrides: document.getElementById('templateAllowlistOverrides'),
    templateRequiredOverrides: document.getElementById('templateRequiredOverrides'),
    saveTenantConfigBtn: document.getElementById('saveTenantConfigBtn'),
    tenantConfigStatus: document.getElementById('tenantConfigStatus'),
    refreshTenantsBtn: document.getElementById('refreshTenantsBtn'),
    tenantCatalog: document.getElementById('tenantCatalog'),
    onboardTenantId: document.getElementById('onboardTenantId'),
    onboardOwnerEmail: document.getElementById('onboardOwnerEmail'),
    onboardOwnerPassword: document.getElementById('onboardOwnerPassword'),
    onboardAssistantName: document.getElementById('onboardAssistantName'),
    onboardToneStyle: document.getElementById('onboardToneStyle'),
    onboardBrandProfile: document.getElementById('onboardBrandProfile'),
    onboardRiskModifier: document.getElementById('onboardRiskModifier'),
    onboardTenantBtn: document.getElementById('onboardTenantBtn'),
    tenantOnboardStatus: document.getElementById('tenantOnboardStatus'),
    templateNameInput: document.getElementById('templateNameInput'),
    templateCategoryInput: document.getElementById('templateCategoryInput'),
    templateChannelInput: document.getElementById('templateChannelInput'),
    templateLocaleInput: document.getElementById('templateLocaleInput'),
    createTemplateBtn: document.getElementById('createTemplateBtn'),
    templateFilterSelect: document.getElementById('templateFilterSelect'),
    templateStatus: document.getElementById('templateStatus'),
    templateTableBody: document.getElementById('templateTableBody'),
    versionTableBody: document.getElementById('versionTableBody'),
    selectedTemplateMeta: document.getElementById('selectedTemplateMeta'),
    selectedVersionMeta: document.getElementById('selectedVersionMeta'),
    versionTitleInput: document.getElementById('versionTitleInput'),
    draftInstructionInput: document.getElementById('draftInstructionInput'),
    versionContentInput: document.getElementById('versionContentInput'),
    generateDraftBtn: document.getElementById('generateDraftBtn'),
    saveDraftBtn: document.getElementById('saveDraftBtn'),
    evaluateBtn: document.getElementById('evaluateBtn'),
    activateBtn: document.getElementById('activateBtn'),
    archiveBtn: document.getElementById('archiveBtn'),
    cloneBtn: document.getElementById('cloneBtn'),
    versionStatus: document.getElementById('versionStatus'),
    versionRiskBlock: document.getElementById('versionRiskBlock'),
  };

  function setText(el, value) {
    if (!el) return;
    el.textContent = String(value ?? '');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseJsonObjectInput(rawValue, fieldName) {
    const text = String(rawValue || '').trim();
    if (!text) return {};
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${fieldName} måste vara giltig JSON.`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${fieldName} måste vara ett JSON-objekt.`);
    }
    return parsed;
  }

  function toPrettyJson(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
    const compact = Object.entries(value).reduce((acc, [key, item]) => {
      if (!Array.isArray(item) || item.length === 0) return acc;
      acc[key] = item;
      return acc;
    }, {});
    return JSON.stringify(compact, null, 2);
  }

  function setStatus(el, message, isError = false) {
    if (!el) return;
    el.textContent = message || '';
    el.style.color = isError ? '#ffb2b2' : '#9aa6bb';
  }

  function setAuthVisible(isLoggedIn) {
    els.loginPanel.classList.toggle('hidden', isLoggedIn);
    els.dashboardPanel.classList.toggle('hidden', !isLoggedIn);
    if (!isLoggedIn) {
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      if (els.tenantSelectionSelect) els.tenantSelectionSelect.innerHTML = '';
      state.pendingLoginTicket = '';
    }
  }

  function setSessionMeta() {
    if (!els.sessionMeta) return;
    if (!state.token || !state.tenantId || !state.role) {
      els.sessionMeta.textContent = 'Inte inloggad';
      return;
    }
    els.sessionMeta.textContent = `Tenant: ${state.tenantId} • Roll: ${state.role}`;
  }

  function renderTenantSwitchOptions() {
    if (!els.tenantSwitchSelect) return;
    const previous = els.tenantSwitchSelect.value || state.tenantId || '';
    const memberships = Array.isArray(state.availableTenants) ? state.availableTenants : [];

    els.tenantSwitchSelect.innerHTML = '';
    if (!memberships.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Tenant';
      els.tenantSwitchSelect.appendChild(option);
      return;
    }

    for (const membership of memberships) {
      const tenantId = membership?.tenantId || membership?.membership?.tenantId || '';
      if (!tenantId) continue;
      const role = membership?.role || membership?.membership?.role || 'okänd';
      const assistantName = membership?.config?.assistantName || '';
      const option = document.createElement('option');
      option.value = tenantId;
      option.textContent = assistantName
        ? `${tenantId} · ${assistantName} (${role})`
        : `${tenantId} (${role})`;
      els.tenantSwitchSelect.appendChild(option);
    }

    const hasPrevious = memberships.some((item) => item.tenantId === previous);
    els.tenantSwitchSelect.value = hasPrevious ? previous : state.tenantId || memberships[0]?.tenantId || '';
  }

  function renderPendingTenantSelection(tenants = []) {
    if (!els.tenantSelectionPanel || !els.tenantSelectionSelect) return;
    els.tenantSelectionSelect.innerHTML = '';
    for (const tenant of tenants) {
      if (!tenant?.tenantId) continue;
      const option = document.createElement('option');
      option.value = tenant.tenantId;
      option.textContent = `${tenant.tenantId} (${tenant.role || 'okänd'})`;
      els.tenantSelectionSelect.appendChild(option);
    }
    const hasOptions = els.tenantSelectionSelect.options.length > 0;
    els.tenantSelectionPanel.classList.toggle('hidden', !hasOptions);
  }

  function isOwner() {
    return state.role === 'OWNER';
  }

  function canTemplateWrite() {
    return state.role === 'OWNER' || state.role === 'STAFF';
  }

  function updateLifecyclePermissions() {
    const writer = canTemplateWrite();
    const owner = isOwner();
    const hasTemplate = Boolean(state.selectedTemplateId);
    const hasVersion = Boolean(state.selectedVersionId);

    if (els.createTemplateBtn) els.createTemplateBtn.disabled = !writer;
    if (els.generateDraftBtn) els.generateDraftBtn.disabled = !writer || !hasTemplate;
    if (els.saveDraftBtn) els.saveDraftBtn.disabled = !writer || !hasVersion;
    if (els.evaluateBtn) els.evaluateBtn.disabled = !writer || !hasVersion;
    if (els.cloneBtn) els.cloneBtn.disabled = !writer || !hasVersion;
    if (els.activateBtn) els.activateBtn.disabled = !owner || !hasVersion;
    if (els.archiveBtn) els.archiveBtn.disabled = !owner || !hasVersion;
    if (els.createStaffBtn) els.createStaffBtn.disabled = !owner;
    if (els.refreshStaffBtn) els.refreshStaffBtn.disabled = !owner;
    if (els.runRiskPreviewBtn) els.runRiskPreviewBtn.disabled = !writer;
    if (els.runOrchestratorBtn) els.runOrchestratorBtn.disabled = !writer;
    if (els.fetchCalibrationSuggestionBtn) els.fetchCalibrationSuggestionBtn.disabled = !writer;
    if (els.applyCalibrationSuggestionBtn) els.applyCalibrationSuggestionBtn.disabled = !owner;
    if (els.runPilotReportBtn) els.runPilotReportBtn.disabled = !writer;
    if (els.refreshMailInsightsBtn) els.refreshMailInsightsBtn.disabled = !writer;
    if (els.previewMailSeedsBtn) els.previewMailSeedsBtn.disabled = !owner;
    if (els.applyMailSeedsBtn) els.applyMailSeedsBtn.disabled = !owner;
    if (els.mailSeedsCategory) els.mailSeedsCategory.disabled = !owner;
    if (els.mailSeedsLimit) els.mailSeedsLimit.disabled = !owner;
    if (els.mailSeedsNamePrefix) els.mailSeedsNamePrefix.disabled = !owner;
    if (els.refreshMonitorBtn) els.refreshMonitorBtn.disabled = !writer;
    if (els.refreshTenantsBtn) els.refreshTenantsBtn.disabled = !writer;
    if (els.onboardTenantBtn) els.onboardTenantBtn.disabled = !owner;
    if (els.loadSessionsBtn) els.loadSessionsBtn.disabled = !writer;
    if (els.loadStateManifestBtn) els.loadStateManifestBtn.disabled = !owner;
    if (els.createStateBackupBtn) els.createStateBackupBtn.disabled = !owner;
    if (els.listStateBackupsBtn) els.listStateBackupsBtn.disabled = !owner;
    if (els.previewPruneBackupsBtn) els.previewPruneBackupsBtn.disabled = !owner;
    if (els.runPruneBackupsBtn) els.runPruneBackupsBtn.disabled = !owner;
    if (els.previewStateRestoreBtn) els.previewStateRestoreBtn.disabled = !owner;
    if (els.runStateRestoreBtn) els.runStateRestoreBtn.disabled = !owner;
    if (els.restoreBackupFileInput) els.restoreBackupFileInput.disabled = !owner;
    if (els.switchTenantBtn) {
      const tenantCount = Array.isArray(state.availableTenants) ? state.availableTenants.length : 0;
      els.switchTenantBtn.disabled = !writer || tenantCount < 2;
    }
    if (els.tenantSwitchSelect) {
      const tenantCount = Array.isArray(state.availableTenants) ? state.availableTenants.length : 0;
      els.tenantSwitchSelect.disabled = !writer || tenantCount < 2;
    }

    const lockEditor = !writer || !hasVersion;
    [els.versionTitleInput, els.versionContentInput].forEach((el) => {
      if (!el) return;
      el.disabled = lockEditor;
    });

    [els.staffEmailInput, els.staffPasswordInput].forEach((el) => {
      if (!el) return;
      el.disabled = !owner;
    });

    [
      els.assistantName,
      els.toneStyle,
      els.brandProfile,
      els.riskModifier,
      els.templateEmailSignature,
      els.templateAllowlistOverrides,
      els.templateRequiredOverrides,
      els.saveTenantConfigBtn,
    ].forEach((el) => {
      if (!el) return;
      el.disabled = !owner;
    });

    if (els.sessionsScopeSelect) {
      els.sessionsScopeSelect.disabled = !writer;
      const tenantOption = els.sessionsScopeSelect.querySelector('option[value="tenant"]');
      if (tenantOption) tenantOption.disabled = !owner;
      if (!owner && els.sessionsScopeSelect.value === 'tenant') {
        els.sessionsScopeSelect.value = 'me';
      }
    }
    if (els.sessionsIncludeRevoked) els.sessionsIncludeRevoked.disabled = !writer;

    if (els.calibrationNoteInput) els.calibrationNoteInput.disabled = !owner;
    [
      els.onboardTenantId,
      els.onboardOwnerEmail,
      els.onboardOwnerPassword,
      els.onboardAssistantName,
      els.onboardToneStyle,
      els.onboardBrandProfile,
      els.onboardRiskModifier,
    ].forEach((el) => {
      if (!el) return;
      el.disabled = !owner;
    });
  }

  async function api(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || 'Ogiltigt svar.' };
    }

    if (!response.ok) {
      const error = new Error(data?.error || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function dotClassForRiskLevel(level) {
    const n = Number(level) || 1;
    if (n >= 4) return 'bad';
    if (n === 3) return 'warn';
    return 'ok';
  }

  function renderBadges(container, items) {
    container.innerHTML = '';
    for (const item of items) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.style.marginRight = '8px';
      badge.style.marginBottom = '8px';
      badge.innerHTML = `<span class="dot ${item.dot || 'ok'}"></span>${item.label}: <strong>${item.value}</strong>`;
      container.appendChild(badge);
    }
  }

  function renderRiskTable(evaluations) {
    els.riskTableBody.innerHTML = '';

    for (const evaluation of evaluations) {
      const tr = document.createElement('tr');
      const reasonCodes = Array.isArray(evaluation.reasonCodes) ? evaluation.reasonCodes : [];
      const reasonCodesShort = reasonCodes.length ? reasonCodes.slice(0, 3).join(', ') : '';
      const ownerDecision = String(evaluation.ownerDecision || '');
      const riskLevel = Number(evaluation.riskLevel || 1);
      const riskScore = Number(evaluation.riskScore || 0);
      const semanticScore = Number(evaluation.semanticScore || 0);
      const ruleScore = Number(evaluation.ruleScore || 0);
      const policyAdjustments = Array.isArray(evaluation.policyAdjustments)
        ? evaluation.policyAdjustments
        : [];
      const policyHitRows = policyAdjustments
        .map(
          (item) =>
            `${escapeHtml(item.reasonCode || 'policy_rule')}→L${escapeHtml(item.floorApplied || '?')}`
        )
        .join('<br/>');
      const reasonCodesFull = reasonCodes.length
        ? reasonCodes.map((item) => escapeHtml(item)).join('<br/>')
        : '-';
      const selectedAction =
        ownerDecision === 'approved_exception'
          ? 'approve_exception'
          : ownerDecision === 'false_positive'
          ? 'mark_false_positive'
          : ownerDecision === 'escalated'
          ? 'escalate'
          : 'request_revision';
      tr.innerHTML = `
        <td class="code">${evaluation.id}</td>
        <td class="code">${evaluation.templateId}<br/>v:${evaluation.templateVersionId}</td>
        <td><span class="badge"><span class="dot ${dotClassForRiskLevel(riskLevel)}"></span>L${riskLevel}</span></td>
        <td>${evaluation.decision || '-'}</td>
        <td>${evaluation.ownerDecision || 'pending'}</td>
        <td class="mini">
          risk: <strong>${riskScore}</strong><br/>
          sem: ${semanticScore}<br/>
          rule: ${ruleScore}
        </td>
        <td class="mini">
          ${policyAdjustments.length ? policyHitRows : '-'}
        </td>
        <td class="mini" title="${escapeHtml(reasonCodes.join(', '))}">${escapeHtml(reasonCodesShort || '-')}${reasonCodes.length > 3 ? ' ...' : ''}<br/><span class="muted">${reasonCodes.length} st</span></td>
        <td>
          <div class="actions">
            <select data-eid="${evaluation.id}" class="ownerActionSelect">
              <option value="request_revision" ${
                selectedAction === 'request_revision' ? 'selected' : ''
              }>request_revision</option>
              <option value="approve_exception" ${
                selectedAction === 'approve_exception' ? 'selected' : ''
              }>approve_exception</option>
              <option value="mark_false_positive" ${
                selectedAction === 'mark_false_positive' ? 'selected' : ''
              }>mark_false_positive</option>
              <option value="escalate" ${selectedAction === 'escalate' ? 'selected' : ''}>escalate</option>
            </select>
            <button class="btn small ownerActionBtn" data-eid="${evaluation.id}">Spara</button>
          </div>
          <details class="mini" style="margin-top:6px">
            <summary class="muted">Detaljer</summary>
            <div class="code" style="margin-top:6px">Uppdaterad: ${escapeHtml(evaluation.updatedAt || evaluation.evaluatedAt || '-')}</div>
            <div class="code" style="margin-top:4px">${reasonCodesFull}</div>
          </details>
        </td>
      `;
      els.riskTableBody.appendChild(tr);
    }

    const canEdit = isOwner();
    els.riskTableBody.querySelectorAll('.ownerActionBtn').forEach((btn) => {
      btn.disabled = !canEdit;
      btn.addEventListener('click', async () => {
        const evaluationId = btn.getAttribute('data-eid');
        const select = els.riskTableBody.querySelector(`.ownerActionSelect[data-eid="${evaluationId}"]`);
        const action = select ? select.value : 'request_revision';
        const note = window.prompt('Kort notering (valfritt):', 'Owner panel action');
        try {
          await api(`/risk/evaluations/${evaluationId}/owner-action`, {
            method: 'POST',
            body: { action, note: note || '' },
          });
          await refreshAll();
        } catch (error) {
          alert(error.message || 'Kunde inte spara owner action.');
        }
      });
    });
  }

  function renderAudit(events) {
    els.auditList.innerHTML = '';
    for (const event of events) {
      const li = document.createElement('li');
      li.innerHTML = `
        <div><strong>${event.action}</strong> · ${event.outcome}</div>
        <div class="muted code">${event.ts} · target: ${event.targetType || '-'}:${event.targetId || '-'}</div>
      `;
      els.auditList.appendChild(li);
    }
  }

  function renderStaffTable(members) {
    if (!els.staffTableBody) return;
    els.staffTableBody.innerHTML = '';
    const owner = isOwner();

    for (const item of members) {
      const email = item?.user?.email || '-';
      const role = item?.membership?.role || '-';
      const status = item?.membership?.status || '-';
      const membershipId = item?.membership?.id || '';
      const isOwnerMembership = role === 'OWNER';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${email}</td>
        <td>${role}</td>
        <td>${status}</td>
        <td>
          ${
            isOwnerMembership
              ? '<span class="mini muted">immutable</span>'
              : `<button class="btn small staffToggleBtn" data-mid="${membershipId}" data-next="${
                  status === 'active' ? 'disabled' : 'active'
                }">${status === 'active' ? 'Disable' : 'Enable'}</button>`
          }
        </td>
      `;
      els.staffTableBody.appendChild(tr);
    }

    els.staffTableBody.querySelectorAll('.staffToggleBtn').forEach((btn) => {
      btn.disabled = !owner;
      btn.addEventListener('click', async () => {
        const membershipId = btn.getAttribute('data-mid');
        const nextStatus = btn.getAttribute('data-next');
        if (!membershipId || !nextStatus) return;
        try {
          setStatus(els.staffStatus, 'Uppdaterar staff-status...');
          await api(`/users/staff/${membershipId}`, {
            method: 'PATCH',
            body: { status: nextStatus },
          });
          setStatus(els.staffStatus, `Staff-status uppdaterad till ${nextStatus}.`);
          await loadStaffMembers();
          await loadDashboard();
        } catch (error) {
          setStatus(els.staffStatus, error.message || 'Kunde inte uppdatera staff-status.', true);
        }
      });
    });
  }

  function renderSessionsTable(entries = [], currentSessionId = '') {
    if (!els.sessionsTableBody) return;
    els.sessionsTableBody.innerHTML = '';

    if (!Array.isArray(entries) || entries.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="6" class="muted">Inga sessioner hittades.</td>';
      els.sessionsTableBody.appendChild(tr);
      return;
    }

    for (const entry of entries) {
      const session = entry?.session || entry || {};
      const sessionId = session?.id || '';
      const isCurrent = currentSessionId && sessionId === currentSessionId;
      const status = session?.revokedAt ? 'revoked' : 'active';
      const userEmail = entry?.user?.email || '-';
      const role = entry?.membership?.role || session?.role || '-';
      const lastSeen = session?.lastSeenAt || session?.createdAt || '-';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="code">${escapeHtml(sessionId || '-')} ${isCurrent ? '<span class="chip">current</span>' : ''}</td>
        <td>${escapeHtml(userEmail)}</td>
        <td>${escapeHtml(role)}</td>
        <td class="mini">${escapeHtml(lastSeen)}</td>
        <td>${escapeHtml(status)}</td>
        <td>
          ${
            status === 'active'
              ? `<button class="btn small revokeSessionBtn" data-session-id="${escapeHtml(sessionId)}" ${
                  isCurrent ? 'title="Aktuell session"' : ''
                }>${isCurrent ? 'Logga ut denna' : 'Avsluta'}</button>`
              : '<span class="mini muted">-</span>'
          }
        </td>
      `;
      els.sessionsTableBody.appendChild(tr);
    }

    const canManage = canTemplateWrite();
    els.sessionsTableBody.querySelectorAll('.revokeSessionBtn').forEach((btn) => {
      btn.disabled = !canManage;
      btn.addEventListener('click', async () => {
        const sessionId = btn.getAttribute('data-session-id') || '';
        if (!sessionId) return;
        await revokeSessionById(sessionId);
      });
    });
  }

  async function loadSessionsPanel() {
    if (!canTemplateWrite()) {
      state.sessions = [];
      renderSessionsTable([], '');
      return;
    }

    try {
      let scope = String(els.sessionsScopeSelect?.value || 'me').trim().toLowerCase();
      if (!isOwner() && scope === 'tenant') {
        scope = 'me';
        if (els.sessionsScopeSelect) els.sessionsScopeSelect.value = 'me';
      }
      const includeRevoked = Boolean(els.sessionsIncludeRevoked?.checked);

      setStatus(els.sessionsStatus, 'Laddar sessioner...');
      const query = new URLSearchParams({
        scope,
        includeRevoked: includeRevoked ? '1' : '0',
        limit: '100',
      });
      const response = await api(`/auth/sessions?${query.toString()}`);

      state.sessions = Array.isArray(response?.sessions) ? response.sessions : [];
      renderSessionsTable(state.sessions, response?.currentSessionId || '');
      setStatus(
        els.sessionsStatus,
        `Sessioner: ${response?.count ?? state.sessions.length} (scope: ${response?.scope || scope})`
      );
    } catch (error) {
      state.sessions = [];
      renderSessionsTable([], '');
      setStatus(els.sessionsStatus, error.message || 'Kunde inte läsa sessioner.', true);
    }
  }

  async function revokeSessionById(sessionId) {
    if (!sessionId) return;
    const confirmed = window.confirm('Avsluta vald session?');
    if (!confirmed) return;

    try {
      setStatus(els.sessionsStatus, 'Avslutar session...');
      const response = await api(`/auth/sessions/${encodeURIComponent(sessionId)}/revoke`, {
        method: 'POST',
        body: {
          reason: 'owner_panel_revoke',
        },
      });
      if (response?.currentSessionRevoked) {
        setStatus(els.sessionsStatus, 'Nuvarande session avslutades. Loggar ut...');
        logout();
        return;
      }
      setStatus(els.sessionsStatus, 'Session avslutad.');
      await loadSessionsPanel();
    } catch (error) {
      setStatus(els.sessionsStatus, error.message || 'Kunde inte avsluta session.', true);
    }
  }

  function fillTenantConfig(config) {
    els.assistantName.value = config.assistantName || '';
    els.toneStyle.value = config.toneStyle || '';
    els.brandProfile.value = config.brandProfile || '';
    els.riskModifier.value = String(config.riskSensitivityModifier ?? 0);
    if (els.templateEmailSignature) {
      els.templateEmailSignature.value = String(
        config?.templateSignaturesByChannel?.email || ''
      );
    }
    if (els.templateAllowlistOverrides) {
      els.templateAllowlistOverrides.value = toPrettyJson(
        config?.templateVariableAllowlistByCategory || {}
      );
    }
    if (els.templateRequiredOverrides) {
      els.templateRequiredOverrides.value = toPrettyJson(
        config?.templateRequiredVariablesByCategory || {}
      );
    }

    const canEdit = isOwner();
    [
      els.assistantName,
      els.toneStyle,
      els.brandProfile,
      els.riskModifier,
      els.templateEmailSignature,
      els.templateAllowlistOverrides,
      els.templateRequiredOverrides,
      els.saveTenantConfigBtn,
    ].forEach((el) => {
      if (!el) return;
      el.disabled = !canEdit;
    });
  }

  function clearVersionEditor() {
    state.selectedVersionId = '';
    setText(els.selectedVersionMeta, 'Ingen version vald.');
    if (els.versionTitleInput) els.versionTitleInput.value = '';
    if (els.versionContentInput) els.versionContentInput.value = '';
    if (els.versionRiskBlock) els.versionRiskBlock.textContent = '';
    updateLifecyclePermissions();
  }

  function renderTemplateTable() {
    const selectedId = state.selectedTemplateId;
    els.templateTableBody.innerHTML = '';

    for (const template of state.templates) {
      const tr = document.createElement('tr');
      const selected = template.id === selectedId;
      tr.innerHTML = `
        <td>${template.name}</td>
        <td>${template.category}</td>
        <td class="code">${template.currentActiveVersionId ? 'yes' : '-'}</td>
        <td><button class="btn small templateSelectBtn" data-tid="${template.id}">${selected ? 'Vald' : 'Välj'}</button></td>
      `;
      els.templateTableBody.appendChild(tr);
    }

    els.templateTableBody.querySelectorAll('.templateSelectBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const templateId = btn.getAttribute('data-tid');
        await selectTemplate(templateId, { preserveVersion: false });
      });
    });
  }

  function renderVersionTable() {
    const selectedId = state.selectedVersionId;
    els.versionTableBody.innerHTML = '';

    for (const version of state.versions) {
      const tr = document.createElement('tr');
      const riskLevel = version?.risk?.riskLevel || '-';
      const selected = version.id === selectedId;
      tr.innerHTML = `
        <td>${version.versionNo}</td>
        <td>${version.state}</td>
        <td>${riskLevel}</td>
        <td><button class="btn small versionSelectBtn" data-vid="${version.id}">${selected ? 'Vald' : 'Öppna'}</button></td>
      `;
      els.versionTableBody.appendChild(tr);
    }

    els.versionTableBody.querySelectorAll('.versionSelectBtn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const versionId = btn.getAttribute('data-vid');
        await selectVersion(versionId);
      });
    });
  }

  function fillVersionEditor(version) {
    if (!version) {
      clearVersionEditor();
      return;
    }
    state.selectedVersionId = version.id;
    setText(
      els.selectedVersionMeta,
      `v${version.versionNo} · state=${version.state} · createdAt=${version.createdAt}`
    );
    if (els.versionTitleInput) els.versionTitleInput.value = version.title || '';
    if (els.versionContentInput) els.versionContentInput.value = version.content || '';
    if (els.versionRiskBlock) {
      els.versionRiskBlock.textContent = version.risk
        ? JSON.stringify(version.risk, null, 2)
        : 'Ingen riskutvärdering ännu.';
    }
    updateLifecyclePermissions();
  }

  async function selectVersion(versionId) {
    if (!state.selectedTemplateId || !versionId) return;
    const local = state.versions.find((item) => item.id === versionId);
    if (local) {
      fillVersionEditor(local);
      return;
    }
    const response = await api(`/templates/${state.selectedTemplateId}/versions/${versionId}`);
    fillVersionEditor(response?.version || null);
  }

  async function loadVersionsForSelectedTemplate({ preserveVersion = true } = {}) {
    if (!state.selectedTemplateId) {
      state.versions = [];
      els.versionTableBody.innerHTML = '';
      clearVersionEditor();
      return;
    }

    const response = await api(`/templates/${state.selectedTemplateId}/versions`);
    state.versions = Array.isArray(response?.versions) ? response.versions : [];
    renderVersionTable();

    if (!state.versions.length) {
      clearVersionEditor();
      return;
    }

    const keepId =
      preserveVersion && state.selectedVersionId && state.versions.some((v) => v.id === state.selectedVersionId)
        ? state.selectedVersionId
        : state.versions[0].id;
    await selectVersion(keepId);
  }

  async function selectTemplate(templateId, { preserveVersion = true } = {}) {
    state.selectedTemplateId = templateId || '';
    const template = state.templates.find((item) => item.id === state.selectedTemplateId);
    if (template) {
      setText(
        els.selectedTemplateMeta,
        `${template.name} · ${template.category} · locale=${template.locale} · channel=${template.channel}`
      );
    } else {
      setText(els.selectedTemplateMeta, 'Ingen mall vald.');
    }
    renderTemplateTable();
    await loadVersionsForSelectedTemplate({ preserveVersion });
    updateLifecyclePermissions();
  }

  async function loadTemplates({ preserveSelection = true } = {}) {
    const category = els.templateFilterSelect?.value || '';
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const response = await api(`/templates${query}`);
    state.templates = Array.isArray(response?.templates) ? response.templates : [];
    renderTemplateTable();

    if (!state.templates.length) {
      state.selectedTemplateId = '';
      state.versions = [];
      setText(els.selectedTemplateMeta, 'Ingen mall vald.');
      els.versionTableBody.innerHTML = '';
      clearVersionEditor();
      return;
    }

    const keepTemplateId =
      preserveSelection &&
      state.selectedTemplateId &&
      state.templates.some((item) => item.id === state.selectedTemplateId)
        ? state.selectedTemplateId
        : state.templates[0].id;
    await selectTemplate(keepTemplateId, { preserveVersion: true });
  }

  async function createTemplate() {
    try {
      setStatus(els.templateStatus, 'Skapar mall...');
      const name = (els.templateNameInput?.value || '').trim();
      if (!name) throw new Error('Mallnamn krävs.');

      const response = await api('/templates', {
        method: 'POST',
        body: {
          name,
          category: els.templateCategoryInput?.value || 'CONSULTATION',
          channel: (els.templateChannelInput?.value || 'email').trim(),
          locale: (els.templateLocaleInput?.value || 'sv-SE').trim(),
        },
      });

      setStatus(els.templateStatus, 'Mall skapad.');
      if (els.templateNameInput) els.templateNameInput.value = '';
      await loadDashboard();
      await loadTemplates({ preserveSelection: false });
      if (response?.template?.id) await selectTemplate(response.template.id, { preserveVersion: false });
    } catch (error) {
      setStatus(els.templateStatus, error.message || 'Kunde inte skapa mall.', true);
    }
  }

  async function generateDraft() {
    try {
      if (!state.selectedTemplateId) throw new Error('Välj en mall först.');
      setStatus(els.versionStatus, 'Genererar draft...');
      const response = await api(`/templates/${state.selectedTemplateId}/drafts/generate`, {
        method: 'POST',
        body: {
          instruction: (els.draftInstructionInput?.value || '').trim(),
          title: (els.versionTitleInput?.value || '').trim(),
        },
      });
      if (els.draftInstructionInput) els.draftInstructionInput.value = '';
      setStatus(els.versionStatus, `Draft skapad (${response?.generation?.provider || 'ai'}).`);
      await loadDashboard();
      await loadTemplates({ preserveSelection: true });
      if (response?.version?.id) await selectVersion(response.version.id);
    } catch (error) {
      setStatus(els.versionStatus, error.message || 'Kunde inte generera draft.', true);
    }
  }

  async function saveDraft() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Sparar draft...');
      await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}`, {
        method: 'PATCH',
        body: {
          title: (els.versionTitleInput?.value || '').trim(),
          content: els.versionContentInput?.value || '',
          instruction: (els.draftInstructionInput?.value || '').trim(),
        },
      });
      setStatus(els.versionStatus, 'Draft sparad.');
      await loadTemplates({ preserveSelection: true });
      await selectVersion(state.selectedVersionId);
    } catch (error) {
      setStatus(els.versionStatus, error.message || 'Kunde inte spara draft.', true);
    }
  }

  async function evaluateVersion() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Utvärderar risk...');
      await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}/evaluate`, {
        method: 'POST',
        body: {
          instruction: (els.draftInstructionInput?.value || '').trim(),
        },
      });
      setStatus(els.versionStatus, 'Riskutvärdering klar.');
      await refreshAll();
      await selectVersion(state.selectedVersionId);
    } catch (error) {
      setStatus(els.versionStatus, error.message || 'Kunde inte utvärdera version.', true);
    }
  }

  async function activateVersion() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Aktiverar version...');
      await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}/activate`, {
        method: 'POST',
        body: {},
      });
      setStatus(els.versionStatus, 'Version aktiverad.');
      await refreshAll();
      await selectVersion(state.selectedVersionId);
    } catch (error) {
      setStatus(els.versionStatus, error.message || 'Kunde inte aktivera version.', true);
    }
  }

  async function archiveVersion() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Arkiverar version...');
      await api(`/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}/archive`, {
        method: 'POST',
        body: {},
      });
      setStatus(els.versionStatus, 'Version arkiverad.');
      await refreshAll();
    } catch (error) {
      setStatus(els.versionStatus, error.message || 'Kunde inte arkivera version.', true);
    }
  }

  async function cloneVersion() {
    try {
      if (!state.selectedTemplateId || !state.selectedVersionId) {
        throw new Error('Välj en version först.');
      }
      setStatus(els.versionStatus, 'Klonar version...');
      const response = await api(
        `/templates/${state.selectedTemplateId}/versions/${state.selectedVersionId}/clone`,
        {
          method: 'POST',
          body: {},
        }
      );
      setStatus(els.versionStatus, 'Version klonad.');
      await refreshAll();
      if (response?.version?.id) await selectVersion(response.version.id);
    } catch (error) {
      setStatus(els.versionStatus, error.message || 'Kunde inte klona version.', true);
    }
  }

  async function loadStaffMembers() {
    if (!isOwner()) {
      state.staffMembers = [];
      renderStaffTable(state.staffMembers);
      return;
    }
    const response = await api('/users/staff');
    state.staffMembers = Array.isArray(response?.members) ? response.members : [];
    renderStaffTable(state.staffMembers);
  }

  async function createStaffMember() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan hantera staff.');
      const email = (els.staffEmailInput?.value || '').trim();
      const password = els.staffPasswordInput?.value || '';
      if (!email || !password) throw new Error('E-post och lösenord krävs.');

      setStatus(els.staffStatus, 'Skapar/uppdaterar staff...');
      const response = await api('/users/staff', {
        method: 'POST',
        body: {
          email,
          password,
        },
      });
      const statusCode = response?.createdUser ? 'skapad' : 'uppdaterad';
      setStatus(els.staffStatus, `Staff ${statusCode}: ${email}`);

      if (els.staffEmailInput) els.staffEmailInput.value = '';
      if (els.staffPasswordInput) els.staffPasswordInput.value = '';

      await loadStaffMembers();
      await loadDashboard();
    } catch (error) {
      setStatus(els.staffStatus, error.message || 'Kunde inte skapa staff.', true);
    }
  }

  async function runRiskPreview() {
    try {
      if (!canTemplateWrite()) throw new Error('Du saknar behörighet.');
      const category = els.riskLabCategory?.value || 'CONSULTATION';
      const scope = els.riskLabScope?.value || 'output';
      const content = (els.riskLabContent?.value || '').trim();
      const rawVariables = (els.riskLabVariables?.value || '').trim();
      if (!content) throw new Error('Ange text att utvärdera.');

      const variables = rawVariables
        ? rawVariables
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : undefined;

      setStatus(els.riskLabStatus, 'Kör risk preview...');
      const response = await api('/risk/preview', {
        method: 'POST',
        body: {
          category,
          scope,
          content,
          variables,
        },
      });
      if (els.riskLabResult) {
        els.riskLabResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.riskLabStatus,
        `Klar: risk L${response?.evaluation?.riskLevel || '-'} (${response?.evaluation?.decision || '-'})`
      );
      await loadDashboard();
    } catch (error) {
      setStatus(els.riskLabStatus, error.message || 'Kunde inte köra risk preview.', true);
    }
  }

  async function runOrchestrator() {
    try {
      if (!canTemplateWrite()) throw new Error('Du saknar behörighet.');
      const prompt = (els.orchestratorPromptInput?.value || '').trim();
      if (!prompt) throw new Error('Skriv en intern uppgift först.');

      setStatus(els.orchestratorStatus, 'Kör orchestrator...');
      const response = await api('/orchestrator/admin-run', {
        method: 'POST',
        body: { prompt },
      });
      if (els.orchestratorResult) {
        els.orchestratorResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.orchestratorStatus,
        `Klar: intent=${response?.intent || '-'} risk=L${response?.output?.risk?.riskLevel || '-'}`
      );
      await loadDashboard();
    } catch (error) {
      setStatus(els.orchestratorStatus, error.message || 'Kunde inte köra orchestrator.', true);
    }
  }

  async function fetchCalibrationSuggestion() {
    try {
      setStatus(els.calibrationStatus, 'Hämtar kalibreringsförslag...');
      const response = await api('/risk/calibration/suggestion');
      state.calibrationSuggestion = response?.suggestion || null;
      if (els.calibrationResult) {
        els.calibrationResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.calibrationStatus,
        `Förslag: ${response?.suggestion?.suggestedModifier ?? '-'} (${response?.suggestion?.reason || 'okänt'})`
      );
    } catch (error) {
      setStatus(
        els.calibrationStatus,
        error.message || 'Kunde inte hämta kalibreringsförslag.',
        true
      );
    }
  }

  async function applyCalibrationSuggestion() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan applicera förslag.');
      if (!state.calibrationSuggestion) throw new Error('Hämta ett kalibreringsförslag först.');

      setStatus(els.calibrationStatus, 'Applicerar kalibreringsförslag...');
      const note = (els.calibrationNoteInput?.value || '').trim();
      const response = await api('/risk/calibration/apply-suggestion', {
        method: 'POST',
        body: {
          suggestedModifier: state.calibrationSuggestion.suggestedModifier,
          note,
        },
      });

      if (els.calibrationResult) {
        els.calibrationResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.calibrationStatus,
        `Applicerat: riskSensitivityModifier=${response?.settings?.riskSensitivityModifier ?? '-'}`
      );
      state.calibrationSuggestion = null;
      await refreshAll();
    } catch (error) {
      setStatus(
        els.calibrationStatus,
        error.message || 'Kunde inte applicera kalibreringsförslag.',
        true
      );
    }
  }

  async function runPilotReport() {
    try {
      const days = Number(els.reportDaysInput?.value || 14);
      const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(90, days)) : 14;
      if (els.reportDaysInput) els.reportDaysInput.value = String(safeDays);

      setStatus(els.reportStatus, 'Genererar pilotrapport...');
      const response = await api(`/reports/pilot?days=${encodeURIComponent(safeDays)}`);
      if (els.pilotReportResult) {
        els.pilotReportResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.reportStatus,
        `Rapport klar: evaluations=${response?.kpis?.evaluationsTotal ?? 0}, highCritical=${response?.kpis?.highCriticalTotal ?? 0}`
      );
    } catch (error) {
      setStatus(els.reportStatus, error.message || 'Kunde inte generera pilotrapport.', true);
    }
  }

  function renderMailInsights(data) {
    if (!els.mailInsightsResult) return;
    if (!data?.ready) {
      const guidance = Array.isArray(data?.guidance) ? data.guidance : [];
      const message = guidance.length
        ? guidance.map((line) => `- ${line}`).join('\n')
        : '- Ingen mail-data hittades för tenant ännu.';
      els.mailInsightsResult.textContent = [
        'Mail-insikter saknas',
        '',
        message,
      ].join('\n');
      return;
    }

    const counts = data?.report?.counts || {};
    const lines = [
      `Tenant: ${data?.tenantId || '-'}`,
      `Brand: ${data?.brand || '-'}`,
      `Mail-dir: ${data?.paths?.mailDir || '-'}`,
      '',
      `Meddelanden använda: ${counts.messagesUsed ?? 0}`,
      `Trådar: ${counts.threads ?? 0}`,
      `Inbound: ${counts.inbound ?? 0}`,
      `Outbound: ${counts.outbound ?? 0}`,
      `QA-par: ${counts.qaPairs ?? 0}`,
      `Template seeds: ${counts.templateSeeds ?? 0}`,
      '',
      'Summary (preview):',
      (data?.previews?.summary || '').slice(0, 500) || '(saknas)',
    ];

    els.mailInsightsResult.textContent = lines.join('\n');
  }

  function getMailSeedApplyPayload({ forceDryRun } = {}) {
    const limitRaw = Number.parseInt(String(els.mailSeedsLimit?.value || '8'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, limitRaw)) : 8;
    if (els.mailSeedsLimit) els.mailSeedsLimit.value = String(limit);

    const category = String(els.mailSeedsCategory?.value || '').trim();
    const namePrefix = String(els.mailSeedsNamePrefix?.value || '').trim();

    const payload = {
      limit,
      dryRun: Boolean(forceDryRun),
    };
    if (category) payload.category = category;
    if (namePrefix) payload.namePrefix = namePrefix;
    return payload;
  }

  function renderMailSeedPreview(response) {
    if (!els.mailInsightsResult) return;
    const preview = Array.isArray(response?.preview) ? response.preview : [];
    const rows = preview.map((item, index) => {
      const unknown = Array.isArray(item?.unknownVariables) ? item.unknownVariables.length : 0;
      const missing = Array.isArray(item?.missingRequiredVariables)
        ? item.missingRequiredVariables.length
        : 0;
      return `${index + 1}. ${item?.templateName || '-'} [${item?.category || '-'}] • unknownVars=${unknown} • missingRequired=${missing}`;
    });
    const lines = [
      `Seed preview: selected=${response?.selected ?? 0}`,
      `Tenant: ${response?.tenantId || '-'}`,
      '',
      ...(rows.length ? rows : ['(inga preview-rader)']),
    ];
    els.mailInsightsResult.textContent = lines.join('\n');
  }

  function renderMailSeedApplyResult(response) {
    if (!els.mailInsightsResult) return;
    const templates = Array.isArray(response?.templates) ? response.templates : [];
    const rows = templates.map((item, index) => {
      return `${index + 1}. ${item?.templateName || '-'} [${item?.category || '-'}] • decision=${item?.decision || '-'} • risk=L${item?.riskLevel ?? '-'}`;
    });
    const lines = [
      `Seed apply: created=${response?.created ?? 0} av selected=${response?.selected ?? 0}`,
      `Tenant: ${response?.tenantId || '-'}`,
      '',
      ...(rows.length ? rows : ['(inga skapade mallar)']),
    ];
    els.mailInsightsResult.textContent = lines.join('\n');
  }

  async function applyMailTemplateSeeds({ dryRun }) {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan köra seed → draft.');
      const payload = getMailSeedApplyPayload({ forceDryRun: dryRun });
      setStatus(
        els.mailInsightsStatus,
        dryRun ? 'Kör seed preview...' : 'Skapar drafts från seeds...'
      );

      const response = await api('/mail/template-seeds/apply', {
        method: 'POST',
        body: payload,
      });

      if (dryRun) {
        renderMailSeedPreview(response);
        setStatus(
          els.mailInsightsStatus,
          `Preview klar: ${response?.selected ?? 0} seeds valda.`
        );
        return;
      }

      renderMailSeedApplyResult(response);
      setStatus(
        els.mailInsightsStatus,
        `Klart: ${response?.created ?? 0} drafts skapade från seeds.`
      );
      await loadDashboard();
      await loadTemplates({ preserveSelection: false });
      await loadMailInsights();
    } catch (error) {
      setStatus(
        els.mailInsightsStatus,
        error.message || 'Kunde inte köra seed → draft.',
        true
      );
    }
  }

  async function loadMailInsights() {
    try {
      setStatus(els.mailInsightsStatus, 'Laddar mail-insikter...');
      const response = await api('/mail/insights');
      renderMailInsights(response);
      if (response?.ready) {
        const qaPairs = Number(response?.report?.counts?.qaPairs || 0);
        setStatus(els.mailInsightsStatus, `Mail-insikter laddade (QA-par: ${qaPairs}).`);
      } else {
        setStatus(els.mailInsightsStatus, 'Ingen mail-ingest hittad ännu.');
      }
    } catch (error) {
      setStatus(els.mailInsightsStatus, error.message || 'Kunde inte läsa mail-insikter.', true);
    }
  }

  async function loadMonitorStatus() {
    try {
      setStatus(els.monitorPanelStatus, 'Laddar monitor-status...');
      const response = await api('/monitor/status');
      if (els.monitorResult) {
        els.monitorResult.textContent = JSON.stringify(response, null, 2);
      }
      const templatesTotal = response?.kpis?.templatesTotal ?? 0;
      const evaluationsTotal = response?.kpis?.evaluationsTotal ?? 0;
      const highCriticalOpen = response?.kpis?.highCriticalOpen ?? 0;
      setStatus(
        els.monitorPanelStatus,
        `Monitor uppdaterad: templates=${templatesTotal}, evaluations=${evaluationsTotal}, highCriticalOpen=${highCriticalOpen}`
      );
    } catch (error) {
      setStatus(els.monitorPanelStatus, error.message || 'Kunde inte läsa monitor-status.', true);
    }
  }

  async function loadStateManifest() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Laddar state manifest...');
      const response = await api('/ops/state/manifest');
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const count = Array.isArray(response?.stores) ? response.stores.length : 0;
      setStatus(els.opsStatus, `State manifest klart (stores: ${count}).`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte läsa state manifest.', true);
    }
  }

  function getRestoreFileName() {
    return String(els.restoreBackupFileInput?.value || '').trim();
  }

  async function createStateBackup() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Skapar backup...');
      const response = await api('/ops/state/backup', {
        method: 'POST',
        body: {},
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const fileName = response?.backup?.fileName || '-';
      if (els.restoreBackupFileInput && response?.backup?.fileName) {
        els.restoreBackupFileInput.value = response.backup.fileName;
      }
      setStatus(els.opsStatus, `Backup skapad: ${fileName}`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte skapa backup.', true);
    }
  }

  async function listStateBackups() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Laddar backups...');
      const response = await api('/ops/state/backups?limit=20');
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const latestFile = response?.backups?.[0]?.fileName || '';
      if (els.restoreBackupFileInput && latestFile) {
        els.restoreBackupFileInput.value = latestFile;
      }
      setStatus(els.opsStatus, `Backups: ${response?.count ?? 0}`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte läsa backups.', true);
    }
  }

  async function previewPruneBackups() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      setStatus(els.opsStatus, 'Kör prune preview...');
      const response = await api('/ops/state/backups/prune', {
        method: 'POST',
        body: { dryRun: true },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.opsStatus,
        `Prune preview klar: ${response?.deletedCount ?? 0} filer skulle tas bort.`
      );
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte köra prune preview.', true);
    }
  }

  async function runPruneBackups() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      const confirmed = window.confirm(
        'Kör prune på backup-katalogen enligt retention-reglerna?'
      );
      if (!confirmed) {
        setStatus(els.opsStatus, 'Prune avbruten.');
        return;
      }
      setStatus(els.opsStatus, 'Kör prune...');
      const response = await api('/ops/state/backups/prune', {
        method: 'POST',
        body: { dryRun: false },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      setStatus(
        els.opsStatus,
        `Prune klar: ${response?.deletedCount ?? 0} filer borttagna.`
      );
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte pruna backups.', true);
    }
  }

  async function previewStateRestore() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      const fileName = getRestoreFileName();
      if (!fileName) throw new Error('Ange backupfil att förhandsgranska.');
      setStatus(els.opsStatus, `Läser restore preview för ${fileName}...`);
      const response = await api('/ops/state/restore', {
        method: 'POST',
        body: {
          fileName,
          dryRun: true,
        },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const restoreCount = Array.isArray(response?.preview?.stores)
        ? response.preview.stores.filter((store) => store?.willRestore).length
        : 0;
      setStatus(els.opsStatus, `Restore preview klart: ${restoreCount} stores kan återställas.`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte köra restore preview.', true);
    }
  }

  async function runStateRestore() {
    if (!isOwner()) {
      if (els.opsResult) els.opsResult.textContent = 'Endast OWNER.';
      return;
    }
    try {
      const fileName = getRestoreFileName();
      if (!fileName) throw new Error('Ange backupfil att återställa.');
      const expectedConfirm = `RESTORE ${fileName}`;
      const reply = window.prompt(
        `Detta skriver över state-filerna.\nSkriv exakt för att fortsätta:\n${expectedConfirm}`,
        ''
      );
      if (reply === null) {
        setStatus(els.opsStatus, 'Restore avbruten.');
        return;
      }
      if (String(reply).trim() !== expectedConfirm) {
        throw new Error(`Fel bekräftelse. Skriv exakt: ${expectedConfirm}`);
      }

      setStatus(els.opsStatus, `Återställer state från ${fileName}...`);
      const response = await api('/ops/state/restore', {
        method: 'POST',
        body: {
          fileName,
          dryRun: false,
          confirmText: expectedConfirm,
        },
      });
      if (els.opsResult) {
        els.opsResult.textContent = JSON.stringify(response, null, 2);
      }
      const restoredCount = Array.isArray(response?.restore?.stores)
        ? response.restore.stores.filter((store) => store?.restored).length
        : 0;
      setStatus(els.opsStatus, `Restore klart: ${restoredCount} stores återställda.`);
    } catch (error) {
      setStatus(els.opsStatus, error.message || 'Kunde inte återställa backup.', true);
    }
  }

  function renderTenantCatalog(tenants = []) {
    if (!els.tenantCatalog) return;
    if (!Array.isArray(tenants) || tenants.length === 0) {
      els.tenantCatalog.textContent = 'Inga tenants hittades.';
      return;
    }

    const rows = tenants.map((tenant) => {
      const tenantId = tenant?.tenantId || '-';
      const role = tenant?.role || '-';
      const assistantName = tenant?.config?.assistantName || '-';
      const toneStyle = tenant?.config?.toneStyle || '-';
      const brandProfile = tenant?.config?.brandProfile || '-';
      const riskModifier = tenant?.config?.riskSensitivityModifier ?? 0;
      return `${tenantId} | role=${role} | assistant=${assistantName} | tone=${toneStyle} | brand=${brandProfile} | riskModifier=${riskModifier}`;
    });
    els.tenantCatalog.textContent = rows.join('\n');
  }

  async function loadTenants() {
    const response = await api('/tenants/my');
    const tenants = Array.isArray(response?.tenants) ? response.tenants : [];
    state.availableTenants = tenants;
    renderTenantSwitchOptions();
    setSessionMeta();
    updateLifecyclePermissions();
    renderTenantCatalog(tenants);
    return tenants;
  }

  function getRiskFilterQuery() {
    const minRiskLevel = Number(els.riskMinFilter?.value || state.riskFilters.minRiskLevel || 3);
    const ownerDecision = (els.riskOwnerDecisionFilter?.value || '').trim();
    state.riskFilters = {
      minRiskLevel: Number.isFinite(minRiskLevel) ? minRiskLevel : 3,
      ownerDecision,
    };
    const params = new URLSearchParams();
    params.set('minRiskLevel', String(state.riskFilters.minRiskLevel));
    params.set('limit', '50');
    if (state.riskFilters.ownerDecision) {
      params.set('ownerDecision', state.riskFilters.ownerDecision);
    }
    return params.toString();
  }

  async function loadDashboard() {
    const riskQuery = getRiskFilterQuery();
    const [dashboard, riskEvaluations, tenantConfig] = await Promise.all([
      api('/dashboard/owner?minRiskLevel=1&auditLimit=30'),
      api(`/risk/evaluations?${riskQuery}`),
      api('/tenant-config'),
    ]);

    state.tenantId = dashboard.tenantId || state.tenantId;

    setText(els.templatesTotal, dashboard?.templates?.total ?? 0);
    setText(els.templatesActive, dashboard?.templates?.withActiveVersion ?? 0);
    setText(els.riskTotal, dashboard?.riskSummary?.totals?.evaluations ?? 0);
    setText(els.riskOpen, dashboard?.riskSummary?.totals?.highCriticalOpen ?? 0);

    const categoryBadges = Object.entries(dashboard?.templates?.byCategory || {}).map(([label, value]) => ({
      label,
      value,
      dot: 'ok',
    }));
    renderBadges(els.categoryBadges, categoryBadges);

    const riskBadges = Object.entries(dashboard?.riskSummary?.byLevel || {}).map(([level, count]) => ({
      label: `L${level}`,
      value: count,
      dot: dotClassForRiskLevel(level),
    }));
    renderBadges(els.riskBadges, riskBadges);

    renderRiskTable(riskEvaluations?.evaluations || []);
    renderAudit(dashboard?.recentAuditEvents || []);
    fillTenantConfig(tenantConfig?.config || {});
    setStatus(els.tenantConfigStatus, '');
  }

  async function refreshAll() {
    await loadTenants();
    await loadDashboard();
    await loadStaffMembers();
    await loadSessionsPanel();
    await loadTemplates({ preserveSelection: true });
    await loadMailInsights();
    await loadMonitorStatus();
    if (isOwner()) {
      await loadStateManifest();
    } else if (els.opsResult) {
      els.opsResult.textContent = 'Endast OWNER.';
      setStatus(els.opsStatus, '');
      if (els.restoreBackupFileInput) els.restoreBackupFileInput.value = '';
    }
  }

  function applyAuthContext({ token, membership, memberships }) {
    if (typeof token === 'string' && token) {
      state.token = token;
      localStorage.setItem(TOKEN_KEY, state.token);
    }
    if (membership?.role) state.role = membership.role;
    if (membership?.tenantId) state.tenantId = membership.tenantId;

    const list = Array.isArray(memberships) ? memberships.filter((item) => item?.tenantId) : [];
    state.availableTenants = list.length ? list : membership?.tenantId ? [membership] : [];
    renderTenantSwitchOptions();
    setSessionMeta();
    updateLifecyclePermissions();
  }

  async function handleLogin() {
    try {
      setStatus(els.loginStatus, 'Loggar in...');
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      state.pendingLoginTicket = '';
      const response = await api('/auth/login', {
        method: 'POST',
        auth: false,
        body: {
          email: els.emailInput.value.trim(),
          password: els.passwordInput.value,
          tenantId: (els.tenantInput.value || '').trim(),
        },
      });

      if (response?.requiresTenantSelection) {
        state.pendingLoginTicket = response.loginTicket || '';
        renderPendingTenantSelection(response.tenants || []);
        if (!state.pendingLoginTicket) {
          throw new Error('loginTicket saknas för tenant-val.');
        }
        setStatus(els.loginStatus, 'Välj tenant för att slutföra inloggning.');
        updateLifecyclePermissions();
        return;
      }

      applyAuthContext({
        token: response.token,
        membership: response?.membership || null,
        memberships: response?.memberships || (response?.membership ? [response.membership] : []),
      });

      setStatus(els.loginStatus, 'Inloggad.');
      setAuthVisible(true);
      await refreshAll();
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'Inloggning misslyckades.', true);
    }
  }

  async function completeTenantSelection() {
    try {
      const loginTicket = String(state.pendingLoginTicket || '').trim();
      const tenantId = String(els.tenantSelectionSelect?.value || '').trim();
      if (!loginTicket || !tenantId) {
        throw new Error('Välj tenant först.');
      }
      setStatus(els.loginStatus, 'Slutför tenant-val...');
      const response = await api('/auth/select-tenant', {
        method: 'POST',
        auth: false,
        body: { loginTicket, tenantId },
      });
      applyAuthContext({
        token: response.token,
        membership: response?.membership || null,
        memberships: response?.memberships || (response?.membership ? [response.membership] : []),
      });
      state.pendingLoginTicket = '';
      if (els.tenantSelectionPanel) els.tenantSelectionPanel.classList.add('hidden');
      setStatus(els.loginStatus, 'Inloggad.');
      setAuthVisible(true);
      await refreshAll();
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'Tenant-val misslyckades.', true);
    }
  }

  async function switchTenant() {
    try {
      const targetTenantId = String(els.tenantSwitchSelect?.value || '').trim();
      if (!targetTenantId) throw new Error('Välj tenant att byta till.');
      if (targetTenantId === state.tenantId) {
        setSessionMeta();
        return;
      }

      setStatus(els.loginStatus, 'Byter tenant...');
      const response = await api('/auth/switch-tenant', {
        method: 'POST',
        body: { tenantId: targetTenantId },
      });
      applyAuthContext({
        token: response.token,
        membership: response?.membership || null,
        memberships:
          response?.memberships ||
          (Array.isArray(state.availableTenants) && state.availableTenants.length
            ? state.availableTenants
            : response?.membership
            ? [response.membership]
            : []),
      });
      setStatus(els.loginStatus, `Bytte tenant till ${state.tenantId}.`);
      await refreshAll();
    } catch (error) {
      setStatus(els.loginStatus, error.message || 'Kunde inte byta tenant.', true);
      renderTenantSwitchOptions();
    }
  }

  async function restoreSession() {
    if (!state.token) {
      setAuthVisible(false);
      state.availableTenants = [];
      renderTenantSwitchOptions();
      setSessionMeta();
      updateLifecyclePermissions();
      return;
    }
    try {
      const me = await api('/auth/me');
      applyAuthContext({
        membership: me?.membership || null,
        memberships: me?.memberships || (me?.membership ? [me.membership] : []),
      });
      setAuthVisible(true);
      await refreshAll();
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      state.token = '';
      state.role = '';
      state.tenantId = '';
      state.availableTenants = [];
      setAuthVisible(false);
      renderTenantSwitchOptions();
      setSessionMeta();
      updateLifecyclePermissions();
    }
  }

  async function saveTenantConfig() {
    try {
      setStatus(els.tenantConfigStatus, 'Sparar...');
      const allowlistOverrides = parseJsonObjectInput(
        els.templateAllowlistOverrides?.value,
        'templateVariableAllowlistByCategory'
      );
      const requiredOverrides = parseJsonObjectInput(
        els.templateRequiredOverrides?.value,
        'templateRequiredVariablesByCategory'
      );
      const body = {
        assistantName: els.assistantName.value.trim(),
        toneStyle: els.toneStyle.value.trim(),
        brandProfile: els.brandProfile.value.trim(),
        riskSensitivityModifier: Number(els.riskModifier.value || 0),
        templateVariableAllowlistByCategory: allowlistOverrides,
        templateRequiredVariablesByCategory: requiredOverrides,
        templateSignaturesByChannel: {
          email: String(els.templateEmailSignature?.value || '').trim(),
        },
      };
      await api('/tenant-config', {
        method: 'PATCH',
        body,
      });
      setStatus(els.tenantConfigStatus, 'Sparad.');
      await loadDashboard();
    } catch (error) {
      setStatus(els.tenantConfigStatus, error.message || 'Kunde inte spara config.', true);
    }
  }

  async function onboardTenant() {
    try {
      if (!isOwner()) throw new Error('Endast OWNER kan onboarda tenant.');
      const tenantId = String(els.onboardTenantId?.value || '').trim().toLowerCase();
      if (!tenantId) throw new Error('Ange tenantId.');

      const body = { tenantId };
      const ownerEmail = String(els.onboardOwnerEmail?.value || '').trim();
      const ownerPassword = String(els.onboardOwnerPassword?.value || '');
      const assistantName = String(els.onboardAssistantName?.value || '').trim();
      const toneStyle = String(els.onboardToneStyle?.value || '').trim();
      const brandProfile = String(els.onboardBrandProfile?.value || '').trim();
      const riskModifierRaw = String(els.onboardRiskModifier?.value || '').trim();

      if (ownerEmail) body.ownerEmail = ownerEmail;
      if (ownerPassword) body.ownerPassword = ownerPassword;
      if (assistantName) body.assistantName = assistantName;
      if (toneStyle) body.toneStyle = toneStyle;
      if (brandProfile) body.brandProfile = brandProfile;
      if (riskModifierRaw) body.riskSensitivityModifier = Number(riskModifierRaw);

      setStatus(els.tenantOnboardStatus, 'Onboardar tenant...');
      const response = await api('/tenants/onboard', {
        method: 'POST',
        body,
      });
      const onboardedTenantId = response?.tenant?.tenantId || tenantId;
      setStatus(els.tenantOnboardStatus, `Tenant onboardad: ${onboardedTenantId}`);

      if (els.onboardOwnerPassword) els.onboardOwnerPassword.value = '';
      await loadTenants();
      if (els.tenantSwitchSelect) {
        els.tenantSwitchSelect.value = onboardedTenantId;
      }
    } catch (error) {
      setStatus(els.tenantOnboardStatus, error.message || 'Kunde inte onboarda tenant.', true);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    state.token = '';
    state.role = '';
    state.tenantId = '';
    state.pendingLoginTicket = '';
    state.availableTenants = [];
    state.templates = [];
    state.versions = [];
    state.sessions = [];
    state.staffMembers = [];
    state.calibrationSuggestion = null;
    state.selectedTemplateId = '';
    state.selectedVersionId = '';
    state.riskFilters = { minRiskLevel: 3, ownerDecision: '' };
    setAuthVisible(false);
    setStatus(els.loginStatus, '');
    setStatus(els.staffStatus, '');
    setStatus(els.sessionsStatus, '');
    setStatus(els.riskLabStatus, '');
    setStatus(els.orchestratorStatus, '');
    setStatus(els.calibrationStatus, '');
    setStatus(els.reportStatus, '');
    setStatus(els.mailInsightsStatus, '');
    setStatus(els.monitorPanelStatus, '');
    setStatus(els.opsStatus, '');
    setStatus(els.tenantOnboardStatus, '');
    if (els.riskLabResult) els.riskLabResult.textContent = 'Ingen preview körd ännu.';
    if (els.orchestratorResult) els.orchestratorResult.textContent = 'Ingen körning ännu.';
    if (els.calibrationResult) els.calibrationResult.textContent = 'Inget kalibreringsförslag ännu.';
    if (els.pilotReportResult) els.pilotReportResult.textContent = 'Ingen rapport körd ännu.';
    if (els.mailInsightsResult) els.mailInsightsResult.textContent = 'Ingen mail-data ännu.';
    if (els.monitorResult) els.monitorResult.textContent = 'Ingen monitor-data ännu.';
    if (els.opsResult) els.opsResult.textContent = 'Ingen ops-data ännu.';
    if (els.restoreBackupFileInput) els.restoreBackupFileInput.value = '';
    if (els.templateEmailSignature) els.templateEmailSignature.value = '';
    if (els.templateAllowlistOverrides) els.templateAllowlistOverrides.value = '{}';
    if (els.templateRequiredOverrides) els.templateRequiredOverrides.value = '{}';
    if (els.tenantCatalog) els.tenantCatalog.textContent = 'Ingen data ännu.';
    renderSessionsTable([], '');
    renderTenantSwitchOptions();
    setSessionMeta();
    updateLifecyclePermissions();
  }

  els.loginBtn?.addEventListener('click', handleLogin);
  els.completeTenantSelectionBtn?.addEventListener('click', completeTenantSelection);
  els.switchTenantBtn?.addEventListener('click', switchTenant);
  els.refreshBtn?.addEventListener('click', () => refreshAll().catch((error) => alert(error.message || 'Kunde inte uppdatera.')));
  els.logoutBtn?.addEventListener('click', logout);
  els.saveTenantConfigBtn?.addEventListener('click', saveTenantConfig);
  els.refreshTenantsBtn?.addEventListener('click', () => {
    loadTenants().catch((error) => {
      setStatus(els.tenantOnboardStatus, error.message || 'Kunde inte läsa tenants.', true);
    });
  });
  els.onboardTenantBtn?.addEventListener('click', onboardTenant);

  els.createTemplateBtn?.addEventListener('click', createTemplate);
  els.templateFilterSelect?.addEventListener('change', () => {
    loadTemplates({ preserveSelection: false }).catch((error) => {
      setStatus(els.templateStatus, error.message || 'Kunde inte filtrera mallar.', true);
    });
  });
  els.generateDraftBtn?.addEventListener('click', generateDraft);
  els.saveDraftBtn?.addEventListener('click', saveDraft);
  els.evaluateBtn?.addEventListener('click', evaluateVersion);
  els.activateBtn?.addEventListener('click', activateVersion);
  els.archiveBtn?.addEventListener('click', archiveVersion);
  els.cloneBtn?.addEventListener('click', cloneVersion);
  els.createStaffBtn?.addEventListener('click', createStaffMember);
  els.refreshStaffBtn?.addEventListener('click', () => {
    loadStaffMembers().catch((error) => {
      setStatus(els.staffStatus, error.message || 'Kunde inte läsa staff-lista.', true);
    });
  });
  els.loadSessionsBtn?.addEventListener('click', () => {
    loadSessionsPanel().catch((error) => {
      setStatus(els.sessionsStatus, error.message || 'Kunde inte läsa sessioner.', true);
    });
  });
  els.sessionsScopeSelect?.addEventListener('change', () => {
    loadSessionsPanel().catch((error) => {
      setStatus(els.sessionsStatus, error.message || 'Kunde inte läsa sessioner.', true);
    });
  });
  els.sessionsIncludeRevoked?.addEventListener('change', () => {
    loadSessionsPanel().catch((error) => {
      setStatus(els.sessionsStatus, error.message || 'Kunde inte läsa sessioner.', true);
    });
  });
  els.runRiskPreviewBtn?.addEventListener('click', runRiskPreview);
  els.runOrchestratorBtn?.addEventListener('click', runOrchestrator);
  els.fetchCalibrationSuggestionBtn?.addEventListener('click', fetchCalibrationSuggestion);
  els.applyCalibrationSuggestionBtn?.addEventListener('click', applyCalibrationSuggestion);
  els.runPilotReportBtn?.addEventListener('click', runPilotReport);
  els.refreshMailInsightsBtn?.addEventListener('click', loadMailInsights);
  els.previewMailSeedsBtn?.addEventListener('click', () =>
    applyMailTemplateSeeds({ dryRun: true })
  );
  els.applyMailSeedsBtn?.addEventListener('click', () =>
    applyMailTemplateSeeds({ dryRun: false })
  );
  els.refreshMonitorBtn?.addEventListener('click', loadMonitorStatus);
  els.loadStateManifestBtn?.addEventListener('click', loadStateManifest);
  els.createStateBackupBtn?.addEventListener('click', createStateBackup);
  els.listStateBackupsBtn?.addEventListener('click', listStateBackups);
  els.previewPruneBackupsBtn?.addEventListener('click', previewPruneBackups);
  els.runPruneBackupsBtn?.addEventListener('click', runPruneBackups);
  els.previewStateRestoreBtn?.addEventListener('click', previewStateRestore);
  els.runStateRestoreBtn?.addEventListener('click', runStateRestore);
  els.applyRiskFilterBtn?.addEventListener('click', () => {
    loadDashboard().catch((error) => {
      alert(error.message || 'Kunde inte applicera riskfilter.');
    });
  });

  if (els.riskMinFilter) els.riskMinFilter.value = String(state.riskFilters.minRiskLevel);
  if (els.riskOwnerDecisionFilter) els.riskOwnerDecisionFilter.value = state.riskFilters.ownerDecision;

  updateLifecyclePermissions();
  restoreSession();
})();
