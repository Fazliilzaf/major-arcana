(function initCmoCopilotPanel(global) {
  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function mountCmoCopilotPanel(getToken) {
    if (typeof getToken !== 'function') return;

    var cmoBtn = document.getElementById('runCmoAgentBtn');
    var cmoStrategyBtn = document.getElementById('runCmoStrategyIntelBtn');
    var cmoStatus = document.getElementById('cmoRunStatus');
    if (!cmoBtn) return;

    function agentPost(agentName, body) {
      var token = getToken();
      if (!token) return Promise.reject(new Error('Ej inloggad'));
      return fetch('/api/v1/agents/' + agentName + '/run', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body || {}),
      }).then(function (res) {
        return res.json().then(function (payload) {
          if (!res.ok) {
            throw new Error((payload && payload.error) || 'CMO-körning misslyckades');
          }
          return payload;
        });
      });
    }

    function renderList(items, formatter) {
      if (!items || !items.length) return 'Inga rader genererade.';
      return items
        .map(function (item, index) {
          return index + 1 + '. ' + formatter(item);
        })
        .join('\n');
    }

    function readInput() {
      var audienceEl = document.getElementById('cmoTargetAudience');
      var toneEl = document.getElementById('cmoTone');
      var emailTypeEl = document.getElementById('cmoEmailType');
      var sourceEl = document.getElementById('cmoSourceContent');
      return {
        targetAudience: audienceEl ? normalizeText(audienceEl.value) : '',
        tone: toneEl ? normalizeText(toneEl.value) || 'professional' : 'professional',
        emailType: emailTypeEl ? normalizeText(emailTypeEl.value) || 'newsletter' : 'newsletter',
        sourceContent: sourceEl ? normalizeText(sourceEl.value) : '',
        maxTopics: 5,
      };
    }

    function renderOutput(out) {
      var panel = document.getElementById('cmoResultPanel');
      if (panel) panel.style.display = '';

      var counts = out.productionCounts || {};
      var setText = function (id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value != null ? String(value) : '—';
      };

      setText('cmoTopicCount', (out.topics || []).length);
      setText('cmoCalendarCount', (out.contentCalendar || []).length);
      setText('cmoSocialCount', counts.socialPosts != null ? counts.socialPosts : 0);
      setText('cmoSeoCount', counts.seoBriefs != null ? counts.seoBriefs : 0);
      setText('cmoAdCount', counts.adCopies != null ? counts.adCopies : 0);
      setText('cmoEmailCount', counts.emailDrafts != null ? counts.emailDrafts : 0);
      setText('cmoCampaignReadyCount', out.campaignReadyCount != null ? out.campaignReadyCount : 0);

      var summaryEl = document.getElementById('cmoExecutiveSummary');
      if (summaryEl) {
        summaryEl.textContent = out.executiveSummary || 'Ingen sammanfattning.';
      }

      var disclaimerEl = document.getElementById('cmoDisclaimer');
      if (disclaimerEl) {
        disclaimerEl.textContent = out.disclaimer || 'Utkast kräver godkännande före publicering.';
      }

      var calEl = document.getElementById('cmoCalendar');
      if (calEl) {
        var cal = out.contentCalendar || [];
        calEl.textContent = cal.length
          ? cal
              .map(function (c) {
                return 'Vecka ' + c.week + ': ' + c.topic + ' (' + c.format + ') — ' + c.targetDate;
              })
              .join('\n')
          : 'Ingen content-kalender genererad.';
      }

      var socialEl = document.getElementById('cmoSocialPreview');
      if (socialEl) {
        var posts = (out.socialPostPack && out.socialPostPack.posts) || [];
        socialEl.textContent = renderList(posts, function (p) {
          return (
            (p.platformLabel || p.platform || 'social') +
            ' | ' +
            (p.topic || '—') +
            ' | hook=' +
            (p.hook || '—')
          );
        });
      }

      var seoEl = document.getElementById('cmoSeoPreview');
      if (seoEl) {
        var articles = (out.seoBrief && out.seoBrief.articles) || [];
        seoEl.textContent = renderList(articles, function (a) {
          return (a.title || a.primaryKeyword || 'SEO') + ' | slug=' + (a.slug || '—');
        });
      }

      var adEl = document.getElementById('cmoAdPreview');
      if (adEl) {
        var ads = (out.adCopyPack && out.adCopyPack.ads) || [];
        adEl.textContent = renderList(ads, function (a) {
          return (
            (a.channelLabel || a.channel || 'ad') +
            ' | ' +
            ((a.headlines && a.headlines[0]) || '—') +
            ' | CTA=' +
            (a.cta || '—')
          );
        });
      }

      var emailEl = document.getElementById('cmoEmailPreview');
      if (emailEl) {
        var emails = (out.emailDrafts && out.emailDrafts.emails) || [];
        emailEl.textContent = renderList(emails, function (e) {
          return (e.subject || '—') + ' | ' + (e.typeLabel || e.type || 'mail');
        });
      }

      var campaignEl = document.getElementById('cmoCampaignPreview');
      if (campaignEl) {
        var campaigns = out.campaigns || [];
        campaignEl.textContent = renderList(campaigns, function (c) {
          return (c.name || c.id) + ' | readiness=' + (c.readiness || '—') + ' | ' + (c.channel || '—');
        });
      }

      var compliance = out.complianceReview || {};
      var complianceEl = document.getElementById('cmoComplianceStatus');
      if (complianceEl) {
        complianceEl.textContent =
          'Status: ' +
          (compliance.status || '—') +
          (out.scheduleAllowed === true ? ' | Schemaläggning tillåten' : ' | Schemaläggning blockerad');
      }
      var complianceChecksEl = document.getElementById('cmoComplianceChecks');
      if (complianceChecksEl) {
        var checks = compliance.checks || [];
        var flagged = out.flaggedClaims || [];
        var lines = [];
        if (checks.length) {
          lines.push(
            checks
              .map(function (c) {
                return (c.label || c.id) + ': ' + (c.status || '—');
              })
              .join('\n')
          );
        }
        if (flagged.length) {
          lines.push(
            'Flaggade claims:\n' +
              flagged
                .map(function (f, i) {
                  return i + 1 + '. [' + (f.severity || 'info') + '] ' + (f.label || f.id);
                })
                .join('\n')
          );
        }
        complianceChecksEl.textContent = lines.length ? lines.join('\n\n') : 'Inga compliance-flaggor.';
      }

      var scheduleStatusEl = document.getElementById('cmoScheduleStatus');
      if (scheduleStatusEl) {
        scheduleStatusEl.textContent =
          (out.scheduleItems || []).length +
          ' schemaförslag' +
          (out.missedPublications && out.missedPublications.length
            ? ' | ' + out.missedPublications.length + ' missade datum'
            : '');
      }
      var scheduleEl = document.getElementById('cmoSchedulePreview');
      if (scheduleEl) {
        var scheduleItems = out.scheduleItems || [];
        scheduleEl.textContent = scheduleItems.length
          ? scheduleItems
              .map(function (item, index) {
                var publishStatus = String(item.publishStatus || '').trim();
                return (
                  index +
                  1 +
                  '. ' +
                  (item.platform || '—') +
                  ' @ ' +
                  (item.proposedAt || '—') +
                  ' | ' +
                  (item.topic || '—') +
                  ' | ' +
                  (item.windowLabel || '') +
                  (publishStatus ? ' | publish=' + publishStatus : '') +
                  (item.publishMode ? ' | mode=' + item.publishMode : '')
                );
              })
              .join('\n')
          : 'Inget publiceringsschema genererat.';
      }

      var utmEl = document.getElementById('cmoUtmPreview');
      if (utmEl) {
        var utmLinks = (out.utmPack && out.utmPack.links) || [];
        utmEl.textContent = utmLinks.length
          ? utmLinks
              .slice(0, 8)
              .map(function (link, index) {
                return index + 1 + '. ' + (link.channel || '—') + ' → ' + (link.url || '—');
              })
              .join('\n')
          : 'Inget UTM-pack genererat.';
      }

      var trackingEl = document.getElementById('cmoTrackingPreview');
      if (trackingEl) {
        var tracking = out.trackingReview || {};
        var trackingIssues = tracking.issues || [];
        trackingEl.textContent = [
          'Status: ' + (tracking.status || '—'),
          tracking.summary || '',
          trackingIssues.length
            ? trackingIssues
                .slice(0, 6)
                .map(function (issue, index) {
                  return index + 1 + '. [' + (issue.severity || 'info') + '] ' + (issue.label || issue.id);
                })
                .join('\n')
            : 'Inga tracking-problem.',
        ]
          .filter(Boolean)
          .join('\n\n');
      }

      var gatesEl = document.getElementById('cmoOrchestrationGates');
      if (gatesEl) {
        var gates = out.orchestrationGates || null;
        if (!gates) {
          gatesEl.textContent = 'Inga orkestrerings-gates i denna körning (kör orchestrator marketing_campaign för cross-agent-gates).';
        } else {
          var lines = [];
          if (gates.launchGate) {
            lines.push(
              'Launch gate: ' +
                (gates.launchGate.blocked ? 'BLOCKERAD' : 'OK') +
                ' — ' +
                (gates.launchGate.reason || '')
            );
          }
          if (gates.incidentPause) {
            lines.push(
              'Incident-paus: ' +
                (gates.incidentPause.required ? 'KRÄVS' : 'OK') +
                ' — ' +
                (gates.incidentPause.reason || '')
            );
          }
          if (gates.budgetGate) {
            lines.push(
              'Budget gate: ' +
                (gates.budgetGate.requiresOwnerApproval ? 'OWNER KRÄVS' : 'OK') +
                ' — ' +
                (gates.budgetGate.reason || '')
            );
          }
          if (gates.ccoHandoff) {
            lines.push('MQL: ' + (gates.ccoHandoff.mqlDefinition || '—'));
            lines.push('SQL: ' + (gates.ccoHandoff.sqlDefinition || '—'));
          }
          gatesEl.textContent = lines.length ? lines.join('\n\n') : 'Gates utvärderade — inga varningar.';
        }
      }

      var publishPolicyEl = document.getElementById('cmoPublishPolicy');
      if (publishPolicyEl) {
        var pilotOn = out.publishPilotEnabled === true;
        var evals = out.channelPublishEvaluations || [];
        var eligible = Number(out.pilotAutoPublishEligibleCount || 0);
        var policyLines = [
          'Global autoPublish: false (ADR 0002)',
          'Pilot enabled: ' + (pilotOn ? 'ja' : 'nej'),
          pilotOn ? 'Pilot channels: ' + ((out.pilotChannels || []).join(', ') || '—') : '',
          'Pilot-eligible items: ' + eligible,
        ];
        if (evals.length) {
          policyLines.push(
            'Kanaler:\n' +
              evals
                .slice(0, 8)
                .map(function (item, index) {
                  return (
                    index +
                    1 +
                    '. ' +
                    (item.channel || '—') +
                    ' L' +
                    (item.riskLevel || '?') +
                    ' → ' +
                    (item.publishMode || 'proposal_only') +
                    (item.pilotAutoPublishEligible ? ' ✓ pilot' : '')
                  );
                })
                .join('\n')
          );
        }
        publishPolicyEl.textContent = policyLines.filter(Boolean).join('\n\n');
      }

      if (typeof global.activateCmoTab === 'function') {
        global.activateCmoTab('content');
      }
    }

    function renderStrategyIntel(out) {
      renderOutput(out);
      var intelEl = document.getElementById('cmoStrategyIntelPreview');
      if (!intelEl) return;
      var competitors = (out.competitorLandscape && out.competitorLandscape.competitors) || [];
      var nurture = (out.nurtureSequence && out.nurtureSequence.touches) || [];
      var winback = (out.winbackCampaign && out.winbackCampaign.touches) || [];
      var lines = [
        out.executiveSummary || '',
        competitors.length
          ? 'Konkurrenter:\n' +
            competitors
              .map(function (c, i) {
                return i + 1 + '. ' + (c.name || c.id) + ' — ' + (c.positioning || '');
              })
              .join('\n')
          : '',
        nurture.length ? 'Nurture touches: ' + nurture.length : '',
        winback.length ? 'Winback touches: ' + winback.length : '',
      ].filter(Boolean);
      intelEl.textContent = lines.join('\n\n');
      if (typeof global.activateCmoTab === 'function') {
        global.activateCmoTab('strategi');
      }
    }

    global.runCmoStrategyIntel = function runCmoStrategyIntel() {
      var body = readInput();
      body.mode = 'strategy_intel';
      if (cmoStrategyBtn) cmoStrategyBtn.disabled = true;
      cmoBtn.disabled = true;
      if (cmoStatus) cmoStatus.textContent = 'Kör strategi-insights (v2)...';
      return agentPost('CMO', body)
        .then(function (d) {
          var out = (d && d.output && d.output.data) || (d && d.data) || {};
          renderStrategyIntel(out);
          if (cmoStatus) cmoStatus.textContent = 'Strategi-insights klar';
          return out;
        })
        .catch(function (err) {
          if (cmoStatus) cmoStatus.textContent = 'Fel: ' + (err.message || err);
          throw err;
        })
        .finally(function () {
          if (cmoStrategyBtn) cmoStrategyBtn.disabled = false;
          cmoBtn.disabled = false;
        });
    };

    global.runCmoAgent = function runCmoAgent(overrideBody) {
      var body = overrideBody && typeof overrideBody === 'object' ? overrideBody : readInput();
      cmoBtn.disabled = true;
      if (cmoStatus) cmoStatus.textContent = 'Kör Marketing Copilot...';
      return agentPost('CMO', body)
        .then(function (d) {
          var out = (d && d.output && d.output.data) || (d && d.data) || {};
          renderOutput(out);
          if (cmoStatus) cmoStatus.textContent = 'Klar';
          return out;
        })
        .catch(function (err) {
          if (cmoStatus) cmoStatus.textContent = 'Fel: ' + (err.message || err);
          throw err;
        })
        .finally(function () {
          cmoBtn.disabled = false;
        });
    };

    cmoBtn.addEventListener('click', function () {
      global.runCmoAgent().catch(function () {});
    });

    if (cmoStrategyBtn) {
      cmoStrategyBtn.addEventListener('click', function () {
        global.runCmoStrategyIntel().catch(function () {});
      });
    }
  }

  global.initCmoCopilotPanel = mountCmoCopilotPanel;
})(window);
