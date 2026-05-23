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
            <label>Grafts totalt
              <input type="text" data-plan-field="graftsTotal" placeholder="t.ex. 2800" />
            </label>
            <label>Zoner
              <textarea data-plan-field="zones" rows="3" placeholder="Front, vertex, temporal…"></textarea>
            </label>
            <label>Anteckning
              <textarea data-plan-field="notes" rows="4" placeholder="Plan och överenskommelse…"></textarea>
            </label>
            <button type="button" class="customers-utility-button journal-plan-save" data-plan-editor-save>Spara markering</button>
          </aside>
        </div>
      </div>
    `;
    document.body.appendChild(overlayEl);

    const canvas = overlayEl.querySelector('.journal-plan-canvas');
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

    const fieldMap = {
      method: planSummary.method || '',
      graftsTotal: planSummary.graftsTotal || '',
      zones: Array.isArray(planSummary.zones)
        ? planSummary.zones.join(', ')
        : planSummary.zones || '',
      notes: planSummary.notes || '',
    };
    overlayEl.querySelectorAll('[data-plan-field]').forEach((node) => {
      const key = node.dataset.planField;
      if (Object.prototype.hasOwnProperty.call(fieldMap, key)) {
        node.value = fieldMap[key];
      }
    });

    function setTool(tool) {
      state.tool = tool;
      overlayEl.querySelectorAll('[data-plan-tool]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.planTool === tool);
      });
    }

    function readPlanSummary() {
      const summary = {};
      overlayEl.querySelectorAll('[data-plan-field]').forEach((node) => {
        const key = node.dataset.planField;
        const value = String(node.value || '').trim();
        if (key === 'zones') {
          summary.zones = value
            ? value
                .split(',')
                .map((part) => part.trim())
                .filter(Boolean)
            : [];
        } else {
          summary[key] = value;
        }
      });
      return summary;
    }

    overlayEl.addEventListener('click', (event) => {
      const closeButton = event.target.closest('[data-plan-editor-close]');
      if (closeButton) {
        closeEditor();
        if (onClose) onClose();
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

    canvas.addEventListener('pointerdown', (event) => {
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
  }

  window.ArcanaJournalPlanEditor = {
    open: openEditor,
    close: closeEditor,
  };
})();
