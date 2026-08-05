const canvas = document.getElementById("drawCanvas");
const angleEditorEl = document.getElementById("angleEditor");
const markupOutput = document.getElementById("markupOutput");
const statusEl = document.getElementById("status");
const selectBtn = document.getElementById("selectBtn");
const lineBtn = document.getElementById("lineBtn");
const pointBtn = document.getElementById("pointBtn");
const circleBtn = document.getElementById("circleBtn");
const parabolaBtn = document.getElementById("parabolaBtn");
const labelBtn = document.getElementById("labelBtn");
const angleBtn = document.getElementById("angleBtn");
const deleteBtn = document.getElementById("deleteBtn");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
const copyBtn = document.getElementById("copyBtn");
const rebuildVerticesBtn = document.getElementById("rebuildVerticesBtn");
const removeVerticesBtn = document.getElementById("removeVerticesBtn");
const moveBtn = document.getElementById("moveBtn");
const snapInfoEl = document.getElementById("snapInfo");
const equationLegendEl = document.getElementById("equationLegend");
const equationLegendTitleEl = document.getElementById("equationLegendTitle");
const equationLegendTextEl = document.getElementById("equationLegendText");
const equationLegendEditorEl = document.getElementById("equationLegendEditor");
const solverLegendEl = document.getElementById("solverLegend");
const verticesLinesBtn = document.getElementById("verticesLinesBtn");
const allVerticesAnglesBtn = document.getElementById("allVerticesAnglesBtn");
const colorPickerEl = document.getElementById("colorPicker");
const colorHexEl = document.getElementById("colorHex");
const quickColorButtons = Array.from(document.querySelectorAll(".quick-color-btn"));
const topLegendDetailsEls = Array.from(document.querySelectorAll("details.top-legend, details.top-shortcuts"));

let equationEditTimer = null;

if (equationLegendEditorEl) {
  equationLegendEditorEl.addEventListener("input", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.matches("input[data-equation-field]")) {
      scheduleEquationEditApply();
    }
  });

  equationLegendEditorEl.addEventListener("change", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.matches("input[data-equation-field]")) {
      scheduleEquationEditApply();
    }
  });
}

if (equationLegendTextEl) {
  equationLegendTextEl.addEventListener("click", () => {
    const editable = getEditableSelectionGroup();
    if (!editable) {
      return;
    }

    state.equationEditMode = true;
    updateEquationLegend();

    requestAnimationFrame(() => {
      const firstInput = equationLegendEditorEl?.querySelector("input[data-equation-field]");
      if (firstInput instanceof HTMLInputElement) {
        firstInput.focus();
        firstInput.select();
      }
    });
  });
}

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
  showArcDiffs: false,
  showVertexLines: false,
  showAllVertexAngles: false,
  equationEditMode: false,
  parabolaDrafting: false,
  parabolaStage: null,
  parabolaVertexPoint: null,
  referenceImage: null,
  imageCirclePick: null,
  imageDebugOverlay: null,
  showImageDebugOverlay: true,
  moveDragPoint: null,
  moveDidChange: false
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

function closeTopLegendsOnOutsideClick(event) {
  if (topLegendDetailsEls.length === 0) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Node)) {
    return;
  }

  const clickedInsideLegend = topLegendDetailsEls.some((legend) => legend.contains(target));
  if (clickedInsideLegend) {
    return;
  }

  for (const legend of topLegendDetailsEls) {
    if (legend.open) {
      legend.open = false;
    }
  }
}

function syncSolverUi() {
  if (!verticesLinesBtn || !allVerticesAnglesBtn) {
    return;
  }

  verticesLinesBtn.classList.toggle("is-active", state.showVertexLines);
  verticesLinesBtn.textContent = state.showVertexLines ? "On" : "Off";
  allVerticesAnglesBtn.classList.toggle("is-active", state.showAllVertexAngles);
  allVerticesAnglesBtn.textContent = state.showAllVertexAngles ? "On" : "Off";
  if (solverLegendEl && (state.showVertexLines || state.showAllVertexAngles)) {
    solverLegendEl.open = true;
  }
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

function toggleVertexLines() {
  state.showVertexLines = !state.showVertexLines;
  syncSolverUi();
  render(state.lastPointerPoint);
  setStatus(`Vertices lines ${state.showVertexLines ? "on" : "off"}.`);
}

function toggleAllVertexAngles() {
  state.showAllVertexAngles = !state.showAllVertexAngles;
  syncSolverUi();
  render(state.lastPointerPoint);
  setStatus(`All vertices angles ${state.showAllVertexAngles ? "on" : "off"}.`);
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

function mathToCanvasPoint(point) {
  const ox = Math.round(state.logicalWidth / 2);
  const oy = Math.round(state.logicalHeight / 2);
  return {
    x: Math.round(ox + point.x * state.gridUnit),
    y: Math.round(oy - point.y * state.gridUnit)
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
  state.parabolaDrafting = false;
  state.parabolaStage = null;
  state.parabolaVertexPoint = null;
  state.moveDragPoint = null;
  state.moveDidChange = false;
  state.equationEditMode = false;
  if (mode !== "select" && mode !== "move") state.selection.clear();
  updateEquationLegend();

  selectBtn.classList.toggle("is-active", mode === "select");
  moveBtn.classList.toggle("is-active", mode === "move");
  lineBtn.classList.toggle("is-active", mode === "line");
  pointBtn.classList.toggle("is-active", mode === "point");
  circleBtn.classList.toggle("is-active", mode === "circle");
  parabolaBtn.classList.toggle("is-active", mode === "parabola");
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

  if (mode === "parabola") {
    setSnapInfo(snapInfoText("vertex / axis focus / curve"));
    setStatus("Parabola mode: press and drag the lowest point first, release, then drag the C point and press again to finish.");
    return;
  }

  if (mode === "point") {
    setSnapInfo(snapInfoText("point / line / circle"));
    setStatus("Point mode: click to place a point. Snap stays active unless Shift is held.");
    return;
  }

  if (mode === "move") {
    setSnapInfo(snapInfoText("selected geometry"));
    setStatus(state.selection.size > 0
      ? "Move mode: drag the selected geometry to reposition it."
      : "Move mode: select geometry first, then drag it to reposition.");
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

function hasSimilarCircleShape(candidate, tolerance = 8) {
  for (const shape of state.shapes) {
    if (shape.type !== "circle") {
      continue;
    }

    const centerDistance = Math.hypot(shape.cx - candidate.cx, shape.cy - candidate.cy);
    const radiusDelta = Math.abs(shape.r - candidate.r);
    if (centerDistance <= tolerance && radiusDelta <= tolerance) {
      return true;
    }
  }

  return false;
}

function tryImportCircleFromImageClick(canvasPoint) {
  const pick = state.imageCirclePick;
  if (!pick || !Array.isArray(pick.circles) || pick.circles.length === 0) {
    return false;
  }

  const mathPoint = canvasToMathPoint(canvasPoint);
  const detectX = pick.transform.imageCenterX + (mathPoint.x / pick.transform.unitsPerPixel);
  const detectY = pick.transform.imageCenterY - (mathPoint.y / pick.transform.unitsPerPixel);

  if (detectX < 0 || detectY < 0 || detectX >= pick.detectWidth || detectY >= pick.detectHeight) {
    setStatus("Click inside the reference geometry region.", true);
    return true;
  }

  const dx = Math.round(detectX);
  const dy = Math.round(detectY);
  const idx = dy * pick.detectWidth + dx;
  const isDark = pick.mask[idx] === 1 || pick.gray[idx] < pick.threshold;
  if (!isDark) {
    setStatus("Clicked pixel is not dark geometry. Try on the circle stroke.", true);
    return true;
  }

  let best = null;
  let bestScore = Infinity;
  for (const circle of pick.circles) {
    const distCenter = Math.hypot(detectX - circle.detectCx, detectY - circle.detectCy);
    const edgeError = Math.abs(distCenter - circle.detectR);
    const edgeTolerance = Math.max(6, circle.detectR * 0.28);
    const centerTolerance = Math.max(5, circle.detectR * 0.34);

    if (edgeError <= edgeTolerance || distCenter <= centerTolerance) {
      if (edgeError < bestScore) {
        bestScore = edgeError;
        best = circle;
      }
    }
  }

  if (!best) {
    setStatus("Dark pixel found, but no detected circle at that location.", true);
    return true;
  }

  if (hasSimilarCircleShape(best)) {
    setStatus("That detected circle is already on canvas.");
    return true;
  }

  pushUndoSnapshot();
  addCircleCore(best.cx, best.cy, best.r, state.color);
  removeDuplicatePointShapes();
  rebuildMarkup();
  render();

  setStatus(`Added detected circle at (${best.cx}, ${best.cy}) with r=${best.r}.`);
  return true;
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

function formatAngle(value) {
  return String(Number(value.toFixed(state.anglePrecision)) % 360);
}

function formatMathNumber(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Math.abs(value) < 1e-9 ? 0 : value;
  return String(Number(rounded.toFixed(2)));
}

function canvasToMathPoint(point) {
  const ox = Math.round(state.logicalWidth / 2);
  const oy = Math.round(state.logicalHeight / 2);
  return {
    x: Number(((point.x - ox) / state.gridUnit).toFixed(2)),
    y: Number(((oy - point.y) / state.gridUnit).toFixed(2))
  };
}

function formatSignedTerm(value, symbol) {
  if (nearlyEqual(value, 0)) {
    return `${symbol}`;
  }

  return value > 0
    ? `${symbol} - ${formatMathNumber(value)}`
    : `${symbol} + ${formatMathNumber(Math.abs(value))}`;
}

function formatDirectionTerm(symbol, value, positiveDirection) {
  if (nearlyEqual(value, 0)) {
    return symbol;
  }

  const formattedValue = formatMathNumber(Math.abs(value));
  if (positiveDirection) {
    return value > 0 ? `${symbol} - ${formattedValue}` : `${symbol} + ${formattedValue}`;
  }

  return value > 0 ? `${formattedValue} - ${symbol}` : `(${formatMathNumber(value)}) - ${symbol}`;
}

function lineEquation(shape) {
  const p1 = canvasToMathPoint({ x: shape.x1, y: shape.y1 });
  const p2 = canvasToMathPoint({ x: shape.x2, y: shape.y2 });
  if (nearlyEqual(p1.x, p2.x)) {
    return `x = ${formatMathNumber(p1.x)}`;
  }

  const slope = (p2.y - p1.y) / (p2.x - p1.x);
  const intercept = p1.y - slope * p1.x;
  if (nearlyEqual(slope, 0)) {
    return `y = ${formatMathNumber(p1.y)}`;
  }

  const m = formatMathNumber(slope);
  if (nearlyEqual(intercept, 0)) {
    return `y = ${m}x`;
  }

  const sign = intercept > 0 ? "+" : "-";
  return `y = ${m}x ${sign} ${formatMathNumber(Math.abs(intercept))}`;
}

function circleEquation(shape) {
  const center = canvasToMathPoint({ x: shape.cx, y: shape.cy });
  const radius = Number((shape.r / state.gridUnit).toFixed(2));
  return `(${formatSignedTerm(center.x, "x")})^2 + (${formatSignedTerm(center.y, "y")})^2 = ${formatMathNumber(radius)}^2`;
}

function pointEquation(shape) {
  const point = canvasToMathPoint(shape);
  return `(${formatMathNumber(point.x)}, ${formatMathNumber(point.y)})`;
}

function parabolaEquation(shape) {
  const basis = parabolaBasis(shape);

  if (!basis) {
    return "Parabola needs a distinct focus point.";
  }

  const vertex = canvasToMathPoint({ x: shape.vx, y: shape.vy });
  const A = formatMathNumber((4 * basis.p) / state.gridUnit);
  const B = vertex.x * basis.ux + vertex.y * basis.uy;
  const perpendicular = [
    formatRotatedTerm(-basis.uy, "x"),
    formatRotatedTerm(basis.ux, "y")
  ].filter(Boolean).join(" + ").replace(/\+ -/g, "- ");
  const parallel = [
    formatRotatedTerm(basis.ux, "x"),
    formatRotatedTerm(basis.uy, "y")
  ].filter(Boolean).join(" + ").replace(/\+ -/g, "- ");

  return `(${perpendicular})^2 = ${A}(${formatShiftedExpression(parallel, B)})`;
}

function formatRotatedTerm(coefficient, expression) {
  if (nearlyEqual(coefficient, 0)) {
    return "";
  }

  const sign = coefficient < 0 ? "-" : "";
  const magnitude = nearlyEqual(Math.abs(coefficient), 1) ? "" : formatMathNumber(Math.abs(coefficient));
  return `${sign}${magnitude}${expression}`;
}

function labelEquation(shape) {
  return String(shape.text || "Label");
}

function describeShapeEquation(shape) {
  if (shape.type === "line") {
    return `Line ${shape.id}: ${lineEquation(shape)}`;
  }

  if (shape.type === "circle") {
    return `Circle ${shape.id}: ${circleEquation(shape)}`;
  }

  if (shape.type === "point") {
    return `Point ${shape.id}: ${pointEquation(shape)}`;
  }

  if (shape.type === "parabola") {
    return `Parabola ${shape.id}: ${parabolaEquation(shape)}`;
  }

  if (shape.type === "label") {
    return `Label ${shape.id}: ${labelEquation(shape)}`;
  }

  return "";
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatEquationLegendHtml(text) {
  return escapeHtml(text)
    .replace(/\^(-?\d+(?:\.\d+)?)/g, "<sup>$1</sup>")
    .replace(/\n/g, "<br>");
}

function formatShiftedExpression(expression, value) {
  if (nearlyEqual(value, 0)) {
    return expression;
  }

  return value > 0 ? `${expression} - ${formatMathNumber(value)}` : `${expression} + ${formatMathNumber(Math.abs(value))}`;
}

function updateEquationLegend() {
  if (!equationLegendEl || !equationLegendTitleEl || !equationLegendTextEl) {
    return;
  }

  if (state.mode !== "select") {
    equationLegendTitleEl.textContent = "Selection equation";
    equationLegendTextEl.textContent = "Switch to Select mode to inspect equations from the canvas.";
    if (equationLegendEditorEl) equationLegendEditorEl.innerHTML = "";
    equationLegendTextEl.classList.remove("is-clickable");
    state.equationEditMode = false;
    return;
  }

  const selectedShapes = Array.from(state.selection);
  if (selectedShapes.length === 0) {
    equationLegendTitleEl.textContent = "Selection equation";
    equationLegendTextEl.textContent = "Select a line, circle, point, or label to see its equation here.";
    if (equationLegendEditorEl) equationLegendEditorEl.innerHTML = "";
    equationLegendTextEl.classList.remove("is-clickable");
    state.equationEditMode = false;
    return;
  }

  if (selectedShapes.some((shape) => shape.type === "line" || shape.type === "circle" || shape.type === "parabola")) {
    equationLegendEl.open = true;
  }

  const editable = getEditableSelectionGroup();
  const displayShapes = editable ? [editable.shape] : selectedShapes;
  const formulas = displayShapes
    .map(describeShapeEquation)
    .filter(Boolean);

  equationLegendTitleEl.textContent = formulas.length === 1 ? "Selection equation" : `Selection equations (${formulas.length})`;
  equationLegendTextEl.innerHTML = formatEquationLegendHtml(formulas.join("\n"));
  equationLegendTextEl.classList.toggle("is-clickable", Boolean(editable && !state.equationEditMode));

  if (equationLegendEditorEl) {
    equationLegendEditorEl.innerHTML = editable && state.equationEditMode
      ? renderEquationEditor(editable)
      : editable
        ? `<div class="legend-editor-note">Click the equation above to edit values.</div>`
        : "";
  }
}

function getEditableSelectionGroup() {
  const selectedShapes = Array.from(state.selection);
  if (selectedShapes.length === 0) {
    return null;
  }

  const first = selectedShapes[0];
  if (!first || !["line", "circle", "parabola"].includes(first.type)) {
    return null;
  }

  const baseId = shapeBaseId(first.id);
  if (!selectedShapes.every((shape) => shape.type === first.type && shapeBaseId(shape.id) === baseId)) {
    return null;
  }

  return {
    type: first.type,
    baseId,
    shape: state.shapes.find((shape) => shape.type === first.type && shapeBaseId(shape.id) === baseId) || first
  };
}

function renderEquationEditor(editable) {
  const shape = editable.shape;
  if (editable.type === "line") {
    const p1 = canvasToMathPoint({ x: shape.x1, y: shape.y1 });
    const p2 = canvasToMathPoint({ x: shape.x2, y: shape.y2 });
    if (nearlyEqual(p1.x, p2.x)) {
      const xValue = formatMathNumber(p1.x);
      return `
        <div class="legend-editor-form" data-equation-type="line">
          <div class="legend-editor-row">x = <input class="legend-editor-input" data-equation-field="xConst" type="number" step="0.1" value="${escapeHtml(xValue)}"></div>
          <div class="legend-editor-note">Edit the constant only. The line shifts horizontally and its linked points move with it.</div>
        </div>
      `;
    }

    const center = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };
    const slope = (p2.y - p1.y) / (p2.x - p1.x);
    const intercept = p1.y - slope * p1.x;
    const slopeValue = formatMathNumber(slope);
    return `
      <div class="legend-editor-form legend-editor-grid" data-equation-type="line">
        <label class="legend-editor-label">Slope m<input class="legend-editor-input" data-equation-field="slope" type="number" step="0.1" value="${escapeHtml(slopeValue)}"></label>
        <label class="legend-editor-label">Intercept b<input class="legend-editor-input" data-equation-field="intercept" type="number" step="0.1" value="${escapeHtml(formatMathNumber(intercept))}"></label>
      </div>
      <div class="legend-editor-note">Edit m and b. The line keeps its length while its points move onto the new line.</div>
    `;
  }

  if (editable.type === "circle") {
    const center = canvasToMathPoint({ x: shape.cx, y: shape.cy });
    const radius = Number((shape.r / state.gridUnit).toFixed(2));
    return `
      <div class="legend-editor-form legend-editor-grid" data-equation-type="circle">
        <label class="legend-editor-label">Center x<input class="legend-editor-input" data-equation-field="centerX" type="number" step="0.1" value="${escapeHtml(formatMathNumber(center.x))}"></label>
        <label class="legend-editor-label">Center y<input class="legend-editor-input" data-equation-field="centerY" type="number" step="0.1" value="${escapeHtml(formatMathNumber(center.y))}"></label>
        <label class="legend-editor-label">Radius<input class="legend-editor-input" data-equation-field="radius" type="number" step="0.1" min="0.1" value="${escapeHtml(formatMathNumber(radius))}"></label>
      </div>
      <div class="legend-editor-note">Edit the constants only. The circle center and linked points move with the new values.</div>
    `;
  }

  if (editable.type === "parabola") {
    const vertex = canvasToMathPoint({ x: shape.vx, y: shape.vy });
    const focus = canvasToMathPoint({ x: shape.fx, y: shape.fy });
    return `
      <div class="legend-editor-form legend-editor-grid legend-editor-grid-3" data-equation-type="parabola">
        <label class="legend-editor-label">Vx<input class="legend-editor-input" data-equation-field="vertexX" type="number" step="0.1" value="${escapeHtml(formatMathNumber(vertex.x))}"></label>
        <label class="legend-editor-label">Vy<input class="legend-editor-input" data-equation-field="vertexY" type="number" step="0.1" value="${escapeHtml(formatMathNumber(vertex.y))}"></label>
        <label class="legend-editor-label">Cx<input class="legend-editor-input" data-equation-field="focusX" type="number" step="0.1" value="${escapeHtml(formatMathNumber(focus.x))}"></label>
        <label class="legend-editor-label">Cy<input class="legend-editor-input" data-equation-field="focusY" type="number" step="0.1" value="${escapeHtml(formatMathNumber(focus.y))}"></label>
      </div>
      <div class="legend-editor-note">Edit V and C first. The parabola and its linked points update together.</div>
    `;
  }

  return "";
}

function getLegendInputValue(name) {
  const input = equationLegendEditorEl?.querySelector(`[data-equation-field="${name}"]`);
  if (!input) {
    return null;
  }

  const value = parseFloat(input.value);
  return Number.isFinite(value) ? value : null;
}

function applyEquationEditToSelection() {
  const editable = getEditableSelectionGroup();
  if (!editable || !equationLegendEditorEl) {
    return;
  }

  const baseId = editable.baseId;
  const shapes = state.shapes.filter((shape) => shape.type === editable.type && shapeBaseId(shape.id) === baseId);
  if (shapes.length === 0) {
    return;
  }

  if (editable.type === "line") {
    const shape = shapes[0];
    const p1 = canvasToMathPoint({ x: shape.x1, y: shape.y1 });
    const p2 = canvasToMathPoint({ x: shape.x2, y: shape.y2 });
    const oldVertical = nearlyEqual(p1.x, p2.x);
    const oldCenter = {
      x: (p1.x + p2.x) / 2,
      y: (p1.y + p2.y) / 2
    };
    const oldDir = oldVertical
      ? { x: 0, y: 1 }
      : {
          x: (p2.x - p1.x) / Math.hypot(p2.x - p1.x, p2.y - p1.y),
          y: (p2.y - p1.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y)
        };
    const oldNormal = {
      x: -oldDir.y,
      y: oldDir.x
    };

    if (oldVertical) {
      const xConst = getLegendInputValue("xConst");
      if (xConst == null) return;
      const deltaCanvasX = Math.round((xConst - p1.x) * state.gridUnit);
      for (const target of shapes) {
        target.x1 += deltaCanvasX;
        target.x2 += deltaCanvasX;
      }

      for (const point of state.shapes) {
        if (point.type !== "point" || shapeBaseId(point.id) !== baseId) {
          continue;
        }
        point.x += deltaCanvasX;
      }
      return;
    }

    const newSlope = getLegendInputValue("slope");
    const newIntercept = getLegendInputValue("intercept");
    if (newSlope == null || newIntercept == null) {
      return;
    }

    const dirLength = Math.hypot(1, newSlope);
    const dir = {
      x: 1 / dirLength,
      y: newSlope / dirLength
    };
    const normal = {
      x: -dir.y,
      y: dir.x
    };
    const projectedCenter = {
      x: (oldCenter.x + newSlope * (oldCenter.y - newIntercept)) / (1 + newSlope * newSlope),
      y: newSlope * ((oldCenter.x + newSlope * (oldCenter.y - newIntercept)) / (1 + newSlope * newSlope)) + newIntercept
    };
    const centerDelta = {
      x: projectedCenter.x - oldCenter.x,
      y: projectedCenter.y - oldCenter.y
    };

    for (const target of shapes) {
      const targetP1 = canvasToMathPoint({ x: target.x1, y: target.y1 });
      const targetP2 = canvasToMathPoint({ x: target.x2, y: target.y2 });
      const start = {
        x: targetP1.x - oldCenter.x,
        y: targetP1.y - oldCenter.y
      };
      const end = {
        x: targetP2.x - oldCenter.x,
        y: targetP2.y - oldCenter.y
      };
      const startAlong = start.x * oldDir.x + start.y * oldDir.y;
      const startPerp = start.x * oldNormal.x + start.y * oldNormal.y;
      const endAlong = end.x * oldDir.x + end.y * oldDir.y;
      const endPerp = end.x * oldNormal.x + end.y * oldNormal.y;
      const newStart = {
        x: projectedCenter.x + startAlong * dir.x + startPerp * normal.x,
        y: projectedCenter.y + startAlong * dir.y + startPerp * normal.y
      };
      const newEnd = {
        x: projectedCenter.x + endAlong * dir.x + endPerp * normal.x,
        y: projectedCenter.y + endAlong * dir.y + endPerp * normal.y
      };

      target.x1 = Math.round(state.logicalWidth / 2 + newStart.x * state.gridUnit);
      target.y1 = Math.round(state.logicalHeight / 2 - newStart.y * state.gridUnit);
      target.x2 = Math.round(state.logicalWidth / 2 + newEnd.x * state.gridUnit);
      target.y2 = Math.round(state.logicalHeight / 2 - newEnd.y * state.gridUnit);
    }

    for (const point of state.shapes) {
      if (point.type !== "point" || shapeBaseId(point.id) !== baseId) {
        continue;
      }

      const pointMath = canvasToMathPoint({ x: point.x, y: point.y });
      const offset = {
        x: pointMath.x - oldCenter.x,
        y: pointMath.y - oldCenter.y
      };
      const along = offset.x * oldDir.x + offset.y * oldDir.y;
      const perp = offset.x * oldNormal.x + offset.y * oldNormal.y;
      const next = {
        x: projectedCenter.x + along * dir.x + perp * normal.x,
        y: projectedCenter.y + along * dir.y + perp * normal.y
      };
      point.x = Math.round(state.logicalWidth / 2 + next.x * state.gridUnit);
      point.y = Math.round(state.logicalHeight / 2 - next.y * state.gridUnit);
    }
    return;
  }

  if (editable.type === "circle") {
    const shape = shapes[0];
    const oldCenter = { x: shape.cx, y: shape.cy };
    const oldRadius = shape.r;
    const newCenterMath = {
      x: getLegendInputValue("centerX"),
      y: getLegendInputValue("centerY")
    };
    const newRadiusMath = getLegendInputValue("radius");
    if (newCenterMath.x == null || newCenterMath.y == null || newRadiusMath == null || newRadiusMath < 0) {
      return;
    }

    const newCenter = mathToCanvasPoint(newCenterMath);
    const newRadius = Math.round(newRadiusMath * state.gridUnit);
    const radiusScale = oldRadius > 0 ? newRadius / oldRadius : 1;

    for (const target of shapes) {
      target.cx = newCenter.x;
      target.cy = newCenter.y;
      target.r = newRadius;
    }

    for (const point of state.shapes) {
      if (point.type !== "point" || shapeBaseId(point.id) !== baseId) {
        continue;
      }

      if (pointMatches({ x: point.x, y: point.y }, oldCenter)) {
        point.x = newCenter.x;
        point.y = newCenter.y;
      } else {
        const dx = point.x - oldCenter.x;
        const dy = point.y - oldCenter.y;
        point.x = newCenter.x + dx * radiusScale;
        point.y = newCenter.y + dy * radiusScale;
      }
    }
    return;
  }

  if (editable.type === "parabola") {
    const shape = shapes[0];
    const oldVertex = { x: shape.vx, y: shape.vy };
    const oldFocus = { x: shape.fx, y: shape.fy };
    const vertexMath = {
      x: getLegendInputValue("vertexX"),
      y: getLegendInputValue("vertexY")
    };
    const focusMath = {
      x: getLegendInputValue("focusX"),
      y: getLegendInputValue("focusY")
    };

    if (vertexMath.x == null || vertexMath.y == null || focusMath.x == null || focusMath.y == null) {
      return;
    }

    const newVertexMath = vertexMath;
    const newFocusMath = focusMath;

    if (Math.hypot(newFocusMath.x - newVertexMath.x, newFocusMath.y - newVertexMath.y) < 0.01) {
      return;
    }

    const newVertex = mathToCanvasPoint(newVertexMath);
    const newFocus = mathToCanvasPoint(newFocusMath);

    for (const target of shapes) {
      target.vx = newVertex.x;
      target.vy = newVertex.y;
      target.fx = newFocus.x;
      target.fy = newFocus.y;
    }

    for (const point of state.shapes) {
      if (point.type !== "point" || shapeBaseId(point.id) !== baseId) {
        continue;
      }

      if (pointMatches({ x: point.x, y: point.y }, oldVertex)) {
        point.x = newVertex.x;
        point.y = newVertex.y;
      } else if (pointMatches({ x: point.x, y: point.y }, oldFocus)) {
        point.x = newFocus.x;
        point.y = newFocus.y;
      }
    }
  }
}

function scheduleEquationEditApply() {
  clearTimeout(equationEditTimer);
  equationEditTimer = setTimeout(() => {
    const editable = getEditableSelectionGroup();
    if (!editable) {
      return;
    }

    pushUndoSnapshot();
    applyEquationEditToSelection();
    rebuildMarkup();
    markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
    updateEquationLegend();
    highlightMarkupForShapes(state.selection, { scroll: false });
    render();
    setStatus("Equation values updated.");
  }, 220);
}

function shapeToMarkup(shape) {
  if (shape.type === "line") {
    return `line id=${shape.id} visible=1 x1=${formatNumber(shape.x1)} y1=${formatNumber(shape.y1)} x2=${formatNumber(shape.x2)} y2=${formatNumber(shape.y2)} color=${shape.color}`;
  }

  if (shape.type === "circle") {
    return `circle id=${shape.id} visible=1 cx=${formatNumber(shape.cx)} cy=${formatNumber(shape.cy)} r=${formatNumber(shape.r)} color=${shape.color}`;
  }

  if (shape.type === "parabola") {
    return `parabola id=${shape.id} visible=1 vx=${formatNumber(shape.vx)} vy=${formatNumber(shape.vy)} fx=${formatNumber(shape.fx)} fy=${formatNumber(shape.fy)} color=${shape.color}`;
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
  if (type === 'parabola') {
    const vx = parseFloat(kv.vx), vy = parseFloat(kv.vy), fx = parseFloat(kv.fx), fy = parseFloat(kv.fy);
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(fx) || !Number.isFinite(fy)) return null;
    if (Math.hypot(fx - vx, fy - vy) < 1) return null;
    return { type: 'parabola', id, vx, vy, fx, fy, color };
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
  if (state.showVertexLines) {
    drawVertexLines();
  }

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
      } else if (shape.type === "parabola") {
        drawParabolaShape(shape, { glow: true });
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
    } else if (shape.type === "parabola") {
      drawParabolaShape(shape);
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

function getUniqueVertexPoints() {
  const points = [];
  for (const shape of state.shapes) {
    if (shape.type !== "point") {
      continue;
    }

    const point = { x: shape.x, y: shape.y };
    if (!points.some((candidate) => pointMatches(candidate, point))) {
      points.push(point);
    }
  }
  return points;
}

function drawVertexLines() {
  const points = getUniqueVertexPoints();
  if (points.length < 2) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(154, 52, 18, 0.5)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([7, 6]);

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[j].x, points[j].y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function parabolaBasis(shape) {
  const dx = shape.fx - shape.vx;
  const dy = shape.fy - shape.vy;
  const p = Math.hypot(dx, dy);
  if (p < 1e-6) {
    return null;
  }

  const ux = dx / p;
  const uy = dy / p;
  return {
    vx: shape.vx,
    vy: shape.vy,
    ux,
    uy,
    px: -uy,
    py: ux,
    p
  };
}

function parabolaPointAt(shape, t) {
  const basis = parabolaBasis(shape);
  if (!basis) {
    return null;
  }

  const x = (t * t) / (4 * basis.p);
  return {
    x: basis.vx + basis.ux * x + basis.px * t,
    y: basis.vy + basis.uy * x + basis.py * t
  };
}

function sampleParabolaPoints(shape, sampleCount = 140) {
  const basis = parabolaBasis(shape);
  if (!basis) {
    return [];
  }

  const span = Math.max(state.logicalWidth, state.logicalHeight) * 1.1;
  const step = (span * 2) / sampleCount;
  const points = [];
  for (let t = -span; t <= span; t += step) {
    const point = parabolaPointAt(shape, t);
    if (point) {
      points.push(point);
    }
  }
  return points;
}

function drawParabolaShape(shape, { glow = false, dashed = false } = {}) {
  const points = sampleParabolaPoints(shape);
  if (points.length < 2) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.lineWidth = glow ? 8 : 3;
  ctx.globalAlpha = glow ? 0.35 : 1;
  ctx.setLineDash(dashed ? [6, 5] : []);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  if (!glow) {
    ctx.setLineDash([]);
    ctx.fillStyle = shape.color;
    ctx.beginPath();
    ctx.arc(shape.vx, shape.vy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(shape.fx, shape.fy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function pointNearParabola(point, shape, tolerance = 8) {
  const points = sampleParabolaPoints(shape, 180);
  for (let i = 0; i < points.length - 1; i += 1) {
    if (distToSegment(point.x, point.y, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y) <= tolerance) {
      return true;
    }
  }
  return false;
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
  } else if (state.mode === "parabola") {
    if (state.parabolaStage === "focus" && state.parabolaVertexPoint) {
      drawParabolaShape({
        type: "parabola",
        vx: state.parabolaVertexPoint.x,
        vy: state.parabolaVertexPoint.y,
        fx: mousePoint.x,
        fy: mousePoint.y,
        color: state.color
      }, { dashed: true });
    } else {
      drawParabolaShape({
        type: "parabola",
        vx: mousePoint.x,
        vy: mousePoint.y,
        fx: state.draftPoint.x,
        fy: state.draftPoint.y,
        color: state.color
      }, { dashed: true });
    }
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
    const label = `${formatAngle(diff)}°`;
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

function drawSingleAngleAnalysisOverlay(analysis, { interactive = false, showRayLabels = true, showArcDiffLabels = state.showArcDiffs } = {}) {
  if (!analysis) {
    return;
  }

  const { anchor, rays } = analysis;

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
    if (showRayLabels) {
      if (interactive) {
        // store for click-to-edit hit-testing
        ray.labelX = tx + 4;
        ray.labelY = ty - 4;
      }
      ctx.setLineDash([]);
      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText(`${formatAngle(ray.angle)} deg`, tx + 4, ty - 4);
      ctx.setLineDash([6, 4]);
    }
  }

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(anchor.x, anchor.y, 3, 0, Math.PI * 2);
  ctx.fill();
  if (showArcDiffLabels) drawArcDiffs(anchor, rays);
  ctx.restore();
}

function drawAllVertexAngleOverlays() {
  if (!state.showAllVertexAngles) {
    return;
  }

  const points = getUniqueVertexPoints();
  for (const anchor of points) {
    const rays = collectRaysFromPoint(anchor, { includeVertexLines: state.showVertexLines });
    if (rays.length === 0) {
      continue;
    }

    drawSingleAngleAnalysisOverlay(
      { anchor, rays },
      { showRayLabels: false, showArcDiffLabels: true }
    );
  }
}

function drawAngleAnalysisOverlay() {
  drawSingleAngleAnalysisOverlay(state.angleAnalysis, { interactive: true });
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

function drawReferenceImage() {
  const reference = state.referenceImage;
  if (!reference || !reference.image) {
    return;
  }

  const source = reference.image;
  if (!source.width || !source.height) {
    return;
  }

  const widthScale = state.logicalWidth / source.width;
  const heightScale = state.logicalHeight / source.height;
  const scale = Math.min(widthScale, heightScale);
  const drawWidth = Math.max(1, Math.round(source.width * scale));
  const drawHeight = Math.max(1, Math.round(source.height * scale));
  const offsetX = Math.round((state.logicalWidth - drawWidth) / 2);
  const offsetY = Math.round((state.logicalHeight - drawHeight) / 2);

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(source, offsetX, offsetY, drawWidth, drawHeight);
  ctx.restore();
}

function drawImageDebugOverlay() {
  const overlay = state.imageDebugOverlay;
  if (!state.showImageDebugOverlay || !overlay) {
    return;
  }

  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.6;

  for (const line of overlay.lines || []) {
    ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }

  ctx.setLineDash([4, 3]);
  for (const circle of overlay.circles || []) {
    ctx.strokeStyle = "rgba(245, 158, 11, 0.95)";
    ctx.beginPath();
    ctx.arc(circle.cx, circle.cy, Math.max(2, circle.r), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
    ctx.font = "600 10px Inter, sans-serif";
    ctx.fillText(`r=${formatMathNumber(circle.r / state.gridUnit)}`, circle.cx + 8, circle.cy - 8);
  }

  ctx.setLineDash([]);
  for (const point of overlay.points || []) {
    ctx.fillStyle = "rgba(239, 68, 68, 0.9)";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const parabola of overlay.parabolas || []) {
    ctx.strokeStyle = "rgba(16, 185, 129, 0.92)";
    ctx.beginPath();
    ctx.moveTo(parabola.vx, parabola.vy);
    ctx.lineTo(parabola.fx, parabola.fy);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(30, 41, 59, 0.82)";
  ctx.fillRect(12, 12, 245, 42);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 10px Inter, sans-serif";
  const txt = overlay.info || "debug overlay";
  ctx.fillText(`Detector: ${txt}`, 18, 30);
  ctx.fillText("Blue=line  Amber=circle  Red=point", 18, 44);
  ctx.restore();
}

function render(mousePoint = null) {
  clearCanvas();
  drawReferenceImage();
  if (state.showGrid) drawGridLines();
  drawAxes();
  drawImageDebugOverlay();
  drawShapes();
  drawAllVertexAngleOverlays();
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
  return angle % 360;
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

function collectRaysFromPoint(anchor, { includeVertexLines = false } = {}) {
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

  if (includeVertexLines) {
    for (const point of getUniqueVertexPoints()) {
      if (!pointMatches(anchor, point)) {
        rays.push({ to: point });
      }
    }
  }

  const normalized = [];
  for (const ray of rays) {
    const angle = angleFromXAxisDegrees(anchor, ray.to);
    const existing = normalized.find((r) => Math.abs(r.angle - angle) < 1e-6);
    if (!existing) {
      normalized.push({ to: ray.to, angle });
      continue;
    }

    if (distance(anchor, ray.to) < distance(anchor, existing.to)) {
      existing.to = ray.to;
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

  const values = rays.map((ray) => `${formatAngle(ray.angle)} deg`).join(", ");
  setStatus(`Angles to +X at point (${anchor.x}, ${anchor.y}): ${values}`);
}

function toggleAlternateAngleView(rawPoint = null) {
  if (rawPoint) {
    const anchor = findNearestExistingPoint(rawPoint, 14);
    if (!anchor) {
      setStatus("Angle mode: double-click closer to an existing point.", true);
      return;
    }

    if (!state.angleAnalysis || !pointMatches(state.angleAnalysis.anchor, anchor)) {
      analyzePointAnglesAt(rawPoint);
    }
  }

  if (!state.angleAnalysis) {
    setStatus("Angle mode: click a point first, then use 0 or double-click for alternate angles.", true);
    return;
  }

  state.showArcDiffs = !state.showArcDiffs;
  render();
  setStatus(`Alternate angle view ${state.showArcDiffs ? "on" : "off"} (0 / double-click point).`);
}

function deleteSelectionWithConfirm() {
  if (state.mode !== "select") {
    setMode("select");
    setStatus("Select shapes first, then click Delete to confirm removal.");
    return;
  }

  if (state.selection.size === 0) {
    setStatus("Select one or more shapes before deleting.", true);
    return;
  }

  const shapes = Array.from(state.selection);
  const message = shapes.length === 1
    ? `Delete selected ${shapes[0].type} id=${shapes[0].id}?`
    : `Delete ${shapes.length} selected shapes?`;

  if (!window.confirm(message)) {
    setStatus("Delete canceled.");
    return;
  }

  pushUndoSnapshot();
  state.shapes = state.shapes.filter((shape) => !state.selection.has(shape));
  state.selection.clear();
  updateEquationLegend();
  updateMarkupHighlight([]);
  rebuildMarkup();
  render();
  setStatus(shapes.length === 1 ? `Deleted selected ${shapes[0].type} id=${shapes[0].id}.` : `Deleted ${shapes.length} selected shapes.`);
}

function moveShapeBy(shape, dx, dy) {
  if (shape.type === "line") {
    shape.x1 += dx;
    shape.y1 += dy;
    shape.x2 += dx;
    shape.y2 += dy;
    return;
  }

  if (shape.type === "circle") {
    shape.cx += dx;
    shape.cy += dy;
    return;
  }

  if (shape.type === "parabola") {
    shape.vx += dx;
    shape.vy += dy;
    shape.fx += dx;
    shape.fy += dy;
    return;
  }

  if (shape.type === "point" || shape.type === "label") {
    shape.x += dx;
    shape.y += dy;
  }
}

function moveSelectionBy(dx, dy) {
  if (!dx && !dy) {
    return false;
  }

  for (const shape of state.selection) {
    moveShapeBy(shape, dx, dy);
  }

  return true;
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

function applyVisibleGridSnap(point) {
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
  for (const s of state.shapes)
    if (s.type === "parabola" && pointNearParabola(p, s, HIT_LINE + 1)) return s;
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
    state.equationEditMode = false;
    updateEquationLegend();
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
  state.equationEditMode = false;
  updateEquationLegend();
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
    x: anchor.x + dist * Math.cos(rad),
    y: anchor.y - dist * Math.sin(rad)
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

const VERTEX_MERGE_EPSILON = 1;

function vertexPointMatches(a, b) {
  return pointMatches(a, b, VERTEX_MERGE_EPSILON);
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

function snapParabolaAxisPoint(vertex, point) {
  if (!vertex || !point) {
    return point;
  }

  const dx = point.x - vertex.x;
  const dy = point.y - vertex.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: point.x, y: vertex.y };
  }

  return { x: vertex.x, y: point.y };
}

function pointAtDistanceFrom(center, point, distanceValue) {
  if (!center || !point) {
    return point;
  }

  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const currentDistance = Math.hypot(dx, dy);
  if (currentDistance < 1e-6 || !Number.isFinite(distanceValue)) {
    return { x: center.x + distanceValue, y: center.y };
  }

  const scale = distanceValue / currentDistance;
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale
  };
}

function findNearestSnapTarget(point, radius) {
  const nearestPoint = findNearestPointSnapTarget(point, radius);
  if (nearestPoint) {
    return nearestPoint;
  }

  let nearest = null;
  let best = radius;

  for (const shape of state.shapes) {
    if (shape.type === "point") {
      continue;
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

function findNearestPointSnapTarget(point, radius) {
  let nearest = null;
  let best = radius;

  for (const shape of state.shapes) {
    if (shape.type !== "point") {
      continue;
    }

    if (state.snapKindFilter !== "any" && state.snapKindFilter !== "point") {
      continue;
    }

    const candidate = { x: shape.x, y: shape.y, kind: "point" };
    const d = distance(point, candidate);
    if (d <= best) {
      best = d;
      nearest = candidate;
    }
  }

  return nearest;
}

function findNearestCircleSnapTarget(point, radius) {
  const nearestPoint = findNearestPointSnapTarget(point, radius);
  if (nearestPoint) {
    return nearestPoint;
  }

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
  return state.shapes.some((shape) => shape.type === "point" && vertexPointMatches(point, { x: shape.x, y: shape.y }));
}

function nextOwnedPointId(ownerId, pool = state.shapes) {
  const baseId = shapeBaseId(ownerId);
  let suffix = 1;

  while (pool.some((shape) => String(shape.id) === `${baseId}.p${suffix}`)) {
    suffix += 1;
  }

  return `${baseId}.p${suffix}`;
}

function pushUniquePoint(list, point, ownerId, color) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return;
  }

  if (list.some((entry) => vertexPointMatches(entry, point))) {
    return;
  }

  list.push({
    type: "point",
    id: nextOwnedPointId(ownerId, [...state.shapes, ...list]),
    x: point.x,
    y: point.y,
    color
  });
}

function collectMissingUniquePoints(points) {
  const unique = [];

  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      continue;
    }

    if (hasPointShape(point) || unique.some((entry) => vertexPointMatches(entry, point))) {
      continue;
    }

    unique.push(point);
  }

  return unique;
}

function removeDuplicatePointShapes() {
  const uniquePoints = [];
  const nextShapes = [];
  let removedCount = 0;

  for (const shape of state.shapes) {
    if (shape.type !== "point") {
      nextShapes.push(shape);
      continue;
    }

    if (uniquePoints.some((point) => vertexPointMatches(point, shape))) {
      removedCount += 1;
      continue;
    }

    uniquePoints.push(shape);
    nextShapes.push(shape);
  }

  state.shapes = nextShapes;
  return removedCount;
}

function lineDirectionFromPoint(line, point) {
  const startMatches = vertexPointMatches(point, { x: line.x1, y: line.y1 });
  const endMatches = vertexPointMatches(point, { x: line.x2, y: line.y2 });
  if (!startMatches && !endMatches) {
    return null;
  }

  const other = startMatches
    ? { x: line.x2, y: line.y2 }
    : { x: line.x1, y: line.y1 };
  const dx = other.x - point.x;
  const dy = other.y - point.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) {
    return null;
  }

  return {
    x: dx / length,
    y: dy / length
  };
}

function isMeaningfulLineVertex(point, lines) {
  const directions = lines
    .map((line) => lineDirectionFromPoint(line, point))
    .filter(Boolean);

  if (directions.length <= 1) {
    return true;
  }

  if (directions.length > 2) {
    return true;
  }

  const [first, second] = directions;
  const crossValue = Math.abs(cross(first.x, first.y, second.x, second.y));
  const dotValue = first.x * second.x + first.y * second.y;

  return !(crossValue <= 0.01 && dotValue < -0.999);
}

function pointOnCirclePerimeter(point, circle, epsilon = VERTEX_MERGE_EPSILON) {
  return nearlyEqual(Math.hypot(point.x - circle.cx, point.y - circle.cy) - circle.r, 0, epsilon);
}

function isMeaningfulRebuiltPoint(point, lines, circles, parabolas) {
  if (circles.some((circle) => vertexPointMatches(point, { x: circle.cx, y: circle.cy }))) {
    return true;
  }

  if (parabolas.some((parabola) =>
    vertexPointMatches(point, { x: parabola.vx, y: parabola.vy }) ||
    vertexPointMatches(point, { x: parabola.fx, y: parabola.fy })
  )) {
    return true;
  }

  const incidentLines = lines.filter((line) =>
    vertexPointMatches(point, { x: line.x1, y: line.y1 }) ||
    vertexPointMatches(point, { x: line.x2, y: line.y2 })
  );

  if (incidentLines.length <= 1) {
    return true;
  }

  if (incidentLines.length > 2) {
    return true;
  }

  if (circles.some((circle) => pointOnCirclePerimeter(point, circle))) {
    return true;
  }

  return isMeaningfulLineVertex(point, incidentLines);
}

function appendPointShapeIfMissing(point, ownerId, color) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return false;
  }

  if (hasPointShape(point)) {
    return false;
  }

  state.shapes.push({
    type: "point",
    id: nextOwnedPointId(ownerId),
    x: point.x,
    y: point.y,
    color
  });
  return true;
}

function rebuildVertices() {
  const geometryShapes = state.shapes.filter((shape) => shape.type !== "point");
  if (geometryShapes.length === 0) {
    state.shapes = [];
    state.selection.clear();
    updateEquationLegend();
    updateMarkupHighlight([]);
    rebuildMarkup();
    render();
    setStatus("No geometry available. Cleared all vertices.");
    return;
  }

  pushUndoSnapshot();

  const nextPoints = [];

  const lines = geometryShapes.filter((shape) => shape.type === "line");
  const circles = geometryShapes.filter((shape) => shape.type === "circle");
  const parabolas = geometryShapes.filter((shape) => shape.type === "parabola");

  const lineVertices = [];
  for (const line of lines) {
    for (const point of [{ x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 }]) {
      let entry = lineVertices.find((candidate) => vertexPointMatches(candidate.point, point));
      if (!entry) {
        entry = { point, lines: [] };
        lineVertices.push(entry);
      }
      entry.lines.push(line);
    }
  }

  for (const entry of lineVertices) {
    if (!isMeaningfulLineVertex(entry.point, entry.lines)) {
      continue;
    }

    const ownerLine = entry.lines[0];
    const ownerId = shapeBaseId(ownerLine.id);
    pushUniquePoint(nextPoints, entry.point, ownerId, ownerLine.color);
  }

  for (const circle of circles) {
    const ownerId = shapeBaseId(circle.id);
    pushUniquePoint(nextPoints, { x: circle.cx, y: circle.cy }, ownerId, circle.color);
  }

  for (const parabola of parabolas) {
    const ownerId = shapeBaseId(parabola.id);
    pushUniquePoint(nextPoints, { x: parabola.vx, y: parabola.vy }, ownerId, parabola.color);
    pushUniquePoint(nextPoints, { x: parabola.fx, y: parabola.fy }, ownerId, parabola.color);
  }

  for (let i = 0; i < lines.length; i += 1) {
    const a1 = { x: lines[i].x1, y: lines[i].y1 };
    const a2 = { x: lines[i].x2, y: lines[i].y2 };
    const lineBaseId = shapeBaseId(lines[i].id);

    for (let j = i + 1; j < lines.length; j += 1) {
      const hit = segmentIntersectionPoint(a1, a2, { x: lines[j].x1, y: lines[j].y1 }, { x: lines[j].x2, y: lines[j].y2 });
      if (!hit) {
        continue;
      }

      pushUniquePoint(nextPoints, hit, lineBaseId, lines[i].color);
      pushUniquePoint(nextPoints, hit, shapeBaseId(lines[j].id), lines[j].color);
    }

    for (const circle of circles) {
      const hits = segmentCircleIntersections(a1, a2, { cx: circle.cx, cy: circle.cy, r: circle.r });
      for (const hit of hits) {
        pushUniquePoint(nextPoints, hit, lineBaseId, lines[i].color);
        pushUniquePoint(nextPoints, hit, shapeBaseId(circle.id), circle.color);
      }
    }
  }

  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const hits = circleCircleIntersections(
        { cx: circles[i].cx, cy: circles[i].cy, r: circles[i].r },
        { cx: circles[j].cx, cy: circles[j].cy, r: circles[j].r }
      );
      for (const hit of hits) {
        pushUniquePoint(nextPoints, hit, shapeBaseId(circles[i].id), circles[i].color);
        pushUniquePoint(nextPoints, hit, shapeBaseId(circles[j].id), circles[j].color);
      }
    }
  }

  const filteredPoints = nextPoints.filter((point) => isMeaningfulRebuiltPoint(point, lines, circles, parabolas));

  state.shapes = [...geometryShapes, ...filteredPoints];
  removeDuplicatePointShapes();
  state.selection = new Set(Array.from(state.selection).filter((shape) => shape.type !== "point" && state.shapes.includes(shape)));
  updateEquationLegend();
  highlightMarkupForShapes(state.selection, { scroll: false });
  rebuildMarkup();
  render();
  setStatus(`Rebuilt ${filteredPoints.length} vertex point${filteredPoints.length === 1 ? "" : "s"} from current geometry.`);
}

function removeVertices() {
  const pointCount = state.shapes.filter((shape) => shape.type === "point").length;
  if (pointCount === 0) {
    setStatus("No vertices to remove.");
    return;
  }

  pushUndoSnapshot();
  state.shapes = state.shapes.filter((shape) => shape.type !== "point");
  state.selection = new Set(Array.from(state.selection).filter((shape) => shape.type !== "point" && state.shapes.includes(shape)));
  updateEquationLegend();
  highlightMarkupForShapes(state.selection, { scroll: false });
  rebuildMarkup();
  render();
  setStatus(`Removed ${pointCount} vert${pointCount === 1 ? "ex" : "ices"}.`);
}

// shared core used by addLine and AI batch processing (no undo push, no render)
function addLineCore(start, end, color, forcedSplits = []) {
  const id = getNextId();
  const intersectionInfo = collectLineIntersections(start, end);
  const intersectionPoints = [...intersectionInfo.points, ...forcedSplits];
  splitExistingLines(intersectionInfo.hitsByLineIndex);
  const segments = buildRaySegments(start, end, intersectionPoints);
  const addedIntersectionPoints = collectMissingUniquePoints(intersectionPoints);
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segId = segments.length > 1 ? `${id}.${i + 1}` : id;
    state.shapes.push({ type: "line", id: segId, x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, color });
  }
  appendPointShapeIfMissing(start, id, color);
  appendPointShapeIfMissing(end, id, color);
  for (const p of addedIntersectionPoints) {
    appendPointShapeIfMissing(p, id, color);
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
  const addedIntersectionPoints = collectMissingUniquePoints(intersectionInfo.points);
  const id = getNextId();
  state.shapes.push({ type: "circle", id, cx, cy, r, color });
  appendPointShapeIfMissing({ x: cx, y: cy }, id, color);
  for (const p of addedIntersectionPoints) {
    appendPointShapeIfMissing(p, id, color);
  }
}

function addLine(start, end, forcedSplits = []) {
  pushUndoSnapshot();

  const id = getNextId();
  const intersectionInfo = collectLineIntersections(start, end);
  const intersectionPoints = [...intersectionInfo.points, ...forcedSplits];
  splitExistingLines(intersectionInfo.hitsByLineIndex);
  const segments = buildRaySegments(start, end, intersectionPoints);
  const addedIntersectionPoints = collectMissingUniquePoints(intersectionPoints);

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
  appendPointShapeIfMissing(start, id, state.color);
  appendPointShapeIfMissing(end, id, state.color);
  for (const p of intersectionPoints) {
    if (addedIntersectionPoints.some((q) => pointMatches(q, p))) {
      appendPointShapeIfMissing(p, id, state.color);
    }
  }
  removeDuplicatePointShapes();
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
  const addedIntersectionPoints = collectMissingUniquePoints(intersectionInfo.points);

  const id = getNextId();
  state.shapes.push({
    type: "circle",
    id,
    cx: center.x,
    cy: center.y,
    r,
    color: state.color
  });
  appendPointShapeIfMissing(center, id, state.color);
  for (const p of addedIntersectionPoints) {
    appendPointShapeIfMissing(p, id, state.color);
  }
  removeDuplicatePointShapes();
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

function addParabola(vertex, focus) {
  if (Math.hypot(focus.x - vertex.x, focus.y - vertex.y) < 1) {
    setStatus("Parabola needs a distinct focus point.", true);
    return;
  }

  pushUndoSnapshot();
  const id = getNextId();
  state.shapes.push({
    type: "parabola",
    id,
    vx: vertex.x,
    vy: vertex.y,
    fx: focus.x,
    fy: focus.y,
    color: state.color
  });
  appendPointShapeIfMissing(vertex, id, state.color);
  appendPointShapeIfMissing(focus, id, state.color);
  removeDuplicatePointShapes();
  rebuildMarkup();
  render();
  setStatus(`Added parabola id=${id}.`);
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

function addPoint(point) {
  if (hasPointShape(point)) {
    setStatus(`Point already exists at (${formatNumber(point.x)}, ${formatNumber(point.y)}).`, true);
    return;
  }

  pushUndoSnapshot();
  const id = getNextId();
  state.shapes.push({
    type: "point",
    id,
    x: point.x,
    y: point.y,
    color: state.color
  });
  removeDuplicatePointShapes();
  rebuildMarkup();
  render();
  setStatus(`Added point id=${id} at (${formatNumber(point.x)}, ${formatNumber(point.y)}).`);
}

canvas.addEventListener("mousemove", (event) => {
  const point = toDrawPoint(event);

  if (state.isDragging) {
    if (state.mode === "move" && state.moveDragPoint) {
      const currentPoint = toCanvasPoint(event);
      const dx = currentPoint.x - state.moveDragPoint.x;
      const dy = currentPoint.y - state.moveDragPoint.y;

      if (dx || dy) {
        if (!state.moveDidChange) {
          pushUndoSnapshot();
          state.moveDidChange = true;
        }

        moveSelectionBy(dx, dy);
        state.moveDragPoint = currentPoint;
        state.lastPointerPoint = currentPoint;
        rebuildMarkup();
        updateEquationLegend();
        highlightMarkupForShapes(state.selection, { scroll: false });
      }

      render(currentPoint);
      return;
    }

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
    } else if (state.mode === "parabola" && state.parabolaStage === "vertex" && !event.shiftKey) {
      currentPoint = applyVisibleGridSnap(point);
      state.hoverPoint = null;
      setSnapInfo(snapInfoText("vertex / grid"));
    } else if (state.mode === "parabola" && state.parabolaStage === "focus" && !event.shiftKey) {
      currentPoint = applyVisibleGridSnap(point);
      state.hoverPoint = null;
      setSnapInfo(snapInfoText(state.snapToGrid && state.showGrid ? "C point / grid" : "C point"));
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
      } else if (state.mode === "parabola" && event.shiftKey) {
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
    } else if (state.mode === "parabola") {
      setSnapInfo(snapInfoText(event.shiftKey ? "off (Shift)" : "axis focus"));
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
  const canvasPoint = toCanvasPoint(event);

  if (state.mode === "select") {
    applySelectClick(findShapeAtPoint(canvasPoint));
    return;
  }

  if (state.mode === "move") {
    if (state.selection.size === 0) {
      setStatus("Select one or more shapes before moving.", true);
      return;
    }

    const hit = findShapeAtPoint(canvasPoint);
    if (!hit || !state.selection.has(hit)) {
      setStatus("Press on a selected shape to move it.", true);
      return;
    }

    const point = canvasPoint;
    state.isDragging = true;
    state.moveDragPoint = point;
    state.moveDidChange = false;
    state.lastPointerPoint = point;
    state.hoverPoint = null;
    state.draftPoint = point;
    state.draftCurrentPoint = point;
    setStatus(`Moving ${state.selection.size} selected shape${state.selection.size === 1 ? "" : "s"}.`);
    render(point);
    return;
  }

  if (state.mode === "point") {
    const rawPoint = toDrawPoint(event);
    let point = rawPoint;
    if (!event.shiftKey) {
      const nearest = findNearestSnapTarget(rawPoint, state.snapRadius);
      if (nearest) {
        point = nearest;
        setSnapInfo(snapInfoText(`target: ${kindLabel(nearest.kind)}`));
      } else {
        setSnapInfo(snapInfoText("target: none"));
      }
    } else {
      setSnapInfo(snapInfoText("off (Shift)"));
    }
    addPoint(point);
    return;
  }

  if (state.mode === "parabola") {
    const rawPoint = toDrawPoint(event);
    if (!state.parabolaDrafting) {
      let focus = rawPoint;
      let snapped = false;
      focus = applyVisibleGridSnap(focus);
      if (!event.shiftKey) {
        const nearest = findNearestSnapTarget(rawPoint, state.snapRadius);
        if (nearest) {
          focus = nearest;
          snapped = true;
        }
      }

      state.parabolaDrafting = true;
      state.parabolaStage = "vertex";
      state.parabolaVertexPoint = null;
      state.isDragging = true;
      state.hoverPoint = null;
      state.pendingDiameterCircle = null;
      state.draftPoint = focus;
      state.draftCurrentPoint = focus;
      state.lastPointerPoint = rawPoint;
      if (snapped) {
        setSnapInfo(snapInfoText(`target: ${kindLabel(focus.kind)}`));
      } else {
        setSnapInfo(event.shiftKey ? snapInfoText("off (Shift)") : snapInfoText("target: none"));
      }
      setStatus(`Parabola anchor set at (${focus.x}, ${focus.y}). Drag the lowest point, then release to place the C point.`);
      render(state.draftCurrentPoint);
      return;
    }

    if (state.parabolaStage === "focus") {
      const focusPoint = event.shiftKey
        ? rawPoint
        : applyVisibleGridSnap(rawPoint);

      if (distance(state.parabolaVertexPoint, focusPoint) < 1) {
        setStatus("Parabola needs a distinct C point.", true);
        render(state.draftCurrentPoint || state.parabolaVertexPoint);
        return;
      }

      state.parabolaDrafting = false;
      state.parabolaStage = null;
      state.isDragging = false;
      state.hoverPoint = null;
      state.pendingDiameterCircle = null;
      state.draftCurrentPoint = focusPoint;
      addParabola(state.parabolaVertexPoint, focusPoint);
      state.draftPoint = null;
      state.draftCurrentPoint = null;
      state.parabolaVertexPoint = null;
      return;
    }

    state.parabolaVertexPoint = state.draftCurrentPoint || rawPoint;
    state.parabolaStage = "focus";
    state.isDragging = false;
    state.hoverPoint = null;
    state.pendingDiameterCircle = null;
    setStatus(`Drag the C point away from (${state.parabolaVertexPoint.x}, ${state.parabolaVertexPoint.y}), then press to finish.`);
    render(state.parabolaVertexPoint);
    return;
  }

  if (state.mode === "label") {
    const point = toDrawPoint(event);
    addLabel(point);
    return;
  }

  if (state.mode === "angle") {
    if (tryOpenAngleEditor(event, toCanvasPoint(event))) return;
    analyzePointAnglesAt(toCanvasPoint(event));
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
  } else if ((state.mode === "line" || state.mode === "parabola") && !event.shiftKey) {
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
  } else if (state.mode === "circle") {
    setStatus(`Drag circle radius from (${state.draftPoint.x}, ${state.draftPoint.y}) and release.`);
  } else if (state.mode === "parabola") {
    if (state.parabolaStage === "focus") {
      setStatus(`Drag the C point from (${state.parabolaVertexPoint.x}, ${state.parabolaVertexPoint.y}) and press to finish. Snap locks to 4 axis directions.`);
    } else {
      setStatus(`Drag parabola vertex from (${state.draftPoint.x}, ${state.draftPoint.y}) and release. Snap locks to 4 axis directions.`);
    }
  }

  render(state.draftCurrentPoint);
});

canvas.addEventListener("mouseup", (event) => {
  if (state.mode === "move") {
    if (!state.isDragging || !state.moveDragPoint) {
      return;
    }

    state.isDragging = false;
    state.moveDragPoint = null;
    state.draftPoint = null;
    state.draftCurrentPoint = null;
    state.hoverPoint = null;
    state.lastPointerPoint = null;

    rebuildMarkup();
    updateEquationLegend();
    highlightMarkupForShapes(state.selection, { scroll: false });
    render(toCanvasPoint(event));

    const moved = state.moveDidChange;
    state.moveDidChange = false;
    setStatus(moved
      ? `Moved ${state.selection.size} selected shape${state.selection.size === 1 ? "" : "s"}.`
      : "Move canceled.");
    return;
  }

  if (!state.isDragging || !state.draftPoint || state.mode === "select") {
    return;
  }

  if (state.mode === "parabola") {
    if (state.parabolaStage === "vertex") {
      state.parabolaVertexPoint = state.draftCurrentPoint || state.draftPoint;
      state.parabolaStage = "focus";
      state.isDragging = true;
      state.hoverPoint = null;
      state.pendingDiameterCircle = null;
      setStatus(`Now drag the C point away from (${state.parabolaVertexPoint.x}, ${state.parabolaVertexPoint.y}), then press to finish.`);
      render();
    }
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
  } else if (state.mode === "parabola" && !event.shiftKey) {
    end = snapParabolaAxisPoint(start, rawEnd);
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
    if (distance(start, end) < 1) {
      render();
      setStatus("Click without drag does not create a line. Use Point mode to place a point.");
      return;
    }
    addLine(start, end, splits);
  } else if (state.mode === "circle") {
    addCircle(start, end);
  } else if (state.mode === "parabola") {
    if (distance(start, end) < 1) {
      render();
      setStatus("Click without drag does not create a parabola. Drag to a focus point.");
      return;
    }
    addParabola(start, end);
  }
});

canvas.addEventListener("dblclick", (event) => {
  if (state.mode !== "angle") {
    return;
  }

  event.preventDefault();
  toggleAlternateAngleView(toCanvasPoint(event));
});

selectBtn.addEventListener("click", () => setMode("select"));
moveBtn.addEventListener("click", () => setMode("move"));
lineBtn.addEventListener("click", () => setMode("line"));
pointBtn.addEventListener("click", () => setMode("point"));
circleBtn.addEventListener("click", () => setMode("circle"));
parabolaBtn.addEventListener("click", () => setMode("parabola"));
labelBtn.addEventListener("click", () => setMode("label"));
angleBtn.addEventListener("click", () => setMode("angle"));
deleteBtn.addEventListener("click", () => deleteSelectionWithConfirm());

undoBtn.addEventListener("click", () => {
  state.draftPoint = null;
  state.draftCurrentPoint = null;
  state.isDragging = false;
  state.parabolaDrafting = false;
  state.parabolaStage = null;
  state.parabolaVertexPoint = null;
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
  state.parabolaDrafting = false;
  state.parabolaStage = null;
  state.parabolaVertexPoint = null;
  state.hoverPoint = null;
  state.angleAnalysis = null;
  state.referenceImage = null;
  state.imageCirclePick = null;
  state.imageDebugOverlay = null;
  state.selection.clear();
  updateEquationLegend();
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

rebuildVerticesBtn?.addEventListener("click", () => {
  rebuildVertices();
});

removeVerticesBtn?.addEventListener("click", () => {
  removeVertices();
});

if (verticesLinesBtn) {
  verticesLinesBtn.addEventListener("click", () => {
    toggleVertexLines();
  });
}

if (allVerticesAnglesBtn) {
  allVerticesAnglesBtn.addEventListener("click", () => {
    toggleAllVertexAngles();
  });
}

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
  if (state.mode === "parabola") {
    return;
  }

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
  const target = event.target;

  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  ) {
    return;
  }

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

  if (key === "backspace") {
    event.preventDefault();
    deleteSelectionWithConfirm();
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
    toggleAlternateAngleView();
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

document.addEventListener("click", closeTopLegendsOnOutsideClick);

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
    removeDuplicatePointShapes();
    markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
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
const aiModelSelectEl = document.getElementById("aiModelSelect");
const aiUseImageBtn = document.getElementById("aiUseImageBtn");
const aiRemoveImageBtn = document.getElementById("aiRemoveImageBtn");
const aiDebugOverlayEl = document.getElementById("aiDebugOverlay");
const aiImageInputEl = document.getElementById("aiImageInput");
const aiImagePreviewEl = document.getElementById("aiImagePreview");
const aiImagePreviewWrapEl = document.getElementById("aiImagePreviewWrap");
const aiImageMetaEl = document.getElementById("aiImageMeta");
const markupLoadBtn = document.getElementById("markupLoadBtn");
const markupSaveBtn = document.getElementById("markupSaveBtn");

let aiImagePayload = null;

function setAiStatus(msg, type = "") {
  aiStatusEl.textContent = msg;
  aiStatusEl.className = `ai-status ${type}`;
}

function resetAiImagePreview() {
  aiImagePayload = null;
  state.imageCirclePick = null;
  state.imageDebugOverlay = null;
  state.referenceImage = null;
  if (aiImagePreviewEl) {
    aiImagePreviewEl.removeAttribute("src");
  }
  if (aiImagePreviewWrapEl) {
    aiImagePreviewWrapEl.classList.add("is-empty");
  }
  if (aiImageMetaEl) {
    aiImageMetaEl.textContent = "No image selected.";
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read the image file."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode the image file."));
    image.src = url;
  });
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function solveLinear3x3(matrix, rhs) {
  const a = matrix.map((row, i) => [...row, rhs[i]]);

  for (let pivot = 0; pivot < 3; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < 3; row += 1) {
      if (Math.abs(a[row][pivot]) > Math.abs(a[best][pivot])) {
        best = row;
      }
    }

    if (Math.abs(a[best][pivot]) < 1e-9) {
      return null;
    }

    if (best !== pivot) {
      const tmp = a[pivot];
      a[pivot] = a[best];
      a[best] = tmp;
    }

    const denom = a[pivot][pivot];
    for (let col = pivot; col < 4; col += 1) {
      a[pivot][col] /= denom;
    }

    for (let row = 0; row < 3; row += 1) {
      if (row === pivot) {
        continue;
      }
      const factor = a[row][pivot];
      for (let col = pivot; col < 4; col += 1) {
        a[row][col] -= factor * a[pivot][col];
      }
    }
  }

  return [a[0][3], a[1][3], a[2][3]];
}

function fitQuadratic(points) {
  if (!Array.isArray(points) || points.length < 20) {
    return null;
  }

  let sx = 0;
  let sx2 = 0;
  let sx3 = 0;
  let sx4 = 0;
  let sy = 0;
  let sxy = 0;
  let sx2y = 0;

  for (const point of points) {
    const x = point.x;
    const y = point.y;
    const x2 = x * x;
    sx += x;
    sx2 += x2;
    sx3 += x2 * x;
    sx4 += x2 * x2;
    sy += y;
    sxy += x * y;
    sx2y += x2 * y;
  }

  const solution = solveLinear3x3(
    [
      [sx4, sx3, sx2],
      [sx3, sx2, sx],
      [sx2, sx, points.length]
    ],
    [sx2y, sxy, sy]
  );

  if (!solution) {
    return null;
  }

  const [a, b, c] = solution;
  const meanY = sy / points.length;
  let sse = 0;
  let sst = 0;
  for (const point of points) {
    const predicted = a * point.x * point.x + b * point.x + c;
    const err = point.y - predicted;
    sse += err * err;
    const centered = point.y - meanY;
    sst += centered * centered;
  }

  const r2 = sst > 1e-9 ? 1 - sse / sst : 0;
  return { a, b, c, r2 };
}

function componentIntersectsText(component, textBoxes) {
  if (!textBoxes.length) {
    return false;
  }

  const a = component.bbox;
  for (const b of textBoxes) {
    const overlapW = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
    const overlapH = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
    if (overlapW <= 0 || overlapH <= 0) {
      continue;
    }
    const overlapArea = overlapW * overlapH;
    const compArea = Math.max(1, (a.maxX - a.minX + 1) * (a.maxY - a.minY + 1));
    if (overlapArea / compArea > 0.25) {
      return true;
    }
  }

  return false;
}

function classifyComponentToPrimitive(component) {
  const samples = component.samples;
  if (!samples.length) {
    return null;
  }

  const bboxW = component.bbox.maxX - component.bbox.minX + 1;
  const bboxH = component.bbox.maxY - component.bbox.minY + 1;
  const pixelCount = component.count;
  const area = bboxW * bboxH;
  const density = pixelCount / Math.max(1, area);

  const cx = component.sumX / pixelCount;
  const cy = component.sumY / pixelCount;

  if (pixelCount <= 180 && bboxW <= 18 && bboxH <= 18) {
    return {
      kind: "point",
      data: { x: Math.round(cx), y: Math.round(cy) }
    };
  }

  let covXX = 0;
  let covXY = 0;
  let covYY = 0;
  for (const sample of samples) {
    const dx = sample.x - cx;
    const dy = sample.y - cy;
    covXX += dx * dx;
    covXY += dx * dy;
    covYY += dy * dy;
  }
  covXX /= samples.length;
  covXY /= samples.length;
  covYY /= samples.length;

  const theta = 0.5 * Math.atan2(2 * covXY, covXX - covYY);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const vx = -uy;
  const vy = ux;

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const rotated = [];
  for (const sample of samples) {
    const dx = sample.x - cx;
    const dy = sample.y - cy;
    const u = dx * ux + dy * uy;
    const v = dx * vx + dy * vy;
    rotated.push({ x: u, y: v });
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }

  const major = Math.max(1, maxU - minU);
  const minor = Math.max(1, maxV - minV);
  const aspect = major / minor;

  const fromRotated = (u, v) => ({
    x: Math.round(cx + u * ux + v * vx),
    y: Math.round(cy + u * uy + v * vy)
  });

  if (aspect >= 3.2 && major >= 14 && minor <= 24 && density <= 0.86) {
    const centerV = (minV + maxV) / 2;
    return {
      kind: "line",
      data: {
        x1: fromRotated(minU, centerV).x,
        y1: fromRotated(minU, centerV).y,
        x2: fromRotated(maxU, centerV).x,
        y2: fromRotated(maxU, centerV).y
      }
    };
  }

  const radiusEstimate = (bboxW + bboxH) / 4;
  let radiusMean = 0;
  for (const sample of samples) {
    radiusMean += Math.hypot(sample.x - cx, sample.y - cy);
  }
  radiusMean /= samples.length;

  let radiusVar = 0;
  for (const sample of samples) {
    const d = Math.hypot(sample.x - cx, sample.y - cy) - radiusMean;
    radiusVar += d * d;
  }
  radiusVar /= samples.length;
  const radiusCv = Math.sqrt(radiusVar) / Math.max(1, radiusMean);
  const bboxRatio = bboxW / Math.max(1, bboxH);
  const ringDensity = pixelCount / Math.max(1, Math.PI * radiusEstimate * radiusEstimate);

  if (
    bboxRatio >= 0.75 && bboxRatio <= 1.25 &&
    radiusCv <= 0.24 &&
    ringDensity >= 0.08 && ringDensity <= 0.78 &&
    radiusEstimate >= 8
  ) {
    const radiusRobust = Math.max(radiusMean, radiusEstimate * 0.92);
    return {
      kind: "circle",
      data: {
        cx: Math.round(cx),
        cy: Math.round(cy),
        r: Math.max(6, Math.round(radiusRobust))
      }
    };
  }

  if (pixelCount >= 70 && major >= 26 && aspect >= 1.3) {
    const fit = fitQuadratic(rotated);
    if (fit && Math.abs(fit.a) > 0.002 && fit.r2 >= 0.56) {
      const vertexU = -fit.b / (2 * fit.a);
      const vertexV = fit.c - (fit.b * fit.b) / (4 * fit.a);
      const p = 1 / (4 * fit.a);
      const focusV = vertexV + p;
      const vertex = fromRotated(vertexU, vertexV);
      const focus = fromRotated(vertexU, focusV);
      if (distance(vertex, focus) >= 4) {
        return {
          kind: "parabola",
          data: {
            vx: vertex.x,
            vy: vertex.y,
            fx: focus.x,
            fy: focus.y
          }
        };
      }
    }
  }

  return null;
}

function inferLinesBetweenPointCandidates(points, mask, width, height) {
  if (!Array.isArray(points) || points.length < 2) {
    return [];
  }

  const maxPairs = 260;
  let pairCount = 0;
  const inferred = [];

  const hasInkNear = (x, y) => {
    const cx = Math.round(x);
    const cy = Math.round(y);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || py < 0 || px >= width || py >= height) {
          continue;
        }
        if (mask[py * width + px]) {
          return true;
        }
      }
    }
    return false;
  };

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      pairCount += 1;
      if (pairCount > maxPairs) {
        return inferred;
      }

      const a = points[i];
      const b = points[j];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (length < 18 || length > Math.min(width, height) * 0.95) {
        continue;
      }

      const samples = Math.max(18, Math.round(length / 3));
      let hit = 0;
      for (let k = 0; k <= samples; k += 1) {
        const t = k / samples;
        const x = a.x + (b.x - a.x) * t;
        const y = a.y + (b.y - a.y) * t;
        if (hasInkNear(x, y)) {
          hit += 1;
        }
      }

      const ratio = hit / (samples + 1);
      if (ratio >= 0.72) {
        inferred.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
  }

  return inferred;
}

function inferLinesFromMask(mask, width, height) {
  const lines = [];
  const steps = 18;

  const traceLine = (x1, y1, x2, y2) => {
    let hits = 0;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(x1 + (x2 - x1) * t);
      const y = Math.round(y1 + (y2 - y1) * t);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) {
            continue;
          }
          if (mask[py * width + px]) {
            hits += 1;
            dx = 2;
            dy = 2;
          }
        }
      }
    }
    return hits / (steps + 1);
  };

  // Horizontal scan candidates.
  for (let y = 6; y < height - 6; y += Math.max(6, Math.round(height / 22))) {
    let runStart = -1;
    for (let x = 0; x < width; x += 1) {
      const on = mask[y * width + x] === 1;
      if (on && runStart < 0) runStart = x;
      if ((!on || x === width - 1) && runStart >= 0) {
        const runEnd = on && x === width - 1 ? x : x - 1;
        if (runEnd - runStart >= width * 0.18) {
          lines.push({ x1: runStart, y1: y, x2: runEnd, y2: y });
        }
        runStart = -1;
      }
    }
  }

  // Vertical scan candidates.
  for (let x = 6; x < width - 6; x += Math.max(6, Math.round(width / 22))) {
    let runStart = -1;
    for (let y = 0; y < height; y += 1) {
      const on = mask[y * width + x] === 1;
      if (on && runStart < 0) runStart = y;
      if ((!on || y === height - 1) && runStart >= 0) {
        const runEnd = on && y === height - 1 ? y : y - 1;
        if (runEnd - runStart >= height * 0.18) {
          lines.push({ x1: x, y1: runStart, x2: x, y2: runEnd });
        }
        runStart = -1;
      }
    }
  }

  return lines.filter((line) => traceLine(line.x1, line.y1, line.x2, line.y2) >= 0.7);
}

function buildImageToMathTransform({ detectWidth, detectHeight, foregroundMaxAbsX, foregroundMaxAbsY }) {
  const visibleHalfX = state.logicalWidth / (2 * state.gridUnit);
  const visibleHalfY = state.logicalHeight / (2 * state.gridUnit);
  const targetHalfY = visibleHalfY * 0.5;
  const imageCenterX = detectWidth / 2;
  const imageCenterY = detectHeight / 2;

  const maxAbsX = Math.max(1, foregroundMaxAbsX || detectWidth / 2);
  const maxAbsY = Math.max(1, foregroundMaxAbsY || detectHeight / 2);

  const unitsPerPixelByY = targetHalfY / maxAbsY;
  const unitsPerPixelByX = (visibleHalfX * 0.92) / maxAbsX;
  const unitsPerPixel = Math.max(0.001, Math.min(unitsPerPixelByY, unitsPerPixelByX));

  return {
    imageCenterX,
    imageCenterY,
    unitsPerPixel,
    detectToMathPoint(point) {
      return {
        x: (point.x - imageCenterX) * unitsPerPixel,
        y: (imageCenterY - point.y) * unitsPerPixel
      };
    }
  };
}

function derivePrimitiveScaleBounds({ primitives, labels, detectWidth, detectHeight, drawWidth, drawHeight }) {
  const centerX = detectWidth / 2;
  const centerY = detectHeight / 2;
  let maxAbsX = Math.max(1, drawWidth / 2);
  let maxAbsY = Math.max(1, drawHeight / 2);

  const addPoint = (x, y) => {
    maxAbsX = Math.max(maxAbsX, Math.abs(x - centerX));
    maxAbsY = Math.max(maxAbsY, Math.abs(y - centerY));
  };

  for (const primitive of primitives) {
    if (primitive.kind === "point") {
      addPoint(primitive.data.x, primitive.data.y);
      continue;
    }

    if (primitive.kind === "line") {
      addPoint(primitive.data.x1, primitive.data.y1);
      addPoint(primitive.data.x2, primitive.data.y2);
      continue;
    }

    if (primitive.kind === "circle") {
      const { cx, cy, r } = primitive.data;
      maxAbsX = Math.max(maxAbsX, Math.abs(cx - centerX) + r);
      maxAbsY = Math.max(maxAbsY, Math.abs(cy - centerY) + r);
      continue;
    }

    if (primitive.kind === "parabola") {
      addPoint(primitive.data.vx, primitive.data.vy);
      addPoint(primitive.data.fx, primitive.data.fy);
    }
  }

  for (const label of labels) {
    addPoint(label.x, label.y);
  }

  return { maxAbsX, maxAbsY };
}

async function extractGeometryFromImagePayload(payload) {
  const image = await loadImageFromUrl(payload.dataUrl);
  const detectWidth = 550;
  const detectHeight = 350;
  const detectCanvas = document.createElement("canvas");
  detectCanvas.width = detectWidth;
  detectCanvas.height = detectHeight;
  const context = detectCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    throw new Error("Could not inspect image pixels.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, detectWidth, detectHeight);
  const drawScale = Math.min(detectWidth / image.width, detectHeight / image.height);
  const drawWidth = Math.max(1, Math.round(image.width * drawScale));
  const drawHeight = Math.max(1, Math.round(image.height * drawScale));
  const offsetX = Math.round((detectWidth - drawWidth) / 2);
  const offsetY = Math.round((detectHeight - drawHeight) / 2);
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  const labels = [];
  const textBoxes = [];
  if (typeof window.TextDetector === "function") {
    try {
      const detector = new window.TextDetector();
      const textResults = await detector.detect(detectCanvas);
      for (const item of textResults) {
        const rawText = String(item.rawValue || "").trim().replace(/\s+/g, " ");
        if (!rawText) {
          continue;
        }
        const box = item.boundingBox;
        if (!box) {
          continue;
        }

        const x = Math.round(box.x + box.width / 2);
        const y = Math.round(box.y + box.height / 2);
        labels.push({ x, y, text: rawText });
        textBoxes.push({
          minX: box.x,
          minY: box.y,
          maxX: box.x + box.width,
          maxY: box.y + box.height
        });
      }
    } catch (error) {
      // TextDetector is optional; fallback is geometry-only extraction.
    }
  }

  const imageData = context.getImageData(0, 0, detectWidth, detectHeight);
  const rgba = imageData.data;
  const total = detectWidth * detectHeight;
  const gray = new Uint8Array(total);
  let graySum = 0;
  let graySqSum = 0;
  for (let i = 0; i < total; i += 1) {
    const p = i * 4;
    const value = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]);
    gray[i] = value;
    graySum += value;
    graySqSum += value * value;
  }

  const mean = graySum / total;
  const variance = Math.max(0, graySqSum / total - mean * mean);
  const std = Math.sqrt(variance);
  const threshold = clampNumber(Math.round(mean - std * 0.18), 40, 225);

  const binary = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    binary[i] = gray[i] < threshold ? 1 : 0;
  }

  // Remove isolated pixels for less noise in connected components.
  const denoised = new Uint8Array(total);
  for (let y = 1; y < detectHeight - 1; y += 1) {
    for (let x = 1; x < detectWidth - 1; x += 1) {
      const idx = y * detectWidth + x;
      if (!binary[idx]) {
        continue;
      }
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) {
            continue;
          }
          neighbors += binary[(y + dy) * detectWidth + (x + dx)];
        }
      }
      if (neighbors >= 2) {
        denoised[idx] = 1;
      }
    }
  }

  const components = [];
  const visited = new Uint8Array(total);
  const queue = [];
  const neighborOffsets = [
    -detectWidth - 1, -detectWidth, -detectWidth + 1,
    -1, 1,
    detectWidth - 1, detectWidth, detectWidth + 1
  ];

  for (let start = 0; start < total; start += 1) {
    if (!denoised[start] || visited[start]) {
      continue;
    }

    queue.length = 0;
    queue.push(start);
    visited[start] = 1;
    let head = 0;

    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = detectWidth;
    let minY = detectHeight;
    let maxX = 0;
    let maxY = 0;
    const samples = [];

    while (head < queue.length) {
      const idx = queue[head];
      head += 1;

      const y = Math.floor(idx / detectWidth);
      const x = idx - y * detectWidth;
      count += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      if (samples.length < 6000 || (count % 4 === 0 && samples.length < 9000)) {
        samples.push({ x, y });
      }

      for (const offset of neighborOffsets) {
        const next = idx + offset;
        if (next < 0 || next >= total || visited[next] || !denoised[next]) {
          continue;
        }

        const ny = Math.floor(next / detectWidth);
        const nx = next - ny * detectWidth;
        if (Math.abs(nx - x) > 1 || Math.abs(ny - y) > 1) {
          continue;
        }

        visited[next] = 1;
        queue.push(next);
      }
    }

    if (count < 12) {
      continue;
    }

    const boxArea = (maxX - minX + 1) * (maxY - minY + 1);
    if (boxArea > total * 0.72) {
      continue;
    }

    components.push({
      count,
      sumX,
      sumY,
      samples,
      bbox: { minX, minY, maxX, maxY }
    });
  }

  const primitives = [];
  for (const component of components) {
    if (componentIntersectsText(component, textBoxes)) {
      continue;
    }

    const primitive = classifyComponentToPrimitive(component);
    if (primitive) {
      primitives.push(primitive);
    }
  }

  const pointPrimitives = primitives
    .filter((primitive) => primitive.kind === "point")
    .map((primitive) => ({ x: primitive.data.x, y: primitive.data.y }));

  const inferredLines = inferLinesBetweenPointCandidates(pointPrimitives, denoised, detectWidth, detectHeight);
  for (const line of inferredLines) {
    primitives.push({ kind: "line", data: line });
  }

  const scanLines = inferLinesFromMask(denoised, detectWidth, detectHeight);
  for (const line of scanLines) {
    primitives.push({ kind: "line", data: line });
  }

  const primitiveBounds = derivePrimitiveScaleBounds({
    primitives,
    labels,
    detectWidth,
    detectHeight,
    drawWidth,
    drawHeight
  });

  const transform = buildImageToMathTransform({
    detectWidth,
    detectHeight,
    foregroundMaxAbsX: primitiveBounds.maxAbsX,
    foregroundMaxAbsY: primitiveBounds.maxAbsY
  });

  const result = {
    points: [],
    lines: [],
    circles: [],
    detectedCircles: [],
    parabolas: [],
    labels: [],
    transform: {
      unitsPerPixel: transform.unitsPerPixel,
      targetHalfYUnits: (state.logicalHeight / (2 * state.gridUnit)) * 0.5
    }
  };

  for (const primitive of primitives) {
    if (primitive.kind === "point") {
      const mathPoint = transform.detectToMathPoint({ x: primitive.data.x, y: primitive.data.y });
      const canvasPoint = mathToCanvasPoint(mathPoint);
      result.points.push({
        x: canvasPoint.x,
        y: canvasPoint.y
      });
      continue;
    }

    if (primitive.kind === "line") {
      const startMath = transform.detectToMathPoint({ x: primitive.data.x1, y: primitive.data.y1 });
      const endMath = transform.detectToMathPoint({ x: primitive.data.x2, y: primitive.data.y2 });
      const startCanvas = mathToCanvasPoint(startMath);
      const endCanvas = mathToCanvasPoint(endMath);
      result.lines.push({
        x1: startCanvas.x,
        y1: startCanvas.y,
        x2: endCanvas.x,
        y2: endCanvas.y
      });
      continue;
    }

    if (primitive.kind === "circle") {
      const centerMath = transform.detectToMathPoint({ x: primitive.data.cx, y: primitive.data.cy });
      const centerCanvas = mathToCanvasPoint(centerMath);
      const radiusUnits = primitive.data.r * transform.unitsPerPixel;
      const canvasRadius = Math.max(6, Math.round(radiusUnits * state.gridUnit));
      result.circles.push({
        cx: centerCanvas.x,
        cy: centerCanvas.y,
        r: canvasRadius
      });
      result.detectedCircles.push({
        detectCx: primitive.data.cx,
        detectCy: primitive.data.cy,
        detectR: primitive.data.r,
        cx: centerCanvas.x,
        cy: centerCanvas.y,
        r: canvasRadius
      });
      continue;
    }

    if (primitive.kind === "parabola") {
      const vertexMath = transform.detectToMathPoint({ x: primitive.data.vx, y: primitive.data.vy });
      const focusMath = transform.detectToMathPoint({ x: primitive.data.fx, y: primitive.data.fy });
      const vertexCanvas = mathToCanvasPoint(vertexMath);
      const focusCanvas = mathToCanvasPoint(focusMath);
      result.parabolas.push({
        vx: vertexCanvas.x,
        vy: vertexCanvas.y,
        fx: focusCanvas.x,
        fy: focusCanvas.y
      });
    }
  }

  for (const label of labels) {
    const labelMath = transform.detectToMathPoint({ x: label.x, y: label.y });
    const labelCanvas = mathToCanvasPoint(labelMath);
    result.labels.push({
      x: labelCanvas.x,
      y: labelCanvas.y,
      text: label.text
    });
  }

  const lineSeen = new Set();
  result.lines = result.lines.filter((line) => {
    const a = `${Math.round(line.x1)},${Math.round(line.y1)}`;
    const b = `${Math.round(line.x2)},${Math.round(line.y2)}`;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (lineSeen.has(key)) {
      return false;
    }
    lineSeen.add(key);
    return true;
  });

  result.debugOverlay = {
    lines: result.lines.map((line) => ({ ...line })),
    circles: result.circles.map((circle) => ({ ...circle })),
    points: result.points.map((point) => ({ ...point })),
    parabolas: result.parabolas.map((parabola) => ({ ...parabola })),
    info: `${components.length} comp, ${primitives.length} prim, th=${threshold}, span=(${Math.round(primitiveBounds.maxAbsX)},${Math.round(primitiveBounds.maxAbsY)})`
  };

  result.circlePickContext = {
    detectWidth,
    detectHeight,
    threshold,
    gray,
    mask: denoised,
    transform: {
      imageCenterX: transform.imageCenterX,
      imageCenterY: transform.imageCenterY,
      unitsPerPixel: transform.unitsPerPixel
    },
    circles: result.detectedCircles
  };

  return result;
}

async function buildAiImagePayload(file) {
  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromUrl(rawDataUrl);
  const maxDimension = 900;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));
  const canvasEl = document.createElement("canvas");
  canvasEl.width = targetWidth;
  canvasEl.height = targetHeight;
  const context = canvasEl.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the image.");
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);
  const mimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl = canvasEl.toDataURL(mimeType, mimeType === "image/png" ? undefined : 0.8);

  return {
    dataUrl,
    width: targetWidth,
    height: targetHeight,
    name: file.name || "reference-image"
  };
}

async function handleAiImageSelection() {
  const file = aiImageInputEl?.files?.[0] || null;
  if (!file) {
    resetAiImagePreview();
    return;
  }

  if (!file.type.startsWith("image/")) {
    resetAiImagePreview();
    setAiStatus("Choose an image file for AI reference.", "error");
    return;
  }

  try {
    setAiStatus("Preparing image…");
    aiImagePayload = await buildAiImagePayload(file);
    if (aiImagePreviewEl) {
      aiImagePreviewEl.src = aiImagePayload.dataUrl;
    }
    if (aiImagePreviewWrapEl) {
      aiImagePreviewWrapEl.classList.remove("is-empty");
    }
    if (aiImageMetaEl) {
      aiImageMetaEl.textContent = `${aiImagePayload.name} - ${aiImagePayload.width}x${aiImagePayload.height}`;
    }
    setAiStatus("Reference image ready.");
  } catch (error) {
    resetAiImagePreview();
    setAiStatus(`Image error: ${error.message}`, "error");
  }
}

async function loadAiModels() {
  if (!aiModelSelectEl) {
    return;
  }

  try {
    const res = await fetch("/api/ai-models");
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.models)) {
      throw new Error(data.error || "Could not load AI models.");
    }

    aiModelSelectEl.innerHTML = data.models
      .map((model) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.label)}${model.description ? ` - ${escapeHtml(model.description)}` : ""}</option>`)
      .join("");

    const selected = data.models.some((model) => model.id === data.defaultModel)
      ? data.defaultModel
      : data.models[0]?.id;

    if (selected) {
      aiModelSelectEl.value = selected;
    }
  } catch (error) {
    setAiStatus(`Model list unavailable: ${error.message}`, "error");
  }
}

async function runAiDraw() {
  const prompt = aiPromptEl.value.trim();
  const hasImage = Boolean(aiImagePayload?.dataUrl);
  if (!prompt && !hasImage) {
    setAiStatus("Enter a description or choose a reference image first.", "error");
    return;
  }
  const model = aiModelSelectEl?.value || "gpt-4o-mini";
  aiSendBtn.disabled = true;
  setAiStatus("Generating…");
  try {
    const res = await fetch("/api/ai-markup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        gridUnit: state.gridUnit,
        model,
        imageDataUrl: aiImagePayload?.dataUrl || ""
      })
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
      } else if (shape.type === "point") {
        if (!hasPointShape(shape)) {
          state.shapes.push(shape);
        }
      } else if (shape.type === "parabola") {
        state.shapes.push(shape);
      } else if (shape.type === "label") {
        state.shapes.push(shape);
      }
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

async function useImageOnlyOnCanvas() {
  if (!aiImagePayload?.dataUrl) {
    setAiStatus("Choose a reference image first.", "error");
    return;
  }

  if (aiUseImageBtn) {
    aiUseImageBtn.disabled = true;
  }
  setAiStatus("Loading image as background…");

  try {
    const image = await loadImageFromUrl(aiImagePayload.dataUrl);

    if (!aiAppendEl.checked) {
      pushUndoSnapshot();
      state.shapes = [];
      state.selection.clear();
      state.equationEditMode = false;
      updateEquationLegend();
      updateMarkupHighlight([]);
      rebuildMarkup();
    }

    state.imageCirclePick = null;
    state.imageDebugOverlay = null;
    state.referenceImage = {
      image,
      width: image.width,
      height: image.height,
      name: aiImagePayload.name || "reference-image"
    };

    render();

    setAiStatus("Image loaded as 50% opacity background. Use drawing tools to trace over it.", "ok");
    setStatus(`Background image ${state.referenceImage.name} loaded.`);
  } catch (error) {
    setAiStatus(`Image load failed: ${error.message}`, "error");
  } finally {
    if (aiUseImageBtn) {
      aiUseImageBtn.disabled = false;
    }
  }
}

function removeBackgroundImage() {
  if (!state.referenceImage) {
    setStatus("No background image to remove.");
    return;
  }

  state.referenceImage = null;
  state.imageCirclePick = null;
  render();
  setAiStatus("Background image removed.", "ok");
  setStatus("Background image removed.");
}

loadAiModels();
resetAiImagePreview();
if (aiDebugOverlayEl) {
  aiDebugOverlayEl.checked = state.showImageDebugOverlay;
}
aiImageInputEl?.addEventListener("change", handleAiImageSelection);
aiSendBtn.addEventListener("click", runAiDraw);
aiUseImageBtn?.addEventListener("click", useImageOnlyOnCanvas);
aiRemoveImageBtn?.addEventListener("click", removeBackgroundImage);
aiDebugOverlayEl?.addEventListener("change", () => {
  state.showImageDebugOverlay = Boolean(aiDebugOverlayEl.checked);
  render();
});
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
    state.equationEditMode = false;
    updateEquationLegend();
    updateMarkupHighlight([]);
    render();
    return;
  }

  // find shapes whose markup exactly matches a selected line
  state.selection = new Set(
    state.shapes.filter(s => coveredMarkup.has(shapeToMarkup(s)))
  );
  state.equationEditMode = false;
  updateEquationLegend();

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
updateEquationLegend();
syncSolverUi();

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
      removeDuplicatePointShapes();
      markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
      state.angleAnalysis = null;
      render();
    };
    reader.readAsText(file);
  };
  input.click();
});
