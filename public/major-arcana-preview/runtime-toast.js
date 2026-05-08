/**
 * Major Arcana Preview — Toast notifications (D4).
 *
 * Globalt toast-system. Stack i bottom-right (default), max 5 synliga.
 * Auto-dismiss efter 5s (eller längre för errors). Dismissable.
 * Icon + message + optional action-button.
 *
 * Public API på window.MajorArcanaPreviewToast:
 *   - mount()
 *   - show({ type, title, message, duration, action, dismissible })
 *      type: 'success' | 'error' | 'warning' | 'info' (default 'info')
 *      action: { label, onClick }
 *      duration: ms (0 = ingen auto-dismiss)
 *   - success(message, options)
 *   - error(message, options)
 *   - warning(message, options)
 *   - info(message, options)
 *   - dismiss(id)
 *   - dismissAll()
 */
(() => {
  'use strict';

  const MAX_VISIBLE = 5;
  const queue = [];
  let nextId = 1;
  let container = null;

  function ensureContainer() {
    if (container && document.body.contains(container)) return container;
    container = document.createElement('div');
    container.className = 'cco-toast-container';
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', 'Notiser');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
    return container;
  }

  function injectStyles() {
    if (document.getElementById('cco-toast-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-toast-styles';
    style.textContent = `
.cco-toast-container {
  position: fixed;
  bottom: 16px;
  right: 16px;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  z-index: var(--cco-z-toast, 100000);
  pointer-events: none;
  max-width: 420px;
  width: calc(100vw - 32px);
}
@media (max-width: 480px) {
  .cco-toast-container {
    bottom: 8px;
    right: 8px;
    left: 8px;
    width: auto;
    max-width: none;
  }
}

.cco-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border-radius: var(--cco-radius-md, 8px);
  background: var(--cco-bg-surface-raised, #ffffff);
  border: 1px solid var(--cco-border-default, rgba(43,37,31,0.15));
  border-left-width: 4px;
  box-shadow: var(--cco-shadow-lg, 0 10px 24px rgba(43,37,31,0.12));
  font: var(--cco-weight-regular, 400) var(--cco-text-base, 14px) var(--cco-font-sans, sans-serif);
  color: var(--cco-text-primary, #2b251f);
  opacity: 0;
  transform: translateX(20px);
  transition:
    opacity var(--cco-duration-normal, 240ms) var(--cco-ease-out, ease),
    transform var(--cco-duration-normal, 240ms) var(--cco-ease-out, ease);
  will-change: opacity, transform;
}
.cco-toast.is-visible {
  opacity: 1;
  transform: translateX(0);
}
.cco-toast.is-leaving {
  opacity: 0;
  transform: translateX(20px);
}

.cco-toast--success { border-left-color: var(--cco-status-success, #4a8268); }
.cco-toast--error { border-left-color: var(--cco-status-danger, #b94a4a); }
.cco-toast--warning { border-left-color: var(--cco-status-warning, #c8821e); }
.cco-toast--info { border-left-color: var(--cco-status-info, #4a7ba8); }

.cco-toast-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  margin-top: 1px;
  color: #fff;
}
.cco-toast--success .cco-toast-icon { background: var(--cco-status-success, #4a8268); }
.cco-toast--error .cco-toast-icon { background: var(--cco-status-danger, #b94a4a); }
.cco-toast--warning .cco-toast-icon { background: var(--cco-status-warning, #c8821e); }
.cco-toast--info .cco-toast-icon { background: var(--cco-status-info, #4a7ba8); }

.cco-toast-body {
  flex: 1 1 auto;
  min-width: 0;
}
.cco-toast-title {
  font-weight: var(--cco-weight-semibold, 600);
  font-size: var(--cco-text-base, 14px);
  margin: 0 0 2px 0;
  line-height: var(--cco-leading-snug, 1.35);
}
.cco-toast-message {
  font-size: var(--cco-text-sm, 12px);
  line-height: var(--cco-leading-normal, 1.5);
  color: var(--cco-text-secondary, #5d544a);
  margin: 0;
  word-wrap: break-word;
  overflow-wrap: anywhere;
}

.cco-toast-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
}
.cco-toast-action {
  background: transparent;
  border: 1px solid transparent;
  color: var(--cco-color-accent, #4a8268);
  font: var(--cco-weight-semibold, 600) var(--cco-text-sm, 12px) var(--cco-font-sans, sans-serif);
  padding: 4px 8px;
  border-radius: var(--cco-radius-sm, 4px);
  cursor: pointer;
  transition: background var(--cco-duration-fast, 150ms);
}
.cco-toast-action:hover {
  background: var(--cco-bg-surface-sunken, #f5efe6);
}
.cco-toast-action:focus-visible {
  outline: 2px solid var(--cco-focus-ring, #4a8268);
  outline-offset: 1px;
}
.cco-toast-close {
  background: transparent;
  border: none;
  color: var(--cco-text-tertiary, #8a8174);
  font-size: 18px;
  line-height: 1;
  width: 24px;
  height: 24px;
  border-radius: var(--cco-radius-sm, 4px);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.cco-toast-close:hover {
  background: var(--cco-bg-surface-sunken, #f5efe6);
  color: var(--cco-text-primary, #2b251f);
}
.cco-toast-close:focus-visible {
  outline: 2px solid var(--cco-focus-ring, #4a8268);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .cco-toast { transition: none; transform: none; }
  .cco-toast.is-visible, .cco-toast.is-leaving { transform: none; }
}
html[data-cco-reduced-motion="on"] .cco-toast {
  transition: none !important;
  transform: none !important;
}
`.trim();
    document.head.appendChild(style);
  }

  const ICONS = { success: '✓', error: '!', warning: '!', info: 'i' };

  function buildToast({ id, type, title, message, action, dismissible }) {
    const toast = document.createElement('div');
    toast.className = `cco-toast cco-toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.dataset.toastId = String(id);

    const icon = document.createElement('span');
    icon.className = 'cco-toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = ICONS[type] || ICONS.info;
    toast.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'cco-toast-body';
    if (title) {
      const t = document.createElement('p');
      t.className = 'cco-toast-title';
      t.textContent = String(title);
      body.appendChild(t);
    }
    if (message) {
      const m = document.createElement('p');
      m.className = 'cco-toast-message';
      m.textContent = String(message);
      body.appendChild(m);
    }
    toast.appendChild(body);

    if (action || dismissible !== false) {
      const actions = document.createElement('div');
      actions.className = 'cco-toast-actions';
      if (action && typeof action === 'object' && action.label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cco-toast-action';
        btn.textContent = String(action.label);
        btn.addEventListener('click', () => {
          try {
            if (typeof action.onClick === 'function') action.onClick();
          } finally {
            dismiss(id);
          }
        });
        actions.appendChild(btn);
      }
      if (dismissible !== false) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'cco-toast-close';
        close.setAttribute('aria-label', 'Stäng notis');
        close.textContent = '×';
        close.addEventListener('click', () => dismiss(id));
        actions.appendChild(close);
      }
      toast.appendChild(actions);
    }

    return toast;
  }

  function show({ type = 'info', title = '', message = '', duration, action, dismissible = true } = {}) {
    injectStyles();
    const root = ensureContainer();
    const id = nextId++;
    const safeType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
    const safeDuration = Number.isFinite(duration) ? duration : safeType === 'error' ? 8000 : 5000;

    const el = buildToast({
      id,
      type: safeType,
      title,
      message,
      action,
      dismissible,
    });
    root.appendChild(el);

    // Visibility-trigger
    requestAnimationFrame(() => {
      requestAnimationFrame(() => el.classList.add('is-visible'));
    });

    // Trim queue if too many
    queue.push({ id, el });
    while (queue.length > MAX_VISIBLE) {
      const oldest = queue.shift();
      if (oldest) dismiss(oldest.id);
    }

    // Auto-dismiss
    if (safeDuration > 0) {
      setTimeout(() => dismiss(id), safeDuration);
    }
    return id;
  }

  function dismiss(id) {
    const idx = queue.findIndex((q) => q.id === id);
    if (idx === -1) return;
    const { el } = queue[idx];
    queue.splice(idx, 1);
    if (!el || !el.parentNode) return;
    el.classList.remove('is-visible');
    el.classList.add('is-leaving');
    setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 260);
  }

  function dismissAll() {
    [...queue].forEach((q) => dismiss(q.id));
  }

  function success(message, options = {}) {
    return show({ type: 'success', message, ...options });
  }
  function error(message, options = {}) {
    return show({ type: 'error', message, ...options });
  }
  function warning(message, options = {}) {
    return show({ type: 'warning', message, ...options });
  }
  function info(message, options = {}) {
    return show({ type: 'info', message, ...options });
  }

  function mount() {
    injectStyles();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewToast = Object.freeze({
      mount,
      show,
      success,
      error,
      warning,
      info,
      dismiss,
      dismissAll,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
