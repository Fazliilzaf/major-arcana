(function initCmoConnectorsPanel(global) {
  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function formatChannelLabel(channel) {
    var key = normalizeText(channel).toLowerCase();
    if (key === 'google_ads') return 'Google Ads';
    if (key === 'meta') return 'Meta';
    if (key === 'linkedin') return 'LinkedIn';
    if (key === 'mail') return 'Mail / CRM';
    return channel || '—';
  }

  function statusTone(status) {
    var normalized = normalizeText(status).toLowerCase();
    if (normalized === 'ok') return 'ok';
    if (normalized === 'error') return 'error';
    if (normalized === 'not_configured') return 'muted';
    return 'warn';
  }

  function renderMetricLine(label, metric) {
    if (!metric || typeof metric !== 'object') return label + ': —';
    if (metric.fresh !== true && metric.value == null) return label + ': — (ej färsk)';
    var value = metric.value;
    if (label === 'CTR') value = (Number(value) * 100).toFixed(2) + '%';
    else if (label === 'Spend' || label === 'CPC') value = Number(value).toFixed(2);
    return label + ': ' + value;
  }

  function mountCmoConnectorsPanel() {
    var refreshBtn = document.getElementById('cmoConnectorsRefreshBtn');
    var windowSelect = document.getElementById('cmoConnectorsWindow');
    var statusEl = document.getElementById('cmoConnectorsStatus');
    var summaryEl = document.getElementById('cmoConnectorsSummary');
    var listEl = document.getElementById('cmoConnectorsList');
    var modeEl = document.getElementById('cmoConnectorsModeNote');
    var tabBar = document.getElementById('cmoTabBar');
    if (!refreshBtn || !listEl) return;

    function setStatus(text, isError) {
      if (!statusEl) return;
      statusEl.textContent = text || '';
      statusEl.style.color = isError ? '#b42318' : '';
    }

    function renderSummary(summary) {
      if (!summaryEl) return;
      var total = summary && summary.total != null ? summary.total : 0;
      var ok = summary && summary.ok != null ? summary.ok : 0;
      var configured = summary && summary.configured != null ? summary.configured : 0;
      var errorCount = summary && summary.error != null ? summary.error : 0;
      var healthAlert = summary && summary.healthAlert === true;
      summaryEl.textContent =
        'Totalt: ' +
        total +
        ' | konfigurerade: ' +
        configured +
        ' | ok: ' +
        ok +
        ' | fel: ' +
        errorCount +
        (healthAlert ? ' | ⚠ health alert' : '');
      if (summaryEl.style) summaryEl.style.color = healthAlert ? '#b42318' : '';
    }

    function renderItems(items) {
      if (!listEl) return;
      if (!Array.isArray(items) || !items.length) {
        listEl.textContent = 'Inga connectors returnerades.';
        return;
      }

      listEl.innerHTML = items
        .map(function (item) {
          var tone = statusTone(item.status);
          var metrics =
            item.metrics && item.metrics.metrics ? item.metrics.metrics : item.metrics || {};
          var metricLines = [
            renderMetricLine('CTR', metrics.ctr),
            renderMetricLine('CPC', metrics.cpc),
            renderMetricLine('Spend', metrics.spend),
            renderMetricLine('Impressions', metrics.impressions),
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            '<div class="overview-card" style="margin-bottom:10px">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">' +
            '<h4 style="margin:0">' +
            formatChannelLabel(item.channel) +
            '</h4>' +
            '<span class="mini" data-tone="' +
            tone +
            '">' +
            (item.status || 'unknown') +
            '</span>' +
            '</div>' +
            '<div class="mini muted" style="margin-top:6px">mode=' +
            (item.mode || '—') +
            ' | window=' +
            (item.metrics && item.metrics.window ? item.metrics.window : '—') +
            '</div>' +
            '<div class="mini" style="margin-top:6px">' +
            (metricLines || 'Inga metrics') +
            '</div>' +
            '<div class="mini muted" style="margin-top:6px">fetchedAt=' +
            (item.fetchedAt || '—') +
            '</div>' +
            '<div class="mini muted" style="margin-top:4px">' +
            (item.message || '') +
            '</div>' +
            '</div>'
          );
        })
        .join('');
    }

    function loadStatus() {
      var windowValue = windowSelect ? normalizeText(windowSelect.value) || '7d' : '7d';
      setStatus('Hämtar connector-status (' + windowValue + ')...');

      return fetch(
        '/api/v1/marketing/connectors/status?window=' +
          encodeURIComponent(windowValue) +
          '&force=1',
        {
          credentials: 'same-origin',
          headers: { accept: 'application/json' },
        }
      )
        .then(function (res) {
          return res.json().then(function (payload) {
            if (!res.ok)
              throw new Error((payload && payload.error) || 'Kunde inte läsa connectors.');
            return payload;
          });
        })
        .then(function (payload) {
          renderSummary(payload.summary || {});
          renderItems(payload.items || []);
          if (modeEl) {
            var firstMode =
              payload.items && payload.items.length ? normalizeText(payload.items[0].mode) : '';
            modeEl.textContent =
              firstMode === 'live'
                ? 'Live-läge — metrics hämtas från plattform när LIVE_FETCH är på.'
                : 'Fixture-läge — read-only testdata. Sätt MODE=live + secrets vid go-live.';
          }
          setStatus('Uppdaterad ' + new Date().toLocaleTimeString('sv-SE') + '.');
          return payload;
        })
        .catch(function (err) {
          if (listEl) listEl.textContent = '';
          setStatus(err.message || 'Connector-status misslyckades.', true);
          throw err;
        });
    }

    refreshBtn.addEventListener('click', function () {
      refreshBtn.disabled = true;
      loadStatus().finally(function () {
        refreshBtn.disabled = false;
      });
    });

    if (windowSelect) {
      windowSelect.addEventListener('change', function () {
        loadStatus();
      });
    }

    if (tabBar) {
      tabBar.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-cmo-tab]');
        if (!btn || btn.getAttribute('data-cmo-tab') !== 'connectors') return;
        loadStatus();
      });
    }
  }

  global.initCmoConnectorsPanel = mountCmoConnectorsPanel;

  if (document.getElementById('cmoConnectorsRefreshBtn')) {
    mountCmoConnectorsPanel();
  }
})(window);
