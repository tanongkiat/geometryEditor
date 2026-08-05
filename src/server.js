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
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    description: "Fast default"
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "Higher quality"
  }
];

function getDefaultAiModel() {
  return AI_MODELS[0].id;
}

function isSupportedAiModel(model) {
  return AI_MODELS.some((entry) => entry.id === model);
}

function isSupportedImageDataUrl(value) {
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(String(value || ""));
}

function callOpenAI(apiKey, userPrompt, gridUnit = 50, model = getDefaultAiModel(), imageDataUrl = "") {
  const visX = (550 / gridUnit).toFixed(1);
  const visY = (350 / gridUnit).toFixed(1);
  const system = `You are a geometry markup generator for a 1100×700 canvas.

COORDINATE SYSTEM (current zoom — use these exact numbers):
- Mathematical origin (0,0) is at canvas pixel (550, 350).
- X increases RIGHT, Y increases UPWARD.
- Current zoom: 1 unit = ${gridUnit} canvas pixels.
- Visible range: X from -${visX} to +${visX}, Y from -${visY} to +${visY}.
- Conversion: canvas_x = 550 + x * ${gridUnit},  canvas_y = 350 - y * ${gridUnit}
- Example: math point (1, 1) → canvas (${550 + gridUnit}, ${350 - gridUnit})

Shapes (one per line, no extra text or markdown):
  point  id=N visible=1 x=CX y=CY color=#hex
  line   id=N visible=1 x1=CX1 y1=CY1 x2=CX2 y2=CY2 color=#hex
  circle id=N visible=1 cx=CX cy=CY r=R color=#hex   (R in canvas pixels; 1 unit = ${gridUnit}px)
  label  id=N visible=1 type=text x=CX y=CY ang1=0 ang2=0 text=TEXT color=#hex

Rules:
- IDs must be unique positive integers starting from 1.
- Always convert math coordinates to canvas pixels before outputting.
- Keep shapes within the visible range.
- Use #1a1a2e (dark), #0d9488 (teal), #d97706 (amber), #dc2626 (red), #2563eb (blue) for variety.
- If a reference image is attached, infer the main geometric structure from that image and approximate it with the supported markup primitives.
- Treat a numeric annotation placed between two rays or near an angle arc as an angle measure, not a segment length. Preserve it as a nearby label and make the two lines meet at the intended vertex.
- When a numeric angle label is present, use that number as the source of truth for the angle even if the picture is not drawn to scale or the sketch visually suggests a different angle.
- Prefer constructing the geometry from explicit numeric labels first, then use the picture only to decide layout, orientation, and which objects are connected.
- Treat a dot, cross, or marked point at the middle of a circle as the circle center. Prefer a circle centered on that point; include a point there when the center is explicitly marked.
- If a line or segment passes through the marked center of a circle and reaches the circle on both sides, treat that line as a diameter and preserve that constraint in the generated geometry.
- Preserve circle containment relationships from the diagram: if a point, segment, ray, label, or other geometry is drawn inside a circle, keep it inside that circle unless a numeric constraint clearly requires otherwise.
- Likewise, if geometry is drawn outside a circle, do not move it inside the circle unless the labels or markings explicitly say it belongs on the circle or inside it.
- Distinguish among geometry that is inside the circle, on the circumference, and outside the circle. Use the picture to preserve that relationship even when the sketch is rough.
- If a line or segment has a number written along the segment itself, interpret that as a length label unless the number is clearly placed inside an angle wedge.
- Preserve important labeled geometry markers from the image with supported primitives: use point for marked locations and label for visible text.
- Output ONLY the markup lines. No explanation, no code fences.`;

  const userContent = [];
  const promptText = userPrompt || "Generate geometry markup that matches the attached reference image as closely as possible.";
  userContent.push({ type: "text", text: promptText });
  if (imageDataUrl) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: imageDataUrl,
        detail: "high"
      }
    });
  }

  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent }
    ],
    max_tokens: 1200,
    temperature: 0.3
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/chat/completions",
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
            if (parsed.error) { reject(new Error(parsed.error.message)); return; }
            resolve((parsed.choices?.[0]?.message?.content || "").trim());
          } catch (e) { reject(new Error("Failed to parse OpenAI response.")); }
        });
      }
    );
    req.on("error", reject);
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
        const markup = await callOpenAI(apiKey, prompt, gridUnit, model, imageDataUrl);
        sendJson(response, 200, { markup });
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
    } catch (error) {
      sendJson(response, 400, {
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
  startServer
};
