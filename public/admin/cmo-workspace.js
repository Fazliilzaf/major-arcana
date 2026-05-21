(function initCmoMarketingWorkspace() {
  var refreshBtn = document.getElementById('cmoWorkspaceRefreshBtn');
  var filterStatus = document.getElementById('cmoWorkspaceFilterStatus');
  var filterOwner = document.getElementById('cmoWorkspaceFilterOwner');
  var statusEl = document.getElementById('cmoWorkspaceStatus');
  var summaryEl = document.getElementById('cmoWorkspaceSummary');
  var resultsEl = document.getElementById('cmoWorkspaceResults');
  if (!resultsEl) return;

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

  function patchCampaign(campaignId, body) {
    return api('/marketing/campaigns/' + encodeURIComponent(campaignId), {
      method: 'PATCH',
      body: body,
    });
  }

  function approveCampaign(campaignId) {
    return api('/marketing/campaigns/' + encodeURIComponent(campaignId) + '/approve', {
      method: 'POST',
      body: {},
    });
  }

  function rejectCampaign(campaignId, reason) {
    return api('/marketing/campaigns/' + encodeURIComponent(campaignId) + '/reject', {
      method: 'POST',
      body: { reason: reason || 'Avvisad i workspace.' },
    });
  }

  function renderRows(items) {
    resultsEl.style.whiteSpace = 'normal';
    resultsEl.innerHTML = '';
    if (!items || !items.length) {
      resultsEl.textContent = 'Inga kampanjutkast matchar filtret.';
      return;
    }

    items.forEach(function (campaign, index) {
      var row = document.createElement('div');
      row.style.cssText =
        'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(127,127,127,0.2);font-size:12px;';

      var text = document.createElement('span');
      text.style.flex = '1 1 280px';
      text.textContent =
        index +
        1 +
        '. ' +
        (campaign.name || campaign.id) +
        ' | status=' +
        (campaign.status || '—') +
        ' | owner=' +
        (campaign.owner || '—') +
        ' | channel=' +
        (campaign.channel || '—') +
        ' | v' +
        (campaign.version || 1);

      row.appendChild(text);

      var actions = document.createElement('span');
      actions.style.display = 'inline-flex';
      actions.style.gap = '6px';
      actions.style.flexWrap = 'wrap';

      if (!String(campaign.owner || '').trim()) {
        var assignBtn = document.createElement('button');
        assignBtn.type = 'button';
        assignBtn.className = 'btn small';
        assignBtn.textContent = 'Tilldela ägare';
        assignBtn.addEventListener('click', function () {
          var owner = window.prompt('Ange ägare (t.ex. OWNER):', 'OWNER');
          if (!owner || !String(owner).trim()) return;
          setStatus('Sparar ägare för ' + campaign.id + '...');
          patchCampaign(campaign.id, { owner: String(owner).trim() })
            .then(function () {
              setStatus('Ägare tilldelad.');
              loadCampaigns();
            })
            .catch(function (err) {
              setStatus(err.message || 'Kunde inte tilldela ägare.', true);
            });
        });
        actions.appendChild(assignBtn);
      }

      if (campaign.status === 'pending_approval') {
        var approveBtn = document.createElement('button');
        approveBtn.type = 'button';
        approveBtn.className = 'btn small primary';
        approveBtn.textContent = 'Godkänn';
        approveBtn.addEventListener('click', function () {
          if (!window.confirm('Godkänn kampanj "' + (campaign.name || campaign.id) + '"?')) return;
          setStatus('Godkänner ' + campaign.id + '...');
          approveCampaign(campaign.id)
            .then(function () {
              setStatus('Kampanj godkänd.');
              loadCampaigns();
            })
            .catch(function (err) {
              setStatus(err.message || 'Kunde inte godkänna.', true);
            });
        });
        actions.appendChild(approveBtn);

        var rejectBtn = document.createElement('button');
        rejectBtn.type = 'button';
        rejectBtn.className = 'btn small';
        rejectBtn.textContent = 'Avvisa';
        rejectBtn.addEventListener('click', function () {
          var reason = window.prompt('Anledning till avvisning:', 'Behöver justeras.');
          if (reason === null) return;
          setStatus('Avvisar ' + campaign.id + '...');
          rejectCampaign(campaign.id, reason)
            .then(function () {
              setStatus('Kampanj avvisad.');
              loadCampaigns();
            })
            .catch(function (err) {
              setStatus(err.message || 'Kunde inte avvisa.', true);
            });
        });
        actions.appendChild(rejectBtn);
      }

      if (actions.childNodes.length) row.appendChild(actions);
      resultsEl.appendChild(row);
    });
  }

  function loadCampaigns() {
    setStatus('Laddar kampanjutkast...');
    var path =
      '/marketing/campaigns?limit=100' +
      queryParam('status', filterStatus && filterStatus.value) +
      queryParam('owner', filterOwner && filterOwner.value);

    api(path)
      .then(function (payload) {
        var items = payload.items || [];
        if (summaryEl && payload.summary) {
          summaryEl.textContent =
            'Totalt: ' +
            (payload.summary.total || items.length) +
            ' | Väntar godkännande: ' +
            (payload.summary.pendingApproval || 0) +
            ' | Godkända: ' +
            (payload.summary.approved || 0) +
            ' | Blockerade: ' +
            (payload.summary.blocked || 0);
        }
        renderRows(items);
        setStatus('Klar: kampanjworkspace');
      })
      .catch(function (err) {
        setStatus(err.message || 'Kunde inte ladda kampanjutkast.', true);
      });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadCampaigns);
  }
  if (filterStatus) {
    filterStatus.addEventListener('change', loadCampaigns);
  }
  if (filterOwner) {
    filterOwner.addEventListener('change', loadCampaigns);
  }

  loadCampaigns();
})();
