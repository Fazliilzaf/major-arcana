/**
 * Major Arcana Preview — Animations runtime (D3).
 *
 * Bibliotek av återanvändbara micro-interactions byggda på Web Animations API.
 * Respekterar prefers-reduced-motion + manuell reduced-motion-toggle.
 *
 * Public API på window.MajorArcanaPreviewAnimations:
 *   - mount()
 *   - animate(el, name, options)  → Animation | null
 *   - fadeIn(el, options)
 *   - fadeOut(el, options)
 *   - slideIn(el, direction, options)  ('up'|'down'|'left'|'right')
 *   - slideOut(el, direction, options)
 *   - pulse(el, options)
 *   - shake(el, options)
 *   - bounceSuccess(el, options)
 *   - hoverLift(el)        — adda hover-lift-class
 *   - cancelAll(el)
 *
 * Alla returnerar Animation eller null om reduced-motion är aktivt.
 */
(() => {
  'use strict';

  function isReducedMotion() {
    try {
      const html = document.documentElement;
      const attr = html.getAttribute('data-cco-reduced-motion');
      if (attr === 'on') return true;
      if (attr === 'off') return false;
      // 'system' eller saknas → följ media query
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    } catch (_e) {
      return false;
    }
  }

  function withDefaults(opts = {}) {
    return {
      duration: 240,
      easing: 'cubic-bezier(0, 0, 0.2, 1)',
      fill: 'forwards',
      iterations: 1,
      ...opts,
    };
  }

  function safeAnimate(el, keyframes, opts) {
    if (!el || typeof el.animate !== 'function') return null;
    if (isReducedMotion()) {
      // Tillämpa slut-state direkt utan animation
      try {
        const finalFrame = Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : null;
        if (finalFrame) {
          for (const [prop, value] of Object.entries(finalFrame)) {
            if (prop === 'offset' || prop === 'easing') continue;
            el.style[prop] = value;
          }
        }
      } catch (_e) {}
      return null;
    }
    try {
      return el.animate(keyframes, opts);
    } catch (_e) {
      return null;
    }
  }

  function animate(el, name, options = {}) {
    const animations = {
      fadeIn: () => fadeIn(el, options),
      fadeOut: () => fadeOut(el, options),
      slideInUp: () => slideIn(el, 'up', options),
      slideInDown: () => slideIn(el, 'down', options),
      slideInLeft: () => slideIn(el, 'left', options),
      slideInRight: () => slideIn(el, 'right', options),
      pulse: () => pulse(el, options),
      shake: () => shake(el, options),
      bounceSuccess: () => bounceSuccess(el, options),
    };
    const fn = animations[name];
    return fn ? fn() : null;
  }

  function fadeIn(el, options = {}) {
    const opts = withDefaults({ duration: 240, ...options });
    return safeAnimate(el, [{ opacity: 0 }, { opacity: 1 }], opts);
  }

  function fadeOut(el, options = {}) {
    const opts = withDefaults({ duration: 180, ...options });
    return safeAnimate(el, [{ opacity: 1 }, { opacity: 0 }], opts);
  }

  function slideIn(el, direction = 'up', options = {}) {
    const opts = withDefaults({ duration: 280, ...options });
    const distance = options.distance || 12;
    const transforms = {
      up: [`translateY(${distance}px)`, 'translateY(0)'],
      down: [`translateY(-${distance}px)`, 'translateY(0)'],
      left: [`translateX(${distance}px)`, 'translateX(0)'],
      right: [`translateX(-${distance}px)`, 'translateX(0)'],
    };
    const [from, to] = transforms[direction] || transforms.up;
    return safeAnimate(
      el,
      [
        { opacity: 0, transform: from },
        { opacity: 1, transform: to },
      ],
      opts
    );
  }

  function slideOut(el, direction = 'down', options = {}) {
    const opts = withDefaults({ duration: 200, ...options });
    const distance = options.distance || 12;
    const transforms = {
      up: ['translateY(0)', `translateY(-${distance}px)`],
      down: ['translateY(0)', `translateY(${distance}px)`],
      left: ['translateX(0)', `translateX(-${distance}px)`],
      right: ['translateX(0)', `translateX(${distance}px)`],
    };
    const [from, to] = transforms[direction] || transforms.down;
    return safeAnimate(
      el,
      [
        { opacity: 1, transform: from },
        { opacity: 0, transform: to },
      ],
      opts
    );
  }

  function pulse(el, options = {}) {
    const opts = withDefaults({
      duration: 600,
      iterations: options.iterations || 1,
      ...options,
    });
    return safeAnimate(
      el,
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.05)' },
        { transform: 'scale(1)' },
      ],
      opts
    );
  }

  function shake(el, options = {}) {
    const opts = withDefaults({
      duration: 360,
      easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
      ...options,
    });
    return safeAnimate(
      el,
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(3px)' },
        { transform: 'translateX(-2px)' },
        { transform: 'translateX(2px)' },
        { transform: 'translateX(0)' },
      ],
      opts
    );
  }

  function bounceSuccess(el, options = {}) {
    const opts = withDefaults({
      duration: 500,
      easing: 'cubic-bezier(0.5, 1.6, 0.4, 1)',
      ...options,
    });
    return safeAnimate(
      el,
      [
        { transform: 'scale(1)', filter: 'brightness(1)' },
        { transform: 'scale(1.12)', filter: 'brightness(1.1)' },
        { transform: 'scale(1)', filter: 'brightness(1)' },
      ],
      opts
    );
  }

  function hoverLift(el) {
    if (!el || !el.classList) return () => {};
    el.classList.add('cco-hover-lift');
    return () => el.classList.remove('cco-hover-lift');
  }

  function cancelAll(el) {
    if (!el || typeof el.getAnimations !== 'function') return;
    try {
      el.getAnimations().forEach((anim) => {
        try {
          anim.cancel();
        } catch (_e) {}
      });
    } catch (_e) {}
  }

  function injectAnimationStyles() {
    if (document.getElementById('cco-animations-styles')) return;
    const style = document.createElement('style');
    style.id = 'cco-animations-styles';
    style.textContent = `
.cco-hover-lift {
  transition:
    transform var(--cco-duration-fast, 150ms) var(--cco-ease-out, ease),
    box-shadow var(--cco-duration-fast, 150ms) var(--cco-ease-out, ease);
  will-change: transform;
}
.cco-hover-lift:hover {
  transform: translateY(-2px);
  box-shadow: var(--cco-shadow-lg, 0 10px 24px rgba(0,0,0,0.12));
}
.cco-hover-lift:active {
  transform: translateY(0);
  box-shadow: var(--cco-shadow-sm, 0 1px 3px rgba(0,0,0,0.08));
  transition-duration: 80ms;
}

@keyframes cco-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.cco-spin {
  animation: cco-spin 0.9s linear infinite;
}

@keyframes cco-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.cco-fade-in {
  animation: cco-fade-in var(--cco-duration-normal, 240ms) var(--cco-ease-out, ease) forwards;
}

@keyframes cco-slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.cco-slide-up {
  animation: cco-slide-up var(--cco-duration-normal, 240ms) var(--cco-ease-out, ease) forwards;
}

@media (prefers-reduced-motion: reduce) {
  .cco-spin, .cco-fade-in, .cco-slide-up {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
  }
  .cco-hover-lift {
    transition: none !important;
  }
  .cco-hover-lift:hover {
    transform: none !important;
  }
}
html[data-cco-reduced-motion="on"] .cco-spin,
html[data-cco-reduced-motion="on"] .cco-fade-in,
html[data-cco-reduced-motion="on"] .cco-slide-up {
  animation: none !important;
  opacity: 1 !important;
  transform: none !important;
}
html[data-cco-reduced-motion="on"] .cco-hover-lift {
  transition: none !important;
}
html[data-cco-reduced-motion="on"] .cco-hover-lift:hover {
  transform: none !important;
}
`.trim();
    document.head.appendChild(style);
  }

  function mount() {
    injectAnimationStyles();
  }

  if (typeof window !== 'undefined') {
    window.MajorArcanaPreviewAnimations = Object.freeze({
      mount,
      animate,
      fadeIn,
      fadeOut,
      slideIn,
      slideOut,
      pulse,
      shake,
      bounceSuccess,
      hoverLift,
      cancelAll,
      isReducedMotion,
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
      mount();
    }
  }
})();
