/**
 * Major Arcana Preview — Empty states (D5).
 *
 * Standardiserade empty-states: ikon, rubrik, beskrivning, optional CTA.
 *
 * Public API på window.MajorArcanaPreviewEmptyStates:
 *   - mount()
 *   - render(target, { variant, title, message, action })
 *      target: HTMLElement där state injectas
 *      variant: 'inbox-zero' | 'no-results' | 'no-data' | 'all-done' | 'error' | 'first-run'
 *      action: { label, onClick }
 *   - clear(target)
 *
 * Usage:
 *   MajorArcanaPreviewEmptyStates.render(myList, {
 *     variant: 'all-done',
 *     title: 'Allt klart!',
 *     message: 'Inga öppna trådar just nu.',
 *     action: { label: 'Visa avslutade', onClick: () => showCompleted() }
 *   });
 */
(() => {
  'use strict';

  const ICONS = {
    'inbox-zero': '✨',
    'no-results': '🔍',
    'no-data': '📭',
    'all-done': '✓',
    error: '⚠',
    'first-run': '👋',
  };

  const COLORS = {
    'inbox-zero': 'var(--cco-status-success, #4a8268)',
    'no-results': 'var(--cco-text-tertiary, #8a8174)',
    'no-data': 'var(--cco-text-tertiary, #8a8174)',
    'all-done': 'var(--cco-status-success, #4a8268)',
    error: 'var(--cco-status-danger, #b94a4a)',
    'first-run': 'var(--cco-color-accent, #4a8268)',
  };

  function injectStyles() {
    if (document.getElementById('cco-empty-states-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-empty-states-styles';
    style.textContent = `
.cco-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--cco-space-12, 48px) var(--cco-space-6, 24px);
  color: var(--cco-text-secondary, #5d544a);
  min-height: 240px;
  font-family: var(--cco-font-sans, sans-serif);
}
.cco-empty-state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--cco-bg-surface-sunken, #f5efe6);
  font-size: 32px;
  line-height: 1;
  margin-bottom: var(--cco-space-4, 16px);
  color: var(--cco-text-primary, #2b251f);
}
.cco-empty-state-title {
  font-size: var(--cco-text-lg, 17px);
  font-weight: var(--cco-weight-semibold, 600);
  color: var(--cco-text-primary, #2b251f);
  margin: 0 0 var(--cco-space-2, 8px) 0;
  line-height: var(--cco-leading-snug, 1.35);
}
.cco-empty-state-message {
  font-size: var(--cco-text-base, 14px);
  color: var(--cco-text-secondary, #5d544a);
  margin: 0 0 var(--cco-space-6, 24px) 0;
  max-width: 420px;
  line-height: var(--cco-leading-normal, 1.5);
}
.cco-empty-state-action {
  display: inline-flex;
  align-items: center;
  gap: var(--cco-space-2, 8px);
  padding: var(--cco-space-2, 8px) var(--cco-space-5, 20px);
  background: var(--cco-color-accent, #4a8268);
  color: var(--cco-text-on-accent, #ffffff);
  border: none;
  border-radius: var(--cco-radius-md, 8px);
  font: var(--cco-weight-semibold, 600) var(--cco-text-base, 14px) var(--cco-font-sans, sans-serif);
  cursor: pointer;
  transition:
    background var(--cco-duration-fast, 150ms) var(--cco-ease-out, ease),
    transform var(--cco-duration-fast, 150ms) var(--cco-ease-out, ease);
}
.cco-empty-state-action:hover {
  background: var(--cco-color-accent-strong, #2e5a47);
  transform: translateY(-1px);
}
.cco-empty-state-action:active {
  transform: translateY(0);
}
.cco-empty-state-action:focus-visible {
  outline: 3px solid var(--cco-focus-ring, #4a8268);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .cco-empty-state-action { transition: none; transform: none; }
  .cco-empty-state-action:hover { transform: none; }
}
html[data-cco-reduced-motion="on"] .cco-empty-state-action {
  transition: none !important;
  transform: none !important;
}
`.trim();
    document.head.appendChild(style);
  }

  function clear(target) {
    if (!target) return;
    const existing = target.querySelector(':scope > .cco-empty-state');
    if (existing) existing.remove();
  }

  function render(target, options = {}) {
    if (!target || !(target instanceof HTMLElement)) return null;
    injectStyles();
    clear(target);

    const variant = options.variant && ICONS[options.variant] ? options.variant : 'no-data';
    const root = document.createElement('div');
    root.className = `cco-empty-state cco-empty-state--${variant}`;
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');

    const icon = document.createElement('div');
    icon.className = 'cco-empty-state-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = options.icon || ICONS[variant];
    if (COLORS[variant]) icon.style.color = COLORS[variant];
    root.appendChild(icon);

    if (options.title) {
      const t = document.createElement('h3');
      t.className = 'cco-empty-state-title';
      t.textContent = String(options.title);
      root.appendChild(t);
    }
    if (options.message) {
      const m = document.createElement('p');
      m.className = 'cco-empty-state-message';
      m.textContent = String(options.message);
      root.appendChild(m);
    }
    if (options.action && typeof options.action === 'object' && options.action.label) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cco-empty-state-action';
      btn.textContent = String(options.action.label);
      btn.addEventListener('click', (e) => {
        try {
          if (typeof options.action.onClick === 'function') options.action.onClick(e);
        } catch (_e) {}
      });
      root.appendChild(btn);
    }

    target.appendChild(root);
    return root;
  }

  function mount() {
    injectStyles();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewEmptyStates = Object.freeze({
      mount,
      render,
      clear,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
