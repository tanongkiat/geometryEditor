const fs = require("fs");
const http = require("http");
const path = require("path");
const { parseMarkupText } = require("./parser");
const { renderSvg } = require("./renderer");

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

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
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
