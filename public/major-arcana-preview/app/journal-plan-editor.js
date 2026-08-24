/**
 * Konsultationsbild — enkel markering för behandlingsplan.
 * Rita frihand, pilar, rektanglar och text ovanpå journalbild.
 */
(() => {
  'use strict';

  const COLORS = ['#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#ffffff'];
  let overlayEl = null;
  let state = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cloneShapes(shapes) {
    return JSON.parse(JSON.stringify(Array.isArray(shapes) ? shapes : []));
  }

  /* ── Zoner ──────────────────────────────────────────────────────────────
   * Zonerna låg tidigare i en kommaseparerad textarea och sparades som
   * strängar. `ccoOfferFromPlan` läser `zones[].grafts`, så antalet per zon
   * blev alltid tomt och kundportalen visade sina hårdkodade 800/1200/500.
   * Nu är varje zon en rad med eget antal, och den sparas som objekt.
   * Etiketterna följer ZONE_META i ccoOfferEsign.js — matchningen där sker
   * på label i gemener, så stavningen måste hållas ihop.
   * ------------------------------------------------------------------- */

  function normalizeIncomingZones(zones) {
    if (!Array.isArray(zones)) return [];
    return zones
      .map((zone) => {
        if (zone && typeof zone === 'object') {
          return {
            label: String(zone.label || zone.name || zone.zone || '').trim(),
            grafts: String(zone.grafts ?? zone.graftCount ?? zone.count ?? '').trim(),
          };
        }
        // Äldre planer sparade zonen som ren sträng — behåll namnet, antalet saknas.
        return { label: String(zone || '').trim(), grafts: '' };
      })
      .filter((zone) => zone.label);
  }

  function zoneRowHtml(zone = { label: '', grafts: '' }) {
    return `
      <div class="journal-plan-zone-row" data-plan-zone-row>
        <input
          type="text"
          class="journal-plan-zone-name"
          data-plan-zone-name
          list="journal-plan-zone-names"
          placeholder="Zon"
          value="${escapeHtml(zone.label)}"
        />
        <input
          type="text"
          inputmode="numeric"
          class="journal-plan-zone-grafts"
          data-plan-zone-grafts
          placeholder="grafts"
          value="${escapeHtml(zone.grafts)}"
        />
        <button
          type="button"
          class="journal-plan-zone-remove"
          data-plan-zone-remove
          aria-label="Ta bort zonen"
        >×</button>
      </div>
    `;
  }

  function renderZoneRows(root, zones) {
    const host = root.querySelector('[data-plan-zone-rows]');
    if (!host) return;
    const list = zones.length ? zones : [{ label: '', grafts: '' }];
    host.innerHTML = list.map(zoneRowHtml).join('');
    updateZoneSum(root);
  }

  function readZoneRows(root) {
    return Array.from(root.querySelectorAll('[data-plan-zone-row]'))
      .map((row) => ({
        label: String(row.querySelector('[data-plan-zone-name]')?.value || '').trim(),
        grafts: String(row.querySelector('[data-plan-zone-grafts]')?.value || '').trim(),
      }))
      .filter((zone) => zone.label);
  }

  function sumZoneGrafts(zones) {
    return zones.reduce((total, zone) => {
      const parsed = Number(String(zone.grafts || '').replace(/[^\d]/g, ''));
      return Number.isFinite(parsed) ? total + parsed : total;
    }, 0);
  }

  function updateZoneSum(root) {
    const readout = root.querySelector('[data-plan-zone-sum]');
    if (!readout) return;
    const sum = sumZoneGrafts(readZoneRows(root));
    readout.textContent = sum ? `Zonerna summerar till ${sum}` : '';
  }

  function drawShape(ctx, shape) {
    if (!shape || !ctx) return;
    ctx.save();
    ctx.strokeStyle = shape.color || '#e11d48';
    ctx.fillStyle = shape.color || '#e11d48';
    ctx.lineWidth = Number(shape.lineWidth || 3);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (shape.type === 'path' && Array.isArray(shape.points) && shape.points.length > 1) {
      ctx.beginPath();
      shape.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    } else if (shape.type === 'rect') {
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h);
    } else if (shape.type === 'arrow') {
      const x1 = shape.x1;
      const y1 = shape.y1;
      const x2 = shape.x2;
      const y2 = shape.y2;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = 12;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(
        x2 - head * Math.cos(angle - Math.PI / 6),
        y2 - head * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        x2 - head * Math.cos(angle + Math.PI / 6),
        y2 - head * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
    } else if (shape.type === 'text' && shape.text) {
      ctx.font = `${Number(shape.fontSize || 18)}px Inter, system-ui, sans-serif`;
      ctx.fillText(shape.text, shape.x, shape.y);
    }
    ctx.restore();
  }

  function redrawCanvas(canvas, image, shapes) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    cloneShapes(shapes).forEach((shape) => drawShape(ctx, shape));
  }

  function canvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  function buildPreviewDataUrl(canvas) {
    return canvas.toDataURL('image/png');
  }

  function touchDistance(touches) {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  function closeEditor() {
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
    state = null;
  }

  function openEditor(options = {}) {
    closeEditor();
    const imageUrl = String(options.imageUrl || '');
    const annotations =
      options.annotations && typeof options.annotations === 'object' ? options.annotations : {};
    const planSummary =
      options.planSummary && typeof options.planSummary === 'object' ? options.planSummary : {};
    const onSave = typeof options.onSave === 'function' ? options.onSave : null;
    const onClose = typeof options.onClose === 'function' ? options.onClose : null;

    state = {
      tool: 'pen',
      color: COLORS[0],
      shapes: cloneShapes(annotations.shapes),
      draftPath: null,
      arrowStart: null,
      rectStart: null,
      activePointers: new Set(),
      viewScale: 1,
      panX: 0,
      panY: 0,
      panDragging: false,
      panStartX: 0,
      panStartY: 0,
      panOriginX: 0,
      panOriginY: 0,
      pinchStartDistance: 0,
      pinchStartScale: 1,
      onSave,
      onClose,
    };

    overlayEl = document.createElement('div');
    overlayEl.className = 'journal-plan-editor-overlay';
    overlayEl.innerHTML = `
      <div class="journal-plan-editor-shell" role="dialog" aria-modal="true" aria-label="Markera behandlingsplan">
        <header class="journal-plan-editor-head">
          <div>
            <h3>Behandlingsplan på bild</h3>
            <p class="patient-master-muted">Markera zoner och spara till journalen.</p>
          </div>
          <button type="button" class="customers-utility-button" data-plan-editor-close>Stäng</button>
        </header>
        <div class="journal-plan-editor-toolbar">
          <button type="button" class="journal-plan-tool is-active" data-plan-tool="pen">Penna</button>
          <button type="button" class="journal-plan-tool" data-plan-tool="arrow">Pil</button>
          <button type="button" class="journal-plan-tool" data-plan-tool="rect">Ruta</button>
          <button type="button" class="journal-plan-tool" data-plan-tool="text">Text</button>
          <button type="button" class="journal-plan-tool" data-plan-tool="undo">Ångra</button>
          <button type="button" class="journal-plan-tool" data-plan-tool="pan">Flytta</button>
          <div class="journal-plan-zoom-controls" aria-label="Zoom">
            <button type="button" class="journal-plan-zoom-btn" data-plan-zoom="out" aria-label="Zooma ut">−</button>
            <span class="journal-plan-zoom-readout" data-plan-zoom-readout>100%</span>
            <button type="button" class="journal-plan-zoom-btn" data-plan-zoom="in" aria-label="Zooma in">+</button>
          </div>
          <div class="journal-plan-colors">
            ${COLORS.map(
              (color, index) =>
                `<button type="button" class="journal-plan-color${index === 0 ? ' is-active' : ''}" data-plan-color="${color}" style="--plan-color:${color}" aria-label="Färg"></button>`
            ).join('')}
          </div>
        </div>
        <div class="journal-plan-editor-body">
          <div class="journal-plan-canvas-wrap">
            <canvas class="journal-plan-canvas"></canvas>
          </div>
          <aside class="journal-plan-side">
            <label>Metod
              <select data-plan-field="method">
                <option value="">Välj metod</option>
                <option value="FUE">FUE</option>
                <option value="FUT">FUT</option>
                <option value="PRP">PRP</option>
                <option value="Kombination">Kombination</option>
              </select>
            </label>
            <div class="journal-plan-zones">
              <span class="journal-plan-zones-title">Zoner och grafts</span>
              <div class="journal-plan-zone-rows" data-plan-zone-rows></div>
              <button type="button" class="journal-plan-zone-add" data-plan-zone-add>+ Lägg till zon</button>
              <datalist id="journal-plan-zone-names">
                <option value="Hårlinje"></option>
                <option value="Mitt"></option>
                <option value="Krona"></option>
                <option value="Vertex"></option>
                <option value="Tempel"></option>
              </datalist>
            </div>
            <label>Grafts totalt
              <input type="text" data-plan-field="graftsTotal" placeholder="summeras från zonerna" />
              <span class="journal-plan-zone-sum" data-plan-zone-sum></span>
            </label>
            <label>Anteckning till kund
              <textarea data-plan-field="notes" rows="3" placeholder="Syns i offert och behandlingsplan…"></textarea>
            </label>
            <label>Intern anteckning
              <textarea data-plan-field="staffNotes" rows="3" placeholder="Bara för personal — syns inte i offert"></textarea>
            </label>
            <button type="button" class="customers-utility-button journal-plan-save" data-plan-editor-save>Spara markering</button>
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    const canvas = overlayEl.querySelector('.journal-plan-canvas');
    const canvasWrap = overlayEl.querySelector('.journal-plan-canvas-wrap');
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const sideReserve = isMobile ? 24 : 420;
      const maxWidth = Math.min(window.innerWidth - sideReserve, 960);
      const scale = Math.min(1, maxWidth / image.width);
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      redrawCanvas(canvas, image, state.shapes);
    };
    image.src = imageUrl;

    renderZoneRows(overlayEl, normalizeIncomingZones(planSummary.zones));

    const fieldMap = {
      method: planSummary.method || '',
      graftsTotal: planSummary.graftsTotal || '',
      notes: planSummary.notes || '',
      staffNotes: planSummary.staffNotes || '',
    };
    overlayEl.querySelectorAll('[data-plan-field]').forEach((node) => {
      const key = node.dataset.planField;
      if (Object.prototype.hasOwnProperty.call(fieldMap, key)) {
        node.value = fieldMap[key];
      }
    });

    function updateZoomReadout() {
      const readout = overlayEl.querySelector('[data-plan-zoom-readout]');
      if (readout) readout.textContent = `${Math.round(state.viewScale * 100)}%`;
    }

    function clampPan() {
      if (state.viewScale <= 1) {
        state.panX = 0;
        state.panY = 0;
        return;
      }
      const scaledW = canvas.width * state.viewScale;
      const scaledH = canvas.height * state.viewScale;
      const wrapW = canvasWrap.clientWidth || 0;
      const wrapH = canvasWrap.clientHeight || 0;
      const minX = Math.min(0, wrapW - scaledW);
      const minY = Math.min(0, wrapH - scaledH);
      state.panX = Math.min(0, Math.max(minX, state.panX));
      state.panY = Math.min(0, Math.max(minY, state.panY));
    }

    function applyViewTransform() {
      canvas.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.viewScale})`;
      canvas.style.transformOrigin = 'top left';
      canvasWrap.classList.toggle('is-zoomed', state.viewScale > 1);
      updateZoomReadout();
    }

    function setViewScale(nextScale) {
      state.viewScale = Math.min(4, Math.max(1, nextScale));
      if (state.viewScale <= 1) {
        state.panX = 0;
        state.panY = 0;
      }
      clampPan();
      applyViewTransform();
    }

    function canPanView() {
      return state.tool === 'pan' || state.viewScale > 1;
    }

    function cancelDraftShape() {
      state.draftPath = null;
      state.arrowStart = null;
      state.rectStart = null;
      const last = state.shapes[state.shapes.length - 1];
      if (last?.type === 'path' && Array.isArray(last.points) && last.points.length <= 1) {
        state.shapes.pop();
        redrawCanvas(canvas, image, state.shapes);
      }
    }

    function isDrawingTool() {
      return state.tool !== 'pan' && !state.panDragging && state.activePointers.size <= 1;
    }

    function setTool(tool) {
      state.tool = tool;
      overlayEl.querySelectorAll('[data-plan-tool]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.planTool === tool);
      });
      const panMode = tool === 'pan' || state.viewScale > 1;
      canvasWrap.classList.toggle('is-pan-mode', panMode);
      canvas.classList.toggle('is-pan-mode', panMode);
      cancelDraftShape();
    }

    function readPlanSummary() {
      const summary = {};
      overlayEl.querySelectorAll('[data-plan-field]').forEach((node) => {
        summary[node.dataset.planField] = String(node.value || '').trim();
      });

      // Zonerna är egna rader, inte ett [data-plan-field]. De sparas som objekt
      // eftersom offerten läser zones[].grafts — en kommalista gav alltid tom
      // siffra, och portalen föll tillbaka på hårdkodade 800/1200/500.
      summary.zones = readZoneRows(overlayEl);

      // Skrivs inte i något fält: låt summan av zonerna vara totalen.
      if (!summary.graftsTotal) {
        const sum = sumZoneGrafts(summary.zones);
        if (sum) summary.graftsTotal = String(sum);
      }
      return summary;
    }

    // Summan uppdateras medan man skriver, så personalen ser direkt om
    // zonerna går ihop med totalen.
    overlayEl.addEventListener('input', (event) => {
      if (event.target.closest('[data-plan-zone-row]')) updateZoneSum(overlayEl);
    });

    overlayEl.addEventListener('click', (event) => {
      const closeButton = event.target.closest('[data-plan-editor-close]');
      if (closeButton) {
        closeEditor();
        if (onClose) onClose();
        return;
      }
      if (event.target.closest('[data-plan-zone-add]')) {
        const host = overlayEl.querySelector('[data-plan-zone-rows]');
        if (host) {
          host.insertAdjacentHTML('beforeend', zoneRowHtml());
          host.querySelector('[data-plan-zone-row]:last-child [data-plan-zone-name]')?.focus();
        }
        return;
      }
      const removeZone = event.target.closest('[data-plan-zone-remove]');
      if (removeZone) {
        const host = overlayEl.querySelector('[data-plan-zone-rows]');
        removeZone.closest('[data-plan-zone-row]')?.remove();
        // Lämna aldrig rutan helt tom — då ser den ut som om funktionen saknas.
        if (host && !host.querySelector('[data-plan-zone-row]')) {
          host.innerHTML = zoneRowHtml();
        }
        updateZoneSum(overlayEl);
        return;
      }
      const toolButton = event.target.closest('[data-plan-tool]');
      if (toolButton) {
        const tool = toolButton.dataset.planTool;
        if (tool === 'undo') {
          state.shapes.pop();
          redrawCanvas(canvas, image, state.shapes);
          return;
        }
        setTool(tool);
        return;
      }
      const colorButton = event.target.closest('[data-plan-color]');
      if (colorButton) {
        state.color = colorButton.dataset.planColor;
        overlayEl.querySelectorAll('[data-plan-color]').forEach((button) => {
          button.classList.toggle('is-active', button === colorButton);
        });
        return;
      }
      const zoomButton = event.target.closest('[data-plan-zoom]');
      if (zoomButton) {
        const delta = zoomButton.dataset.planZoom === 'in' ? 0.25 : -0.25;
        setViewScale(state.viewScale + delta);
        if (state.viewScale > 1 && state.tool !== 'pan') {
          setTool('pan');
        }
        return;
      }
      const saveButton = event.target.closest('[data-plan-editor-save]');
      if (saveButton && onSave) {
        const payload = {
          annotations: { version: 1, shapes: cloneShapes(state.shapes) },
          planSummary: readPlanSummary(),
          previewDataUrl: buildPreviewDataUrl(canvas),
        };
        saveButton.disabled = true;
        Promise.resolve(onSave(payload))
          .then(() => {
            closeEditor();
          })
          .catch(() => {
            saveButton.disabled = false;
          });
      }
    });

    canvasWrap.addEventListener('pointerdown', (event) => {
      if (!canPanView() || event.touches?.length >= 2) return;
      if (state.tool !== 'pan' && state.viewScale <= 1) return;
      state.panDragging = true;
      state.panStartX = event.clientX;
      state.panStartY = event.clientY;
      state.panOriginX = state.panX;
      state.panOriginY = state.panY;
      canvasWrap.setPointerCapture(event.pointerId);
      canvas.classList.add('is-pan-dragging');
      event.preventDefault();
    });

    canvasWrap.addEventListener('pointermove', (event) => {
      if (!state.panDragging) return;
      state.panX = state.panOriginX + (event.clientX - state.panStartX);
      state.panY = state.panOriginY + (event.clientY - state.panStartY);
      clampPan();
      applyViewTransform();
      event.preventDefault();
    });

    function endPanDrag(event) {
      if (!state.panDragging) return;
      state.panDragging = false;
      if (event?.pointerId != null) {
        try {
          canvasWrap.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }
      canvas.classList.remove('is-pan-dragging');
    }

    canvasWrap.addEventListener('pointerup', endPanDrag);
    canvasWrap.addEventListener('pointercancel', endPanDrag);

    canvas.addEventListener('pointerdown', (event) => {
      if (state.panDragging || canPanView() && state.tool === 'pan') return;
      state.activePointers.add(event.pointerId);
      if (state.activePointers.size > 1) {
        cancelDraftShape();
        return;
      }
      canvas.setPointerCapture(event.pointerId);
      const point = canvasPoint(canvas, event);
      if (state.tool === 'pen') {
        state.draftPath = {
          type: 'path',
          color: state.color,
          lineWidth: 3,
          points: [point],
        };
        state.shapes.push(state.draftPath);
      } else if (state.tool === 'arrow') {
        state.arrowStart = point;
      } else if (state.tool === 'rect') {
        state.rectStart = point;
      } else if (state.tool === 'text') {
        const text = window.prompt('Text på bilden:', '');
        if (text) {
          state.shapes.push({
            type: 'text',
            color: state.color,
            fontSize: 18,
            x: point.x,
            y: point.y,
            text,
          });
          redrawCanvas(canvas, image, state.shapes);
        }
      }
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!isDrawingTool()) return;
      const point = canvasPoint(canvas, event);
      if (state.tool === 'pen' && state.draftPath) {
        const last = state.draftPath.points[state.draftPath.points.length - 1];
        if (!last || Math.hypot(last.x - point.x, last.y - point.y) > 1.5) {
          state.draftPath.points.push(point);
          redrawCanvas(canvas, image, state.shapes);
        }
      }
    });

    canvas.addEventListener('pointerup', (event) => {
      state.activePointers.delete(event.pointerId);
      if (!isDrawingTool()) {
        cancelDraftShape();
        return;
      }
      const point = canvasPoint(canvas, event);
      if (state.tool === 'arrow' && state.arrowStart) {
        state.shapes.push({
          type: 'arrow',
          color: state.color,
          lineWidth: 3,
          x1: state.arrowStart.x,
          y1: state.arrowStart.y,
          x2: point.x,
          y2: point.y,
        });
        state.arrowStart = null;
        redrawCanvas(canvas, image, state.shapes);
      } else if (state.tool === 'rect' && state.rectStart) {
        state.shapes.push({
          type: 'rect',
          color: state.color,
          lineWidth: 3,
          x: Math.min(state.rectStart.x, point.x),
          y: Math.min(state.rectStart.y, point.y),
          w: Math.abs(point.x - state.rectStart.x),
          h: Math.abs(point.y - state.rectStart.y),
        });
        state.rectStart = null;
        redrawCanvas(canvas, image, state.shapes);
      }
      state.draftPath = null;
    });

    canvas.addEventListener('pointercancel', (event) => {
      state.activePointers.delete(event.pointerId);
      cancelDraftShape();
    });

    canvasWrap.addEventListener(
      'touchstart',
      (event) => {
        if (event.touches.length >= 2) {
          cancelDraftShape();
          state.pinchStartDistance = touchDistance(event.touches);
          state.pinchStartScale = state.viewScale;
        }
      },
      { passive: true }
    );

    canvasWrap.addEventListener(
      'touchmove',
      (event) => {
        if (event.touches.length < 2) return;
        event.preventDefault();
        const distance = touchDistance(event.touches);
        if (!state.pinchStartDistance) {
          state.pinchStartDistance = distance;
          state.pinchStartScale = state.viewScale;
        }
        const nextScale = state.pinchStartScale * (distance / state.pinchStartDistance);
        setViewScale(nextScale);
        if (state.viewScale > 1 && state.tool !== 'pan') {
          setTool('pan');
        }
      },
      { passive: false }
    );

    canvasWrap.addEventListener(
      'touchend',
      () => {
        state.pinchStartDistance = 0;
      },
      { passive: true }
    );
  }

  window.ArcanaJournalPlanEditor = {
    open: openEditor,
    close: closeEditor,
  };
})();
