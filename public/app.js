const markupInput = document.getElementById("markupInput");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const svgViewport = document.getElementById("svgViewport");
const inspectOutput = document.getElementById("inspectOutput");
const loadBtn = document.getElementById("loadBtn");
const saveBtn = document.getElementById("saveBtn");
const renderBtn = document.getElementById("renderBtn");
const downloadBtn = document.getElementById("downloadBtn");
const selectModeBtn = document.getElementById("selectModeBtn");
const lineModeBtn = document.getElementById("lineModeBtn");
const circleModeBtn = document.getElementById("circleModeBtn");
const cancelDrawBtn = document.getElementById("cancelDrawBtn");
const snapInfoEl = document.getElementById("snapInfo");

const state = {
  items: [],
  selectedIndex: null,
  currentFile: "Markup.txt",
  svg: "",
  mode: "inspect",
  lineDrawMode: "normal",
  pendingPoint: null,
  pendingCurrentPoint: null,
  pendingDiameterCircle: null,
  hoverPoint: null,
  lastPointerPoint: null,
  isDragging: false,
  snapRadius: 14,
  snapKindFilter: "any"
};

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#a61b1b" : "#4b5f56";
}

function setSnapInfo(text) {
  snapInfoEl.textContent = text;
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

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function formatNumber(value) {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return String(Number(value.toFixed(3)));
}

function quoteMarkupValue(value) {
  if (value === "") {
    return '""';
  }

  if (/\s|"/.test(value)) {
    return `"${value.replace(/([\\"])/g, "\\$1")}"`;
  }

  return value;
}

function formatMarkupValue(key, value) {
  if (key === "visible") {
    if (value === true || value === 1) return "1";
    if (value === false || value === 0) return "0";
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return formatNumber(value);
  }

  return quoteMarkupValue(String(value));
}

function buildMarkupLine(shape, properties) {
  const entries = Object.entries(properties).map(([key, value]) => `${key}=${formatMarkupValue(key, value)}`);
  return `${shape} ${entries.join(" ")}`;
}

function orderedProperties(shape, properties) {
  const keyOrder = {
    line: ["id", "visible", "x1", "y1", "x2", "y2", "color"],
    point: ["id", "visible", "x", "y", "color"],
    circle: ["id", "visible", "cx", "cy", "r", "color"],
    label: ["id", "visible", "type", "x", "y", "ang1", "ang2", "text", "color"]
  };

  const order = keyOrder[shape] || [];
  const normalized = {};

  for (const key of order) {
    if (properties[key] !== undefined) {
      normalized[key] = properties[key];
    }
  }

  for (const [key, value] of Object.entries(properties)) {
    if (normalized[key] === undefined) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function serializeItemsToMarkup(items) {
  return items
    .map((item) => buildMarkupLine(item.shape, orderedProperties(item.shape, item.properties || {})))
    .join("\n");
}

function getNextId() {
  let maxId = 0;

  for (const item of state.items) {
    const rawId = item && item.properties ? item.properties.id : undefined;
    const numericId = typeof rawId === "number" ? rawId : Number.parseFloat(String(rawId));
    if (Number.isFinite(numericId)) {
      maxId = Math.max(maxId, Math.floor(numericId));
    }
  }

  return maxId + 1;
}

function appendMarkupLine(line) {
  const current = markupInput.value;
  if (!current.trim()) {
    markupInput.value = line;
    return;
  }

  markupInput.value = `${current.replace(/\s*$/, "")}\n${line}`;
}

function findItemIndexByShapeAndId(shape, id) {
  for (let i = state.items.length - 1; i >= 0; i -= 1) {
    const item = state.items[i];
    if (item.shape === shape && String(item.properties.id) === String(id)) {
      return i;
    }
  }

  return null;
}

function setMode(mode) {
  state.mode = mode;
  state.pendingPoint = null;
  state.pendingCurrentPoint = null;
  state.pendingDiameterCircle = null;
  state.hoverPoint = null;
  state.isDragging = false;
  clearDraftOverlay();
  clearSnapOverlay();

  selectModeBtn.classList.toggle("is-active", mode === "inspect");
  lineModeBtn.classList.toggle("is-active", mode === "line");
  circleModeBtn.classList.toggle("is-active", mode === "circle");
  svgViewport.classList.toggle("is-drawing", mode !== "inspect");

  if (mode === "inspect") {
    setSnapInfo(snapInfoText("line mode only"));
    setStatus("Inspect mode enabled. Click a shape to read and jump to its markup line.");
  } else if (mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
    setStatus(`Line mode (${lineDrawModeLabel()}): drag to draw from start to end.`);
  } else if (mode === "circle") {
    setSnapInfo(snapInfoText("line mode only"));
    setStatus("Circle mode: drag from center to set radius.");
  }
}

function debounce(fn, waitMs) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}

async function apiCall(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }

  return data;
}

function updateStats(summary) {
  const shapeText = Object.keys(summary.byShape)
    .sort()
    .map((key) => `${key}: ${summary.byShape[key]}`)
    .join(" | ");

  statsEl.textContent = `Items: ${summary.total}${shapeText ? ` | ${shapeText}` : ""}`;
}

function focusMarkupLine(lineNumber) {
  if (!Number.isInteger(lineNumber) || lineNumber < 1) {
    return;
  }

  const lines = markupInput.value.split(/\r?\n/);
  if (lineNumber > lines.length) {
    return;
  }

  let start = 0;
  for (let i = 0; i < lineNumber - 1; i += 1) {
    start += lines[i].length + 1;
  }

  const end = start + lines[lineNumber - 1].length;
  markupInput.focus();
  markupInput.setSelectionRange(start, end);
}

function clearSelection() {
  state.selectedIndex = null;
  inspectOutput.textContent = "";
  document.querySelectorAll(".selected-item").forEach((element) => {
    element.classList.remove("selected-item");
  });
}

function selectItem(index) {
  state.selectedIndex = index;

  document.querySelectorAll(".selected-item").forEach((element) => {
    element.classList.remove("selected-item");
  });

  const selectedElements = svgViewport.querySelectorAll(`[data-item-index="${index}"]`);
  selectedElements.forEach((element) => {
    element.classList.add("selected-item");
  });

  const item = state.items[index];
  if (!item) {
    inspectOutput.textContent = "";
    return;
  }

  inspectOutput.textContent = prettyJson(item);
  focusMarkupLine(item.lineNumber);
}

function getSvgRoot() {
  return svgViewport.querySelector("svg");
}

function clearDraftOverlay() {
  const svg = getSvgRoot();
  if (!svg) {
    return;
  }

  const draft = svg.querySelector("#draft-overlay");
  if (draft) {
    draft.remove();
  }
}

function clearSnapOverlay() {
  const svg = getSvgRoot();
  if (!svg) {
    return;
  }

  const marker = svg.querySelector("#snap-overlay");
  if (marker) {
    marker.remove();
  }
}

function drawSnapOverlay(point) {
  const svg = getSvgRoot();
  if (!svg || !point || state.mode !== "line") {
    clearSnapOverlay();
    return;
  }

  clearSnapOverlay();

  const ns = "http://www.w3.org/2000/svg";
  const offsetX = Number(svg.getAttribute("data-offset-x") || 0);
  const offsetY = Number(svg.getAttribute("data-offset-y") || 0);

  const marker = document.createElementNS(ns, "circle");
  marker.setAttribute("id", "snap-overlay");
  marker.setAttribute("cx", String(point.x + offsetX));
  marker.setAttribute("cy", String(point.y + offsetY));
  marker.setAttribute("r", "9");
  marker.setAttribute("stroke", snapStrokeColor(point.kind));
  marker.setAttribute("stroke-width", "2");
  marker.setAttribute("stroke-dasharray", "5 4");
  marker.setAttribute("fill", "none");
  marker.setAttribute("pointer-events", "none");
  svg.appendChild(marker);
}

function drawDraftOverlay(start, current) {
  const svg = getSvgRoot();
  if (!svg || !start || !current) {
    return;
  }

  clearDraftOverlay();

  const ns = "http://www.w3.org/2000/svg";
  const offsetX = Number(svg.getAttribute("data-offset-x") || 0);
  const offsetY = Number(svg.getAttribute("data-offset-y") || 0);

  const sx = start.x + offsetX;
  const sy = start.y + offsetY;
  const cx = current.x + offsetX;
  const cy = current.y + offsetY;

  let element;
  if (state.mode === "line") {
    element = document.createElementNS(ns, "line");
    element.setAttribute("x1", String(sx));
    element.setAttribute("y1", String(sy));
    element.setAttribute("x2", String(cx));
    element.setAttribute("y2", String(cy));
  } else if (state.mode === "circle") {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const radius = Math.max(1, Math.sqrt(dx * dx + dy * dy));

    element = document.createElementNS(ns, "circle");
    element.setAttribute("cx", String(sx));
    element.setAttribute("cy", String(sy));
    element.setAttribute("r", String(radius));
  } else {
    return;
  }

  element.setAttribute("id", "draft-overlay");
  element.setAttribute("stroke", "#b45309");
  element.setAttribute("stroke-width", "2");
  element.setAttribute("stroke-dasharray", "6 5");
  element.setAttribute("fill", "none");
  element.setAttribute("pointer-events", "none");
  svg.appendChild(element);
}

function getOriginalPointFromClick(event) {
  const svg = getSvgRoot();
  if (!svg || typeof svg.createSVGPoint !== "function") {
    return null;
  }

  const ctm = svg.getScreenCTM();
  if (!ctm) {
    return null;
  }

  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;

  const local = point.matrixTransform(ctm.inverse());
  const offsetX = Number(svg.getAttribute("data-offset-x") || 0);
  const offsetY = Number(svg.getAttribute("data-offset-y") || 0);

  return {
    x: Math.round(local.x - offsetX),
    y: Math.round(local.y - offsetY)
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

  for (const item of state.items) {
    if (item.shape === "point" && (state.snapKindFilter === "any" || state.snapKindFilter === "point")) {
      const p = item.properties || {};
      const candidate = { x: Number(p.x), y: Number(p.y), kind: "point" };
      const d = distance(point, candidate);
      if (d <= best) {
        best = d;
        nearest = candidate;
      }
    }

    if (item.shape === "line" && (state.snapKindFilter === "any" || state.snapKindFilter === "line")) {
      const p = item.properties || {};
      const candidate = closestPointOnSegment(
        point,
        { x: Number(p.x1), y: Number(p.y1) },
        { x: Number(p.x2), y: Number(p.y2) }
      );
      const d = distance(point, candidate);
      if (d <= best) {
        best = d;
        nearest = { x: candidate.x, y: candidate.y, kind: "line" };
      }
    }

    if (item.shape === "circle" && (state.snapKindFilter === "any" || state.snapKindFilter === "circle")) {
      const p = item.properties || {};
      const candidate = closestPointOnCircle(point, {
        cx: Number(p.cx),
        cy: Number(p.cy),
        r: Number(p.r)
      });
      const d = distance(point, candidate);
      if (d <= best) {
        best = d;
        nearest = {
          x: candidate.x,
          y: candidate.y,
          kind: "circle",
          circle: {
            cx: Number(p.cx),
            cy: Number(p.cy),
            r: Number(p.r)
          }
        };
      }
    }
  }

  return nearest;
}

function findNearestCircleSnapTarget(point, radius) {
  let nearest = null;
  let best = radius;

  for (const item of state.items) {
    if (item.shape !== "circle") {
      continue;
    }

    const p = item.properties || {};
    const circle = {
      cx: Number(p.cx),
      cy: Number(p.cy),
      r: Number(p.r)
    };
    const candidate = closestPointOnCircle(point, circle);
    const d = distance(point, candidate);
    if (d <= best) {
      best = d;
      nearest = {
        x: candidate.x,
        y: candidate.y,
        kind: "circle",
        circle
      };
    }
  }

  return nearest;
}

function applySnapFromLastPointer(shiftPressed) {
  if (state.mode !== "line") {
    return;
  }

  if (state.lineDrawMode === "diameter") {
    if (shiftPressed) {
      state.hoverPoint = null;
      clearSnapOverlay();
      setSnapInfo(snapInfoText("off (Shift)"));
      if (state.isDragging && state.pendingPoint && state.lastPointerPoint) {
        state.pendingCurrentPoint = state.lastPointerPoint;
        drawDraftOverlay(state.pendingPoint, state.lastPointerPoint);
      }
      return;
    }

    if (!state.lastPointerPoint) {
      setSnapInfo(snapInfoText("target: none"));
      return;
    }

    state.hoverPoint = findNearestCircleSnapTarget(state.lastPointerPoint, state.snapRadius);
    drawSnapOverlay(state.hoverPoint);
    if (state.hoverPoint) {
      setSnapInfo(snapInfoText("target: circle"));
    } else {
      setSnapInfo(snapInfoText("target: none"));
    }

    if (state.isDragging && state.pendingPoint && state.pendingDiameterCircle) {
      state.pendingCurrentPoint = oppositePointOnCircle(state.pendingPoint, state.pendingDiameterCircle);
      drawDraftOverlay(state.pendingPoint, state.pendingCurrentPoint);
    }
    return;
  }

  if (shiftPressed) {
    state.hoverPoint = null;
    clearSnapOverlay();
    setSnapInfo(snapInfoText("off (Shift)"));
    if (state.isDragging && state.pendingPoint && state.lastPointerPoint) {
      state.pendingCurrentPoint = state.lastPointerPoint;
      drawDraftOverlay(state.pendingPoint, state.lastPointerPoint);
    }
    return;
  }

  if (!state.lastPointerPoint) {
    setSnapInfo(snapInfoText("target: none"));
    return;
  }

  state.hoverPoint = findNearestSnapTarget(state.lastPointerPoint, state.snapRadius);
  drawSnapOverlay(state.hoverPoint);
  if (state.hoverPoint) {
    setSnapInfo(snapInfoText(`target: ${kindLabel(state.hoverPoint.kind)}`));
  } else {
    setSnapInfo(snapInfoText("target: none"));
  }

  if (state.isDragging && state.pendingPoint) {
    state.pendingCurrentPoint = state.hoverPoint || state.lastPointerPoint;
    drawDraftOverlay(state.pendingPoint, state.pendingCurrentPoint);
  }
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
  const existingLines = state.items.filter((item) => item.shape === "line");
  const existingPoints = state.items.filter((item) => item.shape === "point");

  for (const item of existingLines) {
    const p = item.properties;
    const hit = segmentIntersectionPoint(
      start,
      end,
      { x: Number(p.x1), y: Number(p.y1) },
      { x: Number(p.x2), y: Number(p.y2) }
    );

    if (!hit) {
      continue;
    }

    if (pointMatches(hit, start) || pointMatches(hit, end)) {
      continue;
    }

    const alreadyInMarkup = existingPoints.some((pt) => {
      const pp = pt.properties;
      return pointMatches(hit, { x: Number(pp.x), y: Number(pp.y) });
    });

    if (alreadyInMarkup) {
      continue;
    }

    const duplicate = points.some((pnt) => pointMatches(hit, pnt));
    if (duplicate) {
      continue;
    }

    points.push(hit);
  }

  return points;
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

function cloneItems(items) {
  return items.map((item) => ({
    shape: item.shape,
    properties: { ...(item.properties || {}) }
  }));
}

function splitLineItem(lineItem, splitPoints) {
  const props = lineItem.properties || {};
  const start = { x: Number(props.x1), y: Number(props.y1) };
  const end = { x: Number(props.x2), y: Number(props.y2) };
  const segments = buildRaySegments(start, end, splitPoints);

  if (segments.length <= 1) {
    return [lineItem];
  }

  const out = [];
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    out.push({
      shape: "line",
      properties: {
        ...props,
        id: `${props.id}.${i + 1}`,
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2
      }
    });
  }

  return out;
}

function itemsContainPoint(items, point) {
  return items.some((item) => {
    if (item.shape !== "point") {
      return false;
    }

    const p = item.properties || {};
    return pointMatches(point, { x: Number(p.x), y: Number(p.y) });
  });
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

async function addLineFromPoints(start, end) {
  const id = getNextId();
  const workingItems = cloneItems(state.items);
  const hitsByLineIndex = new Map();
  const intersectionPoints = [];

  for (let i = 0; i < workingItems.length; i += 1) {
    const item = workingItems[i];
    if (item.shape !== "line") {
      continue;
    }

    const p = item.properties || {};
    const hit = segmentIntersectionPoint(
      start,
      end,
      { x: Number(p.x1), y: Number(p.y1) },
      { x: Number(p.x2), y: Number(p.y2) }
    );

    if (!hit) {
      continue;
    }

    const onStart = pointMatches(hit, { x: Number(p.x1), y: Number(p.y1) });
    const onEnd = pointMatches(hit, { x: Number(p.x2), y: Number(p.y2) });
    const touchesNewEndpoint = pointMatches(hit, start) || pointMatches(hit, end);

    if (!touchesNewEndpoint && !intersectionPoints.some((pt) => pointMatches(pt, hit))) {
      intersectionPoints.push(hit);
    }

    if (!onStart && !onEnd) {
      const list = hitsByLineIndex.get(i) || [];
      if (!list.some((pt) => pointMatches(pt, hit))) {
        list.push(hit);
        hitsByLineIndex.set(i, list);
      }
    }
  }

  // If start/end is on a line interior (snapped endpoint), split that existing line too.
  for (let i = 0; i < workingItems.length; i += 1) {
    const item = workingItems[i];
    if (item.shape !== "line") {
      continue;
    }

    const p = item.properties || {};
    const a = { x: Number(p.x1), y: Number(p.y1) };
    const b = { x: Number(p.x2), y: Number(p.y2) };

    for (const endpoint of [start, end]) {
      if (!pointOnSegment(endpoint, a, b)) {
        continue;
      }

      const onStart = pointMatches(endpoint, a);
      const onEnd = pointMatches(endpoint, b);
      if (onStart || onEnd) {
        continue;
      }

      const list = hitsByLineIndex.get(i) || [];
      if (!list.some((pt) => pointMatches(pt, endpoint))) {
        list.push({ x: endpoint.x, y: endpoint.y });
        hitsByLineIndex.set(i, list);
      }
    }
  }

  for (const item of workingItems) {
    if (item.shape !== "circle") {
      continue;
    }

    const p = item.properties || {};
    const hits = segmentCircleIntersections(start, end, {
      cx: Number(p.cx),
      cy: Number(p.cy),
      r: Number(p.r)
    });

    for (const hit of hits) {
      if (pointMatches(hit, start) || pointMatches(hit, end)) {
        continue;
      }

      if (!intersectionPoints.some((pt) => pointMatches(pt, hit))) {
        intersectionPoints.push(hit);
      }
    }
  }

  const rewrittenItems = [];
  for (let i = 0; i < workingItems.length; i += 1) {
    const item = workingItems[i];
    if (item.shape !== "line" || !hitsByLineIndex.has(i)) {
      rewrittenItems.push(item);
      continue;
    }

    rewrittenItems.push(...splitLineItem(item, hitsByLineIndex.get(i) || []));
  }

  const segments = buildRaySegments(start, end, intersectionPoints);
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    rewrittenItems.push({
      shape: "line",
      properties: {
        id: segments.length > 1 ? `${id}.${i + 1}` : id,
        visible: 1,
        x1: seg.x1,
        y1: seg.y1,
        x2: seg.x2,
        y2: seg.y2,
        color: "#1a1a2e"
      }
    });
  }

  rewrittenItems.push({
    shape: "point",
    properties: {
      id,
      visible: 1,
      x: start.x,
      y: start.y,
      color: "#1a1a2e"
    }
  });

  rewrittenItems.push({
    shape: "point",
    properties: {
      id,
      visible: 1,
      x: end.x,
      y: end.y,
      color: "#1a1a2e"
    }
  });

  const addedIntersectionPoints = [];
  for (const p of intersectionPoints) {
    if (itemsContainPoint(rewrittenItems, p)) {
      continue;
    }

    rewrittenItems.push({
      shape: "point",
      properties: {
        id,
        visible: 1,
        x: p.x,
        y: p.y,
        color: "#1a1a2e"
      }
    });
    addedIntersectionPoints.push(p);
  }

  markupInput.value = serializeItemsToMarkup(rewrittenItems);
  await renderMarkup();

  const index = findItemIndexByShapeAndId("line", id) ?? findItemIndexByShapeAndId("line", `${id}.1`);
  if (index !== null) {
    selectItem(index);
  }

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

async function addCircleFromPoints(center, edge) {
  const dx = edge.x - center.x;
  const dy = edge.y - center.y;
  const radius = Math.round(Math.sqrt(dx * dx + dy * dy));

  if (radius < 1) {
    setStatus("Circle radius must be at least 1 pixel. Click a farther point.", true);
    return;
  }

  const workingItems = cloneItems(state.items);
  const hitsByLineIndex = new Map();
  const intersectionPoints = [];

  for (let i = 0; i < workingItems.length; i += 1) {
    const item = workingItems[i];
    if (item.shape !== "line") {
      continue;
    }

    const p = item.properties || {};
    const hits = segmentCircleIntersections(
      { x: Number(p.x1), y: Number(p.y1) },
      { x: Number(p.x2), y: Number(p.y2) },
      {
        cx: center.x,
        cy: center.y,
        r: radius
      }
    );

    if (hits.length === 0) {
      continue;
    }

    const splitPoints = [];
    for (const hit of hits) {
      if (!intersectionPoints.some((pt) => pointMatches(pt, hit))) {
        intersectionPoints.push(hit);
      }

      const onStart = pointMatches(hit, { x: Number(p.x1), y: Number(p.y1) });
      const onEnd = pointMatches(hit, { x: Number(p.x2), y: Number(p.y2) });
      if (!onStart && !onEnd && !splitPoints.some((pt) => pointMatches(pt, hit))) {
        splitPoints.push(hit);
      }
    }

    if (splitPoints.length > 0) {
      hitsByLineIndex.set(i, splitPoints);
    }
  }

  for (const item of workingItems) {
    if (item.shape !== "circle") {
      continue;
    }

    const p = item.properties || {};
    const hits = circleCircleIntersections(
      {
        cx: center.x,
        cy: center.y,
        r: radius
      },
      {
        cx: Number(p.cx),
        cy: Number(p.cy),
        r: Number(p.r)
      }
    );

    for (const hit of hits) {
      if (!intersectionPoints.some((pt) => pointMatches(pt, hit))) {
        intersectionPoints.push(hit);
      }
    }
  }

  const rewrittenItems = [];
  for (let i = 0; i < workingItems.length; i += 1) {
    const item = workingItems[i];
    if (item.shape !== "line" || !hitsByLineIndex.has(i)) {
      rewrittenItems.push(item);
      continue;
    }

    rewrittenItems.push(...splitLineItem(item, hitsByLineIndex.get(i) || []));
  }

  const id = getNextId();
  rewrittenItems.push({
    shape: "circle",
    properties: {
      id,
      visible: 1,
      cx: center.x,
      cy: center.y,
      r: radius,
      color: "#1a1a2e"
    }
  });

  rewrittenItems.push({
    shape: "point",
    properties: {
      id,
      visible: 1,
      x: center.x,
      y: center.y,
      color: "#1a1a2e"
    }
  });

  const addedIntersectionPoints = [];
  for (const p of intersectionPoints) {
    if (itemsContainPoint(rewrittenItems, p)) {
      continue;
    }

    rewrittenItems.push({
      shape: "point",
      properties: {
        id,
        visible: 1,
        x: p.x,
        y: p.y,
        color: "#1a1a2e"
      }
    });
    addedIntersectionPoints.push(p);
  }

  markupInput.value = serializeItemsToMarkup(rewrittenItems);
  await renderMarkup();

  const index = findItemIndexByShapeAndId("circle", id);
  if (index !== null) {
    selectItem(index);
  }

  if (addedIntersectionPoints.length > 0) {
    setStatus(`Added circle id=${id} and ${addedIntersectionPoints.length} circle intersection point(s).`);
    return;
  }

  if (intersectionPoints.length > 0) {
    setStatus(`Added circle id=${id} and split crossed line(s).`);
    return;
  }

  setStatus(`Added circle id=${id} with center point.`);
}

async function renderMarkup() {
  try {
    const result = await apiCall("/api/render", {
      method: "POST",
      body: JSON.stringify({
        markup: markupInput.value
      })
    });

    state.items = result.items;
    state.svg = result.svg;
    state.isDragging = false;
    state.pendingPoint = null;
    state.pendingCurrentPoint = null;
    state.hoverPoint = null;

    svgViewport.innerHTML = result.svg;
    updateStats(result.summary);

    if (state.selectedIndex !== null) {
      selectItem(state.selectedIndex);
    }

    setStatus(`Rendered ${result.summary.total} item(s) from ${state.currentFile}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

const debouncedRender = debounce(renderMarkup, 220);

async function loadMarkup() {
  try {
    const result = await apiCall(`/api/load?file=${encodeURIComponent(state.currentFile)}`);
    state.currentFile = result.file;
    markupInput.value = result.markup;
    clearSelection();
    await renderMarkup();
    setStatus(`Loaded ${state.currentFile}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function saveMarkup() {
  try {
    const file = window.prompt("Save file path (relative to workspace root):", state.currentFile) || state.currentFile;
    const result = await apiCall("/api/save", {
      method: "POST",
      body: JSON.stringify({
        file,
        markup: markupInput.value
      })
    });

    state.currentFile = result.file;
    setStatus(`Saved ${result.file}`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function downloadSvg() {
  if (!state.svg) {
    setStatus("Nothing to download yet. Render first.", true);
    return;
  }

  const blob = new Blob([state.svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "drawing.svg";
  anchor.click();
  URL.revokeObjectURL(url);
}

svgViewport.addEventListener("click", (event) => {
  if (state.mode !== "inspect") {
    return;
  }

  const target = event.target.closest("[data-item-index]");
  if (!target) {
    return;
  }

  const index = Number(target.getAttribute("data-item-index"));
  if (Number.isInteger(index)) {
    selectItem(index);
  }
});

svgViewport.addEventListener("mousedown", (event) => {
  if (state.mode !== "line" && state.mode !== "circle") {
    return;
  }

  const rawPoint = getOriginalPointFromClick(event);
  if (!rawPoint) {
    setStatus("Cannot read pointer position yet. Render first.", true);
    return;
  }

  let point = rawPoint;
  let snapped = false;
  state.pendingDiameterCircle = null;
  if (state.mode === "line" && state.lineDrawMode === "diameter") {
    if (!event.shiftKey) {
      const nearestCircle = findNearestCircleSnapTarget(rawPoint, state.snapRadius);
      if (nearestCircle) {
        point = nearestCircle;
        state.pendingDiameterCircle = nearestCircle.circle;
        snapped = true;
      }
    }

    if (!state.pendingDiameterCircle && !event.shiftKey) {
      const nearest = findNearestSnapTarget(rawPoint, state.snapRadius);
      if (nearest) {
        point = nearest;
        snapped = true;
      }
    }
  } else if (state.mode === "line" && !event.shiftKey) {
    const nearest = findNearestSnapTarget(rawPoint, state.snapRadius);
    if (nearest) {
      point = nearest;
      snapped = true;
    }
  }

  event.preventDefault();
  clearSnapOverlay();
  state.hoverPoint = null;
  state.isDragging = true;
  state.pendingPoint = point;
  state.pendingCurrentPoint = point;

  if (state.mode === "line") {
    if (snapped) {
      setSnapInfo(snapInfoText(`target: ${kindLabel(point.kind)}`));
      if (state.lineDrawMode === "diameter") {
        if (state.pendingDiameterCircle) {
          setStatus(`Diameter mode: snapped to circle at (${point.x}, ${point.y}). Release to draw opposite diameter endpoint.`);
        } else {
          setStatus(`Diameter mode: no circle start snap, drawing normal line from (${point.x}, ${point.y}).`);
        }
      } else {
        setStatus(`Snapped start to target (${point.x}, ${point.y}). Drag and release.`);
      }
    } else {
      setSnapInfo(event.shiftKey ? snapInfoText("off (Shift)") : snapInfoText("target: none"));
      setStatus(`Drag line from (${point.x}, ${point.y}) and release.${event.shiftKey ? " (snap off)" : ""}`);
    }
  } else {
    setStatus(`Drag circle radius from (${point.x}, ${point.y}) and release.`);
  }

  drawDraftOverlay(point, point);
});

svgViewport.addEventListener("mousemove", (event) => {
  if (!state.isDragging || !state.pendingPoint) {
    return;
  }

  const rawPoint = getOriginalPointFromClick(event);
  state.lastPointerPoint = rawPoint;
  if (!rawPoint) {
    return;
  }

  let point = rawPoint;
  if (state.mode === "line" && state.lineDrawMode === "diameter") {
    if (state.pendingDiameterCircle && state.pendingPoint) {
      const perimeterPoint = closestPointOnCircle(rawPoint, state.pendingDiameterCircle);
      state.pendingPoint = perimeterPoint;
      point = oppositePointOnCircle(perimeterPoint, state.pendingDiameterCircle);
      state.hoverPoint = perimeterPoint;
      setSnapInfo(snapInfoText("target: circle"));
      drawSnapOverlay(perimeterPoint);
    } else {
      state.hoverPoint = null;
      setSnapInfo(snapInfoText("target: none"));
      clearSnapOverlay();
    }
  } else if (state.mode === "line" && !event.shiftKey) {
    const nearest = findNearestSnapTarget(rawPoint, state.snapRadius);
    if (nearest) {
      point = nearest;
      state.hoverPoint = nearest;
      setSnapInfo(snapInfoText(`target: ${kindLabel(nearest.kind)}`));
      drawSnapOverlay(nearest);
    } else {
      state.hoverPoint = null;
      setSnapInfo(snapInfoText("target: none"));
      clearSnapOverlay();
    }
  } else {
    state.hoverPoint = null;
    if (state.mode === "line" && event.shiftKey) {
      setSnapInfo(snapInfoText("off (Shift)"));
    }
    clearSnapOverlay();
  }

  state.pendingCurrentPoint = point;
  drawDraftOverlay(state.pendingPoint, point);
});

svgViewport.addEventListener("mousemove", (event) => {
  state.lastPointerPoint = getOriginalPointFromClick(event);

  if (state.isDragging) {
    return;
  }

  if (state.mode !== "line") {
    state.hoverPoint = null;
    clearSnapOverlay();
    return;
  }

  const point = state.lastPointerPoint;
  if (!point || event.shiftKey) {
    state.hoverPoint = null;
    if (event.shiftKey) {
      setSnapInfo(snapInfoText("off (Shift)"));
    }
    clearSnapOverlay();
    return;
  }

  if (state.lineDrawMode === "diameter") {
    state.hoverPoint = findNearestCircleSnapTarget(point, state.snapRadius);
  } else {
    state.hoverPoint = findNearestSnapTarget(point, state.snapRadius);
  }
  if (state.hoverPoint) {
    const label = state.lineDrawMode === "diameter" ? "circle" : kindLabel(state.hoverPoint.kind);
    setSnapInfo(snapInfoText(`target: ${label}`));
  } else {
    setSnapInfo(snapInfoText("target: none"));
  }
  drawSnapOverlay(state.hoverPoint);
});

svgViewport.addEventListener("mouseup", async (event) => {
  if (!state.isDragging || !state.pendingPoint || (state.mode !== "line" && state.mode !== "circle")) {
    return;
  }

  const rawEndPoint = getOriginalPointFromClick(event);
  let endPoint = rawEndPoint;
  if (state.mode === "line" && state.lineDrawMode === "diameter" && state.pendingDiameterCircle) {
    endPoint = oppositePointOnCircle(state.pendingPoint, state.pendingDiameterCircle);
  } else if (state.mode === "line" && rawEndPoint && !event.shiftKey) {
    const nearest = findNearestSnapTarget(rawEndPoint, state.snapRadius);
    if (nearest) {
      endPoint = nearest;
    }
  }
  const startPoint = state.pendingPoint;

  state.isDragging = false;
  state.pendingPoint = null;
  state.pendingCurrentPoint = null;
  state.pendingDiameterCircle = null;
  state.hoverPoint = null;
  if (state.mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
  }
  clearDraftOverlay();
  clearSnapOverlay();

  if (!endPoint) {
    setStatus("Unable to finish drag. Try again.", true);
    return;
  }

  if (state.mode === "line") {
    await addLineFromPoints(startPoint, endPoint);
  } else {
    await addCircleFromPoints(startPoint, endPoint);
  }
});

svgViewport.addEventListener("mouseleave", () => {
  state.hoverPoint = null;
  if (state.mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
  }
  clearSnapOverlay();
  if (!state.isDragging) {
    clearDraftOverlay();
  }
});

markupInput.addEventListener("input", debouncedRender);
loadBtn.addEventListener("click", async () => {
  const file = window.prompt("Load file path (relative to workspace root):", state.currentFile) || state.currentFile;
  state.currentFile = file;
  await loadMarkup();
});
saveBtn.addEventListener("click", saveMarkup);
renderBtn.addEventListener("click", renderMarkup);
downloadBtn.addEventListener("click", downloadSvg);
selectModeBtn.addEventListener("click", () => setMode("inspect"));
lineModeBtn.addEventListener("click", () => setMode("line"));
circleModeBtn.addEventListener("click", () => setMode("circle"));
cancelDrawBtn.addEventListener("click", () => {
  state.pendingPoint = null;
  state.pendingCurrentPoint = null;
  state.pendingDiameterCircle = null;
  state.hoverPoint = null;
  state.isDragging = false;
  if (state.mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
  }
  clearDraftOverlay();
  clearSnapOverlay();
  setStatus("Pending drawing action canceled.");
});

window.addEventListener("mouseup", () => {
  if (!state.isDragging) {
    return;
  }

  state.pendingPoint = null;
  state.pendingCurrentPoint = null;
  state.pendingDiameterCircle = null;
  state.hoverPoint = null;
  state.isDragging = false;
  if (state.mode === "line") {
    setSnapInfo(snapInfoText("target: none"));
  }
  clearDraftOverlay();
  clearSnapOverlay();
  setStatus("Drag canceled.");
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (event.key === "Shift") {
    if (state.mode !== "line") {
      return;
    }

    state.hoverPoint = null;
    clearSnapOverlay();
    setSnapInfo(snapInfoText("off (Shift)"));

    if (state.isDragging && state.pendingPoint && state.lastPointerPoint) {
      state.pendingCurrentPoint = state.lastPointerPoint;
      drawDraftOverlay(state.pendingPoint, state.lastPointerPoint);
    }
    return;
  }

  if (event.metaKey || event.ctrlKey || event.altKey) {
    return;
  }

  if (key === "d") {
    state.lineDrawMode = state.lineDrawMode === "diameter" ? "normal" : "diameter";
    if (state.mode === "line") {
      state.pendingPoint = null;
      state.pendingCurrentPoint = null;
      state.pendingDiameterCircle = null;
      state.hoverPoint = null;
      state.isDragging = false;
      clearDraftOverlay();
      clearSnapOverlay();
      applySnapFromLastPointer(event.shiftKey);
    }
    setStatus(`Line draw mode set to ${lineDrawModeLabel()} (shortcut D).`);
    return;
  }

  if (key !== "p" && key !== "l" && key !== "c" && key !== "a") {
    return;
  }

  if (document.activeElement === markupInput) {
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

loadMarkup();
