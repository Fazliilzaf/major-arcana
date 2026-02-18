(function () {
  if (window.__ARCANA_EMBED__) return;
  window.__ARCANA_EMBED__ = true;

  var script =
    document.currentScript ||
    (function () {
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length - 1] || null;
    })();

  function resolveBrand(hostname) {
    var host = String(hostname || '').toLowerCase();
    if (host.indexOf('curatiio') !== -1) return 'curatiio';
    if (
      host.indexOf('hairtpclinic') !== -1 ||
      host.indexOf('hair-tp') !== -1 ||
      host.indexOf('hairtp') !== -1
    ) {
      return 'hair-tp-clinic';
    }
    return '';
  }

  function themeForBrand(brand) {
    if (brand === 'curatiio') {
      return {
        primary: '#4e6f68',
        primaryHover: '#5a837b',
        primaryText: '#ffffff',
        panelBorder: 'rgba(242, 247, 246, 0.14)',
      };
    }
    // Hair TP Clinic (default)
    return {
      primary: '#cabaae',
      primaryHover: '#d7c9be',
      primaryText: '#303030',
      panelBorder: 'rgba(246, 241, 238, 0.14)',
    };
  }

  function safeUrl(value, base) {
    try {
      return new URL(String(value || ''), base).toString();
    } catch {
      return '';
    }
  }

  function init() {
    if (!script) return;
    if (document.getElementById('arcana-embed-panel')) return;

    var baseOrigin = '';
    try {
      baseOrigin = new URL(script.src).origin;
    } catch {
      baseOrigin = '';
    }

    var explicitBrand = script.getAttribute('data-brand') || '';
    var brand = String(explicitBrand).trim() || resolveBrand(location.hostname) || 'hair-tp-clinic';
    var theme = themeForBrand(brand);

    var position = String(script.getAttribute('data-position') || 'right')
      .trim()
      .toLowerCase();
    if (position !== 'left') position = 'right';

    var buttonText = String(script.getAttribute('data-button-text') || 'Chatta med oss');
    var buttonAria = String(script.getAttribute('data-button-aria') || 'Öppna chatten');

    var chatSrc =
      script.getAttribute('data-src') ||
      (baseOrigin ? baseOrigin + '/' : '/');
    chatSrc = safeUrl(chatSrc, baseOrigin || window.location.href);
    try {
      var chatUrl = new URL(chatSrc);
      chatUrl.searchParams.set('sourceUrl', window.location.href);
      chatSrc = chatUrl.toString();
    } catch {
      // ignore
    }

    var style = document.createElement('style');
    style.id = 'arcana-embed-style';
    style.textContent =
      '' +
      ':root{' +
      '--arcana-embed-primary:' +
      theme.primary +
      ';' +
      '--arcana-embed-primary-hover:' +
      theme.primaryHover +
      ';' +
      '--arcana-embed-primary-text:' +
      theme.primaryText +
      ';' +
      '--arcana-embed-panel-border:' +
      theme.panelBorder +
      ';' +
      '}' +
      '#arcana-embed-launcher{' +
      'position:fixed;bottom:18px;' +
      (position === 'left' ? 'left:18px;' : 'right:18px;') +
      'z-index:2147483000;' +
      'display:flex;align-items:center;gap:10px;' +
      'border-radius:999px;' +
      'padding:12px 14px;' +
      'background:var(--arcana-embed-primary);' +
      'color:var(--arcana-embed-primary-text);' +
      'border:1px solid rgba(0,0,0,0.08);' +
      'box-shadow:0 16px 40px rgba(0,0,0,0.35);' +
      'font:500 14px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;' +
      'cursor:pointer;' +
      '}' +
      '#arcana-embed-launcher:hover{background:var(--arcana-embed-primary-hover);}' +
      '#arcana-embed-launcher:focus{outline:2px solid rgba(255,255,255,0.65);outline-offset:2px;}' +
      '#arcana-embed-launcher img{width:22px;height:22px;display:block;}' +
      '#arcana-embed-backdrop{' +
      'position:fixed;inset:0;z-index:2147482998;' +
      'background:rgba(0,0,0,0.45);' +
      'backdrop-filter:blur(2px);' +
      'opacity:0;pointer-events:none;' +
      'transition:opacity 160ms ease;' +
      '}' +
      '#arcana-embed-panel{' +
      'position:fixed;z-index:2147482999;' +
      (position === 'left' ? 'left:18px;' : 'right:18px;') +
      'bottom:78px;' +
      'width:390px;height:640px;' +
      'border-radius:22px;' +
      'overflow:hidden;' +
      'border:1px solid var(--arcana-embed-panel-border);' +
      'box-shadow:0 28px 90px rgba(0,0,0,0.55);' +
      'transform:translateY(10px);' +
      'opacity:0;pointer-events:none;' +
      'transition:opacity 160ms ease, transform 160ms ease;' +
      'background:#111;' +
      '}' +
      '#arcana-embed-panel[data-open=\"true\"]{opacity:1;pointer-events:auto;transform:translateY(0);}' +
      '#arcana-embed-backdrop[data-open=\"true\"]{opacity:1;pointer-events:auto;}' +
      '#arcana-embed-close{' +
      'position:absolute;top:10px;right:10px;z-index:2;' +
      'width:36px;height:36px;' +
      'border-radius:999px;' +
      'border:1px solid rgba(255,255,255,0.18);' +
      'background:rgba(0,0,0,0.45);' +
      'color:#fff;' +
      'cursor:pointer;' +
      '}' +
      '#arcana-embed-close:hover{background:rgba(0,0,0,0.65);}' +
      '#arcana-embed-iframe{width:100%;height:100%;border:0;display:block;background:#fff;}' +
      '@media (max-width: 640px){' +
      '#arcana-embed-panel{' +
      'left:0 !important;right:0 !important;top:0 !important;bottom:0 !important;' +
      'width:auto !important;height:auto !important;border-radius:0 !important;' +
      '}' +
      '#arcana-embed-launcher{bottom:16px;' +
      (position === 'left' ? 'left:16px;' : 'right:16px;') +
      '}' +
      '}';

    document.head.appendChild(style);

    var backdrop = document.createElement('div');
    backdrop.id = 'arcana-embed-backdrop';
    backdrop.setAttribute('data-open', 'false');

    var panel = document.createElement('div');
    panel.id = 'arcana-embed-panel';
    panel.setAttribute('data-open', 'false');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Arcana chatt');

    var closeBtn = document.createElement('button');
    closeBtn.id = 'arcana-embed-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Stäng chatten');
    closeBtn.textContent = '✕';

    var iframe = document.createElement('iframe');
    iframe.id = 'arcana-embed-iframe';
    iframe.title = 'Arcana chatt';
    iframe.loading = 'lazy';
    iframe.setAttribute('allow', 'clipboard-write');

    panel.appendChild(closeBtn);
    panel.appendChild(iframe);

    var launcher = document.createElement('button');
    launcher.id = 'arcana-embed-launcher';
    launcher.type = 'button';
    launcher.setAttribute('aria-label', buttonAria);
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', panel.id);

    var showIcon = String(script.getAttribute('data-icon') || '').toLowerCase() !== 'false';
    if (showIcon && baseOrigin && brand === 'hair-tp-clinic') {
      var icon = document.createElement('img');
      icon.src = safeUrl('/assets/hairtpclinic-mark.svg', baseOrigin);
      icon.alt = '';
      icon.decoding = 'async';
      icon.loading = 'lazy';
      launcher.appendChild(icon);
    }

    var label = document.createElement('span');
    label.textContent = buttonText;
    launcher.appendChild(label);

    var previousOverflow = null;

    function setOpen(nextOpen) {
      var open = Boolean(nextOpen);
      panel.setAttribute('data-open', open ? 'true' : 'false');
      backdrop.setAttribute('data-open', open ? 'true' : 'false');
      launcher.setAttribute('aria-expanded', open ? 'true' : 'false');

      if (open) {
        if (!iframe.src) iframe.src = chatSrc;
        if (previousOverflow === null) {
          previousOverflow = document.documentElement.style.overflow || '';
        }
        document.documentElement.dataset.arcanaEmbedScrollLock = 'true';
        document.documentElement.style.overflow = 'hidden';
      } else {
        if (previousOverflow !== null) {
          document.documentElement.style.overflow = previousOverflow;
          previousOverflow = null;
        }
        delete document.documentElement.dataset.arcanaEmbedScrollLock;
      }
    }

    launcher.addEventListener('click', function () {
      var open = panel.getAttribute('data-open') === 'true';
      setOpen(!open);
    });

    closeBtn.addEventListener('click', function () {
      setOpen(false);
    });

    backdrop.addEventListener('click', function () {
      setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setOpen(false);
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
    document.body.appendChild(launcher);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
