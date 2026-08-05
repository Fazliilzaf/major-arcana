(function initCmoWeeklyReportsPanel(global) {
  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function formatNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('sv-SE');
  }

  function formatPercent(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return (num * 100).toFixed(2) + '%';
  }

  function renderKpiBlock(label, kpi) {
    if (!kpi || typeof kpi !== 'object') return '';
    const lines = [
      '<strong>' + label + '</strong> (' + (kpi.status || '—') + ', ' + (kpi.mode || '—') + ')',
    ];
    if (kpi.clicks != null) lines.push('Klick: ' + formatNumber(kpi.clicks));
    if (kpi.impressions != null) lines.push('Visningar: ' + formatNumber(kpi.impressions));
    if (kpi.spend != null) lines.push('Spend: ' + formatNumber(kpi.spend) + ' kr');
    if (kpi.ctr != null) lines.push('CTR: ' + formatPercent(kpi.ctr));
    if (kpi.cpc != null) lines.push('CPC: ' + formatNumber(kpi.cpc) + ' kr');
    if (kpi.cpa != null) lines.push('CPA: ' + formatNumber(kpi.cpa) + ' kr');
    if (kpi.position != null) lines.push('Genomsnittlig position: ' + formatNumber(kpi.position));
    if (kpi.message) lines.push('Meddelande: ' + kpi.message);
    return '<div style="margin-bottom:10px">' + lines.join('<br>') + '</div>';
  }

  function renderListItem(report, index) {
    return (
      '<div class="overview-card" style="margin-bottom:8px;cursor:pointer" data-report-index="' +
      index +
      '">' +
      '<div style="display:flex;justify-content:space-between;gap:8px">' +
      '<strong>' +
      (report.week || '—') +
      '</strong>' +
      '<span class="mini" data-tone="' +
      (report.status === 'final' ? 'ok' : 'warn') +
      '">' +
      (report.status || 'draft') +
      '</span>' +
      '</div>' +
      '<div class="mini muted">' +
      (report.brand || '—') +
      ' · ' +
      (report.periodStart || '—') +
      ' → ' +
      (report.periodEnd || '—') +
      '</div>' +
      '<div class="mini">' +
      (report.summary || '').slice(0, 120) +
      (report.summary && report.summary.length > 120 ? '…' : '') +
      '</div>' +
      '</div>'
    );
  }

  function mountCmoWeeklyReportsPanel(getToken) {
    if (typeof getToken !== 'function') return;

    var panel = document.getElementById('cmoWeeklyReportsPanel');
    var listEl = document.getElementById('cmoWeeklyReportsList');
    var detailEl = document.getElementById('cmoWeeklyReportsDetail');
    var generateBtn = document.getElementById('cmoWeeklyReportsGenerateBtn');
    var statusEl = document.getElementById('cmoWeeklyReportsStatus');
    var backBtn = document.getElementById('cmoWeeklyReportsBackBtn');
    var saveBtn = document.getElementById('cmoWeeklyReportsSaveBtn');
    var finalBtn = document.getElementById('cmoWeeklyReportsFinalBtn');
    var tabBar = document.getElementById('cmoTabBar');

    var currentReports = [];
    var currentReport = null;

    function setStatus(text, isError) {
      if (!statusEl) return;
      statusEl.textContent = text || '';
      statusEl.style.color = isError ? '#b42318' : '';
    }

    function showList() {
      if (listEl) listEl.hidden = false;
      if (detailEl) detailEl.hidden = true;
    }

    function showDetail() {
      if (listEl) listEl.hidden = true;
      if (detailEl) detailEl.hidden = false;
    }

    function getAuthHeaders() {
      var token = getToken();
      return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
    }

    function apiFetch(path, options) {
      options = options || {};
      options.headers = { ...getAuthHeaders(), ...(options.headers || {}) };
      return fetch('/api/v1' + path, options).then(function (res) {
        return res.json().then(function (payload) {
          if (!res.ok) throw new Error((payload && payload.error) || 'API-fel');
          return payload;
        });
      });
    }

    function renderList(items) {
      currentReports = items || [];
      if (!listEl) return;
      if (!items || !items.length) {
        listEl.innerHTML =
          '<div class="muted mini">Inga veckorapporter än. Klicka på "Generera" för att skapa den första.</div>';
        return;
      }
      listEl.innerHTML = items.map(renderListItem).join('');
      listEl.querySelectorAll('[data-report-index]').forEach(function (card) {
        card.addEventListener('click', function () {
          var index = Number(card.getAttribute('data-report-index'));
          currentReport = currentReports[index];
          renderDetail(currentReport);
          showDetail();
        });
      });
    }

    function renderDetail(report) {
      if (!detailEl || !report) return;
      currentReport = report;

      var kpi = report.sections && report.sections.kpi ? report.sections.kpi : {};
      var kpiHtml = [
        renderKpiBlock('Google Search Console', kpi.gsc),
        renderKpiBlock('Google Ads', kpi.google_ads),
        renderKpiBlock('Meta Ads', kpi.meta),
        renderKpiBlock('LinkedIn', kpi.linkedin),
        renderKpiBlock('Mail', kpi.mail),
      ].join('');

      detailEl.innerHTML =
        '<div class="seg">' +
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px">' +
        '<h3 style="margin:0">Veckorapport ' +
        report.week +
        '</h3>' +
        '<span class="mini" data-tone="' +
        (report.status === 'final' ? 'ok' : 'warn') +
        '">' +
        (report.status || 'draft') +
        '</span>' +
        '</div>' +
        '<div class="mini muted" style="margin-bottom:10px">' +
        (report.brand || '—') +
        ' · ' +
        (report.periodStart || '—') +
        ' → ' +
        (report.periodEnd || '—') +
        '</div>' +
        '<label class="mini">Sammanfattning</label>' +
        '<textarea id="cmoWeeklyReportSummary" class="code-block" style="width:100%;min-height:80px;margin-bottom:10px">' +
        (report.summary || '') +
        '</textarea>' +
        '<h4 style="margin:8px 0">KPI:er</h4>' +
        '<div class="code-block" style="margin-bottom:10px">' +
        kpiHtml +
        '</div>' +
        '<label class="mini">Utfört denna vecka (en punkt per rad)</label>' +
        '<textarea id="cmoWeeklyReportDone" class="code-block" style="width:100%;min-height:60px;margin-bottom:10px">' +
        (report.sections && report.sections.done ? report.sections.done.join('\n') : '') +
        '</textarea>' +
        '<label class="mini">Planerat nästa vecka (en punkt per rad)</label>' +
        '<textarea id="cmoWeeklyReportPlanned" class="code-block" style="width:100%;min-height:60px;margin-bottom:10px">' +
        (report.sections && report.sections.planned ? report.sections.planned.join('\n') : '') +
        '</textarea>' +
        '<label class="mini">Blockerare / beslut som krävs (en punkt per rad)</label>' +
        '<textarea id="cmoWeeklyReportBlockers" class="code-block" style="width:100%;min-height:60px;margin-bottom:10px">' +
        (report.sections && report.sections.blockers ? report.sections.blockers.join('\n') : '') +
        '</textarea>' +
        '</div>';
    }

    function readTextareaLines(id) {
      var el = document.getElementById(id);
      if (!el) return [];
      return el.value
        .split('\n')
        .map(function (line) {
          return line.trim();
        })
        .filter(Boolean);
    }

    function loadReports() {
      setStatus('Hämtar veckorapporter...');
      return apiFetch('/marketing/weekly-reports?limit=50')
        .then(function (payload) {
          renderList(payload.items || []);
          setStatus('Uppdaterad ' + new Date().toLocaleTimeString('sv-SE') + '.');
          return payload;
        })
        .catch(function (err) {
          setStatus(err.message || 'Kunde inte hämta veckorapporter.', true);
          throw err;
        });
    }

    function generateReport() {
      if (!generateBtn) return;
      generateBtn.disabled = true;
      setStatus('Genererar veckorapport...');
      apiFetch('/marketing/weekly-reports/new/generate', { method: 'POST', body: '{}' })
        .then(function (payload) {
          currentReport = payload.item;
          renderDetail(currentReport);
          showDetail();
          setStatus('Veckorapport genererad.');
        })
        .catch(function (err) {
          setStatus(err.message || 'Kunde inte generera veckorapport.', true);
        })
        .finally(function () {
          generateBtn.disabled = false;
        });
    }

    function saveCurrentReport(status) {
      if (!currentReport) return;
      if (saveBtn) saveBtn.disabled = true;
      if (finalBtn) finalBtn.disabled = true;

      var body = {
        summary: document.getElementById('cmoWeeklyReportSummary')
          ? document.getElementById('cmoWeeklyReportSummary').value
          : currentReport.summary,
        status: status || currentReport.status || 'draft',
        sections: {
          ...currentReport.sections,
          done: readTextareaLines('cmoWeeklyReportDone'),
          planned: readTextareaLines('cmoWeeklyReportPlanned'),
          blockers: readTextareaLines('cmoWeeklyReportBlockers'),
        },
      };

      setStatus('Sparar...');
      apiFetch('/marketing/weekly-reports/' + currentReport.id, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
        .then(function (payload) {
          currentReport = payload.item;
          renderDetail(currentReport);
          setStatus('Sparad.');
        })
        .catch(function (err) {
          setStatus(err.message || 'Kunde inte spara.', true);
        })
        .finally(function () {
          if (saveBtn) saveBtn.disabled = false;
          if (finalBtn) finalBtn.disabled = false;
        });
    }

    if (generateBtn) {
      generateBtn.addEventListener('click', generateReport);
    }

    if (backBtn) {
      backBtn.addEventListener('click', function () {
        loadReports().then(showList);
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        saveCurrentReport('draft');
      });
    }

    if (finalBtn) {
      finalBtn.addEventListener('click', function () {
        saveCurrentReport('final');
      });
    }

    if (tabBar) {
      tabBar.addEventListener('click', function (event) {
        var btn = event.target.closest('[data-cmo-tab]');
        if (!btn || btn.getAttribute('data-cmo-tab') !== 'weekly-reports') return;
        showList();
        loadReports();
      });
    }

    if (document.getElementById('cmoWeeklyReportsPanel')) {
      showList();
      loadReports();
    }
  }

  global.initCmoWeeklyReportsPanel = mountCmoWeeklyReportsPanel;
})(window);
