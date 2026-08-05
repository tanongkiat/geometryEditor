const canvas = document.getElementById("drawCanvas");
const angleEditorEl = document.getElementById("angleEditor");
const markupOutput = document.getElementById("markupOutput");
const markupLegendEl = document.getElementById("markupLegend");
const markupLegendPanelEl = markupLegendEl?.querySelector(".markup-legend-panel");
const markupFloatBtn = document.getElementById("markupFloatBtn");
const aiLegendEl = document.getElementById("aiLegend");
const aiLegendPanelEl = aiLegendEl?.querySelector(".ai-legend-panel");
const aiFloatBtn = document.getElementById("aiFloatBtn");
const statusEl = document.getElementById("status");
const selectBtn = document.getElementById("selectBtn");
const lineBtn = document.getElementById("lineBtn");
const pointBtn = document.getElementById("pointBtn");
const circleBtn = document.getElementById("circleBtn");
const parabolaBtn = document.getElementById("parabolaBtn");
const labelBtn = document.getElementById("labelBtn");
const angleBtn = document.getElementById("angleBtn");
const angleCurveBtn = document.getElementById("angleCurveBtn");
const deleteBtn = document.getElementById("deleteBtn");
const undoBtn = document.getElementById("undoBtn");
const clearBtn = document.getElementById("clearBtn");
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
const keepSelectedLinesBtn = document.getElementById("keepSelectedLinesBtn");
const allVerticesAnglesBtn = document.getElementById("allVerticesAnglesBtn");
const calculatorLegendEl = document.getElementById("calculatorLegend");
const calculatorExpressionEl = document.getElementById("calculatorExpression");
const calculatorResultEl = document.getElementById("calculatorResult");
const calculatorClearBtn = document.getElementById("calculatorClearBtn");
const calculatorEqualsBtn = document.getElementById("calculatorEqualsBtn");
const calculatorBackspaceBtn = document.getElementById("calculatorBackspaceBtn");
const calculatorValueButtons = Array.from(document.querySelectorAll("[data-calculator-value]"));
const colorPickerEl = document.getElementById("colorPicker");
const colorHexEl = document.getElementById("colorHex");
const labelSizeInputEl = document.getElementById("labelSizeInput");
const quickColorButtons = Array.from(document.querySelectorAll(".quick-color-btn"));
const topLegendDetailsEls = Array.from(document.querySelectorAll("details.top-legend, details.top-shortcuts"));

let equationEditTimer = null;
let calculatorLastAnswer = 0;

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
  labelTextSize: 16,
  colorBeforeVertexLines: null,
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
  solidVertexLineKeys: new Set(),
  vertexLineColors: new Map(),
  keepSelectedVertexLines: false,
  showAllVertexAngles: false,
  equationEditMode: false,
  parabolaDrafting: false,
  parabolaStage: null,
  parabolaVertexPoint: null,
  angleCurveStartTarget: null,
  angleCurveDraft: null,
  angleCurveAutoLabel: true,
  referenceImage: null,
  referenceImageSelected: false,
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

  const wrapStyle = window.getComputedStyle(wrap);
  const horizontalPadding = parseFloat(wrapStyle.paddingLeft) + parseFloat(wrapStyle.paddingRight);
  const verticalPadding = parseFloat(wrapStyle.paddingTop) + parseFloat(wrapStyle.paddingBottom);
  const maxWidth = Math.max(1, wrap.clientWidth - horizontalPadding);
  const maxHeight = Math.max(1, wrap.clientHeight - verticalPadding);
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
    if (legend.open && !legend.classList.contains("is-floating")) {
      legend.open = false;
    }
  }
}

function syncSolverUi() {
  if (!verticesLinesBtn || !keepSelectedLinesBtn || !allVerticesAnglesBtn) {
    return;
  }

  verticesLinesBtn.classList.toggle("is-active", state.showVertexLines);
  verticesLinesBtn.textContent = state.showVertexLines ? "On" : "Off";
  keepSelectedLinesBtn.classList.toggle("is-active", state.keepSelectedVertexLines);
  keepSelectedLinesBtn.textContent = state.keepSelectedVertexLines ? "On" : "Off";
  allVerticesAnglesBtn.classList.toggle("is-active", state.showAllVertexAngles);
  allVerticesAnglesBtn.textContent = state.showAllVertexAngles ? "On" : "Off";
  if (solverLegendEl && (state.showVertexLines || state.keepSelectedVertexLines || state.showAllVertexAngles)) {
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

function normalizeLabelTextSize(value, fallback = 16) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(8, Math.min(120, Math.round(parsed)));
}

function getLabelTextSize(shape) {
  return normalizeLabelTextSize(shape?.size, shape?.labelType === "angle" ? 14 : 16);
}

function syncLabelTextSizeUi() {
  if (labelSizeInputEl) {
    labelSizeInputEl.value = String(state.labelTextSize);
  }
}

function syncLabelTextSizeFromSelection() {
  const selectedLabels = Array.from(state.selection).filter((shape) => shape.type === "label");
  if (selectedLabels.length === 0) return;
  const sizes = new Set(selectedLabels.map(getLabelTextSize));
  if (sizes.size === 1) {
    state.labelTextSize = sizes.values().next().value;
    syncLabelTextSizeUi();
  }
}

function setLabelTextSize(value) {
  const size = normalizeLabelTextSize(value, state.labelTextSize);
  state.labelTextSize = size;
  syncLabelTextSizeUi();

  const selectedLabels = Array.from(state.selection).filter((shape) => shape.type === "label");
  if (selectedLabels.length === 0) {
    setStatus(`Label text size set to ${size}px for new labels.`);
    return;
  }

  pushUndoSnapshot();
  for (const shape of selectedLabels) {
    shape.size = size;
  }
  rebuildMarkup();
  highlightMarkupForShapes(state.selection, { scroll: false });
  render();
  setStatus(`Set ${selectedLabels.length} selected label${selectedLabels.length === 1 ? "" : "s"} to ${size}px.`);
}

function tokenizeCalculatorExpression(expression) {
  const input = String(expression || "")
    .toLowerCase()
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/π/g, "pi");
  const tokens = [];
  let cursor = 0;

  while (cursor < input.length) {
    const char = input[cursor];
    if (/\s/.test(char)) {
      cursor += 1;
      continue;
    }

    const numberMatch = input.slice(cursor).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      tokens.push({ type: "number", value: Number(numberMatch[0]) });
      cursor += numberMatch[0].length;
      continue;
    }

    const nameMatch = input.slice(cursor).match(/^[a-z]+/);
    if (nameMatch) {
      tokens.push({ type: "name", value: nameMatch[0] });
      cursor += nameMatch[0].length;
      continue;
    }

    if ("+-*/^()".includes(char)) {
      tokens.push({ type: "symbol", value: char });
      cursor += 1;
      continue;
    }

    throw new Error(`Unsupported character “${char}”.`);
  }

  const functionNames = new Set(["sin", "cos", "tan", "sqrt", "abs", "log", "ln"]);
  const expanded = [];
  const endsValue = (token) => token && (
    token.type === "number" ||
    token.value === ")" ||
    (token.type === "name" && (token.value === "pi" || token.value === "ans"))
  );
  const startsValue = (token) => token && (
    token.type === "number" ||
    token.type === "name" ||
    token.value === "("
  );

  for (const token of tokens) {
    const previous = expanded[expanded.length - 1];
    const isFunctionCall = previous?.type === "name" && functionNames.has(previous.value) && token.value === "(";
    if (endsValue(previous) && startsValue(token) && !isFunctionCall) {
      expanded.push({ type: "symbol", value: "*" });
    }
    expanded.push(token);
  }

  return expanded;
}

function evaluateCalculatorExpression(expression, lastAnswer = 0) {
  const tokens = tokenizeCalculatorExpression(expression);
  if (tokens.length === 0) {
    throw new Error("Enter an expression.");
  }

  let cursor = 0;
  const current = () => tokens[cursor] || null;
  const takeSymbol = (symbol) => {
    if (current()?.type === "symbol" && current().value === symbol) {
      cursor += 1;
      return true;
    }
    return false;
  };
  const expectSymbol = (symbol) => {
    if (!takeSymbol(symbol)) {
      throw new Error(`Expected “${symbol}”.`);
    }
  };

  const applyFunction = (name, value) => {
    const radians = value * Math.PI / 180;
    if (name === "sin") return Math.sin(radians);
    if (name === "cos") return Math.cos(radians);
    if (name === "tan") return Math.tan(radians);
    if (name === "sqrt") return Math.sqrt(value);
    if (name === "abs") return Math.abs(value);
    if (name === "log") return Math.log10(value);
    if (name === "ln") return Math.log(value);
    throw new Error(`Unknown function “${name}”.`);
  };

  const parsePrimary = () => {
    const token = current();
    if (!token) {
      throw new Error("Expression is incomplete.");
    }

    if (token.type === "number") {
      cursor += 1;
      return token.value;
    }

    if (takeSymbol("(")) {
      const value = parseExpression();
      expectSymbol(")");
      return value;
    }

    if (token.type === "name") {
      cursor += 1;
      if (token.value === "pi") return Math.PI;
      if (token.value === "ans") return lastAnswer;
      expectSymbol("(");
      const value = parseExpression();
      expectSymbol(")");
      return applyFunction(token.value, value);
    }

    throw new Error(`Unexpected “${token.value}”.`);
  };

  const parsePower = () => {
    const base = parsePrimary();
    return takeSymbol("^") ? Math.pow(base, parseUnary()) : base;
  };

  const parseUnary = () => {
    if (takeSymbol("+")) return parseUnary();
    if (takeSymbol("-")) return -parseUnary();
    return parsePower();
  };

  const parseTerm = () => {
    let value = parseUnary();
    while (current()?.value === "*" || current()?.value === "/") {
      const operator = current().value;
      cursor += 1;
      const right = parseUnary();
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  };

  function parseExpression() {
    let value = parseTerm();
    while (current()?.value === "+" || current()?.value === "-") {
      const operator = current().value;
      cursor += 1;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  const result = parseExpression();
  if (cursor < tokens.length) {
    throw new Error(`Unexpected “${current().value}”.`);
  }
  if (!Number.isFinite(result)) {
    throw new Error("Result is not a finite number.");
  }
  return result;
}

function formatCalculatorResult(value) {
  const absolute = Math.abs(value);
  if ((absolute >= 1e12 || (absolute > 0 && absolute < 1e-10))) {
    return value.toExponential(10).replace(/\.0+(?=e)/, "");
  }
  return String(Number(value.toFixed(12)));
}

function showCalculatorResult(text, isError = false) {
  if (!calculatorResultEl) return;
  calculatorResultEl.textContent = text;
  calculatorResultEl.classList.toggle("is-error", isError);
}

function insertCalculatorValue(value) {
  if (!calculatorExpressionEl) return;
  const start = calculatorExpressionEl.selectionStart ?? calculatorExpressionEl.value.length;
  const end = calculatorExpressionEl.selectionEnd ?? start;
  calculatorExpressionEl.setRangeText(value, start, end, "end");
  calculatorExpressionEl.focus();
}

function focusCalculatorExpression() {
  if (!calculatorExpressionEl) return;
  calculatorExpressionEl.focus();
  const end = calculatorExpressionEl.value.length;
  calculatorExpressionEl.setSelectionRange(end, end);
}

function clearCalculator() {
  if (calculatorExpressionEl) {
    calculatorExpressionEl.value = "";
    calculatorExpressionEl.focus();
  }
  showCalculatorResult("0");
}

function backspaceCalculator() {
  if (!calculatorExpressionEl) return;
  const start = calculatorExpressionEl.selectionStart ?? calculatorExpressionEl.value.length;
  const end = calculatorExpressionEl.selectionEnd ?? start;
  const deleteFrom = start === end ? Math.max(0, start - 1) : start;
  calculatorExpressionEl.setRangeText("", deleteFrom, end, "end");
  calculatorExpressionEl.focus();
}

function runCalculator() {
  if (!calculatorExpressionEl) return;
  try {
    calculatorLastAnswer = evaluateCalculatorExpression(calculatorExpressionEl.value, calculatorLastAnswer);
    showCalculatorResult(formatCalculatorResult(calculatorLastAnswer));
  } catch (error) {
    showCalculatorResult(error.message, true);
  }
}

for (const button of calculatorValueButtons) {
  button.addEventListener("click", () => insertCalculatorValue(button.getAttribute("data-calculator-value") || ""));
}

calculatorEqualsBtn?.addEventListener("click", runCalculator);
calculatorClearBtn?.addEventListener("click", clearCalculator);
calculatorBackspaceBtn?.addEventListener("click", backspaceCalculator);
calculatorLegendEl?.addEventListener("toggle", () => {
  if (calculatorLegendEl.open) {
    requestAnimationFrame(focusCalculatorExpression);
  }
});
calculatorExpressionEl?.addEventListener("keydown", (event) => {
  if (event.key === "x" || event.key === "X") {
    event.preventDefault();
    insertCalculatorValue("*");
  } else if (event.key === "Enter" || event.key === "=") {
    event.preventDefault();
    runCalculator();
  } else if (event.key === "Escape") {
    event.preventDefault();
    clearCalculator();
  }
});

window.addEventListener("keydown", (event) => {
  if (!calculatorLegendEl?.open || event.defaultPrevented) return;

  const target = event.target;
  const isCalculatorInput = target === calculatorExpressionEl;
  const isOtherEditable = !isCalculatorInput && (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable
  );
  if (isCalculatorInput || isOtherEditable || event.metaKey || event.ctrlKey || event.altKey) return;

  if (event.key === "Enter" || event.key === "=") {
    event.preventDefault();
    event.stopImmediatePropagation();
    runCalculator();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopImmediatePropagation();
    clearCalculator();
    return;
  }
  if (event.key === "Backspace") {
    event.preventDefault();
    event.stopImmediatePropagation();
    backspaceCalculator();
    return;
  }

  const key = event.key === "x" || event.key === "X" ? "*" : event.key;
  if (/^[0-9a-wyzA-WYZ.+\-*/^()]$/.test(key) || key === "π") {
    event.preventDefault();
    event.stopImmediatePropagation();
    insertCalculatorValue(key);
  }
});

function toggleVertexLines() {
  cancelPendingVertexHelperClick();
  if (!state.showVertexLines) {
    state.colorBeforeVertexLines = state.color;
    state.showVertexLines = true;
    setDrawingColor("#f97316");
  } else {
    state.showVertexLines = false;
    if (!state.keepSelectedVertexLines) {
      state.solidVertexLineKeys.clear();
      state.vertexLineColors.clear();
    }
    const priorColor = state.colorBeforeVertexLines;
    state.colorBeforeVertexLines = null;
    if (priorColor) {
      setDrawingColor(priorColor);
    }
  }
  syncSolverUi();
  render(state.lastPointerPoint);
  setStatus(state.showVertexLines
    ? "Vertices lines on. Style temporarily changed to default orange. In Select mode, click a helper line to toggle it between dashed and solid."
    : state.keepSelectedVertexLines && state.solidVertexLineKeys.size > 0
      ? `Vertices lines off. Solid selected lines remain visible; Style restored to ${state.color.toUpperCase()}.`
      : `Vertices lines off. Style restored to ${state.color.toUpperCase()}.`);
}

function toggleKeepSelectedVertexLines() {
  state.keepSelectedVertexLines = !state.keepSelectedVertexLines;
  if (!state.keepSelectedVertexLines && !state.showVertexLines) {
    state.solidVertexLineKeys.clear();
    state.vertexLineColors.clear();
  }

  syncSolverUi();
  render(state.lastPointerPoint);
  setStatus(state.keepSelectedVertexLines
    ? "Keep Selected Lines on. Solid lines will remain when Vertices Lines is turned off."
    : "Keep Selected Lines off.");
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

function toggleAngleCurveAutoLabel() {
  state.angleCurveAutoLabel = !state.angleCurveAutoLabel;
  if (state.angleCurveDraft) {
    state.angleCurveDraft.text = state.angleCurveAutoLabel
      ? `${formatAngle(positiveAngleDelta(state.angleCurveDraft.ang1, state.angleCurveDraft.ang2) * 180 / Math.PI)}°`
      : "";
    render(state.lastPointerPoint);
  }
  setStatus(state.angleCurveAutoLabel
    ? "Angle Curve automatic labels on (Q)."
    : "Angle Curve plain curve mode on; automatic labels off (Q).");
}

function setMode(mode) {
  cancelPendingVertexHelperClick();
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
  state.angleCurveStartTarget = null;
  state.angleCurveDraft = null;
  state.moveDragPoint = null;
  state.moveDidChange = false;
  state.equationEditMode = false;
  if (mode !== "select" && mode !== "move") state.selection.clear();
  if (mode !== "select") state.referenceImageSelected = false;
  updateEquationLegend();

  selectBtn.classList.toggle("is-active", mode === "select");
  moveBtn.classList.toggle("is-active", mode === "move");
  lineBtn.classList.toggle("is-active", mode === "line");
  pointBtn.classList.toggle("is-active", mode === "point");
  circleBtn.classList.toggle("is-active", mode === "circle");
  parabolaBtn.classList.toggle("is-active", mode === "parabola");
  labelBtn.classList.toggle("is-active", mode === "label");
  angleBtn.classList.toggle("is-active", mode === "angle");
  angleCurveBtn.classList.toggle("is-active", mode === "angleCurve");

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
      ? "Move mode: drag the selected geometry to reposition it. Click different geometry to select it first."
      : "Move mode: click geometry to select it, then drag it on the next interaction.");
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

  if (mode === "angleCurve") {
    setSnapInfo(snapInfoText("target: line"));
    setStatus(`Angle Curve mode (${state.angleCurveAutoLabel ? "auto label" : "plain curve"}): press on one snapped line, then drag along a second line and release. Press Q to toggle labels.`);
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
  if (state.referenceImageSelected && state.referenceImage) {
    const bounds = getReferenceImageBounds();
    equationLegendEl.open = true;
    equationLegendTitleEl.textContent = "Background image";
    equationLegendTextEl.textContent = bounds
      ? `${state.referenceImage.name} — ${Math.round(bounds.width)}×${Math.round(bounds.height)} canvas pixels.`
      : state.referenceImage.name;
    if (equationLegendEditorEl) equationLegendEditorEl.innerHTML = "";
    equationLegendTextEl.classList.remove("is-clickable");
    state.equationEditMode = false;
    return;
  }

  if (selectedShapes.length === 0) {
    equationLegendTitleEl.textContent = "Selection equation";
    equationLegendTextEl.textContent = "Select geometry or a background image to inspect it here.";
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
    const rawText = shape.labelType === "angle"
      ? String(shape.text ?? "")
      : String(shape.text || "Label");
    const safeText = rawText === "" || /\s|"/.test(rawText)
      ? `"${rawText.replace(/([\\"])/g, "\\$1")}"`
      : rawText;
    if (shape.labelType === "angle") {
      return `label id=${shape.id} visible=1 type=angle x=${formatNumber(shape.x)} y=${formatNumber(shape.y)} r=${formatNumber(shape.r)} ang1=${formatNumber(shape.ang1)} ang2=${formatNumber(shape.ang2)} text=${safeText} size=${getLabelTextSize(shape)} color=${shape.color}`;
    }
    return `label id=${shape.id} visible=1 type=text x=${formatNumber(shape.x)} y=${formatNumber(shape.y)} ang1=0 ang2=0 text=${safeText} size=${getLabelTextSize(shape)} color=${shape.color}`;
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
    const size = normalizeLabelTextSize(kv.size, kv.type === 'angle' ? 14 : 16);
    if (kv.type === 'angle') {
      const r = parseFloat(kv.r), ang1 = parseFloat(kv.ang1), ang2 = parseFloat(kv.ang2);
      if (!Number.isFinite(r) || r < 1 || !Number.isFinite(ang1) || !Number.isFinite(ang2)) return null;
      return { type: 'label', labelType: 'angle', id, x, y, r, ang1, ang2, text: kv.text ?? '', size, color };
    }
    return { type: 'label', id, x, y, text: kv.text || 'Label', size, color };
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

function positiveAngleDelta(startAngle, endAngle) {
  const fullTurn = Math.PI * 2;
  return ((endAngle - startAngle) % fullTurn + fullTurn) % fullTurn;
}

function angleCurveLabelPosition(shape) {
  const delta = positiveAngleDelta(shape.ang1, shape.ang2);
  const middle = shape.ang1 + delta / 2;
  const textRadius = shape.r + Math.max(20, getLabelTextSize(shape) * 1.2);
  return {
    x: shape.x + Math.cos(middle) * textRadius,
    y: shape.y + Math.sin(middle) * textRadius
  };
}

function drawAngleCurveShape(shape, { dashed = false, glow = false } = {}) {
  const radius = Number(shape.r);
  const startAngle = Number(shape.ang1);
  const endAngle = Number(shape.ang2);
  if (!Number.isFinite(radius) || radius < 1 || !Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
    return;
  }

  const labelPoint = angleCurveLabelPosition(shape);
  ctx.save();
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = glow ? 9 : 2.5;
  ctx.globalAlpha = glow ? 0.35 : 1;
  ctx.setLineDash(dashed ? [6, 5] : []);
  ctx.beginPath();
  ctx.arc(shape.x, shape.y, radius, startAngle, endAngle);
  ctx.stroke();

  if (!glow) {
    ctx.setLineDash([]);
    const labelText = String(shape.text ?? "");
    if (labelText) {
      ctx.font = `700 ${getLabelTextSize(shape)}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.strokeText(labelText, labelPoint.x, labelPoint.y);
      ctx.fillStyle = shape.color;
      ctx.fillText(labelText, labelPoint.x, labelPoint.y);
    }

    if (dashed) {
      for (const angle of [startAngle, endAngle]) {
        ctx.beginPath();
        ctx.arc(shape.x + Math.cos(angle) * radius, shape.y + Math.sin(angle) * radius, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

function drawShapes() {
  if (state.showVertexLines || (state.keepSelectedVertexLines && state.solidVertexLineKeys.size > 0)) {
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
      } else if (shape.type === "label" && shape.labelType === "angle") {
        drawAngleCurveShape(shape, { glow: true });
      } else if (shape.type === "label") {
        const size = getLabelTextSize(shape);
        ctx.font = `600 ${size}px Inter, sans-serif`;
        const w = ctx.measureText(String(shape.text || "Label")).width;
        ctx.fillRect(shape.x - 4, shape.y - size * 0.7, w + 8, size * 1.4);
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
    } else if (shape.type === "label" && shape.labelType === "angle") {
      drawAngleCurveShape(shape);
    } else if (shape.type === "label") {
      ctx.fillStyle = shape.color;
      ctx.font = `600 ${getLabelTextSize(shape)}px Inter, sans-serif`;
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

    const point = { x: shape.x, y: shape.y, id: String(shape.id) };
    if (!points.some((candidate) => pointMatches(candidate, point))) {
      points.push(point);
    }
  }

  const validLineKeys = new Set();
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      validLineKeys.add(vertexHelperLineKey(points[i], points[j]));
    }
  }
  for (const key of state.solidVertexLineKeys) {
    if (!validLineKeys.has(key)) {
      state.solidVertexLineKeys.delete(key);
      state.vertexLineColors.delete(key);
    }
  }
  return points;
}

function vertexHelperLineKey(first, second) {
  return [String(first.id), String(second.id)].sort().join("::");
}

function findVertexHelperLineAt(point, tolerance = 9) {
  const vertices = getUniqueVertexPoints();
  if (vertices.some((vertex) => Math.hypot(point.x - vertex.x, point.y - vertex.y) <= 10)) {
    return null;
  }

  let nearest = null;
  let bestDistance = tolerance;
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const first = vertices[i];
      const second = vertices[j];
      const lineDistance = distToSegment(point.x, point.y, first.x, first.y, second.x, second.y);
      if (lineDistance <= bestDistance) {
        bestDistance = lineDistance;
        nearest = {
          first,
          second,
          key: vertexHelperLineKey(first, second)
        };
      }
    }
  }
  return nearest;
}

let vertexHelperClickTimer = null;
let pendingVertexHelperClick = null;
let recentlyDeselectedVertexHelper = null;

function cancelPendingVertexHelperClick() {
  clearTimeout(vertexHelperClickTimer);
  vertexHelperClickTimer = null;
  pendingVertexHelperClick = null;
}

function toggleVertexHelperLine(helperLine, point) {
  const isSolid = !state.solidVertexLineKeys.has(helperLine.key);
  if (isSolid) {
    state.solidVertexLineKeys.add(helperLine.key);
    state.vertexLineColors.set(helperLine.key, state.color);
  } else {
    recentlyDeselectedVertexHelper = {
      key: helperLine.key,
      color: state.vertexLineColors.get(helperLine.key) || state.color,
      timestamp: Date.now()
    };
    state.solidVertexLineKeys.delete(helperLine.key);
    state.vertexLineColors.delete(helperLine.key);
  }

  render(point);
  setStatus(`Helper line is now ${isSolid ? `solid ${state.color.toUpperCase()}` : "dashed"}.`);
  return true;
}

function queueVertexHelperLineToggle(point) {
  if (!state.showVertexLines) {
    return false;
  }

  const helperLine = findVertexHelperLineAt(point);
  if (!helperLine) {
    return false;
  }

  if (!state.solidVertexLineKeys.has(helperLine.key) && !pendingVertexHelperClick) {
    toggleVertexHelperLine(helperLine, point);
    return true;
  }

  if (pendingVertexHelperClick) {
    const previous = pendingVertexHelperClick;
    cancelPendingVertexHelperClick();
    if (previous.helperLine.key === helperLine.key) {
      return true;
    }
    toggleVertexHelperLine(previous.helperLine, previous.point);
  }

  pendingVertexHelperClick = { helperLine, point };
  vertexHelperClickTimer = setTimeout(() => {
    const pending = pendingVertexHelperClick;
    vertexHelperClickTimer = null;
    pendingVertexHelperClick = null;
    if (pending) {
      toggleVertexHelperLine(pending.helperLine, pending.point);
    }
  }, 420);
  return true;
}

function convertSolidVertexHelperLineAt(point) {
  const helperLine = findVertexHelperLineAt(point);
  if (!helperLine) {
    return false;
  }

  const isCurrentlySolid = state.solidVertexLineKeys.has(helperLine.key);
  const pendingMatches = pendingVertexHelperClick?.helperLine.key === helperLine.key;
  const recentMatch = pendingMatches &&
    recentlyDeselectedVertexHelper?.key === helperLine.key &&
    Date.now() - recentlyDeselectedVertexHelper.timestamp < 1200;
  if (!isCurrentlySolid && !recentMatch) {
    return false;
  }

  const color = isCurrentlySolid
    ? state.vertexLineColors.get(helperLine.key) || state.color
    : recentlyDeselectedVertexHelper.color;
  cancelPendingVertexHelperClick();
  if (!window.confirm("Do you want to change this solid Vertices Line to a permanent line?")) {
    if (!isCurrentlySolid) {
      state.solidVertexLineKeys.add(helperLine.key);
      state.vertexLineColors.set(helperLine.key, color);
      render(point);
    }
    setStatus("Solid helper line kept unchanged.");
    return true;
  }

  const permanentLineId = getNextId();
  pushUndoSnapshot();
  state.solidVertexLineKeys.delete(helperLine.key);
  state.vertexLineColors.delete(helperLine.key);
  recentlyDeselectedVertexHelper = null;
  addLineCore(helperLine.first, helperLine.second, color);
  removeDuplicatePointShapes();

  const addedLines = state.shapes.filter((shape) =>
    shape.type === "line" && shapeBaseId(shape.id) === String(permanentLineId)
  );
  state.selection = new Set(addedLines);
  rebuildMarkup();
  updateEquationLegend();
  highlightMarkupForShapes(state.selection, { scroll: false });
  render(point);
  setStatus(`Converted the solid helper into ${addedLines.length} permanent line segment${addedLines.length === 1 ? "" : "s"} using ${color.toUpperCase()}.`);
  return true;
}

function drawVertexLines() {
  const points = getUniqueVertexPoints();
  if (points.length < 2) {
    return;
  }

  if (state.showVertexLines) {
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

  const solidLineKeys = state.solidVertexLineKeys;
  if (solidLineKeys.size === 0) {
    return;
  }

  ctx.save();
  ctx.lineWidth = 2.4;
  ctx.setLineDash([]);

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const key = vertexHelperLineKey(points[i], points[j]);
      if (!solidLineKeys.has(key)) {
        continue;
      }
      ctx.strokeStyle = state.vertexLineColors.get(key) || state.color;
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
  } else if (state.mode === "angleCurve" && state.angleCurveDraft) {
    drawAngleCurveShape(state.angleCurveDraft, { dashed: true });
  }

  ctx.restore();
}

function drawSnapIndicator() {
  if ((state.mode !== "line" && state.mode !== "angleCurve") || !state.hoverPoint) {
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

function getReferenceImageBounds() {
  const reference = state.referenceImage;
  if (!reference || !reference.image) {
    return null;
  }

  const source = reference.image;
  if (!source.width || !source.height) {
    return null;
  }

  const widthScale = state.logicalWidth / source.width;
  const heightScale = state.logicalHeight / source.height;
  const scale = Math.min(widthScale, heightScale);
  const drawWidth = Math.max(1, Math.round(source.width * scale));
  const drawHeight = Math.max(1, Math.round(source.height * scale));
  const offsetX = Math.round((state.logicalWidth - drawWidth) / 2);
  const offsetY = Math.round((state.logicalHeight - drawHeight) / 2);

  return {
    x: offsetX,
    y: offsetY,
    width: drawWidth,
    height: drawHeight
  };
}

function pointInReferenceImage(point) {
  const bounds = getReferenceImageBounds();
  if (!bounds || !point) {
    return false;
  }

  return point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height;
}

function projectDetectedObjectsToReference(extraction) {
  const bounds = getReferenceImageBounds();
  const sourceRect = extraction?.detectionImageRect;
  const objects = extraction?.detectionObjects;
  if (!bounds || !sourceRect || !objects || sourceRect.width <= 0 || sourceRect.height <= 0) {
    return null;
  }

  const scaleX = bounds.width / sourceRect.width;
  const scaleY = bounds.height / sourceRect.height;
  const radiusScale = (scaleX + scaleY) / 2;
  const mapPoint = (x, y) => ({
    x: bounds.x + (x - sourceRect.x) * scaleX,
    y: bounds.y + (y - sourceRect.y) * scaleY
  });

  const lines = (objects.lines || []).map((line) => {
    const start = mapPoint(line.x1, line.y1);
    const end = mapPoint(line.x2, line.y2);
    return { type: "line", x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  });
  const circles = (objects.circles || []).map((circle) => {
    const center = mapPoint(circle.cx, circle.cy);
    return { type: "circle", cx: center.x, cy: center.y, r: circle.r * radiusScale };
  });
  const parabolas = (objects.parabolas || []).map((parabola) => {
    const vertex = mapPoint(parabola.vx, parabola.vy);
    const focus = mapPoint(parabola.fx, parabola.fy);
    return { type: "parabola", vx: vertex.x, vy: vertex.y, fx: focus.x, fy: focus.y };
  });
  const labels = (objects.labels || []).map((label) => {
    const mapped = mapPoint(label.x, label.y);
    return { type: "label", x: mapped.x, y: mapped.y, text: label.text };
  });

  return {
    lines,
    circles,
    points: [],
    parabolas,
    labels,
    info: extraction.debugOverlay?.info || "background objects"
  };
}

function findDetectedImageObjectAtPoint(point) {
  const overlay = state.imageDebugOverlay;
  if (!overlay || !point) {
    return null;
  }

  const labelHit = (overlay.labels || []).find((candidate) =>
    !candidate.imported && Math.hypot(point.x - candidate.x, point.y - candidate.y) <= 24
  );
  if (labelHit) return labelHit;

  const lineHit = (overlay.lines || []).find((candidate) =>
    !candidate.imported && distToSegment(point.x, point.y, candidate.x1, candidate.y1, candidate.x2, candidate.y2) <= 11
  );
  if (lineHit) return lineHit;

  const circleHit = (overlay.circles || []).find((candidate) =>
    !candidate.imported && Math.abs(Math.hypot(point.x - candidate.cx, point.y - candidate.cy) - candidate.r) <= 12
  );
  if (circleHit) return circleHit;

  return (overlay.parabolas || []).find((candidate) =>
    !candidate.imported && pointNearParabola(point, candidate, 12)
  ) || null;
}

function importDetectedImageObject(object) {
  if (!object || object.imported || object.type === "point") {
    return false;
  }

  pushUndoSnapshot();
  const id = getNextId();
  const previousShapeCount = state.shapes.length;

  if (object.type === "line") {
    addLineCore(
      { x: object.x1, y: object.y1 },
      { x: object.x2, y: object.y2 },
      state.color
    );
  } else if (object.type === "circle") {
    addCircleCore(object.cx, object.cy, object.r, state.color);
  } else if (object.type === "parabola") {
    state.shapes.push({
      type: "parabola",
      id,
      vx: object.vx,
      vy: object.vy,
      fx: object.fx,
      fy: object.fy,
      color: state.color
    });
    appendPointShapeIfMissing({ x: object.vx, y: object.vy }, id, state.color);
    appendPointShapeIfMissing({ x: object.fx, y: object.fy }, id, state.color);
  } else if (object.type === "label") {
    state.shapes.push({
      type: "label",
      id,
      x: object.x,
      y: object.y,
      text: object.text || "Label",
      color: state.color
    });
  } else {
    state.actions.pop();
    return false;
  }

  if (state.shapes.length === previousShapeCount) {
    state.actions.pop();
    return false;
  }

  object.imported = true;
  removeDuplicatePointShapes();
  state.referenceImageSelected = false;
  state.selection = new Set(state.shapes.filter((shape) =>
    shape.type !== "point" && shapeBaseId(shape.id) === String(id)
  ));
  state.equationEditMode = false;
  rebuildMarkup();
  updateEquationLegend();
  highlightMarkupForShapes(state.selection);
  render();
  setStatus(`Selected detected ${object.type} and added it as editable geometry id=${id}.`);
  return true;
}

function drawReferenceImage() {
  const reference = state.referenceImage;
  const bounds = getReferenceImageBounds();
  if (!reference || !bounds) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(reference.image, bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.restore();
}

function drawReferenceImageSelection() {
  if (!state.referenceImageSelected) {
    return;
  }

  const bounds = getReferenceImageBounds();
  if (!bounds) {
    return;
  }

  const handleSize = 9;
  const halfHandle = handleSize / 2;
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height]
  ];

  ctx.save();
  ctx.strokeStyle = "#06b6d4";
  ctx.fillStyle = "#ecfeff";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 5]);
  ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
  ctx.setLineDash([]);

  for (const [x, y] of corners) {
    ctx.fillRect(x - halfHandle, y - halfHandle, handleSize, handleSize);
    ctx.strokeRect(x - halfHandle, y - halfHandle, handleSize, handleSize);
  }

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
    if (line.imported) continue;
    ctx.strokeStyle = "rgba(59, 130, 246, 0.9)";
    ctx.beginPath();
    ctx.moveTo(line.x1, line.y1);
    ctx.lineTo(line.x2, line.y2);
    ctx.stroke();
  }

  ctx.setLineDash([4, 3]);
  for (const circle of overlay.circles || []) {
    if (circle.imported) continue;
    ctx.strokeStyle = "rgba(245, 158, 11, 0.95)";
    ctx.beginPath();
    ctx.arc(circle.cx, circle.cy, Math.max(2, circle.r), 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
    ctx.font = "600 10px Inter, sans-serif";
    ctx.fillText(`r=${formatMathNumber(circle.r / state.gridUnit)}`, circle.cx + 8, circle.cy - 8);
  }

  ctx.setLineDash([]);
  for (const parabola of overlay.parabolas || []) {
    if (parabola.imported) continue;
    ctx.strokeStyle = "rgba(16, 185, 129, 0.92)";
    ctx.beginPath();
    ctx.moveTo(parabola.vx, parabola.vy);
    ctx.lineTo(parabola.fx, parabola.fy);
    ctx.stroke();
  }

  for (const label of overlay.labels || []) {
    if (label.imported) continue;
    ctx.fillStyle = "rgba(139, 92, 246, 0.95)";
    ctx.font = "600 11px Inter, sans-serif";
    ctx.fillText(String(label.text || "Label"), label.x, label.y);
  }

  ctx.fillStyle = "rgba(30, 41, 59, 0.82)";
  ctx.fillRect(12, 12, 245, 42);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "600 10px Inter, sans-serif";
  const txt = overlay.info || "debug overlay";
  ctx.fillText(`Detector: ${txt}`, 18, 30);
  ctx.fillText("Blue=line  Amber=circle", 18, 44);
  ctx.restore();
}

function render(mousePoint = null) {
  clearCanvas();
  drawReferenceImage();
  if (state.showGrid) drawGridLines();
  drawAxes();
  drawImageDebugOverlay();
  drawShapes();
  drawReferenceImageSelection();
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

  if (state.referenceImageSelected && state.referenceImage) {
    const imageName = state.referenceImage.name || "background image";
    if (!window.confirm(`Delete selected background image ${imageName}?`)) {
      setStatus("Delete canceled.");
      return;
    }

    state.referenceImage = null;
    state.referenceImageSelected = false;
    state.imageCirclePick = null;
    state.imageDebugOverlay = null;
    updateEquationLegend();
    updateMarkupHighlight([]);
    render();
    setAiStatus("Background image removed.", "ok");
    setStatus(`Deleted selected background image ${imageName}.`);
    return;
  }

  if (state.selection.size === 0) {
    setStatus("Select one or more shapes or the background image before deleting.", true);
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

function findShapeAtPoint(p, { includePoints = true } = {}) {
  const HIT_PT = 10, HIT_LINE = 7, HIT_LABEL = 22;
  if (includePoints) {
    for (const s of state.shapes)
      if (s.type === "point" && Math.hypot(p.x - s.x, p.y - s.y) <= HIT_PT) return s;
  }
  for (const s of state.shapes) {
    if (s.type !== "label") continue;
    if (s.labelType === "angle") {
      const labelPoint = angleCurveLabelPosition(s);
      if (s.text && Math.hypot(p.x - labelPoint.x, p.y - labelPoint.y) <= Math.max(HIT_LABEL, getLabelTextSize(s))) return s;
      const pointAngle = Math.atan2(p.y - s.y, p.x - s.x);
      const pointDelta = positiveAngleDelta(s.ang1, pointAngle);
      const arcDelta = positiveAngleDelta(s.ang1, s.ang2);
      const radialDistance = Math.abs(Math.hypot(p.x - s.x, p.y - s.y) - s.r);
      if (pointDelta <= arcDelta + 0.04 && radialDistance <= HIT_LINE + 3) return s;
      continue;
    }
    const size = getLabelTextSize(s);
    ctx.save();
    ctx.font = `600 ${size}px Inter, sans-serif`;
    const width = ctx.measureText(String(s.text || "Label")).width;
    ctx.restore();
    if (p.x >= s.x - 6 && p.x <= s.x + width + 6 && p.y >= s.y - size && p.y <= s.y + size) return s;
  }
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
    markupOutput.setSelectionRange(selStart, selEnd);
    const lineH = markupOutput.scrollHeight / Math.max(1, lines.length);
    markupOutput.scrollTop = Math.max(0, (hlRows[0] || 0) * lineH - 40);
    markupHighlightLayer.scrollTop = markupOutput.scrollTop;
    if (!markupLegendEl || markupLegendEl.open) {
      markupOutput.focus({ preventScroll: true });
    }
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
    state.referenceImageSelected = false;
    state.equationEditMode = false;
    updateEquationLegend();
    updateMarkupHighlight([]);
    render();
    return;
  }

  state.referenceImageSelected = false;

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

  if (state.referenceImage) {
    selected = new Set(Array.from(selected).filter((shape) => shape.type !== "point"));
  }

  state.selection = selected;
  syncLabelTextSizeFromSelection();
  state.equationEditMode = false;
  updateEquationLegend();
  highlightMarkupForShapes(selected);
  render();
}

function selectReferenceImage() {
  if (!state.referenceImage) {
    return false;
  }

  _selClickCount = 0;
  _selHitShape = null;
  clearTimeout(_selClickTimer);
  state.selection.clear();
  state.referenceImageSelected = true;
  state.equationEditMode = false;
  updateEquationLegend();
  updateMarkupHighlight([]);
  render();
  setStatus(`Selected background image ${state.referenceImage.name}. Press Delete or Backspace to remove it.`);
  return true;
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

function getAngleCurveLineTargets() {
  const targets = [];
  for (let index = 0; index < state.shapes.length; index += 1) {
    const shape = state.shapes[index];
    if (shape.type !== "line") {
      continue;
    }
    targets.push({
      key: `shape:${index}`,
      a: { x: shape.x1, y: shape.y1 },
      b: { x: shape.x2, y: shape.y2 }
    });
  }

  const vertices = getUniqueVertexPoints();
  for (let i = 0; i < vertices.length; i += 1) {
    for (let j = i + 1; j < vertices.length; j += 1) {
      const helperKey = vertexHelperLineKey(vertices[i], vertices[j]);
      if (!state.solidVertexLineKeys.has(helperKey)) {
        continue;
      }
      targets.push({
        key: `helper:${helperKey}`,
        a: { x: vertices[i].x, y: vertices[i].y },
        b: { x: vertices[j].x, y: vertices[j].y }
      });
    }
  }
  return targets;
}

function findNearestAngleCurveLineTarget(point, radius, excludedKey = null) {
  let nearest = null;
  let bestDistance = radius;
  for (const target of getAngleCurveLineTargets()) {
    if (target.key === excludedKey) {
      continue;
    }
    const snappedPoint = closestPointOnSegment(point, target.a, target.b);
    const targetDistance = distance(point, snappedPoint);
    if (targetDistance <= bestDistance) {
      bestDistance = targetDistance;
      nearest = {
        ...target,
        x: snappedPoint.x,
        y: snappedPoint.y,
        kind: "line"
      };
    }
  }
  return nearest;
}

function intersectInfiniteLines(first, second) {
  const firstDx = first.b.x - first.a.x;
  const firstDy = first.b.y - first.a.y;
  const secondDx = second.b.x - second.a.x;
  const secondDy = second.b.y - second.a.y;
  const denominator = cross(firstDx, firstDy, secondDx, secondDy);
  if (Math.abs(denominator) < 1e-8) {
    return null;
  }
  const offsetX = second.a.x - first.a.x;
  const offsetY = second.a.y - first.a.y;
  const firstT = cross(offsetX, offsetY, secondDx, secondDy) / denominator;
  return {
    x: first.a.x + firstT * firstDx,
    y: first.a.y + firstT * firstDy
  };
}

function pointWithinTargetSegment(point, target, tolerance = 1) {
  return point.x >= Math.min(target.a.x, target.b.x) - tolerance &&
    point.x <= Math.max(target.a.x, target.b.x) + tolerance &&
    point.y >= Math.min(target.a.y, target.b.y) - tolerance &&
    point.y <= Math.max(target.a.y, target.b.y) + tolerance;
}

function maxDistanceAlongTargetRay(center, target, angle) {
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  let maximum = 0;
  for (const endpoint of [target.a, target.b]) {
    const dx = endpoint.x - center.x;
    const dy = endpoint.y - center.y;
    const projection = dx * direction.x + dy * direction.y;
    if (projection > maximum) {
      maximum = projection;
    }
  }
  return maximum;
}

function buildAngleCurveDraft(startTarget, endTarget) {
  if (!startTarget || !endTarget || startTarget.key === endTarget.key) {
    return null;
  }
  const center = intersectInfiniteLines(startTarget, endTarget);
  if (!center || !pointWithinTargetSegment(center, startTarget) || !pointWithinTargetSegment(center, endTarget)) {
    return null;
  }

  const startDistance = Math.hypot(startTarget.x - center.x, startTarget.y - center.y);
  const endDistance = Math.hypot(endTarget.x - center.x, endTarget.y - center.y);
  if (startDistance < 3 || endDistance < 3) {
    return null;
  }

  let startAngle = Math.atan2(startTarget.y - center.y, startTarget.x - center.x);
  let endAngle = Math.atan2(endTarget.y - center.y, endTarget.x - center.x);
  let firstRayTarget = startTarget;
  let secondRayTarget = endTarget;
  let delta = positiveAngleDelta(startAngle, endAngle);
  if (delta > Math.PI) {
    [startAngle, endAngle] = [endAngle, startAngle];
    [firstRayTarget, secondRayTarget] = [secondRayTarget, firstRayTarget];
    delta = Math.PI * 2 - delta;
  }
  if (delta < Math.PI / 180) {
    return null;
  }

  const startRayLimit = maxDistanceAlongTargetRay(center, firstRayTarget, startAngle);
  const endRayLimit = maxDistanceAlongTargetRay(center, secondRayTarget, endAngle);
  const radius = Math.min(endDistance, startRayLimit, endRayLimit);
  if (!Number.isFinite(radius) || radius < 12) {
    return null;
  }

  return {
    type: "label",
    labelType: "angle",
    x: center.x,
    y: center.y,
    r: radius,
    ang1: startAngle,
    ang2: endAngle,
    text: state.angleCurveAutoLabel ? `${formatAngle(delta * 180 / Math.PI)}°` : "",
    size: state.labelTextSize,
    color: state.color
  };
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
      if (shape.type === "label" && shape.labelType === "angle") {
        shape.r = Math.max(1, Math.round(shape.r * factor));
      }
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
    size: state.labelTextSize,
    color: state.color
  });
  rebuildMarkup();
  render();
  setStatus(`Added label id=${id}.`);
}

function addAngleCurve(shape) {
  pushUndoSnapshot();
  const id = getNextId();
  state.shapes.push({ ...shape, id });
  rebuildMarkup();
  render();
  setStatus(shape.text
    ? `Added angle curve id=${id} (${shape.text}).`
    : `Added plain angle curve id=${id}.`);
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

      if (!state.moveDidChange && Math.hypot(dx, dy) < 3) {
        render(currentPoint);
        return;
      }

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

    if (state.mode === "angleCurve" && state.angleCurveStartTarget) {
      const angleCurvePoint = toCanvasPoint(event);
      const target = findNearestAngleCurveLineTarget(
        angleCurvePoint,
        state.snapRadius * 1.5,
        state.angleCurveStartTarget.key
      );
      state.lastPointerPoint = angleCurvePoint;
      state.hoverPoint = target;
      state.draftCurrentPoint = target || angleCurvePoint;
      state.angleCurveDraft = target ? buildAngleCurveDraft(state.angleCurveStartTarget, target) : null;
      if (target && state.angleCurveDraft) {
        setSnapInfo(snapInfoText("target: second line"));
        setStatus(state.angleCurveDraft.text
          ? `Angle Curve: ${state.angleCurveDraft.text}. Drag along the line to resize, then release.`
          : "Plain Angle Curve: drag along the line to resize, then release.");
      } else if (target) {
        setSnapInfo(snapInfoText("target: invalid line pair"));
      } else {
        setSnapInfo(snapInfoText("target: second line"));
      }
      render(angleCurvePoint);
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

  if (state.mode === "angleCurve") {
    const angleCurvePoint = toCanvasPoint(event);
    state.hoverPoint = findNearestAngleCurveLineTarget(angleCurvePoint, state.snapRadius * 1.5);
    setSnapInfo(snapInfoText(state.hoverPoint ? "target: first line" : "target: line"));
  } else if (state.mode === "line" && state.lineDrawMode === "diameter") {
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
  if (state.mode === "line" || state.mode === "angleCurve") {
    setSnapInfo(snapInfoText("target: none"));
  }
  if (!state.isDragging) {
    render();
  }
});

canvas.addEventListener("mousedown", (event) => {
  const canvasPoint = toCanvasPoint(event);

  if (state.mode === "select") {
    if (queueVertexHelperLineToggle(canvasPoint)) {
      return;
    }

    const hit = findShapeAtPoint(canvasPoint, { includePoints: !state.referenceImage });
    if (hit) {
      applySelectClick(hit);
    } else if (importDetectedImageObject(findDetectedImageObjectAtPoint(canvasPoint))) {
      // Detected image objects become normal editable geometry when selected.
    } else if (pointInReferenceImage(canvasPoint)) {
      selectReferenceImage();
    } else {
      applySelectClick(null);
    }
    return;
  }

  if (state.mode === "move") {
    const hit = findShapeAtPoint(canvasPoint, { includePoints: !state.referenceImage });

    if (!hit) {
      const detected = findDetectedImageObjectAtPoint(canvasPoint);
      if (importDetectedImageObject(detected)) {
        setStatus(`Selected detected ${detected.type}. Drag it on the next interaction to move it.`);
        return;
      }

      applySelectClick(null);
      setStatus("Move mode: click geometry to select it, then drag it on the next interaction.");
      return;
    }

    if (state.selection.size === 0 || !state.selection.has(hit)) {
      applySelectClick(hit);
      setStatus(`Selected ${hit.type} id=${hit.id}. Drag the selected geometry on the next interaction to move it.`);
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
    setStatus(`Drag to move ${state.selection.size} selected shape${state.selection.size === 1 ? "" : "s"}.`);
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

  if (state.mode === "angleCurve") {
    const rawStart = toCanvasPoint(event);
    const target = findNearestAngleCurveLineTarget(rawStart, state.snapRadius * 1.5);
    if (!target) {
      state.hoverPoint = null;
      setSnapInfo(snapInfoText("target: line"));
      setStatus("Angle Curve: press closer to the first line.", true);
      render(rawStart);
      return;
    }

    state.isDragging = true;
    state.angleCurveStartTarget = target;
    state.angleCurveDraft = null;
    state.draftPoint = { x: target.x, y: target.y };
    state.draftCurrentPoint = state.draftPoint;
    state.lastPointerPoint = rawStart;
    state.hoverPoint = target;
    setSnapInfo(snapInfoText("target: first line"));
    setStatus("First line snapped. Drag along a different intersecting line to size the angle curve.");
    render(rawStart);
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
      : "Selection unchanged. Drag the selected geometry to move it.");
    return;
  }

  if (state.mode === "angleCurve") {
    if (!state.isDragging || !state.angleCurveStartTarget) {
      return;
    }

    const rawEnd = toCanvasPoint(event);
    const endTarget = findNearestAngleCurveLineTarget(
      rawEnd,
      state.snapRadius * 1.5,
      state.angleCurveStartTarget.key
    );
    const angleCurve = endTarget
      ? buildAngleCurveDraft(state.angleCurveStartTarget, endTarget)
      : state.angleCurveDraft;

    state.isDragging = false;
    state.angleCurveStartTarget = null;
    state.angleCurveDraft = null;
    state.draftPoint = null;
    state.draftCurrentPoint = null;
    state.lastPointerPoint = null;
    state.hoverPoint = null;
    setSnapInfo(snapInfoText("target: line"));

    if (!angleCurve) {
      render(rawEnd);
      setStatus("Angle Curve needs two different intersecting lines. Start and release away from their intersection.", true);
      return;
    }

    addAngleCurve(angleCurve);
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
  state.angleCurveStartTarget = null;
  state.angleCurveDraft = null;
  state.hoverPoint = null;
  if (state.mode === "line" || state.mode === "angleCurve") {
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
  if (state.mode === "select") {
    if (convertSolidVertexHelperLineAt(toCanvasPoint(event))) {
      event.preventDefault();
    }
    return;
  }

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
angleCurveBtn.addEventListener("click", () => setMode("angleCurve"));
deleteBtn.addEventListener("click", () => deleteSelectionWithConfirm());

undoBtn.addEventListener("click", () => {
  cancelPendingVertexHelperClick();
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
  cancelPendingVertexHelperClick();
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
  state.referenceImageSelected = false;
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

if (keepSelectedLinesBtn) {
  keepSelectedLinesBtn.addEventListener("click", () => {
    toggleKeepSelectedVertexLines();
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

labelSizeInputEl?.addEventListener("change", (event) => {
  setLabelTextSize(event.target.value);
});

for (const button of quickColorButtons) {
  button.addEventListener("click", () => {
    setDrawingColor(button.getAttribute("data-color"));
  });
}

window.addEventListener("resize", () => {
  resizeCanvasToFit();
});

if (typeof ResizeObserver !== "undefined" && canvas.parentElement) {
  const canvasResizeObserver = new ResizeObserver(() => {
    resizeCanvasToFit();
  });
  canvasResizeObserver.observe(canvas.parentElement);
}

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
  state.angleCurveStartTarget = null;
  state.angleCurveDraft = null;
  state.hoverPoint = null;
  if (state.mode === "line" || state.mode === "angleCurve") {
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

  if (key === "q") {
    event.preventDefault();
    toggleAngleCurveAutoLabel();
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
syncLabelTextSizeUi();
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
const topMarkupLoadBtn = document.getElementById("topMarkupLoadBtn");
const topMarkupSaveBtn = document.getElementById("topMarkupSaveBtn");

let aiImagePayload = null;
let currentMarkupFileName = "markup.txt";

function setAiStatus(msg, type = "") {
  aiStatusEl.textContent = msg;
  aiStatusEl.className = `ai-status ${type}`;
}

function resetAiImagePreview() {
  aiImagePayload = null;
  state.imageCirclePick = null;
  state.imageDebugOverlay = null;
  state.referenceImage = null;
  state.referenceImageSelected = false;
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

function classifyComponentToPrimitive(component, mask, maskWidth, maskHeight) {
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
    const circleSupport = measureCircleEdgeSupport(
      mask,
      maskWidth,
      maskHeight,
      cx,
      cy,
      radiusRobust
    );
    if (circleSupport.accepted) {
      return {
        kind: "circle",
        data: {
          cx: Math.round(cx),
          cy: Math.round(cy),
          r: Math.max(6, Math.round(radiusRobust))
        }
      };
    }
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

function measureCircleEdgeSupport(mask, width, height, cx, cy, radius) {
  if (!mask || !Number.isFinite(radius) || radius < 6) {
    return { accepted: false, coverage: 0, largestGap: Infinity };
  }

  const sampleCount = Math.round(clampNumber((Math.PI * 2 * radius) / 3, 72, 180));
  const radialTolerance = Math.max(2, Math.min(7, radius * 0.045));
  const supported = new Array(sampleCount).fill(false);
  const octantHits = new Array(8).fill(0);
  const octantTotals = new Array(8).fill(0);

  const hasInkNear = (x, y) => {
    const px = Math.round(x);
    const py = Math.round(y);
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const sx = px + ox;
        const sy = py + oy;
        if (sx >= 0 && sy >= 0 && sx < width && sy < height && mask[sy * width + sx]) {
          return true;
        }
      }
    }
    return false;
  };

  for (let i = 0; i < sampleCount; i += 1) {
    const angle = (i / sampleCount) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const octant = Math.min(7, Math.floor((i * 8) / sampleCount));
    octantTotals[octant] += 1;

    for (let offset = -radialTolerance; offset <= radialTolerance; offset += 1) {
      const testRadius = radius + offset;
      if (hasInkNear(cx + cos * testRadius, cy + sin * testRadius)) {
        supported[i] = true;
        octantHits[octant] += 1;
        break;
      }
    }
  }

  const hitCount = supported.filter(Boolean).length;
  const coverage = hitCount / sampleCount;
  let largestGap = 0;
  let currentGap = 0;
  for (let i = 0; i < sampleCount * 2; i += 1) {
    if (supported[i % sampleCount]) {
      currentGap = 0;
    } else {
      currentGap += 1;
      largestGap = Math.max(largestGap, Math.min(currentGap, sampleCount));
    }
  }

  const octantsCovered = octantHits.filter((hits, index) =>
    hits / Math.max(1, octantTotals[index]) >= 0.42
  ).length;
  const accepted = coverage >= 0.68 &&
    largestGap <= Math.ceil(sampleCount * 0.2) &&
    octantsCovered === 8;

  return { accepted, coverage, largestGap, sampleCount };
}

function inferLargeCirclesFromMask(mask, width, height, components) {
  const circles = [];
  const minRadius = 18;

  for (const component of components) {
    const bboxW = component.bbox.maxX - component.bbox.minX + 1;
    const bboxH = component.bbox.maxY - component.bbox.minY + 1;
    const boxAspect = bboxW / Math.max(1, bboxH);
    const baseRadius = Math.min(bboxW, bboxH) / 2;
    if (baseRadius < minRadius || boxAspect < 0.72 || boxAspect > 1.28) {
      continue;
    }

    const baseCx = (component.bbox.minX + component.bbox.maxX) / 2;
    const baseCy = (component.bbox.minY + component.bbox.maxY) / 2;
    const centerStep = Math.max(1, baseRadius * 0.035);
    let best = null;

    for (const offsetX of [-centerStep, 0, centerStep]) {
      for (const offsetY of [-centerStep, 0, centerStep]) {
        for (const radiusFactor of [0.9, 0.94, 0.98, 1, 1.02]) {
          const candidate = {
            cx: baseCx + offsetX,
            cy: baseCy + offsetY,
            r: baseRadius * radiusFactor
          };
          const support = measureCircleEdgeSupport(
            mask,
            width,
            height,
            candidate.cx,
            candidate.cy,
            candidate.r
          );
          if (!support.accepted) {
            continue;
          }

          const centerPenalty = Math.hypot(offsetX, offsetY) / baseRadius * 0.05;
          const radiusPenalty = Math.abs(radiusFactor - 1) * 0.03;
          const score = support.coverage -
            support.largestGap / support.sampleCount * 0.25 -
            centerPenalty -
            radiusPenalty;
          if (!best || score > best.score) {
            best = { ...candidate, score };
          }
        }
      }
    }

    if (!best) {
      continue;
    }

    const duplicate = circles.some((circle) =>
      Math.hypot(circle.cx - best.cx, circle.cy - best.cy) <= Math.max(5, best.r * 0.08) &&
      Math.abs(circle.r - best.r) <= Math.max(5, best.r * 0.08)
    );
    if (!duplicate) {
      circles.push({
        cx: Math.round(best.cx),
        cy: Math.round(best.cy),
        r: Math.round(best.r)
      });
    }
  }

  return circles;
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

function buildLineDetectionMask(mask, width, height, textBoxes) {
  const lineMask = mask.slice();
  for (const box of textBoxes || []) {
    const minX = Math.max(0, Math.floor(box.minX) - 2);
    const minY = Math.max(0, Math.floor(box.minY) - 2);
    const maxX = Math.min(width - 1, Math.ceil(box.maxX) + 2);
    const maxY = Math.min(height - 1, Math.ceil(box.maxY) + 2);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        lineMask[y * width + x] = 0;
      }
    }
  }
  return lineMask;
}

function detectedLineLength(line) {
  return Math.hypot(line.x2 - line.x1, line.y2 - line.y1);
}

function canonicalDetectedLine(line) {
  let x1 = line.x1;
  let y1 = line.y1;
  let x2 = line.x2;
  let y2 = line.y2;
  let dx = x2 - x1;
  let dy = y2 - y1;
  if (dx < 0 || (Math.abs(dx) < 1e-6 && dy < 0)) {
    [x1, x2] = [x2, x1];
    [y1, y2] = [y2, y1];
    dx = -dx;
    dy = -dy;
  }
  const length = Math.max(1e-6, Math.hypot(dx, dy));
  return {
    ...line,
    x1,
    y1,
    x2,
    y2,
    ux: dx / length,
    uy: dy / length,
    length
  };
}

function mergeCollinearDetectedLines(lines) {
  const candidates = (lines || [])
    .filter((line) => detectedLineLength(line) >= 12)
    .map(canonicalDetectedLine)
    .sort((a, b) => (b.score || 1) - (a.score || 1) || b.length - a.length);
  const merged = [];
  const parallelThreshold = Math.cos(5.5 * Math.PI / 180);

  for (const candidate of candidates) {
    let target = null;
    for (const existing of merged) {
      const directionSimilarity = Math.abs(candidate.ux * existing.ux + candidate.uy * existing.uy);
      if (directionSimilarity < parallelThreshold) {
        continue;
      }

      const nx = -existing.uy;
      const ny = existing.ux;
      const candidateMidX = (candidate.x1 + candidate.x2) / 2;
      const candidateMidY = (candidate.y1 + candidate.y2) / 2;
      const perpendicularDistance = Math.abs(
        (candidateMidX - existing.x1) * nx + (candidateMidY - existing.y1) * ny
      );
      if (perpendicularDistance > 6) {
        continue;
      }

      const project = (x, y) =>
        (x - existing.x1) * existing.ux + (y - existing.y1) * existing.uy;
      const candidateT1 = project(candidate.x1, candidate.y1);
      const candidateT2 = project(candidate.x2, candidate.y2);
      const candidateMin = Math.min(candidateT1, candidateT2);
      const candidateMax = Math.max(candidateT1, candidateT2);
      const gap = Math.max(candidateMin - existing.length, -candidateMax, 0);
      if (gap > 9) {
        continue;
      }

      target = existing;
      break;
    }

    if (!target) {
      merged.push({ ...candidate });
      continue;
    }

    const points = [
      { x: target.x1, y: target.y1 },
      { x: target.x2, y: target.y2 },
      { x: candidate.x1, y: candidate.y1 },
      { x: candidate.x2, y: candidate.y2 }
    ];
    const projections = points.map((point) => ({
      point,
      t: (point.x - target.x1) * target.ux + (point.y - target.y1) * target.uy
    }));
    projections.sort((a, b) => a.t - b.t);
    const start = {
      x: target.x1 + target.ux * projections[0].t,
      y: target.y1 + target.uy * projections[0].t
    };
    const end = {
      x: target.x1 + target.ux * projections[projections.length - 1].t,
      y: target.y1 + target.uy * projections[projections.length - 1].t
    };
    const replacement = canonicalDetectedLine({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      score: Math.max(target.score || 0, candidate.score || 0)
    });
    Object.assign(target, replacement);
  }

  const cleaned = [];
  merged.sort((a, b) => b.length - a.length);
  for (const line of merged) {
    const coveredByLongerLine = cleaned.some((existing) =>
      distToSegment(line.x1, line.y1, existing.x1, existing.y1, existing.x2, existing.y2) <= 9 &&
      distToSegment(line.x2, line.y2, existing.x1, existing.y1, existing.x2, existing.y2) <= 9
    );
    if (!coveredByLongerLine) {
      cleaned.push(line);
    }
  }

  return cleaned.map(({ ux, uy, length, ...line }) => line);
}

function inferLinesInsideCircles(mask, width, height, circles) {
  const candidates = [];
  const hasInkNear = (x, y, nx, ny) => {
    for (let offset = -1; offset <= 1; offset += 1) {
      const px = Math.round(x + nx * offset);
      const py = Math.round(y + ny * offset);
      if (px >= 0 && py >= 0 && px < width && py < height && mask[py * width + px]) {
        return true;
      }
    }
    return false;
  };

  for (const circle of circles || []) {
    if (!Number.isFinite(circle.r) || circle.r < 18) {
      continue;
    }

    const angleSteps = 72;
    const offsetStep = Math.max(2, Math.min(3, circle.r / 40));
    const perimeterInset = Math.max(4, Math.min(8, circle.r * 0.035));
    const minimumRunLength = Math.max(22, Math.min(60, circle.r * 0.3));

    for (let angleIndex = 0; angleIndex < angleSteps; angleIndex += 1) {
      const angle = angleIndex * Math.PI / angleSteps;
      const ux = Math.cos(angle);
      const uy = Math.sin(angle);
      const nx = -uy;
      const ny = ux;

      for (let offset = -circle.r * 0.92; offset <= circle.r * 0.92; offset += offsetStep) {
        const halfChord = Math.sqrt(Math.max(0, circle.r * circle.r - offset * offset));
        const innerHalf = halfChord - perimeterInset;
        if (innerHalf < minimumRunLength / 2) {
          continue;
        }

        const centerX = circle.cx + nx * offset;
        const centerY = circle.cy + ny * offset;
        const sampleStep = 2;
        const sampleCount = Math.max(2, Math.floor((innerHalf * 2) / sampleStep));
        const maxGapSamples = 1;
        let runStart = -1;
        let lastHit = -1;
        let hitCount = 0;

        const finishRun = () => {
          if (runStart < 0 || lastHit < runStart) {
            return;
          }
          const spanSamples = lastHit - runStart + 1;
          const spanLength = (lastHit - runStart) * sampleStep;
          const support = hitCount / spanSamples;
          if (spanLength < minimumRunLength || support < 0.82) {
            return;
          }

          let startT = -innerHalf + runStart * sampleStep;
          let endT = -innerHalf + lastHit * sampleStep;
          if (startT + halfChord <= perimeterInset + sampleStep * 2) {
            startT = -halfChord;
          }
          if (halfChord - endT <= perimeterInset + sampleStep * 2) {
            endT = halfChord;
          }
          candidates.push({
            x1: centerX + ux * startT,
            y1: centerY + uy * startT,
            x2: centerX + ux * endT,
            y2: centerY + uy * endT,
            score: Math.pow(support, 8) + Math.min(1, spanLength / (circle.r * 1.4)) * 0.35
          });
        };

        for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
          const t = -innerHalf + sampleIndex * sampleStep;
          const hit = hasInkNear(centerX + ux * t, centerY + uy * t, nx, ny);
          if (hit) {
            if (runStart < 0) {
              runStart = sampleIndex;
              hitCount = 0;
            }
            lastHit = sampleIndex;
            hitCount += 1;
          } else if (runStart >= 0 && sampleIndex - lastHit > maxGapSamples) {
            finishRun();
            runStart = -1;
            lastHit = -1;
            hitCount = 0;
          }
        }
        finishRun();
      }
    }
  }

  return mergeCollinearDetectedLines(candidates);
}

function infiniteDetectedLineIntersection(first, second) {
  const ax = first.x2 - first.x1;
  const ay = first.y2 - first.y1;
  const bx = second.x2 - second.x1;
  const by = second.y2 - second.y1;
  const denominator = cross(ax, ay, bx, by);
  if (Math.abs(denominator) < 1e-6) {
    return null;
  }
  const dx = second.x1 - first.x1;
  const dy = second.y1 - first.y1;
  const t = cross(dx, dy, bx, by) / denominator;
  return { x: first.x1 + ax * t, y: first.y1 + ay * t };
}

function detectedLineCircleIntersections(line, circle) {
  const normalized = canonicalDetectedLine(line);
  const toCenterX = circle.cx - normalized.x1;
  const toCenterY = circle.cy - normalized.y1;
  const centerT = toCenterX * normalized.ux + toCenterY * normalized.uy;
  const closestX = normalized.x1 + normalized.ux * centerT;
  const closestY = normalized.y1 + normalized.uy * centerT;
  const perpendicularDistance = Math.hypot(circle.cx - closestX, circle.cy - closestY);
  if (perpendicularDistance > circle.r + 1) {
    return [];
  }
  const halfSpan = Math.sqrt(Math.max(0, circle.r * circle.r - perpendicularDistance * perpendicularDistance));
  return [centerT - halfSpan, centerT + halfSpan].map((t) => ({
    x: normalized.x1 + normalized.ux * t,
    y: normalized.y1 + normalized.uy * t
  }));
}

function resolveDetectedLineEndpoints(lines, circles) {
  const merged = mergeCollinearDetectedLines(lines);
  const resolved = merged.map((line, lineIndex) => {
    const length = detectedLineLength(line);
    const snapTolerance = Math.max(8, Math.min(24, length * 0.18));
    const anchors = [];

    for (const circle of circles || []) {
      anchors.push(...detectedLineCircleIntersections(line, circle));
    }

    for (let otherIndex = 0; otherIndex < merged.length; otherIndex += 1) {
      if (otherIndex === lineIndex) {
        continue;
      }
      const other = merged[otherIndex];
      const hit = infiniteDetectedLineIntersection(line, other);
      if (hit && distToSegment(hit.x, hit.y, other.x1, other.y1, other.x2, other.y2) <= snapTolerance) {
        anchors.push(hit);
      }
    }

    const snapEndpoint = (endpoint) => {
      let best = endpoint;
      let bestDistance = snapTolerance;
      for (const anchor of anchors) {
        const anchorDistance = Math.hypot(anchor.x - endpoint.x, anchor.y - endpoint.y);
        if (anchorDistance <= bestDistance) {
          bestDistance = anchorDistance;
          best = anchor;
        }
      }
      return best;
    };

    const start = snapEndpoint({ x: line.x1, y: line.y1 });
    const end = snapEndpoint({ x: line.x2, y: line.y2 });
    if (Math.hypot(end.x - start.x, end.y - start.y) < 8) {
      return line;
    }
    return {
      x1: Math.round(start.x),
      y1: Math.round(start.y),
      x2: Math.round(end.x),
      y2: Math.round(end.y)
    };
  });

  const deduplicated = [];
  const directionThreshold = Math.cos(18 * Math.PI / 180);
  for (const candidate of resolved.sort((a, b) => detectedLineLength(b) - detectedLineLength(a))) {
    const normalizedCandidate = canonicalDetectedLine(candidate);
    let duplicate = null;
    let reverse = false;
    for (const existing of deduplicated) {
      const normalizedExisting = canonicalDetectedLine(existing);
      const directionSimilarity = Math.abs(
        normalizedCandidate.ux * normalizedExisting.ux + normalizedCandidate.uy * normalizedExisting.uy
      );
      if (directionSimilarity < directionThreshold) {
        continue;
      }
      const directDistance = Math.max(
        Math.hypot(candidate.x1 - existing.x1, candidate.y1 - existing.y1),
        Math.hypot(candidate.x2 - existing.x2, candidate.y2 - existing.y2)
      );
      const reverseDistance = Math.max(
        Math.hypot(candidate.x1 - existing.x2, candidate.y1 - existing.y2),
        Math.hypot(candidate.x2 - existing.x1, candidate.y2 - existing.y1)
      );
      if (Math.min(directDistance, reverseDistance) <= 15) {
        duplicate = existing;
        reverse = reverseDistance < directDistance;
        break;
      }
    }

    if (!duplicate) {
      deduplicated.push({ ...candidate });
      continue;
    }

    const candidateStart = reverse
      ? { x: candidate.x2, y: candidate.y2 }
      : { x: candidate.x1, y: candidate.y1 };
    const candidateEnd = reverse
      ? { x: candidate.x1, y: candidate.y1 }
      : { x: candidate.x2, y: candidate.y2 };
    duplicate.x1 = Math.round((duplicate.x1 + candidateStart.x) / 2);
    duplicate.y1 = Math.round((duplicate.y1 + candidateStart.y) / 2);
    duplicate.x2 = Math.round((duplicate.x2 + candidateEnd.x) / 2);
    duplicate.y2 = Math.round((duplicate.y2 + candidateEnd.y) / 2);
  }

  return deduplicated;
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

    const primitive = classifyComponentToPrimitive(component, denoised, detectWidth, detectHeight);
    if (primitive) {
      primitives.push(primitive);
    }
  }

  const inferredLargeCircles = inferLargeCirclesFromMask(
    denoised,
    detectWidth,
    detectHeight,
    components
  );
  for (const circle of inferredLargeCircles) {
    const duplicate = primitives.some((primitive) =>
      primitive.kind === "circle" &&
      Math.hypot(primitive.data.cx - circle.cx, primitive.data.cy - circle.cy) <= Math.max(5, circle.r * 0.1) &&
      Math.abs(primitive.data.r - circle.r) <= Math.max(5, circle.r * 0.1)
    );
    if (!duplicate) {
      primitives.push({ kind: "circle", data: circle });
    }
  }

  const pointPrimitives = primitives
    .filter((primitive) => primitive.kind === "point")
    .map((primitive) => ({ x: primitive.data.x, y: primitive.data.y }));
  const lineDetectionMask = buildLineDetectionMask(denoised, detectWidth, detectHeight, textBoxes);

  const inferredLines = inferLinesBetweenPointCandidates(pointPrimitives, lineDetectionMask, detectWidth, detectHeight);
  for (const line of inferredLines) {
    primitives.push({ kind: "line", data: line });
  }

  const scanLines = inferLinesFromMask(lineDetectionMask, detectWidth, detectHeight);
  for (const line of scanLines) {
    primitives.push({ kind: "line", data: line });
  }

  const detectedCircleData = primitives
    .filter((primitive) => primitive.kind === "circle")
    .map((primitive) => ({ ...primitive.data }));
  const circleInteriorLines = inferLinesInsideCircles(
    lineDetectionMask,
    detectWidth,
    detectHeight,
    detectedCircleData
  );
  for (const line of circleInteriorLines) {
    primitives.push({ kind: "line", data: line });
  }

  const resolvedLineData = resolveDetectedLineEndpoints(
    primitives.filter((primitive) => primitive.kind === "line").map((primitive) => primitive.data),
    detectedCircleData
  );
  for (let index = primitives.length - 1; index >= 0; index -= 1) {
    if (primitives[index].kind === "line") {
      primitives.splice(index, 1);
    }
  }
  for (const line of resolvedLineData) {
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
    points: [],
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

  result.detectionImageRect = {
    x: offsetX,
    y: offsetY,
    width: drawWidth,
    height: drawHeight
  };
  result.detectionObjects = {
    points: [],
    lines: primitives
      .filter((primitive) => primitive.kind === "line")
      .map((primitive) => ({ ...primitive.data })),
    circles: primitives
      .filter((primitive) => primitive.kind === "circle")
      .map((primitive) => ({ ...primitive.data })),
    parabolas: primitives
      .filter((primitive) => primitive.kind === "parabola")
      .map((primitive) => ({ ...primitive.data })),
    labels: labels.map((label) => ({ ...label }))
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
  if (aiSendBtn.disabled) {
    return;
  }

  const prompt = aiPromptEl.value.trim();
  const hasImage = Boolean(aiImagePayload?.dataUrl);
  if (!prompt && !hasImage) {
    setAiStatus("Enter a description or choose a reference image first.", "error");
    return;
  }
  const model = aiModelSelectEl?.value || "gpt-5.6-terra";
  const append = Boolean(aiAppendEl.checked);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 125000);
  let applying = false;
  let previousShapes = null;
  aiSendBtn.disabled = true;
  aiSendBtn.classList.add("is-loading");
  aiSendBtn.setAttribute("aria-busy", "true");
  aiSendBtn.textContent = "Generating…";
  setAiStatus(hasImage ? "Analyzing image and generating editable geometry…" : "Generating editable geometry…");
  try {
    const res = await fetch("/api/ai-markup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        prompt,
        gridUnit: state.gridUnit,
        model,
        imageDataUrl: aiImagePayload?.dataUrl || "",
        append,
        existingMarkup: markupOutput.value
      })
    });
    const responseText = await res.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
      throw new Error(`Server returned an invalid response (${res.status}).`);
    }
    if (!res.ok || data.error) throw new Error(data.error || "Server error");
    if (typeof data.markup !== "string" || !data.markup.trim()) {
      throw new Error("The model returned no drawable geometry.");
    }

    const clean = data.markup.replace(/```[^\n]*\n?/g, "").trim();
    const cleanLines = clean.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
    const incoming = cleanLines.map(parseMarkupLine);
    if (!incoming.length || incoming.some((shape) => !shape)) {
      throw new Error("The generated markup contains an unsupported or invalid shape.");
    }

    previousShapes = cloneShapes(state.shapes);
    pushUndoSnapshot();
    applying = true;
    if (!append) {
      state.shapes = [];
      state.selection.clear();
    }

    for (const shape of incoming) {
      if (shape.type === "line") {
        addLineCore({ x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 }, shape.color);
      } else if (shape.type === "circle") {
        addCircleCore(shape.cx, shape.cy, shape.r, shape.color);
      } else if (shape.type === "point") {
        if (!hasPointShape(shape)) {
          state.shapes.push({ ...shape, id: getNextId() });
        }
      } else if (shape.type === "parabola") {
        state.shapes.push({ ...shape, id: getNextId() });
      } else if (shape.type === "label") {
        state.shapes.push({ ...shape, id: getNextId() });
      }
    }

    removeDuplicatePointShapes();
    state.selection.clear();
    state.angleAnalysis = null;
    markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
    updateEquationLegend();
    updateMarkupHighlight([]);
    render();
    const modelName = data.model || model;
    const summary = typeof data.summary === "string" && data.summary.trim()
      ? ` ${data.summary.trim()}`
      : "";
    setAiStatus(`Done — ${incoming.length} generated shape${incoming.length === 1 ? "" : "s"} applied with ${modelName}.${summary}`, "ok");
  } catch (err) {
    if (applying && previousShapes) {
      state.shapes = previousShapes;
      state.actions.pop();
      markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
      updateEquationLegend();
      render();
    }
    const message = err.name === "AbortError"
      ? "Generation timed out. Try a shorter prompt, a smaller image, or the Terra model."
      : err.message;
    setAiStatus(`Error: ${message}`, "error");
  } finally {
    clearTimeout(timeout);
    aiSendBtn.disabled = false;
    aiSendBtn.classList.remove("is-loading");
    aiSendBtn.removeAttribute("aria-busy");
    aiSendBtn.textContent = "Generate";
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

    state.referenceImageSelected = false;
    state.referenceImage = {
      image,
      width: image.width,
      height: image.height,
      name: aiImagePayload.name || "reference-image"
    };

    setAiStatus("Analyzing objects in the background image…");
    let detectedCount = 0;
    try {
      const extraction = await extractGeometryFromImagePayload(aiImagePayload);
      state.imageCirclePick = extraction.circlePickContext;
      state.imageDebugOverlay = projectDetectedObjectsToReference(extraction);
      if (state.imageDebugOverlay) {
        detectedCount = ["lines", "circles", "parabolas", "labels"]
          .reduce((count, key) => count + (state.imageDebugOverlay[key]?.length || 0), 0);
      }
    } catch (detectionError) {
      state.imageCirclePick = null;
      state.imageDebugOverlay = null;
    }

    render();

    setAiStatus(`Image loaded as a 50% opacity background. ${detectedCount} selectable object${detectedCount === 1 ? "" : "s"} detected.`, "ok");
    setStatus(detectedCount > 0
      ? `Background image ${state.referenceImage.name} loaded. Select a detected object to make it editable.`
      : `Background image ${state.referenceImage.name} loaded; no selectable objects were detected.`);
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
  state.referenceImageSelected = false;
  state.imageCirclePick = null;
  state.imageDebugOverlay = null;
  updateEquationLegend();
  updateMarkupHighlight([]);
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

function normalizeMarkupFileName(value) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
  if (!cleaned) return "";
  return /\.txt$/i.test(cleaned) ? cleaned : `${cleaned}.txt`;
}

function saveMarkupFile() {
  const requestedName = window.prompt("Enter file name:", currentMarkupFileName);
  if (requestedName === null) {
    setStatus("Save canceled.");
    return;
  }

  const fileName = normalizeMarkupFileName(requestedName);
  if (!fileName) {
    setStatus("Enter a file name before saving.", true);
    return;
  }

  currentMarkupFileName = fileName;
  const blob = new Blob([markupOutput.value], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`Saved current markup to ${fileName}.`);
}

function loadMarkupFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".txt,text/plain";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || "");
      const parsed = text.split(/\r?\n/).map(parseMarkupLine).filter(Boolean);
      pushUndoSnapshot();
      state.shapes = parsed;
      state.selection.clear();
      state.angleAnalysis = null;
      removeDuplicatePointShapes();
      markupOutput.value = state.shapes.map(shapeToMarkup).filter(Boolean).join("\n");
      updateEquationLegend();
      updateMarkupHighlight([]);
      render();
      currentMarkupFileName = normalizeMarkupFileName(file.name) || "markup.txt";
      setStatus(`Loaded ${state.shapes.length} markup item${state.shapes.length === 1 ? "" : "s"} from ${file.name}.`);
    };
    reader.onerror = () => setStatus(`Could not load ${file.name}.`, true);
    reader.readAsText(file);
  };
  input.click();
}

markupLoadBtn?.addEventListener("click", loadMarkupFile);
topMarkupLoadBtn?.addEventListener("click", loadMarkupFile);
markupSaveBtn?.addEventListener("click", saveMarkupFile);
topMarkupSaveBtn?.addEventListener("click", saveMarkupFile);

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
  syncLabelTextSizeFromSelection();
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

let floatingLegendZIndex = 10000;

function createFloatingLegendController({ legend, panel, floatButton, minWidth = 360, minHeight = 240, label }) {
  if (!legend || !panel || !floatButton) {
    return null;
  }

  let action = null;

  function clampPanel() {
    if (!legend.classList.contains("is-floating")) {
      return;
    }

    const margin = 8;
    const rect = panel.getBoundingClientRect();
    const maxWidth = Math.max(1, window.innerWidth - margin * 2);
    const maxHeight = Math.max(1, window.innerHeight - margin * 2);
    const width = Math.min(rect.width, maxWidth);
    const height = Math.min(rect.height, maxHeight);
    const left = clampNumber(rect.left, margin, Math.max(margin, window.innerWidth - width - margin));
    const top = clampNumber(rect.top, margin, Math.max(margin, window.innerHeight - height - margin));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.width = `${width}px`;
    panel.style.height = `${height}px`;
  }

  function setFloating(floating) {
    if (floating) {
      legend.open = true;
      const rect = panel.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(Math.max(minWidth, rect.width), Math.max(1, window.innerWidth - margin * 2));
      const height = Math.min(Math.max(minHeight, rect.height), Math.max(1, window.innerHeight - margin * 2));
      const left = clampNumber(rect.left, margin, Math.max(margin, window.innerWidth - width - margin));
      const top = clampNumber(rect.top, margin, Math.max(margin, window.innerHeight - height - margin));

      legend.classList.add("is-floating");
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.width = `${width}px`;
      panel.style.height = `${height}px`;
      panel.style.zIndex = String(++floatingLegendZIndex);
    } else {
      legend.classList.remove("is-floating");
      panel.removeAttribute("style");
    }

    floatButton.textContent = floating ? "Dock" : "Float";
    floatButton.setAttribute("aria-pressed", String(floating));
    floatButton.title = floating ? `Return ${label} to the top bar` : `Float ${label} over the canvas`;
  }

  floatButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setFloating(!legend.classList.contains("is-floating"));
  });

  function beginAction(event, type, corner = "") {
    if (!legend.classList.contains("is-floating")) {
      return;
    }
    if (type === "drag" && event.target instanceof Element && event.target.closest("button")) {
      return;
    }

    const rect = panel.getBoundingClientRect();
    action = {
      type,
      corner,
      startX: event.clientX,
      startY: event.clientY,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom
    };
    event.preventDefault();
  }

  panel.addEventListener("mousedown", () => {
    if (legend.classList.contains("is-floating")) {
      panel.style.zIndex = String(++floatingLegendZIndex);
    }
  }, true);

  panel.querySelector(".floating-legend-toolbar")?.addEventListener("mousedown", (event) => beginAction(event, "drag"));
  for (const handle of panel.querySelectorAll("[data-resize-corner]")) {
    handle.addEventListener("mousedown", (event) => {
      beginAction(event, "resize", handle.dataset.resizeCorner || "");
      event.stopPropagation();
    });
  }

  document.addEventListener("mousemove", (event) => {
    if (!action) {
      return;
    }

    const margin = 8;
    const dx = event.clientX - action.startX;
    const dy = event.clientY - action.startY;
    if (action.type === "drag") {
      const width = action.right - action.left;
      const height = action.bottom - action.top;
      const left = clampNumber(action.left + dx, margin, Math.max(margin, window.innerWidth - width - margin));
      const top = clampNumber(action.top + dy, margin, Math.max(margin, window.innerHeight - height - margin));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      return;
    }

    const boundedMinWidth = Math.max(1, Math.min(minWidth, window.innerWidth - margin * 2));
    const boundedMinHeight = Math.max(1, Math.min(minHeight, window.innerHeight - margin * 2));
    let left = action.left;
    let right = action.right;
    let top = action.top;
    let bottom = action.bottom;

    if (action.corner.includes("l")) {
      left = clampNumber(action.left + dx, margin, right - boundedMinWidth);
    }
    if (action.corner.includes("r")) {
      right = clampNumber(action.right + dx, left + boundedMinWidth, window.innerWidth - margin);
    }
    if (action.corner.includes("t")) {
      top = clampNumber(action.top + dy, margin, bottom - boundedMinHeight);
    }
    if (action.corner.includes("b")) {
      bottom = clampNumber(action.bottom + dy, top + boundedMinHeight, window.innerHeight - margin);
    }

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    panel.style.width = `${right - left}px`;
    panel.style.height = `${bottom - top}px`;
  });

  document.addEventListener("mouseup", () => {
    action = null;
  });

  window.addEventListener("resize", clampPanel);

  return { setFloating, clampPanel };
}

createFloatingLegendController({
  legend: markupLegendEl,
  panel: markupLegendPanelEl,
  floatButton: markupFloatBtn,
  minWidth: 360,
  minHeight: 240,
  label: "Live Markup"
});

createFloatingLegendController({
  legend: aiLegendEl,
  panel: aiLegendPanelEl,
  floatButton: aiFloatBtn,
  minWidth: 320,
  minHeight: 320,
  label: "AI Draw"
});
