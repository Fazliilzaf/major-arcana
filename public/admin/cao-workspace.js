(function initCaoAdminWorkspace() {
  var activeTab = 'tasks';
  var filterUnownedOnly = false;
  var tabs = document.querySelectorAll('.caoWorkspaceTab');
  var refreshBtn = document.getElementById('caoWorkspaceRefreshBtn');
  var runGateBtn = document.getElementById('caoWorkspaceRunGateBtn');
  var filterUnownedBtn = document.getElementById('caoWorkspaceFilterUnownedBtn');
  var ownerChecklistBtn = document.getElementById('caoWorkspaceOwnerChecklistBtn');
  var staffChecklistBtn = document.getElementById('caoWorkspaceStaffChecklistBtn');
  var statusEl = document.getElementById('caoWorkspaceStatus');
  var summaryEl = document.getElementById('caoWorkspaceSummary');
  var resultsEl = document.getElementById('caoWorkspaceResults');
  if (!tabs.length || !resultsEl) return;

  function api(path, options) {
    var opts = options || {};
    return fetch('/api/v1' + path, {
      method: opts.method || 'GET',
      credentials: 'same-origin',
      headers: Object.assign(
        { accept: 'application/json' },
        opts.body ? { 'content-type': 'application/json' } : {}
      ),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error((body && body.error) || 'Request failed');
        return body;
      });
    });
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.style.color = isError ? '#b42318' : '';
  }

  function queryParam(name, value) {
    var v = String(value || '').trim();
    return v ? '&' + encodeURIComponent(name) + '=' + encodeURIComponent(v) : '';
  }

  function renderTextLines(items, formatter) {
    resultsEl.style.whiteSpace = 'pre-wrap';
    if (!items || !items.length) {
      resultsEl.textContent = 'Inga rader matchar filtret.';
      return;
    }
    resultsEl.textContent = items
      .map(function (item, index) {
        return index + 1 + '. ' + formatter(item);
      })
      .join('\n');
  }

  function patchTask(taskId, body) {
    return api('/admin/tasks/' + encodeURIComponent(taskId), { method: 'PATCH', body: body });
  }

  function promptAndPatch(task, fields) {
    var updates = {};
    if (fields.indexOf('owner') >= 0) {
      var owner = window.prompt('Ange ägare (t.ex. OWNER):', 'OWNER');
      if (!owner || !String(owner).trim()) return Promise.resolve(null);
      updates.owner = String(owner).trim();
    }
    if (fields.indexOf('dod') >= 0) {
      var dod = window.prompt('Definition of Done:', task.dod || '');
      if (dod === null) return Promise.resolve(null);
      updates.dod = String(dod).trim();
    }
    if (fields.indexOf('nextStep') >= 0) {
      var nextStep = window.prompt('Nästa steg:', task.nextStep || '');
      if (nextStep === null) return Promise.resolve(null);
      updates.nextStep = String(nextStep).trim();
    }
    if (!Object.keys(updates).length) return Promise.resolve(null);
    setStatus('Sparar task ' + task.id + '...');
    return patchTask(task.id, updates).then(function () {
      setStatus('Task uppdaterad.');
      loadTab('tasks');
    });
  }

  function renderTaskRows(items) {
    resultsEl.style.whiteSpace = 'normal';
    resultsEl.innerHTML = '';
    if (!items || !items.length) {
      resultsEl.textContent = 'Inga rader matchar filtret.';
      return;
    }
    items.forEach(function (t, index) {
      var row = document.createElement('div');
      row.style.cssText =
        'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid rgba(127,127,127,0.2);font-size:12px;';
      var text = document.createElement('span');
      text.style.flex = '1 1 240px';
      text.textContent =
        index +
        1 +
        '. ' +
        (t.title || t.id) +
        ' | owner=' +
        (t.owner || '—') +
        ' | status=' +
        (t.status || '—') +
        ' | risk=' +
        (t.riskLevel || '—') +
        ' | deadline=' +
        (t.deadline || '—');
      row.appendChild(text);

      var actions = document.createElement('span');
      actions.style.display = 'inline-flex';
      actions.style.gap = '6px';
      actions.style.flexWrap = 'wrap';

      if (!String(t.owner || '').trim()) {
        var assignBtn = document.createElement('button');
        assignBtn.type = 'button';
        assignBtn.className = 'btn small';
        assignBtn.textContent = 'Tilldela ägare';
        assignBtn.addEventListener('click', function () {
          promptAndPatch(t, ['owner']).catch(function (err) {
            setStatus(err.message || 'Kunde inte tilldela ägare.', true);
          });
        });
        actions.appendChild(assignBtn);
      }
      if (!String(t.dod || '').trim() || !String(t.nextStep || '').trim()) {
        var metaBtn = document.createElement('button');
        metaBtn.type = 'button';
        metaBtn.className = 'btn small';
        metaBtn.textContent = 'DoD / nästa steg';
        metaBtn.addEventListener('click', function () {
          promptAndPatch(t, ['dod', 'nextStep']).catch(function (err) {
            setStatus(err.message || 'Kunde inte uppdatera metadata.', true);
          });
        });
        actions.appendChild(metaBtn);
      }
      if (actions.childNodes.length) row.appendChild(actions);
      resultsEl.appendChild(row);
    });
  }

  function loadTab(tab) {
    activeTab = tab || 'tasks';
    setStatus('Laddar ' + activeTab + '...');
    var owner = document.getElementById('caoFilterOwner');
    var status = document.getElementById('caoFilterStatus');
    var risk = document.getElementById('caoFilterRisk');
    var deadline = document.getElementById('caoFilterDeadline');
    var sla = document.getElementById('caoFilterSla');
    var action = document.getElementById('caoFilterAction');
    var path = '';

    if (activeTab === 'tasks') {
      path =
        '/admin/tasks?limit=100' +
        queryParam('owner', owner && owner.value) +
        queryParam('status', status && status.value) +
        queryParam('riskLevel', risk && risk.value) +
        queryParam('deadlineBefore', deadline && deadline.value);
    } else if (activeTab === 'incidents') {
      path =
        '/admin/incidents/admin-view?limit=100' +
        queryParam('owner', owner && owner.value) +
        queryParam('severity', risk && risk.value) +
        queryParam('slaRisk', sla && sla.value) +
        queryParam('status', status && status.value);
    } else if (activeTab === 'docs') {
      path =
        '/admin/documentation/gaps?limit=100' +
        queryParam('owner', owner && owner.value) +
        queryParam('status', status && status.value);
    } else if (activeTab === 'readiness') {
      path = '/admin/readiness/snapshot';
    } else {
      path =
        '/admin/audit/trace?limit=100' +
        queryParam('action', action && action.value) +
        queryParam('outcome', status && status.value);
    }

    api(path)
      .then(function (payload) {
        if (activeTab === 'readiness') {
          if (summaryEl) {
            summaryEl.textContent =
              'Score: ' +
              (payload.score != null ? payload.score : '—') +
              ' | Band: ' +
              (payload.band || '—') +
              ' | Källa: ' +
              (payload.source || 'shared_operational_core');
          }
          var blockerLines = (payload.blockers || []).map(function (b, index) {
            return index + 1 + '. [' + (b.severity || 'info') + '] ' + (b.label || b.id || 'blocker');
          });
          var obs = payload.caoSchedulerObservability || {};
          var obsLines = (obs.caoJobs || []).map(function (job) {
            return (job.id || 'job') + ': ' + (job.healthy ? 'OK' : 'saknar success');
          });
          var alignment = payload.alignment || {};
          resultsEl.style.whiteSpace = 'pre-wrap';
          resultsEl.textContent = [
            payload.disclaimer || '',
            payload.goAllowed === true
              ? 'GoAllowed: ja (operational core)'
              : 'GoAllowed: nej (operational core)',
            '',
            'Blockers:',
            blockerLines.length ? blockerLines.join('\n') : 'Inga blockers.',
            '',
            'CAO scheduler observability:',
            obs.summary || '—',
            obsLines.length ? obsLines.join('\n') : '',
            '',
            'Alignment:',
            'Monitor auktoritativ: ' + (alignment.monitorAuthoritative === false ? 'nej' : 'ja'),
            'Monitor endpoint: ' + (alignment.monitorEndpoint || payload.monitorEndpoint || '/api/v1/monitor/readiness'),
            alignment.operationalScore != null ? 'Operational score: ' + alignment.operationalScore : '',
            '',
            'Auktoritativ Go/No-Go: ' + (payload.monitorEndpoint || '/api/v1/monitor/readiness'),
          ]
            .filter(Boolean)
            .join('\n');
          setStatus('Klar: readiness (shared operational core)');
          return;
        }

        var items = payload.items || [];
        if (filterUnownedOnly && activeTab === 'tasks') {
          items = items.filter(function (t) {
            return !String(t.owner || '').trim();
          });
        }
        if (summaryEl) {
          summaryEl.textContent = payload.summary
            ? 'Totalt: ' + (payload.summary.total != null ? payload.summary.total : items.length) +
              (filterUnownedOnly && activeTab === 'tasks' ? ' (utan ägare)' : '')
            : '';
        }
        if (activeTab === 'tasks') {
          renderTaskRows(items);
        } else if (activeTab === 'incidents') {
          renderTextLines(items, function (i) {
            return (
              (i.id || 'incident') +
              ' | sev=' +
              (i.severity || '—') +
              ' | owner=' +
              ((i.owner && i.owner.userId) || i.owner || '—') +
              ' | sla=' +
              ((i.sla && i.sla.state) || '—')
            );
          });
        } else if (activeTab === 'docs') {
          renderTextLines(items, function (d) {
            return (d.path || 'doc') + ' | owner=' + (d.owner || '—') + ' | issues=' + ((d.issues || []).join(','));
          });
        } else {
          renderTextLines(items, function (e) {
            return (
              (e.ts || e.createdAt || '—') +
              ' | ' +
              (e.action || '—') +
              ' | outcome=' +
              (e.outcome || '—') +
              ' | actor=' +
              (e.actorUserId || '—')
            );
          });
        }
        setStatus('Klar: ' + activeTab);
      })
      .catch(function (err) {
        setStatus(err.message || 'Kunde inte ladda workspace.', true);
      });
  }

  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabs.forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      var tab = btn.getAttribute('data-cao-tab') || 'tasks';
      document.querySelectorAll('.cao-filter-incidents').forEach(function (el) {
        el.style.display = tab === 'incidents' ? 'inline-flex' : 'none';
      });
      document.querySelectorAll('.cao-filter-audit').forEach(function (el) {
        el.style.display = tab === 'audit' ? 'inline-flex' : 'none';
      });
      loadTab(tab);
    });
  });

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      loadTab(activeTab);
    });
  }

  if (runGateBtn) {
    runGateBtn.addEventListener('click', function () {
      if (typeof window.runCaoAgent === 'function') {
        setStatus('Kör CAO quality gate...');
        window
          .runCaoAgent()
          .then(function () {
            setStatus('CAO quality gate klar.');
          })
          .catch(function (err) {
            setStatus(err.message || 'CAO-körning misslyckades.', true);
          });
        return;
      }
      var caoSection = document.getElementById('runCaoAgentBtn');
      if (caoSection) {
        caoSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        caoSection.click();
      }
    });
  }

  function loadChecklists(role) {
    setStatus('Laddar ' + role + '-checklista...');
    api('/admin/checklists?role=' + encodeURIComponent(role))
      .then(function (payload) {
        var items = payload.items || [];
        if (summaryEl) {
          summaryEl.textContent = payload.summary
            ? role + ': ' + payload.summary.seeded + '/' + payload.summary.total + ' seedade'
            : '';
        }
        renderTextLines(items, function (item) {
          return (
            (item.name || item.seedKey) +
            ' | state=' +
            (item.state || '—') +
            (item.templateId ? ' | id=' + item.templateId : '')
          );
        });
        setStatus('Klar: ' + role + '-checklista');
      })
      .catch(function (err) {
        setStatus(err.message || 'Kunde inte ladda checklistor.', true);
      });
  }

  if (ownerChecklistBtn) {
    ownerChecklistBtn.addEventListener('click', function () {
      loadChecklists('OWNER');
    });
  }

  if (staffChecklistBtn) {
    staffChecklistBtn.addEventListener('click', function () {
      loadChecklists('STAFF');
    });
  }

  if (filterUnownedBtn) {
    filterUnownedBtn.addEventListener('click', function () {
      filterUnownedOnly = true;
      tabs.forEach(function (b) {
        b.classList.remove('active');
        if ((b.getAttribute('data-cao-tab') || '') === 'tasks') b.classList.add('active');
      });
      document.querySelectorAll('.cao-filter-incidents').forEach(function (el) {
        el.style.display = 'none';
      });
      document.querySelectorAll('.cao-filter-audit').forEach(function (el) {
        el.style.display = 'none';
      });
      var ownerInput = document.getElementById('caoFilterOwner');
      if (ownerInput) ownerInput.value = '';
      loadTab('tasks');
    });
  }
})();
