const canvas = document.getElementById("drawCanvas");
const angleEditorEl = document.getElementById("angleEditor");
const markupOutput = document.getElementById("markupOutput");
const statusEl = document.getElementById("status");
const selectBtn = document.getElementById("selectBtn");
const lineBtn = document.getElementById("lineBtn");
const circleBtn = document.getElementById("circleBtn");
const labelBtn = document.getElementById("labelBtn");
const angleBtn = document.getElementById("angleBtn");
const deleteBtn = document.getElementById("deleteBtn");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const snapInfoEl = document.getElementById("snapInfo");
const colorPickerEl = document.getElementById("colorPicker");
const colorHexEl = document.getElementById("colorHex");
const quickColorButtons = Array.from(document.querySelectorAll(".quick-color-btn"));

const ctx = canvas.getContext("2d");

const state = {
  mode: "select",
  lineDrawMode: "normal",
  lineAxisConstraint: "none",
  draftPoint: null,
  draftCurrentPoint: null,
  pendingDiameterCircle: null,
  angleAnalysis: null,
  hoverPoint: null,
  lastPointerPoint: null,
  isDragging: false,
  shapes: [],
  actions: [],
  color: "#1a1a2e",
  logicalWidth: 1100,
  logicalHeight: 700,
  snapRadius: 14,
  snapKindFilter: "any",
  gridUnit: 50,
  markupFocused: false,
  showGrid: true,
  snapToGrid: false,
  selection: new Set(),  // Set of shape objects; multi-click expands level
  anglePrecision: 0,
  showArcDiffs: false
};

function resizeCanvasToFit() {
  const wrap = canvas.parentElement;
  if (!wrap) {
    return;
  }

  const maxWidth = Math.max(1, wrap.clientWidth);
  const maxHeight = Math.max(1, wrap.clientHeight);
  const ratio = state.logicalWidth / state.logicalHeight;

  let displayWidth = maxWidth;
  let displayHeight = displayWidth / ratio;

  if (displayHeight > maxHeight) {
    displayHeight = maxHeight;
    displayWidth = displayHeight * ratio;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.round(displayWidth)}px`;
  canvas.style.height = `${Math.round(displayHeight)}px`;
  canvas.width = Math.round(state.logicalWidth * dpr);
  canvas.height = Math.round(state.logicalHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  render();
}

function setStatus(message, error = false) {
  statusEl.textContent = message;
  statusEl.style.color = error ? "#a61b1b" : "#5a6d66";
}

function setSnapInfo(text) {
  snapInfoEl.textContent = text;
}

function syncColorUi() {
  if (colorPickerEl) {
    colorPickerEl.value = state.color;
  }

  if (colorHexEl) {
    colorHexEl.textContent = state.color.toUpperCase();
  }

  for (const button of quickColorButtons) {
    const color = String(button.getAttribute("data-color") || "").toLowerCase();
    button.classList.toggle("is-active", color === state.color);
  }
}

function setDrawingColor(value) {
  const color = String(value || "").trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    return false;
  }

  state.color = color;
  syncColorUi();
  setStatus(`Color set to ${state.color.toUpperCase()}.`);
  return true;
}

function kindLabel(kind) {
  if (kind === "point") return "point";
  if (kind === "line") return "line";
  if (kind === "circle") return "circle";
  return "none";
}

function snapModeLabel() {
  if (state.snapKindFilter === "point") return "point";
  if (state.snapKindFilter === "line") return "line";
  if (state.snapKindFilter === "circle") return "circle";
  return "auto";
}

function lineDrawModeLabel() {
  return state.lineDrawMode === "diameter" ? "diameter" : "normal";
}

function lineAxisConstraintLabel() {
  if (state.lineAxisConstraint === "horizontal") {
    return "horizontal";
  }

  if (state.lineAxisConstraint === "vertical") {
    return "vertical";
  }

  return "free";
}

function applyLineAxisConstraint(start, point) {
  if (!start || !point || state.lineAxisConstraint === "none") {
    return point;
  }

  if (state.lineAxisConstraint === "horizontal") {
    return {
      ...point,
      y: start.y
    };
  }

  return {
    ...point,
    x: start.x
  };
}

function snapInfoText(activeText) {
  return `Snap mode: ${snapModeLabel()} | ${activeText}`;
}

function snapStrokeColor(kind) {
  if (kind === "point") {
    return "#dc2626";
  }

  if (kind === "line" || kind === "circle") {
    return "#f59e0b";
  }

  return "#0f766e";
}

function setMode(mode) {
  state.mode = mode;
  state.draftPoint = null;
  state.draftCurrentPoint = null;
  state.pendingDiameterCircle = null;
  state.angleAnalysis = null;
  state.hoverPoint = null;
  state.isDragging = false;
  if (mode !== "select") state.selection.clear();

  selectBtn.classList.toggle("is-active", mode === "select");
  lineBtn.classList.toggle("is-active", mode === "line");
  circleBtn.classList.toggle("is-active", mode === "circle");
  labelBtn.classList.toggle("is-active", mode === "label");
  angleBtn.classList.toggle("is-active", mode === "angle");
  deleteBtn.classList.toggle("is-active", mode === "delete");

  if (mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
    setStatus(`Line mode (${lineDrawModeLabel()}, ${lineAxisConstraintLabel()}): drag to draw from start to end.`);
    return;
  }

  if (mode === "circle") {
    setSnapInfo(snapInfoText("line mode only"));
    setStatus("Circle mode: drag from center to set radius.");
    return;
  }

  if (mode === "label") {
    setSnapInfo(snapInfoText("line mode only"));
    setStatus("Label mode: click on canvas to place a label.");
    return;
  }

  if (mode === "angle") {
    setSnapInfo(snapInfoText("line mode only"));
    setStatus("Angle mode: click a point to calculate each connected ray angle to +X axis.");
    return;
  }

  if (mode === "delete") {
    setSnapInfo(snapInfoText("line mode only"));
    setStatus("Delete mode: click a point to remove it with its connected lines. Circle centre removes the circle.");
    return;
  }

  setSnapInfo(snapInfoText("line mode only"));
  setStatus("Select mode.");
}

function getNextId() {
  let maxId = 0;
  for (const shape of state.shapes) {
    const numericId = Number.parseFloat(String(shape.id));
    if (Number.isFinite(numericId)) {
      maxId = Math.max(maxId, Math.floor(numericId));
    }
  }
  return maxId + 1;
}

function cloneShapes(shapes) {
  return shapes.map((shape) => ({ ...shape }));
}

function pushUndoSnapshot() {
  state.actions.push(cloneShapes(state.shapes));
}

function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Number(value.toFixed(3)));
}

function shapeToMarkup(shape) {
  if (shape.type === "line") {
    return `line id=${shape.id} visible=1 x1=${formatNumber(shape.x1)} y1=${formatNumber(shape.y1)} x2=${formatNumber(shape.x2)} y2=${formatNumber(shape.y2)} color=${shape.color}`;
  }

  if (shape.type === "circle") {
    return `circle id=${shape.id} visible=1 cx=${formatNumber(shape.cx)} cy=${formatNumber(shape.cy)} r=${formatNumber(shape.r)} color=${shape.color}`;
  }

  if (shape.type === "point") {
    return `point id=${shape.id} visible=1 x=${formatNumber(shape.x)} y=${formatNumber(shape.y)} color=${shape.color}`;
  }

  if (shape.type === "label") {
    const rawText = String(shape.text || "Label");
    const safeText = /\s|"/.test(rawText) ? `"${rawText.replace(/([\\"])/g, "\\$1")}"` : rawText;
    return `label id=${shape.id} visible=1 type=text x=${formatNumber(shape.x)} y=${formatNumber(shape.y)} ang1=0 ang2=0 text=${safeText} color=${shape.color}`;
  }

  return "";
}

function parseMarkupKV(line) {
  const kv = {};
  const re = /(\w+)=("(?:[^"\\]|\\.)*"|\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    let v = m[2];
    if (v.startsWith('"')) v = v.slice(1, -1).replace(/\\([\\"]) /g, '$1');
    kv[m[1]] = v;
  }
  return kv;
}

function parseMarkupLine(raw) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) return null;
  const type = line.split(/\s+/)[0];
  const kv = parseMarkupKV(line);
  const color = kv.color || '#1a1a2e';
  const id = kv.id || '0';
  if (type === 'line') {
    const x1 = parseFloat(kv.x1), y1 = parseFloat(kv.y1), x2 = parseFloat(kv.x2), y2 = parseFloat(kv.y2);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) return null;
    return { type: 'line', id, x1, y1, x2, y2, color };
  }
  if (type === 'circle') {
    const cx = parseFloat(kv.cx), cy = parseFloat(kv.cy), r = parseFloat(kv.r);
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r < 1) return null;
    return { type: 'circle', id, cx, cy, r, color };
  }
  if (type === 'point') {
    const x = parseFloat(kv.x), y = parseFloat(kv.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { type: 'point', id, x, y, color };
  }
  if (type === 'label') {
    const x = parseFloat(kv.x), y = parseFloat(kv.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { type: 'label', id, x, y, text: kv.text || 'Label', color };
  }
  return null;
}

function rebuildMarkup() {
  if (state.markupFocused) return;
  markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
  if (state.mode !== "select") updateMarkupHighlight([]);
}

function clearCanvas() {
  ctx.clearRect(0, 0, state.logicalWidth, state.logicalHeight);
}

function drawGridLines() {
  const W = state.logicalWidth;
  const H = state.logicalHeight;
  const unit = state.gridUnit;
  const ox = Math.round(W / 2);
  const oy = Math.round(H / 2);

  ctx.save();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
  ctx.lineWidth = 1;

  for (let x = ox % unit; x <= W; x += unit) {
    if (x === ox) continue; // axis drawn by drawAxes
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = oy % unit; y <= H; y += unit) {
    if (y === oy) continue;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  ctx.restore();
}

function drawAxes() {
  const W = state.logicalWidth;
  const H = state.logicalHeight;
  const unit = state.gridUnit;
  const ox = Math.round(W / 2);
  const oy = Math.round(H / 2);

  ctx.save();
  ctx.font = "500 10px Inter, sans-serif";
  ctx.textBaseline = "middle";

  // ── axes ──
  ctx.strokeStyle = "rgba(12, 88, 82, 0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();

  // ── tick marks + numeric labels ──
  ctx.fillStyle = "rgba(12, 88, 82, 0.55)";
  ctx.strokeStyle = "rgba(12, 88, 82, 0.45)";
  ctx.lineWidth = 1;
  const tickLen = 5;
  const labelOffset = 14;

  ctx.textAlign = "center";
  for (let px = ox + unit; px <= W; px += unit) {
    const val = Math.round((px - ox) / unit);
    ctx.beginPath(); ctx.moveTo(px, oy - tickLen); ctx.lineTo(px, oy + tickLen); ctx.stroke();
    ctx.fillText(String(val), px, oy + labelOffset);
  }
  for (let px = ox - unit; px >= 0; px -= unit) {
    const val = Math.round((px - ox) / unit);
    ctx.beginPath(); ctx.moveTo(px, oy - tickLen); ctx.lineTo(px, oy + tickLen); ctx.stroke();
    ctx.fillText(String(val), px, oy + labelOffset);
  }

  ctx.textAlign = "right";
  for (let py = oy - unit; py >= 0; py -= unit) {
    const val = Math.round((oy - py) / unit);
    ctx.beginPath(); ctx.moveTo(ox - tickLen, py); ctx.lineTo(ox + tickLen, py); ctx.stroke();
    ctx.fillText(String(val), ox - labelOffset + 4, py);
  }
  for (let py = oy + unit; py <= H; py += unit) {
    const val = -Math.round((py - oy) / unit);
    ctx.beginPath(); ctx.moveTo(ox - tickLen, py); ctx.lineTo(ox + tickLen, py); ctx.stroke();
    ctx.fillText(String(val), ox - labelOffset + 4, py);
  }

  // ── axis name labels ──
  ctx.font = "700 12px Inter, sans-serif";
  ctx.fillStyle = "rgba(12, 88, 82, 0.7)";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("X", W - 18, oy - 6);
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("Y", ox + 6, 6);

  ctx.restore();
}

function drawShapes() {
  // selection glow pass — drawn first so it appears behind shapes
  if (state.selection.size > 0) {
    for (const shape of state.shapes) {
      if (!state.selection.has(shape)) continue;
      ctx.save();
      ctx.strokeStyle = "#22d3ee";
      ctx.fillStyle  = "#22d3ee";
      ctx.globalAlpha = 0.35;
      if (shape.type === "line") {
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(shape.x1, shape.y1); ctx.lineTo(shape.x2, shape.y2); ctx.stroke();
      } else if (shape.type === "circle") {
        ctx.lineWidth = 9;
        ctx.beginPath(); ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2); ctx.stroke();
      } else if (shape.type === "point") {
        ctx.beginPath(); ctx.arc(shape.x, shape.y, 10, 0, Math.PI * 2); ctx.fill();
      } else if (shape.type === "label") {
        ctx.font = "600 16px Inter, sans-serif";
        const w = ctx.measureText(String(shape.text || "Label")).width;
        ctx.fillRect(shape.x - 3, shape.y - 11, w + 6, 18);
      }
      ctx.restore();
    }
  }

  for (const shape of state.shapes) {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = 3;

    if (shape.type === "line") {
      ctx.beginPath();
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      ctx.stroke();
    } else if (shape.type === "circle") {
      ctx.beginPath();
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape.type === "point") {
      ctx.fillStyle = shape.color;
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape.type === "label") {
      ctx.fillStyle = shape.color;
      ctx.font = "600 16px Inter, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(shape.text || "Label"), shape.x, shape.y);
    }

    ctx.restore();
  }
}

function drawDraft(mousePoint) {
  if (!state.draftPoint) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "#b45309";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 5]);

  if (state.mode === "line") {
    ctx.beginPath();
    ctx.moveTo(state.draftPoint.x, state.draftPoint.y);
    ctx.lineTo(mousePoint.x, mousePoint.y);
    ctx.stroke();
  } else if (state.mode === "circle") {
    const dx = mousePoint.x - state.draftPoint.x;
    const dy = mousePoint.y - state.draftPoint.y;
    const radius = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    ctx.beginPath();
    ctx.arc(state.draftPoint.x, state.draftPoint.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSnapIndicator() {
  if (state.mode !== "line" || !state.hoverPoint) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = snapStrokeColor(state.hoverPoint.kind);
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(state.hoverPoint.x, state.hoverPoint.y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawArcDiffs(anchor, rays) {
  if (rays.length < 2) return;
  const n = rays.length;
  const DEG = Math.PI / 180;
  ctx.save();

  for (let i = 0; i < n; i++) {
    const r1 = rays[i];
    const r2 = rays[(i + 1) % n];
    const θ1 = r1.angle;
    // for the wrap-around gap compute the arc going CCW past 360
    const rawθ2 = i < n - 1 ? r2.angle : r2.angle + 360;
    const diff = rawθ2 - θ1;
    const midθ = θ1 + diff / 2;

    const d1 = Math.hypot(r1.to.x - anchor.x, r1.to.y - anchor.y);
    const d2 = Math.hypot(r2.to.x - anchor.x, r2.to.y - anchor.y);
    const arcR = Math.max(28, Math.min(d1, d2) * 0.28);

    // arc CCW from θ1 to rawθ2 (canvas: negate angles, counterclockwise=true)
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, arcR, -θ1 * DEG, -rawθ2 * DEG, true);
    ctx.strokeStyle = "#a78bfa";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // label at arc midpoint
    const lx = anchor.x + (arcR + 16) * Math.cos(midθ * DEG);
    const ly = anchor.y - (arcR + 16) * Math.sin(midθ * DEG);
    const label = `${Number(diff.toFixed(state.anglePrecision)) % 360}°`;
    ctx.font = "600 11px Inter, sans-serif";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(88, 28, 180, 0.82)";
    ctx.beginPath();
    ctx.roundRect(lx - tw / 2 - 4, ly - 9, tw + 8, 17, 3);
    ctx.fill();
    ctx.fillStyle = "#f5f3ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, lx, ly);
  }
  ctx.restore();
}

function drawAngleAnalysisOverlay() {
  if (!state.angleAnalysis) {
    return;
  }

  const { anchor, rays } = state.angleAnalysis;

  ctx.save();
  ctx.strokeStyle = "#22d3ee";
  ctx.fillStyle = "#06b6d4";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  for (const ray of rays) {
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(ray.to.x, ray.to.y);
    ctx.stroke();

    const tx = anchor.x + (ray.to.x - anchor.x) * 0.35;
    const ty = anchor.y + (ray.to.y - anchor.y) * 0.35;
    // store for click-to-edit hit-testing
    ray.labelX = tx + 4;
    ray.labelY = ty - 4;
    ctx.setLineDash([]);
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillText(`${formatNumber(ray.angle)} deg`, tx + 4, ty - 4);
    ctx.setLineDash([6, 4]);
  }

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 3, 0, Math.PI * 2);
  ctx.fill();
  if (state.showArcDiffs) drawArcDiffs(anchor, rays);
  ctx.restore();
}

function drawCoordHover(canvasPoint) {
  const ox = Math.round(state.logicalWidth / 2);
  const oy = Math.round(state.logicalHeight / 2);
  const mx = parseFloat(((canvasPoint.x - ox) / state.gridUnit).toFixed(2));
  const my = parseFloat(((oy - canvasPoint.y) / state.gridUnit).toFixed(2));
  const label = `(${mx}, ${my})`;
  const px = canvasPoint.x + 14;
  const py = canvasPoint.y - 10;
  ctx.save();
  ctx.font = "500 11px Inter, monospace";
  const w = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
  ctx.beginPath();
  ctx.roundRect(px - 4, py - 13, w + 10, 18, 4);
  ctx.fill();
  ctx.fillStyle = "#e2e8f0";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px + 1, py - 4);
  ctx.restore();
}

function render(mousePoint = null) {
  clearCanvas();
  if (state.showGrid) drawGridLines();
  drawAxes();
  drawShapes();
  drawAngleAnalysisOverlay();
  drawSnapIndicator();
  if (mousePoint && state.isDragging) {
    drawDraft(mousePoint);
  }
  if (state.showGrid && mousePoint) {
    drawCoordHover(mousePoint);
  }
}

function angleFromXAxisDegrees(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let angle = (Math.atan2(-dy, dx) * 180) / Math.PI;
  if (angle < 0) {
    angle += 360;
  }
  return Number(angle.toFixed(state.anglePrecision)) % 360;
}

function findNearestExistingPoint(point, radius) {
  let nearest = null;
  let best = radius;

  for (const shape of state.shapes) {
    if (shape.type !== "point") {
      continue;
    }

    const candidate = { x: shape.x, y: shape.y };
    const d = distance(point, candidate);
    if (d <= best) {
      best = d;
      nearest = candidate;
    }
  }

  return nearest;
}

function collectRaysFromPoint(anchor) {
  const rays = [];

  for (const shape of state.shapes) {
    if (shape.type !== "line") {
      continue;
    }

    const a = { x: shape.x1, y: shape.y1 };
    const b = { x: shape.x2, y: shape.y2 };

    if (pointMatches(anchor, a) && !pointMatches(anchor, b)) {
      rays.push({ to: b });
      continue;
    }

    if (pointMatches(anchor, b) && !pointMatches(anchor, a)) {
      rays.push({ to: a });
      continue;
    }

    if (pointOnSegment(anchor, a, b) && !pointMatches(anchor, a) && !pointMatches(anchor, b)) {
      rays.push({ to: a });
      rays.push({ to: b });
    }
  }

  const normalized = [];
  for (const ray of rays) {
    const angle = angleFromXAxisDegrees(anchor, ray.to);
    if (!normalized.some((r) => Math.abs(r.angle - angle) < 1e-6)) {
      normalized.push({ to: ray.to, angle });
    }
  }

  normalized.sort((a, b) => a.angle - b.angle);
  return normalized;
}

function analyzePointAnglesAt(rawPoint) {
  const anchor = findNearestExistingPoint(rawPoint, 14);
  if (!anchor) {
    state.angleAnalysis = null;
    render();
    setStatus("Angle mode: click closer to an existing point.", true);
    return;
  }

  const rays = collectRaysFromPoint(anchor);
  state.angleAnalysis = { anchor, rays };
  render();

  if (rays.length === 0) {
    setStatus(`No connected rays found at point (${anchor.x}, ${anchor.y}).`, true);
    return;
  }

  const values = rays.map((ray) => `${formatNumber(ray.angle)} deg`).join(", ");
  setStatus(`Angles to +X at point (${anchor.x}, ${anchor.y}): ${values}`);
}

function deleteAtPoint(rawPoint) {
  const target = findNearestExistingPoint(rawPoint, 14);

  // check if click is on a circle perimeter or label when no point is near
  if (!target) {
    const HIT = 10;
    const hitCircle = state.shapes.find((s) => {
      if (s.type !== "circle") return false;
      const d = Math.sqrt((rawPoint.x - s.cx) ** 2 + (rawPoint.y - s.cy) ** 2);
      return Math.abs(d - s.r) <= HIT;
    });
    if (hitCircle) {
      pushUndoSnapshot();
      state.shapes = state.shapes.filter((s) => {
        if (s === hitCircle) return false;
        // remove the centre point that belongs to this circle
        if (s.type === "point" && pointMatches({ x: s.x, y: s.y }, { x: hitCircle.cx, y: hitCircle.cy })) return false;
        return true;
      });
      rebuildMarkup();
      markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
      render();
      setStatus(`Deleted circle id=${hitCircle.id}.`);
      return;
    }
    const hitLabel = state.shapes.find((s) => {
      if (s.type !== "label") return false;
      return Math.sqrt((rawPoint.x - s.x) ** 2 + (rawPoint.y - s.y) ** 2) <= 20;
    });
    if (hitLabel) {
      pushUndoSnapshot();
      state.shapes = state.shapes.filter((s) => s !== hitLabel);
      rebuildMarkup();
      markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
      render();
      setStatus(`Deleted label "${hitLabel.text}".`);
      return;
    }
    setStatus("Delete mode: click closer to a point, circle, or label.", true);
    return;
  }

  pushUndoSnapshot();
  const before = state.shapes.length;
  state.shapes = state.shapes.filter((shape) => {
    if (shape.type === "point" && pointMatches({ x: shape.x, y: shape.y }, target)) return false;
    if (shape.type === "line") {
      const a = pointMatches({ x: shape.x1, y: shape.y1 }, target);
      const b = pointMatches({ x: shape.x2, y: shape.y2 }, target);
      if (a || b) return false;
    }
    // remove circle if target is its centre
    if (shape.type === "circle" && pointMatches({ x: shape.cx, y: shape.cy }, target)) return false;
    return true;
  });
  const removed = before - state.shapes.length;
  rebuildMarkup();
  markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
  render();
  setStatus(`Deleted point at (${target.x}, ${target.y}) and ${removed - 1} connected shape(s).`);
}

function toCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const xScale = state.logicalWidth / rect.width;
  const yScale = state.logicalHeight / rect.height;

  return {
    x: Math.round((event.clientX - rect.left) * xScale),
    y: Math.round((event.clientY - rect.top) * yScale)
  };
}

// snaps a canvas-pixel point to the nearest grid intersection
function applyGridSnap(point) {
  if (!state.snapToGrid || !state.showGrid) return point;
  const ox = Math.round(state.logicalWidth / 2);
  const oy = Math.round(state.logicalHeight / 2);
  return {
    x: ox + Math.round((point.x - ox) / state.gridUnit) * state.gridUnit,
    y: oy + Math.round((point.y - oy) / state.gridUnit) * state.gridUnit
  };
}

function toDrawPoint(event) {
  return applyGridSnap(toCanvasPoint(event));
}

function shapeBaseId(id) {
  return String(id).split(".")[0];
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function findShapeAtPoint(p) {
  const HIT_PT = 10, HIT_LINE = 7, HIT_LABEL = 22;
  for (const s of state.shapes)
    if (s.type === "point" && Math.hypot(p.x - s.x, p.y - s.y) <= HIT_PT) return s;
  for (const s of state.shapes)
    if (s.type === "label" && Math.hypot(p.x - s.x, p.y - s.y) <= HIT_LABEL) return s;
  for (const s of state.shapes)
    if (s.type === "line" && distToSegment(p.x, p.y, s.x1, s.y1, s.x2, s.y2) <= HIT_LINE) return s;
  for (const s of state.shapes)
    if (s.type === "circle" && Math.abs(Math.hypot(p.x - s.cx, p.y - s.cy) - s.r) <= HIT_LINE) return s;
  return null;
}

const markupHighlightLayer = document.getElementById("markupHighlightLayer");

function updateMarkupHighlight(selectedLineIndices) {
  const lines = markupOutput.value.split("\n");
  const idxSet = new Set(selectedLineIndices);
  markupHighlightLayer.innerHTML = lines
    .map((line, i) => {
      const escaped = line.replace(/&/g,"&amp;").replace(/</g,"&lt;");
      if (idxSet.has(i)) return `<div class="markup-hl-row">${escaped || " "}</div>`;
      return `<div>${escaped || " "}</div>`;
    })
    .join("");
  // keep highlight layer scrolled in sync
  markupHighlightLayer.scrollTop = markupOutput.scrollTop;
}

markupOutput.addEventListener("scroll", () => {
  markupHighlightLayer.scrollTop = markupOutput.scrollTop;
});

function highlightMarkupForShapes(shapes, { scroll = true } = {}) {
  const text = markupOutput.value;
  const lines = text.split("\n");
  // exact match — avoids false positives when multiple shapes share type+id
  const exactLines = new Set([...shapes].map(s => shapeToMarkup(s)).filter(Boolean));
  let selStart = -1, selEnd = -1, pos = 0;
  const hlRows = [];
  for (let i = 0; i < lines.length; i++) {
    if (exactLines.has(lines[i])) {
      if (selStart === -1) selStart = pos;
      selEnd = pos + lines[i].length;
      hlRows.push(i);
    }
    pos += lines[i].length + 1;
  }
  updateMarkupHighlight(hlRows);
  if (scroll && selStart !== -1) {
    markupOutput.focus({ preventScroll: true });
    markupOutput.setSelectionRange(selStart, selEnd);
    const lineH = markupOutput.scrollHeight / Math.max(1, lines.length);
    markupOutput.scrollTop = Math.max(0, (hlRows[0] || 0) * lineH - 40);
    markupHighlightLayer.scrollTop = markupOutput.scrollTop;
  }
}

function shapesConnectedTo(seeds) {
  const visited = new Set(seeds);
  const queue = [...seeds];
  const endpointsOf = (s) => {
    if (s.type === "line")   return [{x:s.x1,y:s.y1},{x:s.x2,y:s.y2}];
    if (s.type === "point")  return [{x:s.x,y:s.y}];
    if (s.type === "circle") return [{x:s.cx,y:s.cy}];
    return [];
  };
  while (queue.length) {
    const cur = queue.shift();
    const pts = endpointsOf(cur);
    for (const other of state.shapes) {
      if (visited.has(other)) continue;
      if (endpointsOf(other).some(op => pts.some(cp => pointMatches(cp, op)))) {
        visited.add(other);
        queue.push(other);
      }
    }
  }
  return visited;
}

// ── multi-click selection state ──
let _selClickCount = 0;
let _selClickTimer  = null;
let _selHitShape    = null;

function applySelectClick(hit) {
  if (!hit) {
    _selClickCount = 0;
    _selHitShape = null;
    state.selection.clear();
    updateMarkupHighlight([]);
    render();
    return;
  }

  // same shape group → expand; different shape → restart
  const sameBid = _selHitShape && shapeBaseId(hit.id) === shapeBaseId(_selHitShape.id);
  if (sameBid) {
    _selClickCount = Math.min(_selClickCount + 1, 4);
  } else {
    _selClickCount = 1;
    _selHitShape = hit;
  }

  clearTimeout(_selClickTimer);
  _selClickTimer = setTimeout(() => { _selClickCount = 0; _selHitShape = null; }, 450);

  const bid = shapeBaseId(hit.id);
  let selected;

  if (_selClickCount === 1) {
    // level 1: exact shape only
    selected = new Set([hit]);
    setStatus(`Selected ${hit.type} id=${hit.id}. Double-click to expand.`);
  } else if (_selClickCount === 2) {
    // level 2: all shapes with same base ID (full drawn stroke)
    selected = new Set(state.shapes.filter(s => shapeBaseId(s.id) === bid));
    setStatus(`Selected all segments of id=${bid}. Click again to expand to connected shapes.`);
  } else if (_selClickCount === 3) {
    // level 3: connected component through shared points
    const l2 = new Set(state.shapes.filter(s => shapeBaseId(s.id) === bid));
    selected = shapesConnectedTo(l2);
    setStatus(`Selected connected component (${selected.size} shapes). Click again to select all.`);
  } else {
    // level 4: everything
    selected = new Set(state.shapes);
    setStatus(`All ${selected.size} shapes selected.`);
  }

  state.selection = selected;
  highlightMarkupForShapes(selected);
  render();
}

// ── angle label inline editor ──

function labelToViewport(canvasX, canvasY) {
  const rect = canvas.getBoundingClientRect();
  const xScale = rect.width / state.logicalWidth;
  const yScale = rect.height / state.logicalHeight;
  return {
    x: rect.left + canvasX * xScale,
    y: rect.top + canvasY * yScale
  };
}

function hideAngleEditor() {
  angleEditorEl.style.display = "none";
  angleEditorEl._ray = null;
}

function commitAngleEdit() {
  const ray = angleEditorEl._ray;
  if (!ray || !state.angleAnalysis) {
    hideAngleEditor();
    return;
  }
  const rawVal = parseFloat(angleEditorEl.value);
  hideAngleEditor();
  if (!Number.isFinite(rawVal)) return;
  const newAngle = ((rawVal % 360) + 360) % 360;
  const { anchor } = state.angleAnalysis;
  const oldTo = ray.to;
  const dx = oldTo.x - anchor.x;
  const dy = oldTo.y - anchor.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const rad = (newAngle * Math.PI) / 180;
  const newTo = {
    x: Math.round(anchor.x + dist * Math.cos(rad)),
    y: Math.round(anchor.y + dist * Math.sin(rad))
  };
  pushUndoSnapshot();

  // count how many line endpoints sit at oldTo BEFORE we modify anything
  const oldToRefs = state.shapes.reduce((n, s) => {
    if (s.type !== "line") return n;
    if (pointMatches({ x: s.x1, y: s.y1 }, oldTo)) n++;
    if (pointMatches({ x: s.x2, y: s.y2 }, oldTo)) n++;
    return n;
  }, 0);
  const isShared = oldToRefs > 1; // another line also ends at oldTo

  for (const shape of state.shapes) {
    if (shape.type === "line") {
      const aMatch = pointMatches({ x: shape.x1, y: shape.y1 }, anchor) && pointMatches({ x: shape.x2, y: shape.y2 }, oldTo);
      const bMatch = pointMatches({ x: shape.x2, y: shape.y2 }, anchor) && pointMatches({ x: shape.x1, y: shape.y1 }, oldTo);
      if (aMatch) { shape.x2 = newTo.x; shape.y2 = newTo.y; }
      else if (bMatch) { shape.x1 = newTo.x; shape.y1 = newTo.y; }
    } else if (!isShared && shape.type === "point" && pointMatches({ x: shape.x, y: shape.y }, oldTo)) {
      // safe to move: no other line references this point
      shape.x = newTo.x;
      shape.y = newTo.y;
    }
  }

  // shared endpoint: keep original point, add a new one at the rotated position
  if (isShared) {
    state.shapes.push({ type: "point", id: getNextId(), x: newTo.x, y: newTo.y, color: state.color });
  }
  rebuildMarkup();
  // force markup sync regardless of focus state after angle edit
  markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
  analyzePointAnglesAt(anchor);
}

function tryOpenAngleEditor(event, canvasPoint) {
  if (!state.angleAnalysis) return false;
  const { rays } = state.angleAnalysis;
  const rect = canvas.getBoundingClientRect();
  const screenScale = rect.width / state.logicalWidth; // logical → screen px
  const HIT_SCREEN = 32; // hit radius in screen pixels
  for (const ray of rays) {
    if (ray.labelX === undefined) continue;
    const screenLX = rect.left + ray.labelX * screenScale;
    const screenLY = rect.top + ray.labelY * (rect.height / state.logicalHeight);
    const d = Math.sqrt((event.clientX - screenLX) ** 2 + (event.clientY - screenLY) ** 2);
    if (d <= HIT_SCREEN) {
      event.preventDefault();
      angleEditorEl.style.left = `${screenLX}px`;
      angleEditorEl.style.top = `${screenLY}px`;
      angleEditorEl.style.display = "block";
      angleEditorEl.value = formatNumber(ray.angle);
      angleEditorEl._ray = ray;
      // defer focus so mousedown finishes before we steal it
      requestAnimationFrame(() => { angleEditorEl.focus(); angleEditorEl.select(); });
      return true;
    }
  }
  return false;
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

function nearlyEqual(a, b, epsilon = 1e-6) {
  return Math.abs(a - b) <= epsilon;
}

function pointMatches(a, b, epsilon = 1e-6) {
  return nearlyEqual(a.x, b.x, epsilon) && nearlyEqual(a.y, b.y, epsilon);
}

function pointOnSegment(point, a, b, epsilon = 1e-6) {
  const apx = point.x - a.x;
  const apy = point.y - a.y;
  const abx = b.x - a.x;
  const aby = b.y - a.y;

  const crossValue = cross(apx, apy, abx, aby);
  if (Math.abs(crossValue) > epsilon) {
    return false;
  }

  const dot = apx * abx + apy * aby;
  if (dot < -epsilon) {
    return false;
  }

  const len2 = abx * abx + aby * aby;
  if (dot - len2 > epsilon) {
    return false;
  }

  return true;
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function closestPointOnSegment(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (nearlyEqual(len2, 0)) {
    return { x: a.x, y: a.y };
  }

  let t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return {
    x: a.x + t * dx,
    y: a.y + t * dy
  };
}

function closestPointOnCircle(point, circle) {
  const dx = point.x - circle.cx;
  const dy = point.y - circle.cy;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (nearlyEqual(d, 0)) {
    return {
      x: circle.cx + circle.r,
      y: circle.cy
    };
  }

  const scale = circle.r / d;
  return {
    x: circle.cx + dx * scale,
    y: circle.cy + dy * scale
  };
}

function oppositePointOnCircle(point, circle) {
  return {
    x: circle.cx * 2 - point.x,
    y: circle.cy * 2 - point.y
  };
}

function findNearestSnapTarget(point, radius) {
  let nearest = null;
  let best = radius;

  for (const shape of state.shapes) {
    if (shape.type === "point" && (state.snapKindFilter === "any" || state.snapKindFilter === "point")) {
      const candidate = { x: shape.x, y: shape.y, kind: "point" };
      const d = distance(point, candidate);
      if (d <= best) {
        best = d;
        nearest = candidate;
      }
    }

    if (shape.type === "line" && (state.snapKindFilter === "any" || state.snapKindFilter === "line")) {
      const candidate = closestPointOnSegment(point, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
      const d = distance(point, candidate);
      if (d <= best) {
        best = d;
        nearest = {
          x: candidate.x,
          y: candidate.y,
          kind: "line"
        };
      }
    }

    if (shape.type === "circle" && (state.snapKindFilter === "any" || state.snapKindFilter === "circle")) {
      const candidate = closestPointOnCircle(point, { cx: shape.cx, cy: shape.cy, r: shape.r });
      const d = distance(point, candidate);
      if (d <= best) {
        best = d;
        nearest = {
          x: candidate.x,
          y: candidate.y,
          kind: "circle",
          circle: { cx: shape.cx, cy: shape.cy, r: shape.r }
        };
      }
    }
  }

  return nearest;
}

function findNearestCircleSnapTarget(point, radius) {
  let nearest = null;
  let best = radius;

  for (const shape of state.shapes) {
    if (shape.type !== "circle") {
      continue;
    }

    const candidate = closestPointOnCircle(point, { cx: shape.cx, cy: shape.cy, r: shape.r });
    const d = distance(point, candidate);
    if (d <= best) {
      best = d;
      nearest = {
        x: candidate.x,
        y: candidate.y,
        kind: "circle",
        circle: { cx: shape.cx, cy: shape.cy, r: shape.r }
      };
    }
  }

  return nearest;
}

function segmentIntersectionPoint(a1, a2, b1, b2) {
  const rX = a2.x - a1.x;
  const rY = a2.y - a1.y;
  const sX = b2.x - b1.x;
  const sY = b2.y - b1.y;
  const rxs = cross(rX, rY, sX, sY);

  if (nearlyEqual(rxs, 0)) {
    return null;
  }

  const qpx = b1.x - a1.x;
  const qpy = b1.y - a1.y;
  const t = cross(qpx, qpy, sX, sY) / rxs;
  const u = cross(qpx, qpy, rX, rY) / rxs;

  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null;
  }

  return {
    x: a1.x + t * rX,
    y: a1.y + t * rY
  };
}

function applySnapFromLastPointer(shiftPressed) {
  if (state.mode !== "line") {
    return;
  }

  if (state.lineDrawMode === "diameter") {
    if (shiftPressed) {
      state.hoverPoint = null;
      setSnapInfo(snapInfoText("off (Shift)"));
      render(state.lastPointerPoint || null);
      return;
    }

    if (!state.lastPointerPoint) {
      setSnapInfo(snapInfoText("target: none"));
      return;
    }

    state.hoverPoint = findNearestCircleSnapTarget(state.lastPointerPoint, state.snapRadius);
    if (state.hoverPoint) {
      setSnapInfo(snapInfoText("target: circle"));
    } else {
      setSnapInfo(snapInfoText("target: none"));
    }

    if (state.isDragging && state.draftPoint && state.pendingDiameterCircle) {
      state.draftCurrentPoint = oppositePointOnCircle(state.draftPoint, state.pendingDiameterCircle);
    }
    render(state.lastPointerPoint);
    return;
  }

  if (shiftPressed) {
    state.hoverPoint = null;
    setSnapInfo(snapInfoText("off (Shift)"));
    if (state.isDragging && state.lastPointerPoint) {
      state.draftCurrentPoint = applyLineAxisConstraint(state.draftPoint, state.lastPointerPoint);
      render(state.lastPointerPoint);
      return;
    }
    render();
    return;
  }

  if (!state.lastPointerPoint) {
    setSnapInfo(snapInfoText("target: none"));
    return;
  }

  state.hoverPoint = findNearestSnapTarget(state.lastPointerPoint, state.snapRadius);
  if (state.hoverPoint) {
    setSnapInfo(snapInfoText(`target: ${kindLabel(state.hoverPoint.kind)}`));
  } else {
    setSnapInfo(snapInfoText("target: none"));
  }

  if (state.isDragging) {
    state.draftCurrentPoint = applyLineAxisConstraint(state.draftPoint, state.hoverPoint || state.lastPointerPoint);
    render(state.draftCurrentPoint);
    return;
  }

  render();
}

function segmentCircleIntersections(start, end, circle) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const fx = start.x - circle.cx;
  const fy = start.y - circle.cy;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - circle.r * circle.r;

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0 || nearlyEqual(a, 0)) {
    return [];
  }

  const hits = [];
  const sqrtDisc = Math.sqrt(Math.max(0, discriminant));
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  for (const t of [t1, t2]) {
    if (t < 0 || t > 1) {
      continue;
    }

    const point = {
      x: start.x + t * dx,
      y: start.y + t * dy
    };

    if (!hits.some((p) => pointMatches(p, point))) {
      hits.push(point);
    }
  }

  return hits;
}

function circleCircleIntersections(c1, c2) {
  const dx = c2.cx - c1.cx;
  const dy = c2.cy - c1.cy;
  const d = Math.sqrt(dx * dx + dy * dy);

  if (nearlyEqual(d, 0) && nearlyEqual(c1.r, c2.r)) {
    return [];
  }

  if (d > c1.r + c2.r || d < Math.abs(c1.r - c2.r) || nearlyEqual(d, 0)) {
    return [];
  }

  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h2 = c1.r * c1.r - a * a;
  if (h2 < 0) {
    return [];
  }

  const h = Math.sqrt(Math.max(0, h2));
  const xm = c1.cx + (a * dx) / d;
  const ym = c1.cy + (a * dy) / d;

  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;

  const p1 = { x: xm + rx, y: ym + ry };
  const p2 = { x: xm - rx, y: ym - ry };

  if (pointMatches(p1, p2)) {
    return [p1];
  }

  return [p1, p2];
}

function collectLineIntersections(start, end) {
  const points = [];
  const hitsByLineIndex = new Map();

  for (let lineIndex = 0; lineIndex < state.shapes.length; lineIndex += 1) {
    const line = state.shapes[lineIndex];
    if (line.type !== "line") {
      continue;
    }

    const hit = segmentIntersectionPoint(
      start,
      end,
      { x: line.x1, y: line.y1 },
      { x: line.x2, y: line.y2 }
    );

    if (!hit) {
      continue;
    }

    const onLineStart = pointMatches(hit, { x: line.x1, y: line.y1 });
    const onLineEnd = pointMatches(hit, { x: line.x2, y: line.y2 });
    const touchesNewEndpoint = pointMatches(hit, start) || pointMatches(hit, end);

    if (!touchesNewEndpoint) {
      const duplicate = points.some((p) => pointMatches(hit, p));
      if (duplicate) {
        // Keep splitting info even if the intersection coordinate is already in points list.
      } else {
        points.push(hit);
      }
    }

    if (!onLineStart && !onLineEnd) {
      const list = hitsByLineIndex.get(lineIndex) || [];
      if (!list.some((p) => pointMatches(p, hit))) {
        list.push(hit);
        hitsByLineIndex.set(lineIndex, list);
      }
    }
  }

  for (const shape of state.shapes) {
    if (shape.type !== "circle") {
      continue;
    }

    const hits = segmentCircleIntersections(start, end, {
      cx: shape.cx,
      cy: shape.cy,
      r: shape.r
    });

    for (const hit of hits) {
      if (pointMatches(hit, start) || pointMatches(hit, end)) {
        continue;
      }

      if (!points.some((p) => pointMatches(p, hit))) {
        points.push(hit);
      }
    }
  }

  // If a new line endpoint lands on a line interior (for example by snap), split that line too.
  for (let lineIndex = 0; lineIndex < state.shapes.length; lineIndex += 1) {
    const line = state.shapes[lineIndex];
    if (line.type !== "line") {
      continue;
    }

    const a = { x: line.x1, y: line.y1 };
    const b = { x: line.x2, y: line.y2 };

    for (const endpoint of [start, end]) {
      if (!pointOnSegment(endpoint, a, b)) {
        continue;
      }

      const onLineStart = pointMatches(endpoint, a);
      const onLineEnd = pointMatches(endpoint, b);
      if (onLineStart || onLineEnd) {
        continue;
      }

      const list = hitsByLineIndex.get(lineIndex) || [];
      if (!list.some((p) => pointMatches(p, endpoint))) {
        list.push({ x: endpoint.x, y: endpoint.y });
        hitsByLineIndex.set(lineIndex, list);
      }
    }
  }

  return {
    points,
    hitsByLineIndex
  };
}

function collectCircleIntersections(circle) {
  const points = [];
  const hitsByLineIndex = new Map();

  for (let lineIndex = 0; lineIndex < state.shapes.length; lineIndex += 1) {
    const shape = state.shapes[lineIndex];
    if (shape.type !== "line") {
      continue;
    }

    const hits = segmentCircleIntersections(
      { x: shape.x1, y: shape.y1 },
      { x: shape.x2, y: shape.y2 },
      circle
    );

    if (hits.length === 0) {
      continue;
    }

    const splitPoints = [];
    for (const hit of hits) {
      if (!points.some((p) => pointMatches(p, hit))) {
        points.push(hit);
      }

      const onStart = pointMatches(hit, { x: shape.x1, y: shape.y1 });
      const onEnd = pointMatches(hit, { x: shape.x2, y: shape.y2 });
      if (!onStart && !onEnd && !splitPoints.some((p) => pointMatches(p, hit))) {
        splitPoints.push(hit);
      }
    }

    if (splitPoints.length > 0) {
      hitsByLineIndex.set(lineIndex, splitPoints);
    }
  }

  for (const shape of state.shapes) {
    if (shape.type !== "circle") {
      continue;
    }

    const hits = circleCircleIntersections(circle, {
      cx: shape.cx,
      cy: shape.cy,
      r: shape.r
    });

    for (const hit of hits) {
      if (!points.some((p) => pointMatches(p, hit))) {
        points.push(hit);
      }
    }
  }

  return {
    points,
    hitsByLineIndex
  };
}

function lineParameter(start, end, point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denom = dx * dx + dy * dy;
  if (denom <= 0) {
    return 0;
  }

  return ((point.x - start.x) * dx + (point.y - start.y) * dy) / denom;
}

function buildRaySegments(start, end, intersections) {
  const splitPoints = [start, ...intersections, end].slice();
  splitPoints.sort((a, b) => lineParameter(start, end, a) - lineParameter(start, end, b));

  const segments = [];
  for (let i = 0; i < splitPoints.length - 1; i += 1) {
    const a = splitPoints[i];
    const b = splitPoints[i + 1];

    if (pointMatches(a, b)) {
      continue;
    }

    segments.push({
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y
    });
  }

  return segments;
}

function splitExistingLines(hitsByLineIndex) {
  if (hitsByLineIndex.size === 0) {
    return;
  }

  const nextShapes = [];

  for (let i = 0; i < state.shapes.length; i += 1) {
    const shape = state.shapes[i];
    if (shape.type !== "line" || !hitsByLineIndex.has(i)) {
      nextShapes.push(shape);
      continue;
    }

    const splitPoints = hitsByLineIndex.get(i) || [];
    const segments = buildRaySegments(
      { x: shape.x1, y: shape.y1 },
      { x: shape.x2, y: shape.y2 },
      splitPoints
    );

    if (segments.length <= 1) {
      nextShapes.push(shape);
      continue;
    }

    for (let s = 0; s < segments.length; s += 1) {
      const seg = segments[s];
      nextShapes.push({
        type: "line",
        id: `${shape.id}.${s + 1}`,
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2,
        color: shape.color
      });
    }
  }

  state.shapes = nextShapes;
}

function hasPointShape(point) {
  return state.shapes.some((shape) => shape.type === "point" && pointMatches(point, { x: shape.x, y: shape.y }));
}

// shared core used by addLine and AI batch processing (no undo push, no render)
function addLineCore(start, end, color, forcedSplits = []) {
  const id = getNextId();
  const intersectionInfo = collectLineIntersections(start, end);
  const intersectionPoints = [...intersectionInfo.points, ...forcedSplits];
  splitExistingLines(intersectionInfo.hitsByLineIndex);
  const segments = buildRaySegments(start, end, intersectionPoints);
  const addedIntersectionPoints = intersectionPoints.filter((p) => !hasPointShape(p));
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segId = segments.length > 1 ? `${id}.${i + 1}` : id;
    state.shapes.push({ type: "line", id: segId, x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, color });
  }
  state.shapes.push({ type: "point", id, x: start.x, y: start.y, color });
  state.shapes.push({ type: "point", id, x: end.x, y: end.y, color });
  for (const p of addedIntersectionPoints) {
    state.shapes.push({ type: "point", id, x: p.x, y: p.y, color });
  }
}

function scaleShapesAboutOrigin(factor) {
  const ox = Math.round(state.logicalWidth / 2);
  const oy = Math.round(state.logicalHeight / 2);
  pushUndoSnapshot();
  for (const shape of state.shapes) {
    if (shape.type === "line") {
      shape.x1 = Math.round(ox + (shape.x1 - ox) * factor);
      shape.y1 = Math.round(oy + (shape.y1 - oy) * factor);
      shape.x2 = Math.round(ox + (shape.x2 - ox) * factor);
      shape.y2 = Math.round(oy + (shape.y2 - oy) * factor);
    } else if (shape.type === "circle") {
      shape.cx = Math.round(ox + (shape.cx - ox) * factor);
      shape.cy = Math.round(oy + (shape.cy - oy) * factor);
      shape.r  = Math.round(shape.r * factor);
    } else if (shape.type === "point" || shape.type === "label") {
      shape.x = Math.round(ox + (shape.x - ox) * factor);
      shape.y = Math.round(oy + (shape.y - oy) * factor);
    }
  }
  markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
}

function addCircleCore(cx, cy, r, color) {
  if (r < 1) return;
  const intersectionInfo = collectCircleIntersections({ cx, cy, r });
  splitExistingLines(intersectionInfo.hitsByLineIndex);
  const addedIntersectionPoints = intersectionInfo.points.filter((p) => !hasPointShape(p));
  const id = getNextId();
  state.shapes.push({ type: "circle", id, cx, cy, r, color });
  state.shapes.push({ type: "point", id, x: cx, y: cy, color });
  for (const p of addedIntersectionPoints) {
    state.shapes.push({ type: "point", id, x: p.x, y: p.y, color });
  }
}

function addLine(start, end, forcedSplits = []) {
  pushUndoSnapshot();

  const id = getNextId();
  const intersectionInfo = collectLineIntersections(start, end);
  const intersectionPoints = [...intersectionInfo.points, ...forcedSplits];
  splitExistingLines(intersectionInfo.hitsByLineIndex);
  const segments = buildRaySegments(start, end, intersectionPoints);
  const addedIntersectionPoints = intersectionPoints.filter((p) => !hasPointShape(p));

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    const segId = segments.length > 1 ? `${id}.${i + 1}` : id;

    state.shapes.push({
      type: "line",
      id: segId,
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      color: state.color
    });
  }
  state.shapes.push({
    type: "point",
    id,
    x: start.x,
    y: start.y,
    color: state.color
  });
  state.shapes.push({
    type: "point",
    id,
    x: end.x,
    y: end.y,
    color: state.color
  });
  for (const p of intersectionPoints) {
    if (addedIntersectionPoints.some((q) => pointMatches(q, p))) {
      state.shapes.push({
        type: "point",
        id,
        x: p.x,
        y: p.y,
        color: state.color
      });
    }
  }
  rebuildMarkup();
  render();
  if (addedIntersectionPoints.length > 0) {
    setStatus(`Added ${segments.length} ray segment(s) for line id=${id}, split existing crossings, and created ${addedIntersectionPoints.length} intersection point(s).`);
    return;
  }

  if (intersectionPoints.length > 0) {
    setStatus(`Added ${segments.length} ray segment(s) for line id=${id} and split intersected existing line(s).`);
    return;
  }

  setStatus(`Added line id=${id} with start/end points.`);
}

function addCircle(center, edge) {
  const dx = edge.x - center.x;
  const dy = edge.y - center.y;
  const r = Math.round(Math.sqrt(dx * dx + dy * dy));
  if (r < 1) {
    setStatus("Circle radius must be at least 1.", true);
    return;
  }

  pushUndoSnapshot();

  const intersectionInfo = collectCircleIntersections({
    cx: center.x,
    cy: center.y,
    r
  });
  splitExistingLines(intersectionInfo.hitsByLineIndex);
  const addedIntersectionPoints = intersectionInfo.points.filter((p) => !hasPointShape(p));

  const id = getNextId();
  state.shapes.push({
    type: "circle",
    id,
    cx: center.x,
    cy: center.y,
    r,
    color: state.color
  });
  state.shapes.push({
      type: "point",
      id,
    x: center.x,
    y: center.y,
    color: state.color
  });
  for (const p of addedIntersectionPoints) {
    state.shapes.push({
      type: "point",
      id,
      x: p.x,
      y: p.y,
      color: state.color
    });
  }
  rebuildMarkup();
  render();

  if (addedIntersectionPoints.length > 0) {
    setStatus(`Added circle id=${id} and ${addedIntersectionPoints.length} circle intersection point(s).`);
    return;
  }

  if (intersectionInfo.points.length > 0) {
    setStatus(`Added circle id=${id} and split crossed line(s).`);
    return;
  }

  setStatus(`Added circle id=${id} with center point.`);
}

function addLabel(point) {
  const text = (window.prompt("Label text:", "Label") || "").trim();
  if (!text) {
    setStatus("Label canceled.");
    return;
  }

  pushUndoSnapshot();
  const id = getNextId();
  state.shapes.push({
    type: "label",
    id,
    x: point.x,
    y: point.y,
    text,
    color: state.color
  });
  rebuildMarkup();
  render();
  setStatus(`Added label id=${id}.`);
}

canvas.addEventListener("mousemove", (event) => {
  const point = toDrawPoint(event);

  if (state.isDragging) {
    let currentPoint = point;
    if (state.mode === "line" && state.lineDrawMode === "diameter") {
      if (state.pendingDiameterCircle && state.draftPoint) {
        const perimeterPoint = closestPointOnCircle(point, state.pendingDiameterCircle);
        state.draftPoint = perimeterPoint;
        currentPoint = oppositePointOnCircle(perimeterPoint, state.pendingDiameterCircle);
        state.hoverPoint = perimeterPoint;
        setSnapInfo(snapInfoText("target: circle"));
      } else {
        state.hoverPoint = null;
        setSnapInfo(snapInfoText("target: none"));
      }
    } else if (state.mode === "line" && !event.shiftKey) {
      const nearest = findNearestSnapTarget(point, state.snapRadius);
      if (nearest) {
        state.hoverPoint = nearest;
        currentPoint = nearest;
        setSnapInfo(snapInfoText(`target: ${kindLabel(nearest.kind)}`));
      } else {
        state.hoverPoint = null;
        setSnapInfo(snapInfoText("target: none"));
      }
    } else {
      state.hoverPoint = null;
      if (state.mode === "line" && event.shiftKey) {
        setSnapInfo(snapInfoText("off (Shift)"));
      }
    }

    if (state.mode === "line" && state.lineDrawMode !== "diameter") {
      currentPoint = applyLineAxisConstraint(state.draftPoint, currentPoint);
    }

    state.draftCurrentPoint = currentPoint;
    render(currentPoint);
    return;
  }

  if (state.mode === "line" && state.lineDrawMode === "diameter") {
    if (event.shiftKey) {
      state.hoverPoint = null;
      setSnapInfo(snapInfoText("off (Shift)"));
    } else {
      state.hoverPoint = findNearestCircleSnapTarget(point, state.snapRadius);
      if (state.hoverPoint) {
        setSnapInfo(snapInfoText("target: circle"));
      } else {
        setSnapInfo(snapInfoText("target: none"));
      }
    }
  } else if (state.mode === "line" && !event.shiftKey) {
    state.hoverPoint = findNearestSnapTarget(point, state.snapRadius);
    if (state.hoverPoint) {
      setSnapInfo(snapInfoText(`target: ${kindLabel(state.hoverPoint.kind)}`));
    } else {
      setSnapInfo(snapInfoText("target: none"));
    }
  } else {
    state.hoverPoint = null;
    if (state.mode === "line" && event.shiftKey) {
      setSnapInfo(snapInfoText("off (Shift)"));
    }
  }

  render(point);
});

canvas.addEventListener("mouseleave", () => {
  state.hoverPoint = null;
  if (state.mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
  }
  if (!state.isDragging) {
    render();
  }
});

canvas.addEventListener("mousedown", (event) => {
  if (state.mode === "select") {
    applySelectClick(findShapeAtPoint(toCanvasPoint(event)));
    return;
  }

  if (state.mode === "label") {
    const point = toDrawPoint(event);
    return;
  }

  if (state.mode === "angle") {
    if (tryOpenAngleEditor(event, toCanvasPoint(event))) return;
    analyzePointAnglesAt(toCanvasPoint(event));
    return;
  }

  if (state.mode === "delete") {
    deleteAtPoint(toCanvasPoint(event));
    return;
  }

  state.isDragging = true;
  state.hoverPoint = null;
  state.pendingDiameterCircle = null;
  const rawStart = toDrawPoint(event);
  state.lastPointerPoint = rawStart;
  let startPoint = rawStart;
  let snapped = false;

  if (state.mode === "line" && state.lineDrawMode === "diameter") {
    if (!event.shiftKey) {
      const nearestCircle = findNearestCircleSnapTarget(rawStart, state.snapRadius);
      if (nearestCircle) {
        startPoint = nearestCircle;
        state.pendingDiameterCircle = nearestCircle.circle;
        snapped = true;
      }
    }

    if (!state.pendingDiameterCircle && !event.shiftKey) {
      const nearest = findNearestSnapTarget(rawStart, state.snapRadius);
      if (nearest) {
        startPoint = nearest;
        snapped = true;
      }
    }
  } else if (state.mode === "line" && !event.shiftKey) {
    const nearest = findNearestSnapTarget(rawStart, state.snapRadius);
    if (nearest) {
      startPoint = nearest;
      snapped = true;
    }
  }

  state.draftPoint = startPoint;
  state.draftCurrentPoint = state.draftPoint;

  if (state.mode === "line") {
    if (snapped) {
      setSnapInfo(snapInfoText(`target: ${kindLabel(startPoint.kind)}`));
      if (state.lineDrawMode === "diameter") {
        if (state.pendingDiameterCircle) {
          setStatus(`Diameter mode: snapped to circle at (${state.draftPoint.x}, ${state.draftPoint.y}). Release to draw opposite diameter endpoint.`);
        } else {
          setStatus(`Diameter mode: no circle start snap, drawing normal line from (${state.draftPoint.x}, ${state.draftPoint.y}).`);
        }
      } else {
        setStatus(`Snapped start to target (${state.draftPoint.x}, ${state.draftPoint.y}). Drag and release.`);
      }
    } else {
      setSnapInfo(event.shiftKey ? snapInfoText("off (Shift)") : snapInfoText("target: none"));
      setStatus(`Drag line from (${state.draftPoint.x}, ${state.draftPoint.y}) and release.${event.shiftKey ? " (snap off)" : ""}`);
    }
  } else {
    setStatus(`Drag circle radius from (${state.draftPoint.x}, ${state.draftPoint.y}) and release.`);
  }

  render(state.draftCurrentPoint);
});

canvas.addEventListener("mouseup", (event) => {
  if (!state.isDragging || !state.draftPoint || state.mode === "select") {
    return;
  }

  const start = state.draftPoint;
  const rawEnd = toDrawPoint(event);
  let end = rawEnd;
  const diameterCircle = state.pendingDiameterCircle;

  if (state.mode === "line" && state.lineDrawMode === "diameter" && diameterCircle) {
    end = oppositePointOnCircle(start, diameterCircle);
  } else if (state.mode === "line" && !event.shiftKey) {
    const nearest = findNearestSnapTarget(rawEnd, state.snapRadius);
    if (nearest) {
      end = nearest;
    }
  }

  if (state.mode === "line" && state.lineDrawMode !== "diameter") {
    end = applyLineAxisConstraint(start, end);
  }

  state.isDragging = false;
  state.draftPoint = null;
  state.draftCurrentPoint = null;
  state.pendingDiameterCircle = null;
  state.hoverPoint = null;
  if (state.mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
  }

  if (state.mode === "line") {
    // split diameter at circle centre so it becomes two rays
    const splits = (state.lineDrawMode === "diameter" && diameterCircle)
      ? [{ x: diameterCircle.cx, y: diameterCircle.cy }]
      : [];
    addLine(start, end, splits);
  } else {
    addCircle(start, end);
  }
});

selectBtn.addEventListener("click", () => setMode("select"));
lineBtn.addEventListener("click", () => setMode("line"));
circleBtn.addEventListener("click", () => setMode("circle"));
labelBtn.addEventListener("click", () => setMode("label"));
angleBtn.addEventListener("click", () => setMode("angle"));
deleteBtn.addEventListener("click", () => setMode("delete"));

undoBtn.addEventListener("click", () => {
  state.draftPoint = null;
  state.draftCurrentPoint = null;
  state.isDragging = false;
  const snapshot = state.actions.pop();
  if (!snapshot) {
    setStatus("Nothing to undo.");
    return;
  }

  state.shapes = cloneShapes(snapshot);
  rebuildMarkup();
  render();
  setStatus("Removed last shape.");
});

clearBtn.addEventListener("click", () => {
  if (state.shapes.length > 0) {
    pushUndoSnapshot();
  }

  state.shapes = [];
  state.draftPoint = null;
  state.draftCurrentPoint = null;
  state.pendingDiameterCircle = null;
  state.isDragging = false;
  state.hoverPoint = null;
  state.angleAnalysis = null;
  state.selection.clear();
  updateMarkupHighlight([]);
  if (state.mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
  }
  rebuildMarkup();
  render();
  setStatus("Canvas cleared.");
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(markupOutput.value || "");
    setStatus("Markup copied to clipboard.");
  } catch (error) {
    setStatus("Clipboard copy failed. Select text manually.", true);
  }
});

if (colorPickerEl) {
  colorPickerEl.addEventListener("input", (event) => {
    setDrawingColor(event.target.value);
  });
}

for (const button of quickColorButtons) {
  button.addEventListener("click", () => {
    setDrawingColor(button.getAttribute("data-color"));
  });
}

window.addEventListener("resize", () => {
  resizeCanvasToFit();
});

window.addEventListener("mouseup", () => {
  if (!state.isDragging) {
    return;
  }

  state.isDragging = false;
  state.draftPoint = null;
  state.draftCurrentPoint = null;
  state.pendingDiameterCircle = null;
  state.hoverPoint = null;
  if (state.mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
  }
  render();
  setStatus("Drag canceled.");
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (event.key === "Shift") {
    if (state.mode !== "line") {
      return;
    }

    state.hoverPoint = null;
    setSnapInfo(snapInfoText("off (Shift)"));
    if (state.isDragging && state.lastPointerPoint) {
      state.draftCurrentPoint = applyLineAxisConstraint(state.draftPoint, state.lastPointerPoint);
      render(state.draftCurrentPoint);
      return;
    }

    render();
    return;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (key === "d") {
    state.lineDrawMode = state.lineDrawMode === "diameter" ? "normal" : "diameter";
    if (state.mode === "line") {
      state.draftPoint = null;
      state.draftCurrentPoint = null;
      state.pendingDiameterCircle = null;
      state.isDragging = false;
      applySnapFromLastPointer(event.shiftKey);
    }
    setStatus(`Line draw mode set to ${lineDrawModeLabel()} (shortcut D).`);
    render();
    return;
  }

  if (key === "g") {
    state.showGrid = !state.showGrid;
    render();
    setStatus(`Grid lines ${state.showGrid ? "shown" : "hidden"} (G).`);
    return;
  }

  if (key === "s") {
    state.snapToGrid = !state.snapToGrid;
    setStatus(`Grid snap ${state.snapToGrid ? "on — clicks snap to grid intersections" : "off"} (S).`);
    return;
  }

  if (key === "<" || key === ">") {
    state.anglePrecision = Math.min(3, Math.max(0,
      state.anglePrecision + (key === ">" ? 1 : -1)
    ));
    if (state.angleAnalysis) analyzePointAnglesAt(state.angleAnalysis.anchor);
    setStatus(`Angle precision: ${state.anglePrecision} decimal place${state.anglePrecision !== 1 ? "s" : ""} (< / >).`);
    return;
  }

  if (key === "0") {
    state.showArcDiffs = !state.showArcDiffs;
    if (state.angleAnalysis) render();
    setStatus(`Arc differences ${state.showArcDiffs ? "on" : "off"} (0).`);
    return;
  }

  if (key === "x" || key === "z") {
    const factor = key === "x" ? 1.25 : 1 / 1.25;
    state.gridUnit = Math.round(Math.min(300, Math.max(15, state.gridUnit * factor)));
    if (event.shiftKey && state.shapes.length > 0) {
      scaleShapesAboutOrigin(factor);
    }
    const W = state.logicalWidth;
    const H = state.logicalHeight;
    const unitsX = (W / 2 / state.gridUnit).toFixed(1);
    const unitsY = (H / 2 / state.gridUnit).toFixed(1);
    render();
    setStatus(`Zoom: 1 unit = ${state.gridUnit}px | visible range ±${unitsX} x ±${unitsY} (${key.toUpperCase()}).`);
    return;
  }

  if (key === "h" || key === "v") {
    const nextConstraint = key === "h" ? "horizontal" : "vertical";
    state.lineAxisConstraint = state.lineAxisConstraint === nextConstraint ? "none" : nextConstraint;
    if (state.mode === "line") {
      applySnapFromLastPointer(event.shiftKey);
    }
    setStatus(`Line constraint set to ${lineAxisConstraintLabel()} (shortcut ${key.toUpperCase()}).`);
    return;
  }

  if (key !== "p" && key !== "l" && key !== "c" && key !== "a") {
    return;
  }

  state.snapKindFilter =
    key === "p" ? "point" : key === "l" ? "line" : key === "c" ? "circle" : "any";
  applySnapFromLastPointer(event.shiftKey);
  setStatus(`Snap mode set to ${snapModeLabel()} (shortcut ${key.toUpperCase()}).`);
});

window.addEventListener("keyup", (event) => {
  if (event.key !== "Shift" || state.mode !== "line") {
    return;
  }

  applySnapFromLastPointer(false);
});

angleEditorEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); commitAngleEdit(); }
  if (e.key === "Escape") { e.preventDefault(); hideAngleEditor(); }
});

let _markupTimer = null;
markupOutput.addEventListener("focus", () => { state.markupFocused = true; });
markupOutput.addEventListener("blur", () => {
  state.markupFocused = false;
  // sync canvas → markup on blur so it's tidy
  markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
});
markupOutput.addEventListener("input", () => {
  clearTimeout(_markupTimer);
  _markupTimer = setTimeout(() => {
    const parsed = markupOutput.value.split("\n").map(parseMarkupLine).filter(Boolean);
    pushUndoSnapshot();
    state.shapes = parsed;
    state.angleAnalysis = null;
    render();
  }, 350);
});
// commit on click-away
canvas.addEventListener("mousedown", () => {
  if (angleEditorEl.style.display !== "none") commitAngleEdit();
}, true); // capture phase so it runs before the main handler

setMode("select");
rebuildMarkup();
syncColorUi();
resizeCanvasToFit();

// ── AI Draw ──
const aiPromptEl = document.getElementById("aiPrompt");
const aiSendBtn  = document.getElementById("aiSendBtn");
const aiStatusEl = document.getElementById("aiStatus");
const aiAppendEl = document.getElementById("aiAppend");
const markupLoadBtn = document.getElementById("markupLoadBtn");
const markupSaveBtn = document.getElementById("markupSaveBtn");

function setAiStatus(msg, type = "") {
  aiStatusEl.textContent = msg;
  aiStatusEl.className = `ai-status ${type}`;
}

async function runAiDraw() {
  const prompt = aiPromptEl.value.trim();
  if (!prompt) { setAiStatus("Enter a description first.", "error"); return; }
  aiSendBtn.disabled = true;
  setAiStatus("Generating…");
  try {
    const res = await fetch("/api/ai-markup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, gridUnit: state.gridUnit })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || "Server error");

    // strip any markdown code fences the model might add
    const clean = data.markup.replace(/```[^\n]*\n?/g, "").trim();
    const incoming = clean.split("\n").map(parseMarkupLine).filter(Boolean);

    pushUndoSnapshot();
    if (!aiAppendEl.checked) state.shapes = [];

    for (const shape of incoming) {
      if (shape.type === "line") {
        addLineCore({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }, shape.color);
      } else if (shape.type === "circle") {
        addCircleCore(shape.cx, shape.cy, shape.r, shape.color);
      } else if (shape.type === "label") {
        state.shapes.push(shape);
      }
      // skip bare point shapes — lines/circles generate their own
    }

    markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
    render();
    setAiStatus(`Done — ${clean.split("\n").filter(Boolean).length} shape(s) added.`, "ok");
  } catch (err) {
    setAiStatus(`Error: ${err.message}`, "error");
  } finally {
    aiSendBtn.disabled = false;
  }
}

aiSendBtn.addEventListener("click", runAiDraw);
aiPromptEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runAiDraw();
});

markupSaveBtn.addEventListener("click", () => {
  const blob = new Blob([markupOutput.value], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "markup.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});

function syncMarkupCursorToCanvas() {
  if (state.mode !== "select") return;
  const text = markupOutput.value;
  const lines = text.split("\n");
  const start = markupOutput.selectionStart;
  const end   = markupOutput.selectionEnd;

  let pos = 0, firstLine = 0, lastLine = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = pos + lines[i].length;
    if (pos <= start && start <= lineEnd) firstLine = i;
    if (pos <= end   && end   <= lineEnd) lastLine  = i;
    pos += lines[i].length + 1;
  }

  // parse exact markup lines in selection → match shapes by full string comparison
  const coveredMarkup = new Set();
  for (let i = firstLine; i <= lastLine; i++) coveredMarkup.add(lines[i]);

  if (coveredMarkup.size === 0) {
    state.selection.clear();
    updateMarkupHighlight([]);
    render();
    return;
  }

  // find shapes whose markup exactly matches a selected line
  state.selection = new Set(
    state.shapes.filter(s => coveredMarkup.has(shapeToMarkup(s)))
  );

  const hlRows = [];
  pos = 0;
  for (let i = 0; i < lines.length; i++) {
    if (coveredMarkup.has(lines[i]) && lines[i].trim()) hlRows.push(i);
    pos += lines[i].length + 1;
  }
  updateMarkupHighlight(hlRows);
  render();
}

markupOutput.addEventListener("click",   syncMarkupCursorToCanvas);
markupOutput.addEventListener("keyup",   syncMarkupCursorToCanvas);
markupOutput.addEventListener("mouseup", syncMarkupCursorToCanvas);

const markupFloatBtn = document.getElementById("markupFloatBtn");
const markupCard     = markupFloatBtn.closest(".markup-card");

markupFloatBtn.addEventListener("click", () => {
  const floating = markupCard.classList.toggle("is-floating");
  markupFloatBtn.textContent = floating ? "⊠" : "↗";
  markupFloatBtn.title = floating ? "Dock" : "Float";
  if (floating) {
    const r = markupCard.getBoundingClientRect();
    markupCard.style.left   = `${r.left}px`;
    markupCard.style.top    = `${r.top}px`;
    markupCard.style.width  = `${r.width}px`;
    markupCard.style.height = `${r.height}px`;
  } else {
    markupCard.style.cssText = "";
  }
});

// drag + 4-corner resize for the floating markup card
(function () {
  let action = null; // { type: 'drag'|'resize', corner, startX, startY, startL, startT, startW, startH }

  const titleEl = markupCard.querySelector(".card-title");

  function startAction(e, type, corner = null) {
    if (!markupCard.classList.contains("is-floating")) return;
    if (type === "drag" && e.target.tagName === "BUTTON") return;
    const r = markupCard.getBoundingClientRect();
    action = { type, corner, startX: e.clientX, startY: e.clientY,
               startL: r.left, startT: r.top, startW: r.width, startH: r.height };
    e.preventDefault();
  }

  titleEl.addEventListener("mousedown", (e) => startAction(e, "drag"));

  for (const handle of markupCard.querySelectorAll(".resize-handle")) {
    const corner = [...handle.classList].find(c => c.startsWith("resize-") && c !== "resize-handle").replace("resize-", "");
    handle.addEventListener("mousedown", (e) => { startAction(e, "resize", corner); e.stopPropagation(); });
  }

  document.addEventListener("mousemove", (e) => {
    if (!action) return;
    const dx = e.clientX - action.startX, dy = e.clientY - action.startY;
    if (action.type === "drag") {
      markupCard.style.left = `${action.startL + dx}px`;
      markupCard.style.top  = `${action.startT + dy}px`;
      return;
    }
    const c = action.corner;
    const minW = 260, minH = 180;
    let l = action.startL, t = action.startT, w = action.startW, h = action.startH;
    if (c === "br") { w = Math.max(minW, w + dx); h = Math.max(minH, h + dy); }
    if (c === "bl") { const nw = Math.max(minW, w - dx); l = action.startL + (w - nw); w = nw; h = Math.max(minH, h + dy); }
    if (c === "tr") { w = Math.max(minW, w + dx); const nh = Math.max(minH, h - dy); t = action.startT + (h - nh); h = nh; }
    if (c === "tl") { const nw = Math.max(minW, w - dx); l = action.startL + (w - nw); w = nw; const nh = Math.max(minH, h - dy); t = action.startT + (h - nh); h = nh; }
    markupCard.style.left   = `${l}px`;
    markupCard.style.top    = `${t}px`;
    markupCard.style.width  = `${w}px`;
    markupCard.style.height = `${h}px`;
  });

  document.addEventListener("mouseup", () => { action = null; });
}());

markupLoadBtn.addEventListener("click", () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      markupOutput.value = text;
      const parsed = text.split("\n").map(parseMarkupLine).filter(Boolean);
      pushUndoSnapshot();
      state.shapes = parsed;
      state.angleAnalysis = null;
      render();
    };
    reader.readAsText(file);
  };
  input.click();
});
