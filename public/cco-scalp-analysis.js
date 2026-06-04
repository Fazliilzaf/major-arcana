(function (global) {
  'use strict';

  const STATUS_CHIP = {
    verified: 'ok',
    imported: 'warn',
    draft: 'draft',
    needs_review: 'warn',
    rejected: 'draft',
  };

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function')
          node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (v != null) node.setAttribute(k, v);
      });
    }
    [].concat(children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  function authHeaders(extra) {
    return {
      'x-cco-role': 'operator',
      ...(extra || {}),
    };
  }

  function renderSessionCard(session, opts, onSelect) {
    const chipClass = STATUS_CHIP[session.status] || 'draft';
    return el('article', { class: 'cco-sa__card', onclick: () => onSelect(session) }, [
      el('h4', { text: `${session.date || '—'} · ${session.sessionType || 'session'}` }),
      el('div', { class: 'cco-sa__meta' }, [
        el('span', {
          class: `cco-sa__chip cco-sa__chip--${chipClass}`,
          text: session.status || 'draft',
        }),
        el('span', { text: `${session.imageCount || 0} bilder` }),
        el('span', { text: `${session.metricCount || 0} mätvärden` }),
      ]),
      session.protocol?.messages?.length
        ? el(
            'ul',
            { class: 'cco-sa__protocol' },
            session.protocol.messages.map((m) => el('li', { text: '⚠ ' + m }))
          )
        : null,
      el('div', { class: 'cco-sa__import-panel' }, [
        el(
          'button',
          {
            class: 'cco-sa__btn',
            type: 'button',
            onclick: (ev) => {
              ev.stopPropagation();
              opts.onImportReport(session);
            },
          },
          ['Importera PDF']
        ),
        el(
          'button',
          {
            class: 'cco-sa__btn',
            type: 'button',
            onclick: (ev) => {
              ev.stopPropagation();
              opts.onImportImages(session);
            },
          },
          ['Importera bilder']
        ),
        session.status !== 'verified'
          ? el(
              'button',
              {
                class: 'cco-sa__btn cco-sa__btn--primary',
                type: 'button',
                onclick: (ev) => {
                  ev.stopPropagation();
                  opts.onVerify(session);
                },
              },
              ['Verifiera']
            )
          : null,
      ]),
    ]);
  }

  function renderMetricsTable(metrics) {
    if (!metrics?.length) return el('p', { class: 'cco-sa__empty', text: 'Inga mätvärden ännu.' });
    const tbody = el(
      'tbody',
      {},
      metrics.map((m) =>
        el('tr', {}, [
          el('td', { text: m.labelSv || m.displaySv || m.metricType }),
          el('td', { text: String(m.value ?? '—') }),
          el('td', { text: m.unit || '' }),
          el('td', { text: m.verified ? 'Ja' : 'Nej' }),
        ])
      )
    );
    return el('div', { class: 'cco-sa__metrics' }, [
      el('table', {}, [
        el(
          'thead',
          {},
          el('tr', {}, [
            el('th', { text: 'Mätvärde' }),
            el('th', { text: 'Värde' }),
            el('th', { text: 'Enhet' }),
            el('th', { text: 'Verifierad' }),
          ])
        ),
        tbody,
      ]),
    ]);
  }

  function renderComparison(comparisons) {
    if (!comparisons?.length) return null;
    return el('section', { class: 'cco-sa__card' }, [
      el('h4', { text: 'Före/efter-jämförelse' }),
      ...comparisons.slice(0, 3).map((c) => {
        const rows = Object.entries(c.metricChanges || {})
          .slice(0, 6)
          .map(([key, val]) =>
            el('li', {
              text: `${val.labelSv || key}: ${val.baseline ?? '—'} → ${val.current ?? '—'} (${val.delta ?? '—'})`,
            })
          );
        return el('div', {}, [
          el('p', {
            class: 'cco-sa__meta',
            text: `Baseline ${c.baselineSessionId?.slice(0, 8)}… vs ${c.comparisonSessionId?.slice(0, 8)}…`,
          }),
          el('ul', { class: 'cco-sa__protocol' }, rows),
          c.clinicianConclusion ? el('p', { text: c.clinicianConclusion }) : null,
        ]);
      }),
    ]);
  }

  function render(root, data, opts) {
    root.innerHTML = '';
    root.className = 'cco-sa';

    const header = el('div', { class: 'cco-sa__header' }, [
      el('div', {}, [
        el('h3', { class: 'cco-sa__title', text: 'Hår-/scalpanalys' }),
        el('p', {
          class: 'cco-sa__disclaimer',
          text: 'Aisia DS-3 — importerat till CCO. Slutlig bedömning görs av klinikens personal.',
        }),
      ]),
      el('div', { class: 'cco-sa__actions' }, [
        el(
          'button',
          {
            class: 'cco-sa__btn cco-sa__btn--primary',
            type: 'button',
            onclick: () => opts.onCreateSession(),
          },
          ['Ny session']
        ),
      ]),
    ]);
    root.appendChild(header);

    if (data.protocol?.messages?.length) {
      root.appendChild(
        el('section', { class: 'cco-sa__card' }, [
          el('h4', { text: 'Capture protocol' }),
          el(
            'ul',
            { class: 'cco-sa__protocol' },
            data.protocol.messages.map((m) => el('li', { text: m }))
          ),
        ])
      );
    }

    const grid = el('div', { class: 'cco-sa__grid' }, []);
    if (!data.sessions?.length) {
      grid.appendChild(
        el('div', {
          class: 'cco-sa__empty',
          text: 'Ingen scalpanalys importerad ännu. Skapa en session och importera Aisia PDF + bilder.',
        })
      );
    } else {
      data.sessions.forEach((session) => {
        grid.appendChild(renderSessionCard(session, opts, opts.onSelectSession));
      });
    }
    root.appendChild(grid);

    if (opts.selectedSession) {
      root.appendChild(
        el('section', { class: 'cco-sa__card' }, [
          el('h4', { text: 'Vald session — mätvärden' }),
          renderMetricsTable(opts.selectedMetrics || []),
          el('div', { class: 'cco-sa__form-row' }, [
            el('label', { text: 'Lägg till mätvärde (manuellt)' }),
            el('input', {
              type: 'text',
              placeholder: 'metricType t.ex. total_hair_count',
              id: 'cco-sa-metric-type',
            }),
            el('input', { type: 'text', placeholder: 'Värde', id: 'cco-sa-metric-value' }),
            el(
              'button',
              {
                class: 'cco-sa__btn',
                type: 'button',
                onclick: () => opts.onAddMetric(opts.selectedSession),
              },
              ['Spara mätvärde']
            ),
          ]),
        ])
      );
    }

    const cmp = renderComparison(data.comparisons);
    if (cmp) root.appendChild(cmp);

    if (opts.patientView) {
      root.appendChild(
        el('section', { class: 'cco-sa__card' }, [
          el('h4', { text: 'Patientvy (förenklad svenska)' }),
          el('p', { class: 'cco-sa__disclaimer', text: opts.patientView.disclaimer || '' }),
          ...(opts.patientView.sessions || []).map((s) =>
            el('div', { class: 'cco-sa__meta' }, [
              el('p', {
                text: `${s.sessionTypeLabel || 'Session'} · ${s.sessionDate || '—'} · ${s.statusLabel || ''}`,
              }),
              el(
                'ul',
                { class: 'cco-sa__protocol' },
                (s.metrics || []).map((m) =>
                  el('li', { text: `${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}` })
                )
              ),
            ])
          ),
        ])
      );
    }

    if (opts.baselineSession && opts.latestFollowUp) {
      root.appendChild(
        el('section', { class: 'cco-sa__card' }, [
          el('h4', { text: 'Uppföljning — jämför mot baseline' }),
          el('p', {
            class: 'cco-sa__meta',
            text: 'Skapar klinisk jämförelse (delta), inte automatisk behandlingsrekommendation.',
          }),
          el(
            'button',
            {
              class: 'cco-sa__btn',
              type: 'button',
              onclick: () => opts.onCreateComparison(opts.baselineSession, opts.latestFollowUp),
            },
            ['Skapa baseline-jämförelse']
          ),
        ])
      );
    }
  }

  async function mount(selector, options) {
    const root = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!root) return null;

    const patientId = options.patientId;
    const tenantId = options.tenantId || 'hairtpclinic';
    const base = options.baseUrl || '';
    const state = { data: null, selectedSession: null, selectedMetrics: [], patientView: null };

    async function reload() {
      const url = `${base}/api/v1/cco/scalp-analysis/patient/${encodeURIComponent(patientId)}?tenantId=${encodeURIComponent(tenantId)}`;
      state.data = await fetchJson(url, { headers: authHeaders(options.headers) });
      try {
        state.patientView = await fetchJson(
          `${base}/api/v1/cco/scalp-analysis/patient/${encodeURIComponent(patientId)}/patient-view`,
          { headers: authHeaders(options.headers) }
        );
      } catch {
        state.patientView = null;
      }
      if (state.selectedSession) {
        const detail = await fetchJson(
          `${base}/api/v1/cco/scalp-analysis/sessions/${encodeURIComponent(state.selectedSession.id)}`,
          { headers: authHeaders(options.headers) }
        );
        state.selectedMetrics = detail.metrics || [];
      }
      paint();
    }

    async function createSession() {
      await fetchJson(`${base}/api/v1/cco/scalp-analysis/sessions`, {
        method: 'POST',
        headers: authHeaders({ 'content-type': 'application/json', ...(options.headers || {}) }),
        body: JSON.stringify({
          patientId,
          sessionType: 'consultation',
          source: 'aisia_ds3',
        }),
      });
      await reload();
    }

    function pickFile(accept, multiple) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        if (multiple) input.multiple = true;
        input.onchange = () => resolve(Array.from(input.files || []));
        input.click();
      });
    }

    async function importReport(session) {
      const files = await pickFile('application/pdf,.pdf', false);
      if (!files.length) return;
      const fd = new FormData();
      fd.append('file', files[0]);
      const res = await fetch(
        `${base}/api/v1/cco/scalp-analysis/sessions/${encodeURIComponent(session.id)}/import-report`,
        { method: 'POST', headers: authHeaders(options.headers), body: fd }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import misslyckades');
      await reload();
    }

    async function importImages(session) {
      const files = await pickFile('image/*', true);
      if (!files.length) return;
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      fd.append('zone', 'problem_area');
      const res = await fetch(
        `${base}/api/v1/cco/scalp-analysis/sessions/${encodeURIComponent(session.id)}/import-images`,
        { method: 'POST', headers: authHeaders(options.headers), body: fd }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bildimport misslyckades');
      await reload();
    }

    async function verifySession(session) {
      const notes = window.prompt('Verifieringskommentar (valfritt):', '') || '';
      await fetchJson(
        `${base}/api/v1/cco/scalp-analysis/sessions/${encodeURIComponent(session.id)}/verify`,
        {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json', ...(options.headers || {}) }),
          body: JSON.stringify({ clinicianNotes: notes }),
        }
      );
      await reload();
    }

    async function createComparison(baseline, followUp) {
      await fetchJson(`${base}/api/v1/cco/scalp-analysis/comparisons`, {
        method: 'POST',
        headers: authHeaders({ 'content-type': 'application/json', ...(options.headers || {}) }),
        body: JSON.stringify({
          patientId,
          baselineSessionId: baseline.id,
          comparisonSessionId: followUp.id,
        }),
      });
      await reload();
    }

    async function addMetric(session) {
      const typeEl = document.getElementById('cco-sa-metric-type');
      const valEl = document.getElementById('cco-sa-metric-value');
      const metricType = typeEl?.value?.trim();
      const value = valEl?.value?.trim();
      if (!metricType || value === '') return;
      await fetchJson(
        `${base}/api/v1/cco/scalp-analysis/sessions/${encodeURIComponent(session.id)}/metrics`,
        {
          method: 'POST',
          headers: authHeaders({ 'content-type': 'application/json', ...(options.headers || {}) }),
          body: JSON.stringify({
            metrics: [{ metricType, value, source: 'manual', unit: 'count' }],
          }),
        }
      );
      if (typeEl) typeEl.value = '';
      if (valEl) valEl.value = '';
      await reload();
    }

    function paint() {
      const sessions = state.data?.sessions || [];
      const latest = sessions[0];
      const baselineSession =
        sessions.find((s) => s.sessionType === 'consultation' && s.status === 'verified') ||
        sessions.find((s) => s.sessionType === 'consultation') ||
        null;
      const latestFollowUp =
        sessions.find((s) => s.sessionType === 'follow_up' && s.id !== baselineSession?.id) ||
        sessions.find((s) => s.sessionType === 'follow_up') ||
        null;
      render(
        root,
        {
          sessions,
          comparisons: state.data?.comparisons || [],
          protocol: latest?.protocol || null,
        },
        {
          onCreateSession: () => createSession().catch((e) => alert(e.message)),
          onImportReport: (s) => importReport(s).catch((e) => alert(e.message)),
          onImportImages: (s) => importImages(s).catch((e) => alert(e.message)),
          onVerify: (s) => verifySession(s).catch((e) => alert(e.message)),
          onSelectSession: async (s) => {
            state.selectedSession = s;
            const detail = await fetchJson(
              `${base}/api/v1/cco/scalp-analysis/sessions/${encodeURIComponent(s.id)}`,
              { headers: authHeaders(options.headers) }
            );
            state.selectedMetrics = detail.metrics || [];
            paint();
          },
          onAddMetric: (s) => addMetric(s).catch((e) => alert(e.message)),
          onCreateComparison: (b, f) => createComparison(b, f).catch((e) => alert(e.message)),
          selectedSession: state.selectedSession,
          selectedMetrics: state.selectedMetrics,
          patientView: state.patientView,
          baselineSession,
          latestFollowUp,
        }
      );
    }

    root.innerHTML = el('p', {
      class: 'cco-sa__empty',
      text: 'Laddar hår-/scalpanalys…',
    }).outerHTML;
    await reload();
    return {
      reload,
      unmount: () => {
        root.innerHTML = '';
      },
    };
  }

  global.CcoScalpAnalysis = { mount };
})(typeof window !== 'undefined' ? window : global);
