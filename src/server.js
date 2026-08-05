const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { parseMarkupText } = require("./parser");
const { renderSvg } = require("./renderer");

// load .env without requiring dotenv package
(function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}());

function summarize(items) {
  const byShape = {};

  for (const item of items) {
    byShape[item.shape] = (byShape[item.shape] || 0) + 1;
  }

  return {
    total: items.length,
    byShape
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

const MAX_REQUEST_BODY_BYTES = 12 * 1024 * 1024;

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BODY_BYTES) {
        reject(new Error("Request body too large."));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function resolveInsideRoot(rootDir, requestedPath) {
  const candidate = requestedPath || "";
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(resolvedRoot, candidate);

  if (resolvedPath === resolvedRoot) {
    return resolvedPath;
  }

  if (!resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Path is outside the workspace root.");
  }

  return resolvedPath;
}

function getDisplayPath(rootDir, absolutePath) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedPath = path.resolve(absolutePath);

  if (resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    return path.relative(resolvedRoot, resolvedPath) || ".";
  }

  return resolvedPath;
}

function serveStatic(response, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");
  response.writeHead(200, { "Content-Type": `${contentType}; charset=utf-8` });
  response.end(content);
}

const AI_MODELS = [
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    description: "Recommended - fast and accurate",
    reasoningEffort: "low",
    imageOutputTokens: 6000
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    description: "Maximum accuracy - slower",
    reasoningEffort: "medium",
    imageOutputTokens: 10000
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "Fast and economical",
    reasoningEffort: "none",
    imageOutputTokens: 4000
  }
];

function getDefaultAiModel() {
  return AI_MODELS[0].id;
}

function isSupportedAiModel(model) {
  return AI_MODELS.some((entry) => entry.id === model);
}

function getAiModel(model) {
  return AI_MODELS.find((entry) => entry.id === model) || AI_MODELS[0];
}

function isSupportedImageDataUrl(value) {
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(String(value || ""));
}

const AI_OUTPUT_FORMAT = {
  type: "json_schema",
  name: "geometry_scene",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      circles: {
        type: "array",
        description: "Every distinct visible circle, including nested or tangent circles.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            cx: { type: "number" },
            cy: { type: "number" },
            r: { type: "number" },
            color: { type: "string", enum: ["#1a1a2e", "#0d9488", "#d97706", "#dc2626", "#2563eb"] }
          },
          required: ["cx", "cy", "r", "color"]
        }
      },
      lines: {
        type: "array",
        description: "Every distinct visible straight segment, with endpoints at its actual visible boundaries.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            x1: { type: "number" },
            y1: { type: "number" },
            x2: { type: "number" },
            y2: { type: "number" },
            color: { type: "string", enum: ["#1a1a2e", "#0d9488", "#d97706", "#dc2626", "#2563eb"] }
          },
          required: ["x1", "y1", "x2", "y2", "color"]
        }
      },
      points: {
        type: "array",
        description: "Only explicitly marked or requested points.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            color: { type: "string", enum: ["#1a1a2e", "#0d9488", "#d97706", "#dc2626", "#2563eb"] }
          },
          required: ["x", "y", "color"]
        }
      },
      parabolas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            vx: { type: "number" },
            vy: { type: "number" },
            fx: { type: "number" },
            fy: { type: "number" },
            color: { type: "string", enum: ["#1a1a2e", "#0d9488", "#d97706", "#dc2626", "#2563eb"] }
          },
          required: ["vx", "vy", "fx", "fy", "color"]
        }
      },
      labels: {
        type: "array",
        description: "Visible dark geometry annotations only; exclude watermarks and decorative text.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            x: { type: "number" },
            y: { type: "number" },
            text: { type: "string" },
            color: { type: "string", enum: ["#1a1a2e", "#0d9488", "#d97706", "#dc2626", "#2563eb"] }
          },
          required: ["x", "y", "text", "color"]
        }
      },
      summary: {
        type: "string",
        description: "A short description of the geometry that was reconstructed or generated."
      }
    },
    required: ["circles", "lines", "points", "parabolas", "labels", "summary"]
  }
};

const AI_ALLOWED_COLORS = new Set(["#1a1a2e", "#0d9488", "#d97706", "#dc2626", "#2563eb"]);

function formatAiNumber(value) {
  return String(Number(Number(value).toFixed(3)));
}

function quoteAiLabel(value) {
  const text = String(value || "Label").slice(0, 120);
  return /\s|["\\]/.test(text)
    ? `"${text.replace(/([\\"])/g, "\\$1")}"`
    : text;
}

function requireAiNumber(properties, key, lineNumber) {
  const value = Number(properties[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`AI output line ${lineNumber} has an invalid ${key} value.`);
  }
  return value;
}

function normalizeAiMarkup(markup) {
  if (typeof markup !== "string" || !markup.trim()) {
    throw new Error("OpenAI returned no geometry markup.");
  }

  const clean = markup.replace(/```[^\n]*\n?/g, "").trim();
  const parsed = parseMarkupText(clean);
  const sourceLines = clean.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (parsed.length !== sourceLines.length) {
    throw new Error("OpenAI returned markup that could not be parsed completely.");
  }
  if (parsed.length === 0) {
    throw new Error("OpenAI returned no drawable shapes.");
  }
  if (parsed.length > 200) {
    throw new Error("OpenAI returned too many shapes (maximum 200).");
  }

  const lines = parsed.map((item, index) => {
    const id = index + 1;
    const p = item.properties;
    const color = AI_ALLOWED_COLORS.has(String(p.color || "").toLowerCase())
      ? String(p.color).toLowerCase()
      : "#1a1a2e";
    const n = (key) => requireAiNumber(p, key, item.lineNumber);

    if (item.shape === "line") {
      const x1 = n("x1");
      const y1 = n("y1");
      const x2 = n("x2");
      const y2 = n("y2");
      if (Math.hypot(x2 - x1, y2 - y1) < 1) {
        throw new Error(`AI output line ${item.lineNumber} is too short to draw.`);
      }
      return `line id=${id} visible=1 x1=${formatAiNumber(x1)} y1=${formatAiNumber(y1)} x2=${formatAiNumber(x2)} y2=${formatAiNumber(y2)} color=${color}`;
    }

    if (item.shape === "circle") {
      const cx = n("cx");
      const cy = n("cy");
      const r = n("r");
      if (r < 1 || r > 2200) {
        throw new Error(`AI output line ${item.lineNumber} has an invalid circle radius.`);
      }
      return `circle id=${id} visible=1 cx=${formatAiNumber(cx)} cy=${formatAiNumber(cy)} r=${formatAiNumber(r)} color=${color}`;
    }

    if (item.shape === "point") {
      return `point id=${id} visible=1 x=${formatAiNumber(n("x"))} y=${formatAiNumber(n("y"))} color=${color}`;
    }

    if (item.shape === "parabola") {
      const vx = n("vx");
      const vy = n("vy");
      const fx = n("fx");
      const fy = n("fy");
      if (Math.hypot(fx - vx, fy - vy) < 1) {
        throw new Error(`AI output line ${item.lineNumber} has an invalid parabola focus.`);
      }
      return `parabola id=${id} visible=1 vx=${formatAiNumber(vx)} vy=${formatAiNumber(vy)} fx=${formatAiNumber(fx)} fy=${formatAiNumber(fy)} color=${color}`;
    }

    if (item.shape === "label") {
      return `label id=${id} visible=1 type=text x=${formatAiNumber(n("x"))} y=${formatAiNumber(n("y"))} ang1=0 ang2=0 text=${quoteAiLabel(p.text)} color=${color}`;
    }

    throw new Error(`AI output line ${item.lineNumber} uses unsupported shape "${item.shape}".`);
  });

  return {
    markup: lines.join("\n"),
    shapeCount: lines.length
  };
}

function requireGeometryNumber(shape, key, kind, index) {
  const value = Number(shape?.[key]);
  if (!Number.isFinite(value) || Math.abs(value) > 10000) {
    throw new Error(`AI ${kind} ${index + 1} has an invalid ${key} value.`);
  }
  return value;
}

function normalizeGeometryColor(value) {
  const color = String(value || "").toLowerCase();
  return AI_ALLOWED_COLORS.has(color) ? color : "#1a1a2e";
}

function infiniteLineIntersection(first, second) {
  const ax = first.x2 - first.x1;
  const ay = first.y2 - first.y1;
  const bx = second.x2 - second.x1;
  const by = second.y2 - second.y1;
  const denominator = ax * by - ay * bx;
  if (Math.abs(denominator) < 1e-8) return null;
  const dx = second.x1 - first.x1;
  const dy = second.y1 - first.y1;
  const t = (dx * by - dy * bx) / denominator;
  return { x: first.x1 + ax * t, y: first.y1 + ay * t };
}

function pointToSegmentDistance(point, line) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-8) return Math.hypot(point.x - line.x1, point.y - line.y1);
  const t = Math.max(0, Math.min(1, ((point.x - line.x1) * dx + (point.y - line.y1) * dy) / lengthSquared));
  return Math.hypot(point.x - (line.x1 + dx * t), point.y - (line.y1 + dy * t));
}

function snapLineEndpointsToIntersections(lines, tolerance = 12) {
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    for (const prefix of ["1", "2"]) {
      const endpoint = { x: line[`x${prefix}`], y: line[`y${prefix}`] };
      let best = null;
      let bestDistance = tolerance;
      for (let otherIndex = 0; otherIndex < lines.length; otherIndex += 1) {
        if (otherIndex === lineIndex) continue;
        const other = lines[otherIndex];
        const intersection = infiniteLineIntersection(line, other);
        if (!intersection || pointToSegmentDistance(intersection, other) > tolerance) continue;
        const distance = Math.hypot(endpoint.x - intersection.x, endpoint.y - intersection.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = intersection;
        }
      }
      if (best) {
        line[`x${prefix}`] = best.x;
        line[`y${prefix}`] = best.y;
      }
    }
  }
}

function snapLineEndpointsToCircles(lines, circles, tolerance = 16) {
  for (const line of lines) {
    for (const prefix of ["1", "2"]) {
      const xKey = `x${prefix}`;
      const yKey = `y${prefix}`;
      const endpoint = { x: line[xKey], y: line[yKey] };
      let best = null;
      let bestError = tolerance;
      for (const circle of circles) {
        const dx = endpoint.x - circle.cx;
        const dy = endpoint.y - circle.cy;
        const distance = Math.hypot(dx, dy);
        const error = Math.abs(distance - circle.r);
        if (distance > 1e-6 && error < bestError) {
          bestError = error;
          best = {
            x: circle.cx + dx * circle.r / distance,
            y: circle.cy + dy * circle.r / distance
          };
        }
      }
      if (best) {
        line[xKey] = best.x;
        line[yKey] = best.y;
      }
    }
  }
}

function clusterSharedLineEndpoints(lines, tolerance = 10) {
  const endpoints = [];
  for (const line of lines) {
    endpoints.push({ line, xKey: "x1", yKey: "y1", x: line.x1, y: line.y1 });
    endpoints.push({ line, xKey: "x2", yKey: "y2", x: line.x2, y: line.y2 });
  }
  const parent = endpoints.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const join = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  for (let i = 0; i < endpoints.length; i += 1) {
    for (let j = i + 1; j < endpoints.length; j += 1) {
      if (Math.hypot(endpoints[i].x - endpoints[j].x, endpoints[i].y - endpoints[j].y) <= tolerance) {
        join(i, j);
      }
    }
  }
  const groups = new Map();
  endpoints.forEach((endpoint, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(endpoint);
  });
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const x = group.reduce((sum, endpoint) => sum + endpoint.x, 0) / group.length;
    const y = group.reduce((sum, endpoint) => sum + endpoint.y, 0) / group.length;
    for (const endpoint of group) {
      endpoint.line[endpoint.xKey] = x;
      endpoint.line[endpoint.yKey] = y;
    }
  }
}

function correctNearTangentCircles(circles, tolerance = 16) {
  for (let i = 0; i < circles.length; i += 1) {
    for (let j = i + 1; j < circles.length; j += 1) {
      const first = circles[i];
      const second = circles[j];
      const distance = Math.hypot(first.cx - second.cx, first.cy - second.cy);
      const larger = first.r >= second.r ? first : second;
      const smaller = larger === first ? second : first;
      const internalError = Math.abs(distance + smaller.r - larger.r);
      if (distance > 1 && internalError <= tolerance) {
        smaller.r = Math.max(1, larger.r - distance);
        continue;
      }
      const externalError = Math.abs(distance - first.r - second.r);
      if (externalError <= tolerance && distance > larger.r + 1) {
        smaller.r = Math.max(1, distance - larger.r);
      }
    }
  }
}

function postProcessAiGeometry(geometry) {
  const circles = geometry.circles.filter((circle, index, all) =>
    !all.slice(0, index).some((other) =>
      Math.hypot(circle.cx - other.cx, circle.cy - other.cy) <= 5 && Math.abs(circle.r - other.r) <= 5
    )
  );
  const lines = geometry.lines.filter((line, index, all) =>
    !all.slice(0, index).some((other) => {
      const sameDirection = Math.hypot(line.x1 - other.x1, line.y1 - other.y1) <= 5 &&
        Math.hypot(line.x2 - other.x2, line.y2 - other.y2) <= 5;
      const reverseDirection = Math.hypot(line.x1 - other.x2, line.y1 - other.y2) <= 5 &&
        Math.hypot(line.x2 - other.x1, line.y2 - other.y1) <= 5;
      return sameDirection || reverseDirection;
    })
  );

  correctNearTangentCircles(circles);
  clusterSharedLineEndpoints(lines, 14);
  snapLineEndpointsToIntersections(lines, 10);
  snapLineEndpointsToCircles(lines, circles);
  clusterSharedLineEndpoints(lines);

  return { ...geometry, circles, lines };
}

function normalizeAiGeometry(output) {
  const requiredArrays = ["circles", "lines", "points", "parabolas", "labels"];
  for (const key of requiredArrays) {
    if (!Array.isArray(output?.[key])) {
      throw new Error(`OpenAI returned an invalid ${key} collection.`);
    }
  }

  const geometry = {
    circles: output.circles.map((shape, index) => {
      const r = requireGeometryNumber(shape, "r", "circle", index);
      if (r < 1 || r > 2200) throw new Error(`AI circle ${index + 1} has an invalid radius.`);
      return {
        cx: requireGeometryNumber(shape, "cx", "circle", index),
        cy: requireGeometryNumber(shape, "cy", "circle", index),
        r,
        color: normalizeGeometryColor(shape.color)
      };
    }),
    lines: output.lines.map((shape, index) => {
      const line = {
        x1: requireGeometryNumber(shape, "x1", "line", index),
        y1: requireGeometryNumber(shape, "y1", "line", index),
        x2: requireGeometryNumber(shape, "x2", "line", index),
        y2: requireGeometryNumber(shape, "y2", "line", index),
        color: normalizeGeometryColor(shape.color)
      };
      if (Math.hypot(line.x2 - line.x1, line.y2 - line.y1) < 1) {
        throw new Error(`AI line ${index + 1} is too short to draw.`);
      }
      return line;
    }),
    points: output.points.map((shape, index) => ({
      x: requireGeometryNumber(shape, "x", "point", index),
      y: requireGeometryNumber(shape, "y", "point", index),
      color: normalizeGeometryColor(shape.color)
    })),
    parabolas: output.parabolas.map((shape, index) => {
      const parabola = {
        vx: requireGeometryNumber(shape, "vx", "parabola", index),
        vy: requireGeometryNumber(shape, "vy", "parabola", index),
        fx: requireGeometryNumber(shape, "fx", "parabola", index),
        fy: requireGeometryNumber(shape, "fy", "parabola", index),
        color: normalizeGeometryColor(shape.color)
      };
      if (Math.hypot(parabola.fx - parabola.vx, parabola.fy - parabola.vy) < 1) {
        throw new Error(`AI parabola ${index + 1} has an invalid focus.`);
      }
      return parabola;
    }),
    labels: output.labels.map((shape, index) => ({
      x: requireGeometryNumber(shape, "x", "label", index),
      y: requireGeometryNumber(shape, "y", "label", index),
      text: String(shape.text || "").trim().slice(0, 120),
      color: normalizeGeometryColor(shape.color)
    })).filter((shape) => shape.text)
  };

  const rawCount = requiredArrays.reduce((count, key) => count + geometry[key].length, 0);
  if (rawCount === 0) throw new Error("OpenAI returned no drawable shapes.");
  if (rawCount > 200) throw new Error("OpenAI returned too many shapes (maximum 200).");

  const processed = postProcessAiGeometry(geometry);
  const markupLines = [];
  const add = (line) => markupLines.push(line.replace("id=N", `id=${markupLines.length + 1}`));
  for (const circle of processed.circles) {
    add(`circle id=N visible=1 cx=${formatAiNumber(circle.cx)} cy=${formatAiNumber(circle.cy)} r=${formatAiNumber(circle.r)} color=${circle.color}`);
  }
  for (const line of processed.lines) {
    add(`line id=N visible=1 x1=${formatAiNumber(line.x1)} y1=${formatAiNumber(line.y1)} x2=${formatAiNumber(line.x2)} y2=${formatAiNumber(line.y2)} color=${line.color}`);
  }
  for (const point of processed.points) {
    add(`point id=N visible=1 x=${formatAiNumber(point.x)} y=${formatAiNumber(point.y)} color=${point.color}`);
  }
  for (const parabola of processed.parabolas) {
    add(`parabola id=N visible=1 vx=${formatAiNumber(parabola.vx)} vy=${formatAiNumber(parabola.vy)} fx=${formatAiNumber(parabola.fx)} fy=${formatAiNumber(parabola.fy)} color=${parabola.color}`);
  }
  for (const label of processed.labels) {
    add(`label id=N visible=1 type=text x=${formatAiNumber(label.x)} y=${formatAiNumber(label.y)} ang1=0 ang2=0 text=${quoteAiLabel(label.text)} color=${label.color}`);
  }

  return {
    markup: markupLines.join("\n"),
    shapeCount: markupLines.length,
    counts: {
      circles: processed.circles.length,
      lines: processed.lines.length,
      points: processed.points.length,
      parabolas: processed.parabolas.length,
      labels: processed.labels.length
    }
  };
}

function extractOpenAIOutput(responseBody) {
  if (responseBody.status === "incomplete") {
    const reason = responseBody.incomplete_details?.reason || "unknown reason";
    throw new Error(`OpenAI response was incomplete (${reason}).`);
  }

  const textParts = [];
  let refusal = "";
  for (const item of responseBody.output || []) {
    if (item.type !== "message") continue;
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        textParts.push(content.text);
      } else if (content.type === "refusal") {
        refusal = content.refusal || "The request was refused.";
      }
    }
  }

  if (!textParts.length) {
    throw new Error(refusal || "OpenAI returned no text output.");
  }

  try {
    return JSON.parse(textParts.join("\n"));
  } catch (error) {
    throw new Error("OpenAI returned an invalid structured response.");
  }
}

function callOpenAI(apiKey, userPrompt, gridUnit = 50, model = getDefaultAiModel(), imageDataUrl = "", options = {}) {
  const visX = (550 / gridUnit).toFixed(1);
  const visY = (350 / gridUnit).toFixed(1);
  const modelConfig = getAiModel(model);
  const instructions = `Convert the user's request or reference image into an accurate editable geometry scene on a 1100×700 canvas.

Canvas coordinates:
- Mathematical origin (0,0) is at canvas pixel (550, 350).
- X increases RIGHT, Y increases UPWARD.
- Current zoom: 1 unit = ${gridUnit} canvas pixels.
- Visible range: X from -${visX} to +${visX}, Y from -${visY} to +${visY}.
- Conversion: canvas_x = 550 + x * ${gridUnit},  canvas_y = 350 - y * ${gridUnit}
- Example: math point (1,1) is canvas (${550 + gridUnit},${350 - gridUnit}).

Output contract:
- Populate the separate circles, lines, points, parabolas, and labels arrays. Never encode geometry in summary.
- Coordinates and radii are canvas pixels. Keep the result within the visible canvas.
- Allowed colors are the schema values. For a black reference diagram, use #1a1a2e consistently unless the user asks for color.
- Return only the structured JSON required by the schema.

Reference-image reconstruction:
1. Internally inventory every supported visible object before assigning coordinates. Do not omit small circles, short segments, or labels.
2. Uniformly fit the source diagram to the canvas with about 30 pixels of margin. Preserve aspect ratio, relative placement, containment, intersections, and empty space.
3. Add every distinct visible circle, including nested and internally or externally tangent circles. Preserve each center and radius relationship; circles visibly sharing a tangency point must still be separate circles.
4. Add every distinct straight stroke exactly once. A stroke stays one line when it crosses another object; split it only where it visibly terminates or changes direction. Do not merge separate collinear strokes.
5. Put a line endpoint at its actual visible boundary: a circle perimeter, tangency point, labeled vertex, or another line endpoint. Lines that visibly share a vertex must reuse exactly the same coordinate pair.
6. Preserve every dark geometry label and numeric annotation at its visible location. Do not invent missing letters. Ignore pale watermarks, logos, crop artifacts, and decorative marks.
7. Add points only for explicit dots or requested points, not for every crossing. A marked circle center and a diameter through it must remain geometrically consistent.
8. Treat a number inside an angle wedge as an angle; treat a number written along a segment as a length. Explicit numeric constraints override a sketch that is not to scale.

Before returning, verify that the object inventory is complete, shared endpoints are identical, segment endpoints meet their intended circles or lines, and nested/tangent circle relationships are preserved.`;

  const userContent = [];
  const promptText = userPrompt || "Reconstruct the attached reference image as accurately as possible.";
  const existingMarkup = typeof options.existingMarkup === "string"
    ? options.existingMarkup.trim().slice(0, 100000)
    : "";
  const context = existingMarkup
    ? `\n\nExisting canvas markup (${options.append ? "add only the requested new geometry" : "use as context; return the complete replacement"}):\n${existingMarkup}`
    : "";
  userContent.push({ type: "input_text", text: `Goal: ${promptText}${context}` });
  if (imageDataUrl) {
    userContent.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "high"
    });
  }

  const body = JSON.stringify({
    model: modelConfig.id,
    instructions,
    input: [{ role: "user", content: userContent }],
    reasoning: { effort: modelConfig.reasoningEffort },
    text: {
      verbosity: "low",
      format: AI_OUTPUT_FORMAT
    },
    max_output_tokens: imageDataUrl ? modelConfig.imageOutputTokens : 3000,
    store: false
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/responses",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(body)
        }
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => { raw += c; });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            if (res.statusCode < 200 || res.statusCode >= 300 || parsed.error) {
              const error = new Error(parsed.error?.message || `OpenAI request failed with status ${res.statusCode}.`);
              error.statusCode = 502;
              reject(error);
              return;
            }
            const output = extractOpenAIOutput(parsed);
            const normalized = normalizeAiGeometry(output);
            resolve({
              ...normalized,
              summary: typeof output.summary === "string" ? output.summary.trim().slice(0, 240) : "",
              model: parsed.model || modelConfig.id,
              requestId: res.headers["x-request-id"] || parsed.id || ""
            });
          } catch (error) {
            error.statusCode = error.statusCode || 502;
            reject(error);
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(120000, () => {
      req.destroy(new Error("OpenAI request timed out after 120 seconds."));
    });
    req.write(body);
    req.end();
  });
}

function startServer({ rootDir, defaultMarkupFile, port }) {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedDefaultFile = path.resolve(defaultMarkupFile);
  const publicDir = path.resolve(__dirname, "..", "public");

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, `http://${request.headers.host}`);

      if (request.method === "GET" && requestUrl.pathname === "/") {
        serveStatic(response, path.join(publicDir, "landing.html"), "text/html");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/studio") {
        serveStatic(response, path.join(publicDir, "index.html"), "text/html");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/canvas") {
        serveStatic(response, path.join(publicDir, "canvas.html"), "text/html");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/app.js") {
        serveStatic(response, path.join(publicDir, "app.js"), "application/javascript");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/styles.css") {
        serveStatic(response, path.join(publicDir, "styles.css"), "text/css");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/canvas.css") {
        serveStatic(response, path.join(publicDir, "canvas.css"), "text/css");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/landing.css") {
        serveStatic(response, path.join(publicDir, "landing.css"), "text/css");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/canvas.js") {
        serveStatic(response, path.join(publicDir, "canvas.js"), "application/javascript");
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/load") {
        const fileQuery = requestUrl.searchParams.get("file");
        const filePath = fileQuery ? resolveInsideRoot(resolvedRoot, fileQuery) : resolvedDefaultFile;

        const markup = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
        sendJson(response, 200, {
          file: getDisplayPath(resolvedRoot, filePath),
          markup
        });
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/ai-models") {
        sendJson(response, 200, {
          defaultModel: getDefaultAiModel(),
          models: AI_MODELS
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/render") {
        const body = await readRequestBody(request);
        const payload = body ? JSON.parse(body) : {};

        const markup = typeof payload.markup === "string" ? payload.markup : "";
        const width = Number(payload.width);
        const height = Number(payload.height);
        const padding = Number(payload.padding);

        const items = parseMarkupText(markup);
        const svg = renderSvg(items, {
          interactive: true,
          includeXmlDeclaration: false,
          width: Number.isFinite(width) ? width : undefined,
          height: Number.isFinite(height) ? height : undefined,
          padding: Number.isFinite(padding) ? padding : 40
        });

        sendJson(response, 200, {
          svg,
          items,
          summary: summarize(items)
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/save") {
        const body = await readRequestBody(request);
        const payload = body ? JSON.parse(body) : {};

        const markup = typeof payload.markup === "string" ? payload.markup : "";
        const filePath = payload.file
          ? resolveInsideRoot(resolvedRoot, String(payload.file))
          : resolvedDefaultFile;

        fs.writeFileSync(filePath, markup, "utf8");

        sendJson(response, 200, {
          ok: true,
          file: getDisplayPath(resolvedRoot, filePath)
        });
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/ai-markup") {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          sendJson(response, 500, { error: "OPENAI_API_KEY not set in .env" });
          return;
        }
        const body = await readRequestBody(request);
        const payload = body ? JSON.parse(body) : {};
        const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
        const gridUnit = Number.isFinite(Number(payload.gridUnit)) ? Math.max(1, Number(payload.gridUnit)) : 50;
        const model = typeof payload.model === "string" && isSupportedAiModel(payload.model)
          ? payload.model
          : getDefaultAiModel();
        const imageDataUrl = typeof payload.imageDataUrl === "string" && isSupportedImageDataUrl(payload.imageDataUrl)
          ? payload.imageDataUrl
          : "";
        if (!prompt && !imageDataUrl) {
          sendJson(response, 400, { error: "Missing prompt or reference image." });
          return;
        }
        const result = await callOpenAI(apiKey, prompt, gridUnit, model, imageDataUrl, {
          append: Boolean(payload.append),
          existingMarkup: typeof payload.existingMarkup === "string" ? payload.existingMarkup : ""
        });
        sendJson(response, 200, result);
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch (error) {
      sendJson(response, Number.isInteger(error.statusCode) ? error.statusCode : 400, {
        error: error.message
      });
    }
  });

  server.listen(port, () => {
    console.log(`Interactive markup tool running at http://localhost:${port}`);
    console.log(`Default file: ${getDisplayPath(resolvedRoot, resolvedDefaultFile)}`);
  });

  return server;
}

module.exports = {
  startServer,
  extractOpenAIOutput,
  normalizeAiMarkup,
  normalizeAiGeometry
};
