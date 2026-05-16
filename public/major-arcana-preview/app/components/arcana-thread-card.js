/**
 * app/components/arcana-thread-card.js
 * Lit web component — Fas 1 av migration från shim-baserad arkitektur till
 * state-driven UI.
 *
 * Status: REGISTRERAD MEN EJ AKTIV. Den kan användas men ingen renderare
 * skapar den ännu. Cards renderas fortfarande av buildThreadCardMarkup +
 * shims i bundlen.
 *
 * Test manuellt i browser-console:
 *   const c = document.createElement('arcana-thread-card');
 *   c.thread = { sender: 'Test Person', subject: 'Hej', pills: [{ label: 'Bokning', color: '#10b981' }] };
 *   document.body.appendChild(c);
 *
 * Använder Lit 3.x från jsDelivr ESM-CDN. Inget build-step krävs.
 * Lit är ~8 KB gzipped.
 */
// Importerar från lokalt bundlad Lit (CSP tillåter inte externa CDN:s)
// Bundlen byggdes en gång via:
//   npx esbuild node_modules/lit/index.js --bundle --format=esm --minify \
//     --outfile=public/major-arcana-preview/app/components/lit-vendor.js
// 15 KB minified, innehåller LitElement + html + css.
import { LitElement, html, css } from './lit-vendor.js';

export class ArcanaThreadCard extends LitElement {
  static properties = {
    /**
     * Thread-objekt med all data komponenten behöver för att rendera.
     * Exempel:
     *   {
     *     id: 'no-reply@cliento.com',
     *     sender: 'Cliento',
     *     subject: 'Booking Request',
     *     preview: 'Var konkret med tider...',
     *     lane: 'bookable',
     *     time: '12:29',
     *     owner: 'Ej tilldelad',
     *     pills: [
     *       { type: 'status', label: 'Tid kan erbjudas', color: '#ef4444', icon: 'clock' },
     *       { type: 'cluster', label: '2 trådar', color: '#7c3aed' }
     *     ],
     *     systemMailLabel: 'via Cliento'
     *   }
     */
    thread: { type: Object },
    selected: { type: Boolean, reflect: true },
    /**
     * Customer-cluster role för detta card. Sätts av parent (lit-switchover.js)
     * via groupThreadsByCustomer(). Värden:
     *   'primary' → cluster-head, visar cluster-pill, klick togglar expanded
     *   'sub'     → underordnad i cluster, indragen styling, hidden om inte expanded
     *   null/''   → ingen cluster, normal rendering
     */
    clusterRole: { type: String, reflect: true, attribute: 'cluster-role' },
    clusterKey: { type: String, attribute: 'cluster-key' },
    clusterExpanded: { type: Boolean, reflect: true, attribute: 'cluster-expanded' },
    clusterHidden: { type: Boolean, reflect: true, attribute: 'cluster-hidden' },
  };

  // Lit's encapsulation: scoped CSS. Stilar läcker inte ut, inga konflikter
  // med cco-polish.css. Componenten är fristående.
  static styles = css`
    :host {
      display: block;
      contain: layout style;
      opacity: 1;
      transition: opacity 200ms ease-out;
    }
    article {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 14px 14px;
      background: #ffffff;
      border-radius: 14px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      border-left: 3px solid var(--lane-color, #cbd5e1);
      min-height: 88px;
      font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
    }
    .head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .sender {
      font-weight: 600;
      font-size: 14px;
      color: #1e293b;
    }
    .subject {
      color: #475569;
      font-size: 13px;
      font-weight: 400;
      margin-left: 6px;
    }
    .meta {
      font-size: 11px;
      color: #94a3b8;
      flex-shrink: 0;
    }
    .preview {
      color: #64748b;
      font-size: 12.5px;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--pill-color, #64748b) 8%, transparent);
      color: var(--pill-color, #64748b);
      border: 1px solid color-mix(in srgb, var(--pill-color, #64748b) 25%, transparent);
      font-size: 11px;
      font-weight: 500;
      line-height: 1.4;
    }
    .pill--system-mail {
      background: rgba(100, 116, 139, 0.06);
      color: #64748b;
      border-color: rgba(100, 116, 139, 0.2);
      font-style: italic;
    }
    .pill--cluster {
      cursor: pointer;
      user-select: none;
    }
    .pill--cluster::after {
      content: ' ▾';
      font-size: 9px;
      opacity: 0.7;
      transition: transform 150ms ease;
      display: inline-block;
    }
    :host([cluster-expanded]) .pill--cluster::after {
      transform: rotate(180deg);
    }
    /* Sub-card styling: indragen + dämpad när expanded, helt dolt annars */
    :host([cluster-role='sub']) article {
      margin-left: 18px;
      border-left-width: 2px;
      box-shadow: none;
      background: rgba(248, 250, 252, 0.7);
    }
    :host([cluster-role='sub']) .sender {
      font-size: 13px;
      font-weight: 500;
    }
    :host([cluster-hidden]) {
      display: none;
    }
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

  /**
   * Klick på cluster-pill → emittera custom event så parent kan toggla
   * expanded-state. Stoppar event-propagation så card-click inte triggas.
   */
  _onPillClick(e, pill) {
    if (pill.type !== 'cluster') return;
    if (!this.clusterKey) return;
    e.preventDefault();
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('cluster-toggle', {
        detail: { key: this.clusterKey, threadId: this.thread?.id },
        bubbles: true,
        composed: true, // Genom shadow boundary till parent i light DOM
      }),
    );
  }

  // Mappa lane till färg (matchar app.bundle.js's existerande färgschema)
  _laneColor(lane) {
    return {
      'act-now': '#ef4444',
      'agera-nu': '#ef4444',
      sprint: '#16a34a',
      bookable: '#0891b2',
      bokning: '#0891b2',
      review: '#f59e0b',
      granska: '#f59e0b',
      unclear: '#7c3aed',
      oklart: '#7c3aed',
      later: '#6366f1',
      senare: '#6366f1',
      admin: '#64748b',
      medical: '#ec4899',
      medicinsk: '#ec4899',
    }[String(lane || '').toLowerCase()] || '#cbd5e1';
  }

  render() {
    const t = this.thread || {};
    const laneColor = this._laneColor(t.lane);
    const pills = Array.isArray(t.pills) ? t.pills : [];
    const sysLabel = t.systemMailLabel;

    return html`
      <article
        style="--lane-color: ${laneColor}"
        data-runtime-thread="${t.id || ''}"
        data-lane="${t.lane || ''}"
      >
        <div class="head">
          <div>
            <span class="sender">${t.sender || 'Okänd avsändare'}</span>
            ${t.subject ? html`<span class="subject">· ${t.subject}</span>` : ''}
          </div>
          <span class="meta">${t.time || ''}${t.owner ? html` · ${t.owner}` : ''}</span>
        </div>
        ${t.preview ? html`<p class="preview">${t.preview}</p>` : ''}
        ${pills.length || sysLabel
          ? html`
              <div class="pills">
                ${pills.map(
                  (p) => html`
                    <span
                      class="pill ${p.type === 'cluster' ? 'pill--cluster' : ''}"
                      style="--pill-color: ${p.color || '#64748b'}"
                      data-pill-type="${p.type || ''}"
                      @click=${(e) => this._onPillClick(e, p)}
                    >
                      ${p.label}
                    </span>
                  `,
                )}
                ${sysLabel
                  ? html`<span class="pill pill--system-mail">${sysLabel}</span>`
                  : ''}
              </div>
            `
          : ''}
      </article>
    `;
  }
}

// Registrera custom element (idempotent — safe att laddas flera gånger)
if (!customElements.get('arcana-thread-card')) {
  customElements.define('arcana-thread-card', ArcanaThreadCard);
}

// Exponera för debug + manuell testning från devtools
if (typeof window !== 'undefined') {
  window.__ArcanaThreadCard = ArcanaThreadCard;
}
