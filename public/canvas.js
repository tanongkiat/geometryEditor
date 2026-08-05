const canvas = document.getElementById("drawCanvas");
const markupOutput = document.getElementById("markupOutput");
const statusEl = document.getElementById("status");
const selectBtn = document.getElementById("selectBtn");
const lineBtn = document.getElementById("lineBtn");
const circleBtn = document.getElementById("circleBtn");
const labelBtn = document.getElementById("labelBtn");
const angleBtn = document.getElementById("angleBtn");
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
  gridUnit: 50
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

  selectBtn.classList.toggle("is-active", mode === "select");
  lineBtn.classList.toggle("is-active", mode === "line");
  circleBtn.classList.toggle("is-active", mode === "circle");
  labelBtn.classList.toggle("is-active", mode === "label");
  angleBtn.classList.toggle("is-active", mode === "angle");

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

function rebuildMarkup() {
  markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
}

function clearCanvas() {
  ctx.clearRect(0, 0, state.logicalWidth, state.logicalHeight);
}

function drawGrid() {
  const W = state.logicalWidth;
  const H = state.logicalHeight;
  const unit = state.gridUnit;          // pixels per 1 unit
  const ox = Math.round(W / 2);        // origin X (canvas centre)
  const oy = Math.round(H / 2);        // origin Y (canvas centre)

  ctx.save();
  ctx.font = "500 10px Inter, sans-serif";
  ctx.textBaseline = "middle";

  // ── minor grid lines (every unit) ──
  ctx.strokeStyle = "rgba(12, 88, 82, 0.07)";
  ctx.lineWidth = 0.75;
  for (let x = ox % unit; x <= W; x += unit) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = oy % unit; y <= H; y += unit) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  // ── axes ──
  ctx.strokeStyle = "rgba(12, 88, 82, 0.45)";
  ctx.lineWidth = 1.5;
  // X axis
  ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke();
  // Y axis
  ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke();

  // ── tick marks + numeric labels ──
  ctx.fillStyle = "rgba(12, 88, 82, 0.55)";
  ctx.strokeStyle = "rgba(12, 88, 82, 0.45)";
  ctx.lineWidth = 1;

  const tickLen = 5;
  const labelOffset = 14;

  // X-axis ticks
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

  // Y-axis ticks (canvas Y is flipped: up = negative canvas-y)
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
  ctx.restore();
}

function render(mousePoint = null) {
  clearCanvas();
  drawGrid();
  drawShapes();
  drawAngleAnalysisOverlay();
  drawSnapIndicator();
  if (mousePoint && state.isDragging) {
    drawDraft(mousePoint);
  }
}

function angleFromXAxisDegrees(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) {
    angle += 360;
  }
  return Number(angle.toFixed(3));
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

function toCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const xScale = state.logicalWidth / rect.width;
  const yScale = state.logicalHeight / rect.height;

  return {
    x: Math.round((event.clientX - rect.left) * xScale),
    y: Math.round((event.clientY - rect.top) * yScale)
  };
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
  const point = toCanvasPoint(event);
  state.lastPointerPoint = point;

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

  render();
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
    return;
  }

  if (state.mode === "label") {
    const point = toCanvasPoint(event);
    addLabel(point);
    return;
  }

  if (state.mode === "angle") {
    analyzePointAnglesAt(toCanvasPoint(event));
    return;
  }

  state.isDragging = true;
  state.hoverPoint = null;
  state.pendingDiameterCircle = null;
  const rawStart = toCanvasPoint(event);
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
  const rawEnd = toCanvasPoint(event);
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

setMode("select");
rebuildMarkup();
syncColorUi();
resizeCanvasToFit();
