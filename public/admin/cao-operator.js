(function initCaoOperatorPanel(global) {
  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function mountCaoOperatorPanel(getToken) {
    if (typeof getToken !== 'function') return;

    function agentPost(agentName) {
      var token = getToken();
      if (!token) return Promise.reject(new Error('Ej inloggad'));
      return fetch('/api/v1/agents/' + agentName + '/run', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: '{}',
      }).then(function (res) {
        return res.json();
      });
    }

    global.runCaoAgent = function runCaoAgent() {
      var caoBtn = document.getElementById('runCaoAgentBtn');
      var caoStatus = document.getElementById('caoRunStatus');
      if (caoBtn) caoBtn.disabled = true;
      if (caoStatus) caoStatus.textContent = 'Kör...';
      return agentPost('CAO')
        .then(function (d) {
          var out = (d && d.output && d.output.data) || (d && d.data) || {};
          var panel = document.getElementById('caoResultPanel');
          if (panel) panel.style.display = '';
          var el = document.getElementById('caoSuggestionCount');
          if (el) el.textContent = String((out.templateSuggestions || []).length);
          el = document.getElementById('caoDisclaimerStatus');
          if (el) {
            el.textContent = out.disclaimerResults
              ? out.disclaimerResults.compliantCount + '/' + out.disclaimerResults.totalCount
              : '—';
          }
          el = document.getElementById('caoVariableScore');
          if (el) {
            el.textContent = ((out.variableOptimization && out.variableOptimization.averageScore) || 100) + '%';
          }
          el = document.getElementById('caoLibraryHealth');
          if (el) {
            var lib = out.templateLibraryHealth || {};
            el.textContent = lib.healthScore != null ? lib.healthScore + '/100' : '—';
          }
          el = document.getElementById('caoQualityGate');
          if (el) {
            var gate = out.adminQualityGate || {};
            el.textContent = gate.gatePassed === true ? 'Godkänd' : 'Flaggad';
          }
          el = document.getElementById('caoExecutiveSummary');
          if (el) el.textContent = out.executiveSummary || 'Ingen sammanfattning.';
          el = document.getElementById('caoAdminOpsSummary');
          if (el) {
            var libSummary = (out.templateLibraryHealth && out.templateLibraryHealth.summary) || '';
            var gateSummary = (out.adminQualityGate && out.adminQualityGate.summary) || '';
            var flagged = (out.adminQualityGate && out.adminQualityGate.flaggedTasks) || [];
            var libFlags = (out.templateLibraryHealth && out.templateLibraryHealth.flags) || [];
            var lines = [];
            if (libSummary) lines.push(libSummary);
            if (gateSummary) lines.push(gateSummary);
            if (libFlags.length) {
              lines.push(
                'Mallflaggor:\n' +
                  libFlags
                    .map(function (f) {
                      return (f.templateName || f.templateId || 'mall') + ': ' + (f.label || f.issue || '');
                    })
                    .join('\n')
              );
            }
            if (flagged.length) {
              lines.push(
                'Uppgifter:\n' +
                  flagged
                    .map(function (t) {
                      return (t.title || t.taskId || 'uppgift') + ' — ' + (t.issues || []).join(', ');
                    })
                    .join('\n')
              );
            }
            el.textContent = lines.length ? lines.join('\n\n') : 'Inga admin- eller mallflaggor.';
          }
          el = document.getElementById('caoAdminBrief');
          if (el) {
            var brief = out.adminBrief || {};
            var priorities = brief.priorities || [];
            el.textContent = priorities.length
              ? priorities
                  .map(function (p, i) {
                    return i + 1 + '. ' + p;
                  })
                  .join('\n')
              : normalizeText(brief.summary) || 'Ingen admin brief.';
          }
          el = document.getElementById('caoWeeklyBrief');
          if (el) {
            var weekly = out.adminWeeklyBrief || {};
            var recs = weekly.recommendations || [];
            el.textContent =
              normalizeText(weekly.weekSummary || weekly.summary) ||
              (recs.length
                ? recs
                    .map(function (r, i) {
                      return i + 1 + '. ' + r;
                    })
                    .join('\n')
                : 'Ingen veckosammanfattning.');
          }
          el = document.getElementById('caoGoNoGoBrief');
          if (el) {
            var goNoGo = out.goNoGoBrief || (out.adminOperatorReports && out.adminOperatorReports.goNoGo) || {};
            var goRecs = goNoGo.recommendations || [];
            var goLines = [];
            if (goNoGo.summary) goLines.push(goNoGo.summary);
            if (goNoGo.highlights && goNoGo.highlights.length) {
              goLines.push(
                'Highlights:\n' +
                  goNoGo.highlights
                    .map(function (line, i) {
                      return i + 1 + '. ' + line;
                    })
                    .join('\n')
              );
            }
            if (goRecs.length) {
              goLines.push(
                'Rekommendationer:\n' +
                  goRecs
                    .map(function (r, i) {
                      return i + 1 + '. ' + r;
                    })
                    .join('\n')
              );
            }
            if (goNoGo.disclaimer) goLines.push(goNoGo.disclaimer);
            el.textContent = goLines.length ? goLines.join('\n\n') : 'Ingen Go/No-Go brief.';
          }
          el = document.getElementById('caoDisclaimerResults');
          if (el) {
            var nc = (out.disclaimerResults && out.disclaimerResults.nonCompliantTemplates) || [];
            el.textContent = nc.length
              ? nc
                  .map(function (t) {
                    return (
                      t.templateName +
                      ': saknar ' +
                      (t.missing || []).join(', ') +
                      (t.violations && t.violations.length
                        ? ' | brott: ' +
                          t.violations
                            .map(function (v) {
                              return v.label;
                            })
                            .join(', ')
                        : '')
                    );
                  })
                  .join('\n')
              : 'Alla mallar godkända.';
          }
          el = document.getElementById('caoVariableResults');
          if (el) {
            var top = (out.variableOptimization && out.variableOptimization.topImprovable) || [];
            el.textContent = top.length
              ? top
                  .map(function (t) {
                    return (
                      t.templateName +
                      ': ' +
                      (t.suggestions || [])
                        .map(function (s) {
                          return s.description;
                        })
                        .join('; ')
                    );
                  })
                  .join('\n')
              : 'Alla mallar har optimal variabelanvändning.';
          }
          if (caoStatus) caoStatus.textContent = 'Klar';
          return out;
        })
        .catch(function (err) {
          if (caoStatus) caoStatus.textContent = 'Fel: ' + (err.message || err);
          throw err;
        })
        .finally(function () {
          if (caoBtn) caoBtn.disabled = false;
        });
    };

    var caoBtn = document.getElementById('runCaoAgentBtn');
    if (caoBtn) {
      caoBtn.addEventListener('click', function () {
        global.runCaoAgent();
      });
    }
  }

  global.initCaoOperatorPanel = mountCaoOperatorPanel;
})(window);
