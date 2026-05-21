(function initCmoAnalyticsPanel(global) {
  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function mountCmoAnalyticsPanel(getToken) {
    if (typeof getToken !== 'function') return;

    var weeklyBtn = document.getElementById('runCmoWeeklyReportBtn');
    var monthlyBtn = document.getElementById('runCmoMonthlyReportBtn');
    var statusEl = document.getElementById('cmoAnalyticsStatus');
    var summaryEl = document.getElementById('cmoAnalyticsSummary');
    var kpisEl = document.getElementById('cmoAnalyticsKpis');
    var mixEl = document.getElementById('cmoAnalyticsChannelMix');
    var briefEl = document.getElementById('cmoAnalyticsBrief');
    if (!weeklyBtn || !monthlyBtn) return;

    function setStatus(text, isError) {
      if (!statusEl) return;
      statusEl.textContent = text || '';
      statusEl.style.color = isError ? '#b42318' : '';
    }

    function renderMetric(label, metric) {
      if (!metric || metric.fresh !== true) return label + ': — (saknar färsk data)';
      var value = metric.value;
      if (label === 'CTR' || label === 'Konvertering') {
        value = (Number(value) * 100).toFixed(2) + '%';
      } else if (label === 'CPC' || label === 'CPA' || label === 'CPL') {
        value = Number(value).toFixed(2);
      }
      return (
        label +
        ': ' +
        value +
        ' | source=' +
        (metric.source || '—') +
        ' | window=' +
        (metric.window || '—') +
        ' | fetchedAt=' +
        (metric.fetchedAt || '—')
      );
    }

    function renderOutput(out) {
      if (summaryEl) {
        summaryEl.textContent = out.executiveSummary || out.recommendation || 'Ingen sammanfattning.';
      }

      var kpis = out.kpis || (out.performanceSummary && out.performanceSummary.kpis) || {};
      if (kpisEl) {
        kpisEl.textContent = [
          renderMetric('CTR', kpis.ctr),
          renderMetric('CPC', kpis.cpc),
          renderMetric('CPA', kpis.cpa),
          renderMetric('CPL', kpis.cpl),
          renderMetric('Konvertering', kpis.conversionRate),
        ].join('\n');
      }

      var mix = out.channelMix || (out.performanceSummary && out.performanceSummary.channelMix) || [];
      if (mixEl) {
        mixEl.textContent = mix.length
          ? mix
              .map(function (item, index) {
                return (
                  index +
                  1 +
                  '. ' +
                  item.channel +
                  ' | share=' +
                  Math.round(Number(item.share || 0) * 100) +
                  '%' +
                  (item.spend != null ? ' | spend=' + item.spend : '')
                );
              })
              .join('\n')
          : 'Ingen kanalmix — otillräcklig data.';
      }

      var brief = out.marketingBrief || {};
      if (briefEl) {
        var lines = [];
        if (Array.isArray(brief.highlights) && brief.highlights.length) {
          lines.push('Highlights:\n' + brief.highlights.map(function (h, i) { return i + 1 + '. ' + h; }).join('\n'));
        }
        if (Array.isArray(brief.risks) && brief.risks.length) {
          lines.push('Risker:\n' + brief.risks.map(function (r, i) { return i + 1 + '. ' + r; }).join('\n'));
        }
        if (Array.isArray(brief.actions) && brief.actions.length) {
          lines.push(
            'Föreslagna åtgärder:\n' +
              brief.actions
                .map(function (a, i) {
                  return i + 1 + '. ' + (a.label || a.id);
                })
                .join('\n')
          );
        }
        if (out.recommendation) lines.push('Rekommendation: ' + out.recommendation);
        briefEl.textContent = lines.length ? lines.join('\n\n') : 'Ingen brief genererad.';
      }
    }

    function runReport(period) {
      var token = getToken();
      if (!token) {
        setStatus('Ej inloggad.', true);
        return Promise.reject(new Error('Ej inloggad'));
      }
      setStatus('Genererar ' + period + 'rapport...');
      return fetch('/api/v1/agents/CMO/run', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: 'admin',
          input: {
            mode: 'analytics',
            period: period,
          },
        }),
      })
        .then(function (res) {
          return res.json().then(function (payload) {
            if (!res.ok) throw new Error((payload && payload.error) || 'Analys misslyckades');
            return payload;
          });
        })
        .then(function (payload) {
          var out = (payload && payload.output && payload.output.data) || (payload && payload.data) || {};
          renderOutput(out);
          setStatus('Klar: ' + period + 'rapport (read-only).');
          return out;
        })
        .catch(function (err) {
          setStatus(err.message || 'Analys misslyckades.', true);
          throw err;
        });
    }

    weeklyBtn.addEventListener('click', function () {
      weeklyBtn.disabled = true;
      if (monthlyBtn) monthlyBtn.disabled = true;
      runReport('weekly').finally(function () {
        weeklyBtn.disabled = false;
        if (monthlyBtn) monthlyBtn.disabled = false;
      });
    });

    monthlyBtn.addEventListener('click', function () {
      weeklyBtn.disabled = true;
      monthlyBtn.disabled = true;
      runReport('monthly').finally(function () {
        weeklyBtn.disabled = false;
        monthlyBtn.disabled = false;
      });
    });
  }

  global.initCmoAnalyticsPanel = mountCmoAnalyticsPanel;
})(window);
