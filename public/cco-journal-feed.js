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
    { id: 'timeline',   label: 'Tidslinje',  icon: '🕐' },
    { id: 'all',        label: 'Alla',       icon: '🗂' },
    { id: 'journals',   label: 'Journaler',  icon: '📄' },
    { id: 'photos',     label: 'Bilder',     icon: '📸' },
    { id: 'documents',  label: 'Dokument',   icon: '📎' },
    { id: 'consents',   label: 'Samtycken',  icon: '✍' },
    { id: 'agreements', label: 'Avtal',      icon: '📑' },
    { id: 'forms',      label: 'Formulär',   icon: '📋' },
    { id: 'aisia',      label: 'Aisia',      icon: '🔬' },
  ];

  // Hålls per-mount så onclick kan nå opts (baseUrl, headers, customerId, tenantId)
  let _activeOpts = null;
  let _activeReload = null;

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
    if (item.assetStatusHint) {
      row('Info', item.assetStatusHint);
    }
    if (item.isCorrection) row('Rättelse av', el('code', {}, item.correctionOfEntryId || '—'));
    if (item.entityId) row('ID', el('code', {}, item.entityId));

    // Visa rättelse-info om det är en rättelse
    if (item.isCorrection) {
      if (item.correctionReason) row('Anledning', item.correctionReason);
      if (item.correctionCreatedBy) row('Rättad av', item.correctionCreatedBy);
      if (item.correctionCreatedAt) row('Rättad', formatDate(item.correctionCreatedAt));
    }

    // Actions — INGA Drive-länkar, bara CCO-source
    const actions = el('div', { class: 'cco-jf__detail-actions' });
    if (item.source === 'cco_journal' && item.link) {
      actions.appendChild(el('a', {
        class: 'cco-jf__btn cco-jf__btn--primary', href: item.link, target: '_blank', rel: 'noopener',
      }, '📝 Öppna journal'));

      // "Ny rättelse" — endast på signerade CCO-journaler som inte själva är rättelser
      if (item.isSigned && !item.isCorrection) {
        actions.appendChild(el('button', {
          class: 'cco-jf__btn cco-jf__btn--correction',
          title: 'Skapa en rättelse — original förblir låst',
          onclick: () => openCorrectionModal(item),
        }, '✏ Ny rättelse'));
      }
    }
    if (item.source === 'patient_asset') {
      if (item.link) {
        // Renderable asset → download från CCO storage
        actions.appendChild(el('a', {
          class: 'cco-jf__btn cco-jf__btn--primary', href: item.link, target: '_blank', rel: 'noopener',
        }, '⬇ Öppna från CCO'));
      } else {
        // Per-status action-knapp för icke-renderbara items
        let btnLabel = '⚠ Ej tillgänglig';
        let btnTitle = 'Filen kan inte öppnas från CCO';
        switch (item.assetStatus) {
          case 'LINK_ONLY_BLOCKER':
            btnLabel = '⛔ Inte importerad än';
            btnTitle = 'Filen är inte importerad ännu — endast referens. Drive-länk visas inte.';
            break;
          case 'NEEDS_REVIEW':
            btnLabel = '🔍 Kräver granskning';
            btnTitle = 'Filen behöver granskas innan den kan öppnas.';
            break;
          case 'IMPORTED_TO_CCO':
            btnLabel = '⏳ Väntar på verifiering';
            btnTitle = 'Filen är importerad men ännu inte verifierad.';
            break;
          case 'FAILED_IMPORT':
            btnLabel = '⚠ Import misslyckades';
            btnTitle = 'Tekniskt fel vid import.';
            break;
          case 'DUPLICATE':
            btnLabel = '📋 Dubblett';
            btnTitle = 'Samma checksum som annan asset.';
            break;
        }
        actions.appendChild(el('button', {
          class: 'cco-jf__btn cco-jf__btn--disabled', disabled: 'true', title: btnTitle,
        }, btnLabel));
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

    // Tidslinje-tab har egen renderingspath och egen fetch
    if (activeTab === 'timeline') {
      // Tabs-rad behöver alltid finnas
      const tabsRow = el('div', { class: 'cco-jf__tabs', role: 'tablist' });
      for (const t of TABS) {
        const count = t.id === 'all' ? (data?.counters?.total || 0)
          : t.id === 'timeline' ? (state.timelineData?.counters?.totalEvents || 0)
          : ((data?.sectionCounts && data.sectionCounts[t.id]) || 0);
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
      renderTimelineView(root, state);
      root.appendChild(el('div', { class: 'cco-jf__footer' },
        'Allt material läses från CCO — inga Drive-länkar.'));
      return;
    }

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
  // Timeline-rendering (kronologisk feed med thread-grupp)
  // -------------------------------------------------------------------------
  function renderTimelineEvent(ev) {
    const meta = [];
    if (ev.actor) meta.push(ev.actor);
    if (ev.detail?.journalType) meta.push(ev.detail.journalType);
    if (ev.detail?.from && ev.detail?.to) meta.push(ev.detail.from + ' → ' + ev.detail.to);
    if (ev.detail?.reason) meta.push('"' + ev.detail.reason + '"');

    return el('div', { class: 'cco-jf__tl-event cco-jf__tl-event--' + (ev.tone || 'info') }, [
      el('div', { class: 'cco-jf__tl-icon' }, ev.icon || '•'),
      el('div', { class: 'cco-jf__tl-body' }, [
        el('div', { class: 'cco-jf__tl-title' }, ev.title),
        el('div', { class: 'cco-jf__tl-meta' }, [
          el('span', { class: 'cco-jf__tl-time' }, formatDate(ev.ts)),
          ...meta.map((m) => el('span', {}, m)),
        ]),
      ]),
    ]);
  }

  function renderThreadBanner(threads) {
    const threadKeys = Object.keys(threads || {});
    if (threadKeys.length === 0) return null;
    const card = el('div', { class: 'cco-jf__thread' });
    card.appendChild(el('div', { class: 'cco-jf__thread-header' }, [
      el('strong', {}, '🧵 Rättelse-trådar (' + threadKeys.length + ')'),
      el('span', { class: 'cco-jf__thread-hint' }, 'Original kopplat till sina rättelser'),
    ]));
    for (const root of threadKeys) {
      const t = threads[root];
      const row = el('div', { class: 'cco-jf__thread-row' });
      row.appendChild(el('div', { class: 'cco-jf__thread-root' }, [
        el('span', { class: 'cco-jf__tl-icon' }, '🔒'),
        el('div', {}, [
          el('strong', {}, t.rootTitle || 'Original'),
          el('div', { class: 'cco-jf__tl-meta' }, formatDate(t.rootSignedAt)),
        ]),
      ]));
      const list = el('div', { class: 'cco-jf__thread-corrections' });
      for (const c of (t.corrections || [])) {
        list.appendChild(el('div', { class: 'cco-jf__thread-correction' }, [
          el('span', { class: 'cco-jf__tl-icon' }, '✏'),
          el('div', {}, [
            el('strong', {}, 'Rättelse · ' + (c.locked ? 'signerad' : 'utkast')),
            el('div', { class: 'cco-jf__tl-meta' }, [
              el('span', {}, formatDate(c.correctionCreatedAt)),
              c.correctionCreatedBy ? el('span', {}, 'av ' + c.correctionCreatedBy) : null,
            ]),
            c.correctionReason ? el('div', { class: 'cco-jf__thread-reason' }, '"' + c.correctionReason + '"') : null,
          ]),
        ]));
      }
      row.appendChild(list);
      card.appendChild(row);
    }
    return card;
  }

  function renderTimelineView(root, state) {
    const body = el('div', { class: 'cco-jf__tl-body-root' });
    if (!state.timelineData) {
      body.appendChild(el('div', { class: 'cco-jf__loading' }, 'Laddar tidslinje…'));
      root.appendChild(body);
      return;
    }
    if (state.timelineError) {
      body.appendChild(el('div', { class: 'cco-jf__empty' }, [
        el('div', { class: 'cco-jf__empty-icon' }, '⚠'),
        el('p', {}, 'Tidslinje kunde inte laddas: ' + state.timelineError),
      ]));
      root.appendChild(body);
      return;
    }

    const data = state.timelineData;
    const c = data.counters || {};

    // Counter-rad
    const counterRow = el('div', { class: 'cco-jf__counters' });
    counterRow.appendChild(renderCounter('events', c.totalEvents || 0));
    counterRow.appendChild(renderCounter('journaler', c.journalEntries || 0));
    counterRow.appendChild(renderCounter('signerade', c.signedEntries || 0));
    counterRow.appendChild(renderCounter('rättelser', c.corrections || 0));
    counterRow.appendChild(renderCounter('assets', c.assets || 0));
    if (c.threads) counterRow.appendChild(renderCounter('trådar', c.threads));
    body.appendChild(counterRow);

    // Thread-banner
    const tb = renderThreadBanner(data.threads || {});
    if (tb) body.appendChild(tb);

    // Tidslinje-events
    const tlList = el('div', { class: 'cco-jf__tl-list' });
    if (!data.events || data.events.length === 0) {
      tlList.appendChild(el('div', { class: 'cco-jf__empty' }, [
        el('div', { class: 'cco-jf__empty-icon' }, '🕐' ),
        el('p', {}, 'Inga händelser ännu på journalflödet.'),
        el('p', { style: 'font-size: 0.78rem; margin-top: 6px;' },
          'Tidslinjen växer när journaler skapas/signeras och assets importeras.'),
      ]));
    } else {
      for (const ev of data.events) {
        tlList.appendChild(renderTimelineEvent(ev));
      }
    }
    body.appendChild(tlList);

    root.appendChild(body);
  }

  async function fetchTimeline({ baseUrl, customerId, tenantId, headers }) {
    const url = (baseUrl || '') + '/api/v1/cco-customers/' + encodeURIComponent(customerId) +
      '/journal-timeline?tenantId=' + encodeURIComponent(tenantId || 'hairtpclinic');
    const res = await fetch(url, { headers: headers || {} });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + ' ' + (txt || res.statusText));
    }
    return res.json();
  }

  // -------------------------------------------------------------------------
  // Korrektur-modal — "Ny rättelse" på signerad CCO-journal
  // -------------------------------------------------------------------------
  function openCorrectionModal(originalItem) {
    // Cleanup any existing modal
    document.querySelectorAll('.cco-jf__modal-backdrop').forEach((n) => n.remove());

    const backdrop = el('div', { class: 'cco-jf__modal-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ny rättelse' });
    const modal = el('div', { class: 'cco-jf__modal' });

    const closeModal = () => backdrop.remove();
    backdrop.addEventListener('click', (ev) => { if (ev.target === backdrop) closeModal(); });
    document.addEventListener('keydown', function escHandler(ev) {
      if (ev.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); }
    });

    const reasonInput = el('textarea', {
      class: 'cco-jf__modal-input',
      placeholder: 'Anledning till rättelse (min 10 tecken) — PDL-krav på spårbarhet',
      rows: '3',
      required: 'true',
      maxlength: '500',
    });

    const errorBox = el('div', { class: 'cco-jf__modal-error', style: 'display:none;' });
    const submitBtn = el('button', { class: 'cco-jf__btn cco-jf__btn--correction', type: 'button' }, '✏ Skapa rättelse');
    submitBtn.addEventListener('click', async () => {
      const reason = reasonInput.value.trim();
      if (reason.length < 10) {
        errorBox.style.display = 'block';
        errorBox.textContent = 'Anledning måste vara minst 10 tecken (PDL-krav på spårbarhet).';
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Skapar...';
      errorBox.style.display = 'none';

      try {
        const opts = _activeOpts || {};
        const url = (opts.baseUrl || '') + '/api/v1/cco-journal-quick/entry/correction';
        const res = await fetch(url, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
          body: JSON.stringify({
            tenantId: originalItem.tenantId || opts.tenantId,
            patientId: originalItem.patientId || opts.customerId,
            entryId: originalItem.entityId,
            reason,
            fields: {}, // tom = kopierar original fields, doctor kan fylla i nytt via journal-UI senare
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error('HTTP ' + res.status + ' ' + (txt || res.statusText));
        }
        const data = await res.json();
        closeModal();
        // Reload feed för att visa nya rättelsen
        if (_activeReload) await _activeReload();
        // Notify success
        const successBanner = el('div', {
          class: 'cco-jf__toast cco-jf__toast--ok',
          role: 'status',
        }, '✓ Rättelse skapad (entryId: ' + (data.correction?.entryId || '?').slice(0, 8) + '...). Originalet förblir låst. Öppna rättelsen för att fylla i ändringar och signera.');
        document.body.appendChild(successBanner);
        setTimeout(() => successBanner.remove(), 6000);
      } catch (err) {
        errorBox.style.display = 'block';
        errorBox.textContent = 'Kunde inte skapa rättelse: ' + err.message;
        submitBtn.disabled = false;
        submitBtn.textContent = '✏ Skapa rättelse';
      }
    });

    modal.appendChild(el('div', { class: 'cco-jf__modal-header' }, [
      el('h3', {}, 'Ny rättelse'),
      el('button', { class: 'cco-jf__modal-close', 'aria-label': 'Stäng', onclick: closeModal }, '×'),
    ]));
    modal.appendChild(el('div', { class: 'cco-jf__modal-body' }, [
      el('p', { class: 'cco-jf__modal-lead' },
        'Du skapar en rättelse till en signerad journal. Originalposten förblir låst — rättelsen sparas som en ny journalpost kopplad till originalet.'),
      el('div', { class: 'cco-jf__modal-original' }, [
        el('strong', {}, originalItem.icon + ' ' + (originalItem.title || 'Original')),
        el('div', { class: 'cco-jf__item-meta' }, [
          el('span', {}, 'Signerad ' + formatDate(originalItem.ts)),
          originalItem.author ? el('span', {}, 'av ' + originalItem.author) : null,
        ]),
      ]),
      el('label', { class: 'cco-jf__modal-label' }, 'Anledning till rättelse'),
      reasonInput,
      errorBox,
    ]));
    modal.appendChild(el('div', { class: 'cco-jf__modal-footer' }, [
      el('button', { class: 'cco-jf__btn', onclick: closeModal, type: 'button' }, 'Avbryt'),
      submitBtn,
    ]));

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    setTimeout(() => reasonInput.focus(), 50);
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

    _activeOpts = opts;  // gör opts tillgänglig för modal-knappar

    const state = { data: null, activeTab: 'all', selectedItemId: null, loading: true, error: null };

    const callbacks = {
      onTabChange(tabId) {
        state.activeTab = tabId;
        state.selectedItemId = null;
        render(root, state, callbacks);
        // Lazy-fetch timeline första gången tab klickas
        if (tabId === 'timeline' && !state.timelineData && !state.timelineLoading) {
          state.timelineLoading = true;
          fetchTimeline(opts).then((td) => {
            state.timelineData = td;
            state.timelineLoading = false;
            render(root, state, callbacks);
          }).catch((err) => {
            state.timelineLoading = false;
            state.timelineError = err.message;
            render(root, state, callbacks);
          });
        }
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

    const api = {
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
    _activeReload = api.reload;
    return api;
  }

  global.CcoJournalFeed = {
    mount,
    openCorrectionModal,  // exposed för testing / extern wire-up
    _internal: { fetchFeed, render, TABS },
  };
})(window);
