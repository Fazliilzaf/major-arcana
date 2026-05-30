/* ---------------------------------------------------------------------------
 * cco-journal-feed.js — Unified Journal-UI för CCO patientkort
 *
 * Owner-mandat (cco-no-drive-links-import-only.mdc):
 *   - INGA Drive-länkar i UI
 *   - Allt läses från CCO endpoint /api/v1/cco-customers/:id/journal-feed
 *   - Asset-statusar visas: VISIBLE_ON_PATIENT_CARD, VERIFIED_IN_CCO,
 *     NEEDS_REVIEW, LINK_ONLY_BLOCKER
 *   - Mobile-first design
 *
 * Användning:
 *   <link rel="stylesheet" href="/cco-journal-feed.css">
 *   <div id="my-mount"></div>
 *   <script src="/cco-journal-feed.js"></script>
 *   <script>
 *     CcoJournalFeed.mount('#my-mount', {
 *       customerId: 'cliento_xxx',
 *       tenantId: 'hairtpclinic',
 *       baseUrl: '',           // tom = same-origin
 *       headers: { 'x-cco-role': 'doctor' }, // för demo-RBAC
 *     });
 *   </script>
 * ------------------------------------------------------------------------- */

(function (global) {
  'use strict';

  const TABS = [
    { id: 'all',                  label: 'Alla',          icon: '🗂' },
    { id: 'journals',             label: 'Journaler',     icon: '📄' },
    { id: 'photos',               label: 'Bilder',        icon: '📸' },
    { id: 'forms',                label: 'Formulär',      icon: '📋' },
    { id: 'consentsAndAgreements',label: 'Samtycken & Avtal', icon: '✍' },
  ];

  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v != null) node.setAttribute(k, v);
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function formatDate(ts) {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return ts;
      return d.toLocaleDateString('sv-SE') + ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    } catch { return ts; }
  }
  function formatBytes(b) {
    if (!b) return '';
    const u = ['B','KB','MB','GB']; let i = 0; let n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(1) + ' ' + u[i];
  }

  function renderCounter(label, count, opts = {}) {
    const cls = 'cco-jf__counter' + (opts.attention ? ' cco-jf__counter--attention' : '');
    return el('span', { class: cls }, [
      el('strong', {}, String(count)),
      ' ' + label,
    ]);
  }

  function renderStatus(label, tone) {
    if (!label) return null;
    return el('span', { class: 'cco-jf__status cco-jf__status--' + (tone || 'info') }, label);
  }

  function renderItemRow(item, isSelected, onClick) {
    const meta = [];
    if (item.author) meta.push(item.author);
    if (item.subcategory && item.subcategory !== item.category) meta.push(item.subcategory);
    if (item.encounterId) meta.push('encounter');
    if (item.isCorrection) meta.push('rättelse');

    const row = el('div', {
      class: 'cco-jf__item',
      role: 'button',
      tabindex: '0',
      'aria-selected': isSelected ? 'true' : 'false',
      onclick: () => onClick(item),
      onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClick(item); } },
    }, [
      el('div', { class: 'cco-jf__item-icon' }, item.icon || '📄'),
      el('div', { class: 'cco-jf__item-main' }, [
        el('p', { class: 'cco-jf__item-title' }, item.title || '(utan titel)'),
        el('div', { class: 'cco-jf__item-meta' }, [
          ...meta.map((m) => el('span', {}, m)),
          item.assetStatus && item.source === 'patient_asset'
            ? renderStatus(item.assetStatusLabel, item.assetStatusTone)
            : null,
          item.isSigned ? el('span', { class: 'cco-jf__status cco-jf__status--ok' }, 'signerad') : null,
        ]),
      ]),
      el('div', { class: 'cco-jf__item-date' }, formatDate(item.ts).split(' ')[0]),
    ]);
    return row;
  }

  function renderDetailPane(item) {
    if (!item) {
      return el('div', { class: 'cco-jf__detail-empty' },
        'Välj en post till vänster för att se detaljer.');
    }

    const grid = el('dl', { class: 'cco-jf__detail-grid' });
    function row(label, value) {
      if (value == null || value === '') return;
      grid.appendChild(el('dt', {}, label));
      grid.appendChild(el('dd', {}, typeof value === 'string' ? value : value));
    }
    row('Källa', item.source === 'cco_journal' ? 'CCO-journal (skriven i CCO)' : 'CCO asset-store (importerad)');
    row('Kategori', item.category);
    if (item.subcategory) row('Undertyp', item.subcategory);
    row('Tidpunkt', formatDate(item.ts));
    if (item.author) row('Författare', item.author);
    if (item.encounterId) row('Encounter', el('code', {}, item.encounterId));
    if (item.mimeType) row('MIME', item.mimeType);
    if (item.fileSize) row('Storlek', formatBytes(item.fileSize));
    if (item.assetStatusLabel) {
      const status = renderStatus(item.assetStatusLabel, item.assetStatusTone);
      row('Status', status);
    }
    if (item.isCorrection) row('Rättelse av', el('code', {}, item.correctionOfEntryId || '—'));
    if (item.entityId) row('ID', el('code', {}, item.entityId));

    // Actions — INGA Drive-länkar, bara CCO-source
    const actions = el('div', { class: 'cco-jf__detail-actions' });
    if (item.source === 'cco_journal' && item.link) {
      actions.appendChild(el('a', {
        class: 'cco-jf__btn cco-jf__btn--primary', href: item.link, target: '_blank', rel: 'noopener',
      }, '📝 Öppna journal'));
    }
    if (item.source === 'patient_asset') {
      if (item.link) {
        // Renderable asset → download från CCO storage
        actions.appendChild(el('a', {
          class: 'cco-jf__btn cco-jf__btn--primary', href: item.link, target: '_blank', rel: 'noopener',
        }, '⬇ Öppna från CCO'));
      } else {
        // Inte renderbar (LINK_ONLY_BLOCKER / NEEDS_REVIEW utan binär)
        actions.appendChild(el('button', {
          class: 'cco-jf__btn cco-jf__btn--disabled', disabled: 'true',
          title: 'Binär saknas — kan inte öppnas från CCO',
        }, '⚠ Binär saknas'));
      }
    }
    if (item.thumbnailLink) {
      actions.appendChild(el('a', {
        class: 'cco-jf__btn', href: item.thumbnailLink, target: '_blank', rel: 'noopener',
      }, '🖼 Thumbnail'));
    }

    return el('div', {}, [
      el('h4', { class: 'cco-jf__detail-title' }, [
        el('span', {}, item.icon || '📄'),
        el('span', {}, item.title || '(utan titel)'),
      ]),
      el('p', { class: 'cco-jf__detail-subtitle' }, formatDate(item.ts)),
      grid,
      actions,
    ]);
  }

  function renderAttentionBanner(needsAttention, counters) {
    if (!needsAttention || needsAttention.length === 0) return null;
    const byStatus = counters.needsAttentionByStatus || {};
    const parts = [];
    if (byStatus.NEEDS_REVIEW) parts.push(byStatus.NEEDS_REVIEW + ' behöver granskning');
    if (byStatus.LINK_ONLY_BLOCKER) parts.push(byStatus.LINK_ONLY_BLOCKER + ' utan binär (LINK_ONLY)');
    if (byStatus.IMPORTED_TO_CCO) parts.push(byStatus.IMPORTED_TO_CCO + ' importerade men ej verifierade');

    return el('div', { class: 'cco-jf__attention', role: 'status' }, [
      el('div', { class: 'cco-jf__attention-icon' }, '⚠'),
      el('div', { class: 'cco-jf__attention-body' }, [
        el('strong', {}, needsAttention.length + ' poster behöver hantering'),
        el('div', {}, parts.join(' · ') || 'Granska i review-kön.'),
      ]),
    ]);
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  function render(root, state, callbacks) {
    root.innerHTML = '';
    root.classList.add('cco-jf');

    const { data, activeTab, selectedItemId, loading, error } = state;

    // Header
    root.appendChild(el('div', { class: 'cco-jf__header' }, [
      el('h3', { class: 'cco-jf__title' }, 'Journaler, bilder & dokument'),
      el('span', { class: 'cco-jf__source-badge', title: 'Allt läses från CCO — inga Drive-länkar.' }, 'CCO-source'),
    ]));

    if (loading) {
      root.appendChild(el('div', { class: 'cco-jf__loading' }, 'Laddar journal-feed…'));
      return;
    }
    if (error) {
      root.appendChild(el('div', { class: 'cco-jf__empty' }, [
        el('div', { class: 'cco-jf__empty-icon' }, '⚠'),
        el('p', {}, 'Kunde inte ladda journal-feed: ' + error),
      ]));
      return;
    }
    if (!data) {
      root.appendChild(el('div', { class: 'cco-jf__empty' }, 'Ingen data.'));
      return;
    }

    const { counters, sections, needsAttention } = data;

    // Counters
    const counterRow = el('div', { class: 'cco-jf__counters' });
    counterRow.appendChild(renderCounter('totalt', counters.total));
    counterRow.appendChild(renderCounter('signerade', counters.signed));
    counterRow.appendChild(renderCounter('rättelser', counters.corrections));
    counterRow.appendChild(renderCounter('PDF', counters.hasPdf));
    if (counters.needsAttention > 0) {
      counterRow.appendChild(renderCounter('behöver granskning', counters.needsAttention, { attention: true }));
    }
    root.appendChild(counterRow);

    // Attention banner
    const banner = renderAttentionBanner(needsAttention, counters);
    if (banner) root.appendChild(banner);

    // Tabs
    const tabsRow = el('div', { class: 'cco-jf__tabs', role: 'tablist' });
    for (const t of TABS) {
      const count = t.id === 'all' ? counters.total : ((data.sectionCounts && data.sectionCounts[t.id]) || 0);
      const isActive = activeTab === t.id;
      tabsRow.appendChild(el('button', {
        class: 'cco-jf__tab',
        role: 'tab',
        'aria-selected': isActive ? 'true' : 'false',
        onclick: () => callbacks.onTabChange(t.id),
      }, [
        el('span', {}, t.icon + ' ' + t.label),
        el('span', { class: 'cco-jf__tab-count' }, String(count)),
      ]));
    }
    root.appendChild(tabsRow);

    // Body: list + detail
    const body = el('div', { class: 'cco-jf__body' });
    const listEl = el('div', { class: 'cco-jf__list', role: 'list' });

    const itemsToRender = activeTab === 'all'
      ? (data.items || [])
      : ((sections && sections[activeTab]) || []);

    if (itemsToRender.length === 0) {
      listEl.appendChild(el('div', { class: 'cco-jf__empty' }, [
        el('div', { class: 'cco-jf__empty-icon' }, '📭'),
        el('p', {}, 'Inga poster i denna kategori ännu.'),
        el('p', { style: 'font-size: 0.78rem; margin-top: 6px;' },
          'När import når sandbox visas alla journaler/bilder/dokument här.'),
      ]));
    } else {
      for (const item of itemsToRender) {
        listEl.appendChild(renderItemRow(item, item.entityId === selectedItemId, callbacks.onItemClick));
      }
    }
    body.appendChild(listEl);

    const selectedItem = itemsToRender.find((i) => i.entityId === selectedItemId) || null;
    const detailEl = el('div', { class: 'cco-jf__detail' }, renderDetailPane(selectedItem));
    body.appendChild(detailEl);

    root.appendChild(body);

    // Footer (source-guarantee)
    root.appendChild(el('div', { class: 'cco-jf__footer' },
      'Allt material läses från CCO — inga Drive-länkar. Senast hämtad: ' + formatDate(data.evaluatedAt)));
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------
  async function fetchFeed({ baseUrl, customerId, tenantId, headers }) {
    const url = (baseUrl || '') + '/api/v1/cco-customers/' + encodeURIComponent(customerId) +
      '/journal-feed?tenantId=' + encodeURIComponent(tenantId || 'hairtpclinic');
    const res = await fetch(url, { headers: headers || {} });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + (txt || res.statusText));
    }
    return res.json();
  }

  function mount(selectorOrEl, opts = {}) {
    const root = typeof selectorOrEl === 'string' ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (!root) throw new Error('CcoJournalFeed.mount: target not found: ' + selectorOrEl);

    const state = { data: null, activeTab: 'all', selectedItemId: null, loading: true, error: null };

    const callbacks = {
      onTabChange(tabId) {
        state.activeTab = tabId;
        state.selectedItemId = null;
        render(root, state, callbacks);
      },
      onItemClick(item) {
        state.selectedItemId = item.entityId;
        render(root, state, callbacks);
      },
    };

    render(root, state, callbacks);
    fetchFeed(opts).then((data) => {
      state.data = data;
      state.loading = false;
      // Auto-select first item om finns
      if (data.items && data.items.length > 0) state.selectedItemId = data.items[0].entityId;
      render(root, state, callbacks);
    }).catch((err) => {
      state.loading = false;
      state.error = err.message;
      render(root, state, callbacks);
    });

    return {
      reload() {
        state.loading = true;
        state.error = null;
        render(root, state, callbacks);
        return fetchFeed(opts).then((data) => {
          state.data = data;
          state.loading = false;
          render(root, state, callbacks);
        }).catch((err) => {
          state.loading = false;
          state.error = err.message;
          render(root, state, callbacks);
        });
      },
    };
  }

  global.CcoJournalFeed = { mount, _internal: { fetchFeed, render, TABS } };
})(window);
