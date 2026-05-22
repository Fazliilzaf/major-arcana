(function initCmoMarketingTabs(global) {
  function activateTab(tabId) {
    var bar = document.getElementById('cmoTabBar');
    if (!bar) return;
    var target = String(tabId || '').trim() || 'strategi';
    bar.querySelectorAll('[data-cmo-tab]').forEach(function (btn) {
      var active = btn.getAttribute('data-cmo-tab') === target;
      btn.classList.toggle('primary', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-cmo-tab-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-cmo-tab-panel') !== target;
    });
  }

  function mountCmoTabs() {
    var bar = document.getElementById('cmoTabBar');
    if (!bar) return;
    bar.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-cmo-tab]');
      if (!btn) return;
      activateTab(btn.getAttribute('data-cmo-tab'));
    });
    activateTab('strategi');
  }

  global.initCmoMarketingTabs = mountCmoTabs;
  global.activateCmoTab = activateTab;
})(window);
