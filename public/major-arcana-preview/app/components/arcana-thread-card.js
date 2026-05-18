/**
 * app/components/arcana-thread-card.js
 * Lit web component för thread-cards i CCO-stil.
 *
 * Fas 11 (2026-05-16): Ny render() med rich CCO-design
 *   - Avatar (32px) med unread-prick
 *   - Sender (13.5px bold) · Subject (13px medium)
 *   - Preview (12px dämpad)
 *   - Pillar (11.5px, ikon + text, CCO-dämpade färger)
 *   - Höger top: meta (Ej tilldelad / Egzona)
 *   - Höger nederkant: 5 runda action-knappar (18px) + CTA-pill
 *   - Lane-färgad rail (3px) vänster
 *   - Bakgrund: #FBF6F0 (default) / #F4ECE3 (hover)
 *
 * Stilar i Shadow DOM — inga konflikter med övriga CSS.
 * Cluster-toggle event och click-forwarding oförändrade från tidigare faser.
 */
import { LitElement, html, css, svg } from './lit-vendor.js';

// ─────────── Tabler-icons (MIT License) inlinade som SVG ───────────
// Bara de vi använder. Path-data från Tabler v3 outline-ikoner.
const ICONS = {
  'clock':           svg`<path d="M12 7v5l3 3" /><circle cx="12" cy="12" r="9" />`,
  'clock-hour-9':    svg`<path d="M12 12h-3" /><circle cx="12" cy="12" r="9" />`,
  'calendar':        svg`<path d="M4 5h16M4 5v14h16V5M4 5l0 -1a1 1 0 0 1 1 -1h0M19 5l0 -1a1 1 0 0 0 -1 -1h0M9 3v4M15 3v4M4 11h16" />`,
  'check':           svg`<path d="M5 12l5 5l10 -10" />`,
  'trash':           svg`<path d="M4 7l16 0M10 11l0 6M14 11l0 6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />`,
  'chevron-right':   svg`<path d="M9 6l6 6l-6 6" />`,
  'refresh':         svg`<path d="M20 11a8.1 8.1 0 0 0 -15.5 -2M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" />`,
  'eye':             svg`<path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />`,
  'alert-triangle':  svg`<path d="M12 9v4M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0M12 16h.01" />`,
  'help-circle':     svg`<circle cx="12" cy="12" r="9" /><path d="M12 17v.01M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4" />`,
  'user':            svg`<circle cx="12" cy="7" r="4" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />`,
  'user-question':   svg`<circle cx="9" cy="7" r="4" /><path d="M3 21v-2a4 4 0 0 1 4 -4h4M19 22v.01M19 19a2 2 0 0 0 .914 -3.778a1.98 1.98 0 0 0 -2.414 .502" />`,
  'info-circle':     svg`<circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" />`,
  'mail':            svg`<rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6l9 -6" />`,
  'sparkles':        svg`<path d="M12 3l2.6 7.4l7.4 2.6l-7.4 2.6l-2.6 7.4l-2.6 -7.4l-7.4 -2.6l7.4 -2.6z" />`,
  'bell':            svg`<path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6M9 17v1a3 3 0 0 0 6 0v-1" />`,
  'stack-2':         svg`<path d="M12 4l-8 4l8 4l8 -4l-8 -4M4 12l8 4l8 -4M4 16l8 4l8 -4" />`,
  'arrow-back-up':   svg`<path d="M9 14l-4 -4l4 -4M5 10h11a4 4 0 1 1 0 8h-1" />`,
  'circle':          svg`<circle cx="12" cy="12" r="9" />`,
};

function icon(name) {
  const path = ICONS[name] || ICONS['circle'];
  return svg`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

// ─────────── CCO designsystem ───────────

// Lane → rail-färg (skarpa primärfärger)
const LANE_RAIL = {
  'oklart':    '#7C3AED', 'unclear':   '#7C3AED',
  'act-now':   '#EF4444', 'urgent':    '#EF4444', 'agera-nu': '#EF4444', 'agera_nu': '#EF4444',
  'granska':   '#4F46E5', 'review':    '#4F46E5',
  'sprint':    '#4F46E5',
  'bokning':   '#16A34A', 'bookable':  '#16A34A', 'booking':  '#16A34A',
  'senare':    '#F59E0B', 'later':     '#F59E0B',
  'admin':     '#64748B',
  'medicinsk': '#EC4899', 'medical':   '#EC4899',
};

// Lane → CTA-text
const LANE_CTA = {
  'oklart':    'Öppna', 'unclear':   'Öppna',
  'act-now':   'Svara', 'urgent':    'Svara', 'agera-nu': 'Svara',
  'granska':   'Granska', 'review':   'Granska',
  'sprint':    'Svara',
  'bokning':   'Bekräfta bokning', 'bookable': 'Bekräfta bokning', 'booking': 'Bekräfta bokning',
  'senare':    'Öppna', 'later':     'Öppna',
  'admin':     'Öppna',
  'medicinsk': 'Öppna', 'medical':   'Öppna',
};

// Lane → CTA-glow-färg (RGB tripple)
const LANE_CTA_GLOW = {
  'oklart':    '124,58,237', 'unclear':   '124,58,237',
  'act-now':   '239,68,68',  'urgent':    '239,68,68',  'agera-nu': '239,68,68',
  'granska':   '79,70,229',  'review':    '79,70,229',
  'sprint':    '79,70,229',
  'bokning':   '22,163,74',  'bookable':  '22,163,74',  'booking':  '22,163,74',
  'senare':    '245,158,11', 'later':     '245,158,11',
  'admin':     '100,116,139',
  'medicinsk': '236,72,153', 'medical':   '236,72,153',
};

// Pill icon-namn (Tabler) baserat på pill.type + pill.label
function pickPillIcon(pill) {
  const label = String(pill.label || '').toLowerCase();
  // 1. Special icons per label
  if (/svar krävs|svara|behöver svar/.test(label)) return 'refresh';
  if (/granska|granskning|granskar/.test(label)) return 'eye';
  if (/hög risk|hog risk|miss.risk|risk/.test(label)) return 'alert-triangle';
  if (/agera|åtgärd|atgard/.test(label)) return 'alert-triangle';
  if (/oklart|otydligt|låg konfidens/.test(label)) return 'help-circle';
  if (/bokning|booking|kalender/.test(label)) return 'calendar';
  if (/tid kan erbjudas|bekräfta|klar|check/.test(label)) return 'check';
  if (/ai.utkast|utkast/.test(label)) return 'sparkles';
  if (/snooze|återkommer|aterkommer/.test(label)) return 'bell';
  if (/cluster|trådar|tradar/.test(label)) return 'stack-2';
  // 2. Type fallback
  if (pill.type === 'risk') return 'alert-triangle';
  if (pill.type === 'cta' || pill.type === 'status') return 'refresh';
  if (pill.type === 'owner') return 'user';
  if (pill.type === 'mailbox') return 'inbox';
  if (pill.type === 'ai') return 'sparkles';
  if (pill.type === 'snooze') return 'bell';
  if (pill.type === 'cluster') return 'stack-2';
  if (pill.type === 'returned') return 'arrow-back-up';
  if (pill.type === 'system-mail') return 'mail';
  return 'circle';
}

// Map skarp tailwind-färg → CCO-dämpad version för pill-text
function softenPillColor(c) {
  const hex = String(c || '').toLowerCase();
  if (hex === '#ef4444' || hex === '#dc2626') return '#B43A3A'; // röd → dämpad
  if (hex === '#16a34a' || hex === '#10b981') return '#4F8A55'; // grön → dämpad
  if (hex === '#f59e0b' || hex === '#eab308') return '#C77D2A'; // amber → dämpad
  if (hex === '#4f46e5' || hex === '#6366f1') return '#1F66A8'; // indigo → dämpad blå
  if (hex === '#f97316') return '#C77D2A'; // orange → dämpad
  if (hex === '#7c3aed' || hex === '#8b5cf6') return '#6B3FCC'; // violet → dämpad
  if (hex === '#0891b2' || hex === '#06b6d4') return '#1F66A8'; // cyan → dämpad blå
  return c;
}

// Initialer från sender-namn
function initials(sender) {
  if (!sender) return '?';
  const parts = String(sender).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join('').toUpperCase().slice(0, 2);
}

// Är sender en system-avsändare? (för avatar-stil)
function isSystemSender(thread) {
  const sender = String(thread?.sender || '').toLowerCase();
  return /^(klarna|cliento|foodora|smartdocs|kivra|hellofresh|news|sportadmin|gotevent)/i.test(sender);
}

export class ArcanaThreadCard extends LitElement {
  static properties = {
    thread: { type: Object },
    selected: { type: Boolean, reflect: true },
    clusterRole: { type: String, reflect: true, attribute: 'cluster-role' },
    clusterKey: { type: String, attribute: 'cluster-key' },
    clusterExpanded: { type: Boolean, reflect: true, attribute: 'cluster-expanded' },
    clusterHidden: { type: Boolean, reflect: true, attribute: 'cluster-hidden' },
  };

  static styles = css`
    :host {
      display: block;
      contain: layout style;
      opacity: 1;
      transition: opacity 200ms ease-out;
    }
    :host([cluster-hidden]) { display: none; }
    :host([cluster-role='sub']) article { margin-left: 18px; opacity: 0.82; }

    /* ─────── Layout (kompakt single-row) ─────── */
    article {
      position: relative;
      background: #FBF6F0;
      border: 0.5px solid #F1E5DB;
      border-radius: 12px;
      padding: 8px 12px 8px 16px;
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto;
      grid-template-rows: auto;
      gap: 0 12px;
      align-items: center;
      cursor: pointer;
      transition: background 180ms ease, transform 180ms ease;
      box-shadow: 0 1px 2px rgba(120, 80, 40, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.6);
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    }
    article:hover { background: #F4ECE3; }
    article::before {
      content: '';
      position: absolute;
      top: 8px; bottom: 8px; left: 0;
      width: 3px;
      border-radius: 0 2px 2px 0;
      background: var(--lane-color, #6B7280);
      box-shadow: 0 0 4px var(--lane-glow, rgba(107, 114, 128, 0.35));
    }

    /* ─────── Avatar ─────── */
    .avatar-wrap {
      position: relative;
      grid-column: 1; grid-row: 1;
      align-self: center;
    }
    .avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 600; font-size: 11px;
      color: #6B4A2F;
      background: radial-gradient(circle at 35% 30%, #FFFFFF 0%, #FFEFDE 35%, #F7DDC0 75%, #E8C29A 100%);
      box-shadow: 0 1px 2px rgba(120, 80, 40, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.7);
      border: 0.5px solid #ECD3B4;
    }
    .avatar.sys {
      background: linear-gradient(160deg, #FBF6F0 0%, #F1E5DB 100%);
      color: #6B7280;
    }
    .avatar svg { width: 14px; height: 14px; }
    .avatar-dot {
      position: absolute; bottom: -1px; left: 22px;
      width: 8px; height: 8px;
      border-radius: 50%;
      background: radial-gradient(circle at 30% 25%, #87B9F9 0%, #3B82F6 60%);
      border: 1.5px solid #FBF6F0;
      box-shadow: 0 0 4px rgba(59, 130, 246, 0.45);
    }

    /* ─────── Body (sender · subject · preview · pills) ─────── */
    .body {
      grid-column: 2; grid-row: 1;
      min-width: 0;
      padding-right: 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .line-1 {
      display: flex; align-items: baseline; gap: 8px;
      line-height: 1.3;
    }
    .sender { font-size: 13.5px; font-weight: 600; color: #0F172A; }
    .sep { font-size: 12px; color: rgba(107, 114, 128, 0.5); }
    .subject {
      font-size: 13px; font-weight: 500; color: #374151;
      flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .preview {
      margin: 0;
      font-size: 12px;
      color: #4B5563;
      line-height: 1.35;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .pills {
      display: flex; align-items: center; gap: 12px;
      flex-wrap: wrap;
      line-height: 1.2;
      margin-top: 1px;
    }
    .pill {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11.5px; font-weight: 600;
    }
    .pill svg { width: 12px; height: 12px; flex-shrink: 0; }
    .meta svg { width: 11px; height: 11px; margin-right: 1px; }
    .rd-btn svg { width: 10px; height: 10px; }
    .cta svg { width: 11px; height: 11px; color: #6B7280; }
    .pill--system-mail {
      color: #6B7280;
      font-style: italic;
      font-weight: 500;
    }
    .pill--cluster {
      cursor: pointer;
    }
    .pill--cluster::after {
      content: ' ▾';
      font-size: 9px; opacity: 0.7;
      transition: transform 150ms ease;
      display: inline-block;
    }
    :host([cluster-expanded]) .pill--cluster::after {
      transform: rotate(180deg);
    }

    /* ─────── Höger kolumn (meta ovan, actions under) ─────── */
    .right-col {
      grid-column: 3; grid-row: 1;
      align-self: start;
      display: flex; flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      padding-top: 2px;
    }
    .meta {
      font-size: 11px;
      color: #6B7280;
      display: inline-flex; align-items: center; gap: 4px;
      white-space: nowrap;
    }
    .meta i { font-size: 11px; }

    /* Fas 19: right-col stackad vertikalt — meta överst, sen Svara-pillen
       (primary action på egen rad), sen 5 små ikoner på en horisontell
       rad nederst. Frigör body-bredd och gör primary-actionen tydligare. */
    .icon-row {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .cta {
      align-self: flex-end;
    }

    /* ─────── Action-knappar (18px runda) ─────── */
    .rd-btn {
      --glow: rgba(120, 80, 40, 0.10);
      width: 18px; height: 18px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; padding: 0;
      border: 0.5px solid #E8D4BE;
      background:
        radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.95) 0%, transparent 55%),
        linear-gradient(180deg, #FFFFFF 0%, #FFF9F3 100%);
      box-shadow:
        0 1px 2px rgba(120, 80, 40, 0.08),
        0 1.5px 4px var(--glow),
        inset 0 0.5px 0.5px rgba(255, 255, 255, 0.95);
      transition: all 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .rd-btn { color: #374151; }
    .rd-btn:hover {
      transform: translateY(-1px) scale(1.12);
      box-shadow:
        0 2px 3px rgba(120, 80, 40, 0.10),
        0 3px 8px var(--glow),
        0 0 0 2.5px var(--glow);
    }
    .rd-btn:hover svg { transform: scale(1.15); }
    .rd-btn svg { transition: transform 200ms ease; }
    .rd-btn:active { transform: scale(0.92); }

    .rd-snooze { --glow: rgba(31, 102, 168, 0.22); }
    .rd-snooze:hover { color: #1F66A8; }
    .rd-sched  { --glow: rgba(199, 125, 42, 0.22); }
    .rd-sched:hover { color: #C77D2A; }
    .rd-cal    { --glow: rgba(79, 138, 85, 0.22); }
    .rd-cal:hover { color: #4F8A55; }
    .rd-check  { --glow: rgba(79, 138, 85, 0.22); }
    .rd-check:hover { color: #4F8A55; }
    .rd-trash  { --glow: rgba(180, 58, 58, 0.22); }
    .rd-trash:hover { color: #B43A3A; }

    /* ─────── CTA-pill ─────── */
    .cta {
      --glow: rgba(31, 102, 168, 0.22);
      margin-left: 3px;
      padding: 3px 10px;
      height: 18px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border: 0.5px solid #E8D4BE;
      background:
        radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.9) 0%, transparent 55%),
        linear-gradient(180deg, #FFFFFF 0%, #FFF9F3 100%);
      color: #0F172A;
      display: inline-flex; align-items: center; gap: 3px;
      box-shadow:
        0 1px 2px rgba(120, 80, 40, 0.08),
        0 1.5px 4px var(--glow),
        inset 0 0.5px 0.5px rgba(255, 255, 255, 0.95);
      transition: all 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
      font-family: inherit;
    }
    .cta svg { transition: transform 200ms ease; }
    .cta:hover {
      transform: translateY(-1px);
      box-shadow:
        0 2px 3px rgba(120, 80, 40, 0.10),
        0 3px 8px var(--glow),
        0 0 0 2.5px var(--glow);
    }
    .cta:hover svg { transform: translateX(2px); }
    .cta:active { transform: scale(0.97); }
  `;

  constructor() {
    super();
    this.thread = null;
    this.selected = false;
    this.clusterRole = '';
    this.clusterKey = '';
    this.clusterExpanded = false;
    this.clusterHidden = false;
  }

  _onPillClick(e, pill) {
    if (pill.type !== 'cluster') return;
    if (!this.clusterKey) return;
    e.preventDefault();
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('cluster-toggle', {
        detail: { key: this.clusterKey, threadId: this.thread?.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _onActionClick(e, action) {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('card-action', {
        detail: { action, threadId: this.thread?.id },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    const t = this.thread || {};
    const pills = Array.isArray(t.pills) ? t.pills : [];
    const lane = String(t.lane || t.primaryLaneId || '').toLowerCase();
    const sysLabel = t.systemMailLabel;
    const isSys = isSystemSender(t);
    const showUnreadDot = !isSys && (t.unread !== false); // visa prick som default
    const ownerText = t.owner && !/ej.tilldelad|unassigned/i.test(t.owner)
      ? t.owner
      : 'Ej tilldelad';
    const showInfoIcon = /ej.tilldelad|unassigned/i.test(ownerText);

    const railColor = LANE_RAIL[lane] || '#6B7280';
    const railRgb = LANE_CTA_GLOW[lane] || '107, 114, 128';
    const ctaText = LANE_CTA[lane] || 'Öppna';

    // Filter ut owner-pill och mailbox-pill (visas i meta höger istället)
    const visiblePills = pills.filter((p) => p.type !== 'owner' && p.type !== 'mailbox');

    return html`
      <article
        style="--lane-color: ${railColor}; --lane-glow: rgba(${railRgb}, 0.35);"
        data-runtime-thread="${t.id || ''}"
        data-lane="${lane}"
      >
        <div class="avatar-wrap">
          <div class="avatar ${isSys ? 'sys' : ''}">
            ${isSys
              ? icon('mail')
              : html`${initials(t.sender)}`}
          </div>
          ${showUnreadDot ? html`<span class="avatar-dot"></span>` : ''}
        </div>

        <div class="body">
          <div class="line-1">
            <span class="sender">${t.sender || 'Okänd avsändare'}</span>
            ${t.subject ? html`<span class="sep">·</span><span class="subject">${t.subject}</span>` : ''}
          </div>
          ${t.preview ? html`<p class="preview">${t.preview}</p>` : ''}
          ${visiblePills.length || sysLabel
            ? html`
                <div class="pills">
                  ${visiblePills.map((p) => {
                    const isCluster = p.type === 'cluster';
                    return html`
                      <span
                        class="pill ${isCluster ? 'pill--cluster' : ''}"
                        style="color: ${softenPillColor(p.color) || '#6B7280'};"
                        data-pill-type="${p.type || ''}"
                        @click=${(e) => this._onPillClick(e, p)}
                      >
                        ${icon(pickPillIcon(p))}
                        ${p.label}
                      </span>
                    `;
                  })}
                  ${sysLabel
                    ? html`<span class="pill pill--system-mail">${sysLabel}</span>`
                    : ''}
                </div>
              `
            : ''}
        </div>

        <div class="right-col">
          <div class="meta">
            ${showInfoIcon ? icon('info-circle') : ''}${ownerText}
          </div>
          <button
            class="cta"
            style="--glow: rgba(${railRgb}, 0.22);"
            @click=${(e) => this._onActionClick(e, 'cta')}
          >
            ${ctaText} ${icon('chevron-right')}
          </button>
          <div class="icon-row">
            <button class="rd-btn rd-snooze" aria-label="Snooze" @click=${(e) => this._onActionClick(e, 'snooze')}>${icon('clock-hour-9')}</button>
            <button class="rd-btn rd-sched" aria-label="Schemalägg" @click=${(e) => this._onActionClick(e, 'schedule')}>${icon('clock')}</button>
            <button class="rd-btn rd-cal" aria-label="Boka tid" @click=${(e) => this._onActionClick(e, 'calendar')}>${icon('calendar')}</button>
            <button class="rd-btn rd-check" aria-label="Markera klar" @click=${(e) => this._onActionClick(e, 'done')}>${icon('check')}</button>
            <button class="rd-btn rd-trash" aria-label="Radera" @click=${(e) => this._onActionClick(e, 'delete')}>${icon('trash')}</button>
          </div>
        </div>
      </article>
    `;
  }
}

// Registrera custom element (idempotent — safe att laddas flera gånger)
if (!customElements.get('arcana-thread-card')) {
  customElements.define('arcana-thread-card', ArcanaThreadCard);
}

if (typeof window !== 'undefined') {
  window.__ArcanaThreadCard = ArcanaThreadCard;
}
