(function initExecutiveDecisionFeedPanel() {
  var summaryEl = document.getElementById('executiveFeedSummary');
  var listEl = document.getElementById('executiveFeedList');
  var refreshBtn = document.getElementById('executiveFeedRefreshBtn');
  if (!summaryEl || !listEl) return;

  function renderSummary(summary) {
    if (!summary) {
      summaryEl.textContent = 'Ingen feed-data.';
      return;
    }
    summaryEl.textContent =
      'Aktiva: ' +
      (summary.totalActive || 0) +
      ' | OWNER-åtgärd: ' +
      (summary.ownerActionRequired || 0) +
      ' | High: ' +
      ((summary.bySeverity && summary.bySeverity.high) || 0);
  }

  function resolveEntry(entryId, resolution) {
    return fetch('/api/v1/executive/feed/' + encodeURIComponent(entryId) + '/resolve', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ resolution: resolution || 'acknowledged', resolvedBy: 'owner' }),
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error((body && body.error) || 'Kunde inte kvittera.');
        return body;
      });
    });
  }

  function approveCampaignDrafts(entry) {
    var draftIds = (entry.context && entry.context.draftIds) || [];
    if (!draftIds.length) {
      return Promise.reject(new Error('Inga kampanj-ID i feed-posten.'));
    }
    return Promise.all(
      draftIds.map(function (draftId) {
        return fetch('/api/v1/marketing/campaigns/' + encodeURIComponent(draftId) + '/approve', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({}),
        }).then(function (res) {
          return res.json().then(function (body) {
            if (!res.ok) throw new Error((body && body.error) || 'Godkännande misslyckades.');
            return body;
          });
        });
      })
    );
  }

  function renderEntries(entries) {
    listEl.innerHTML = '';
    if (!entries || !entries.length) {
      listEl.textContent = 'Inga pending beslut just nu.';
      return;
    }
    entries.forEach(function (entry) {
      var row = document.createElement('div');
      row.className = 'executive-feed-row';
      row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin-bottom:8px';

      var text = document.createElement('div');
      text.style.flex = '1';
      text.textContent =
        '[' +
        (entry.severity || 'info') +
        '] ' +
        (entry.agent || 'agent') +
        ' — ' +
        (entry.recommendation || 'Granska') +
        (entry.requiredOwnerAction ? ' (OWNER)' : '');

      row.appendChild(text);

      if (entry.status === 'pending') {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn small';
        btn.textContent =
          entry.actionType === 'approve_campaigns' ? 'Godkänn kampanjer' : 'Kvittera';
        btn.addEventListener('click', function () {
          btn.disabled = true;
          var action =
            entry.actionType === 'approve_campaigns'
              ? approveCampaignDrafts(entry).then(function () {
                  return resolveEntry(entry.id, 'approved');
                })
              : resolveEntry(entry.id, 'acknowledged');
          action
            .then(function () {
              loadFeed();
            })
            .catch(function (err) {
              btn.disabled = false;
              summaryEl.textContent = err.message || 'Åtgärd misslyckades.';
            });
        });
        row.appendChild(btn);
      }

      listEl.appendChild(row);
    });
  }

  function loadFeed() {
    fetch('/api/v1/executive/feed?ownerAction=true&limit=10', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (payload) {
        renderSummary(payload.summary);
        renderEntries(payload.entries);
      })
      .catch(function () {
        summaryEl.textContent = 'Kunde inte ladda executive feed.';
        listEl.textContent = '';
      });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadFeed);
  }
  loadFeed();
})();
