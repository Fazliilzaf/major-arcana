(function initCmoContentAssetsPanel() {
  var refreshBtn = document.getElementById('cmoContentAssetsRefreshBtn');
  var statusEl = document.getElementById('cmoContentAssetsStatus');
  var listEl = document.getElementById('cmoContentAssetsList');
  var tabBar = document.getElementById('cmoTabBar');
  if (!listEl) return;

  function api(path) {
    return fetch('/api/v1' + path, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
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

  function renderRows(items) {
    listEl.style.whiteSpace = 'normal';
    listEl.innerHTML = '';
    if (!items || !items.length) {
      listEl.textContent = 'Inga content assets ännu.';
      return;
    }

    items.forEach(function (asset, index) {
      var row = document.createElement('div');
      row.style.cssText =
        'padding:8px 0;border-bottom:1px solid rgba(127,127,127,0.2);font-size:12px;';
      var versions = Array.isArray(asset.versions) ? asset.versions.length : 0;
      row.textContent =
        index +
        1 +
        '. ' +
        (asset.title || asset.id || '—') +
        ' | channel=' +
        (asset.channel || '—') +
        ' | status=' +
        (asset.status || '—') +
        ' | version=' +
        (asset.version || 1) +
        ' | history=' +
        versions;
      listEl.appendChild(row);
    });
  }

  function loadAssets() {
    setStatus('Laddar content assets...');
    api('/marketing/content-assets?limit=50')
      .then(function (payload) {
        renderRows(payload.items || []);
        setStatus('Klar: content assets');
      })
      .catch(function (err) {
        setStatus(err.message || 'Kunde inte ladda content assets.', true);
      });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', loadAssets);
  if (tabBar) {
    tabBar.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-cmo-tab]');
      if (!btn || btn.getAttribute('data-cmo-tab') !== 'content') return;
      loadAssets();
    });
  }
})();
