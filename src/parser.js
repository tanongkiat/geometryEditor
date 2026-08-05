const fs = require("fs");

function tokenizeLine(line) {
  const tokens = [];
  const regex = /(?:[^\s"']+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')+/g;
  const matches = line.match(regex);

  if (!matches) {
    return tokens;
  }

  for (const token of matches) {
    tokens.push(token);
  }

  return tokens;
}

function unquote(value) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\([\\"'])/g, "$1");
  }

  return value;
}

function parseValue(key, raw) {
  const value = unquote(raw);

  if (value === "true") return true;
  if (value === "false") return false;
  if (key === "visible" && raw === "1") return true;
  if (key === "visible" && raw === "0") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseMarkupLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const parts = tokenizeLine(trimmed);
  const shape = parts[0];
  const properties = {};

  for (let i = 1; i < parts.length; i += 1) {
    const token = parts[i];
    const eqIndex = token.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = token.slice(0, eqIndex);
    const value = token.slice(eqIndex + 1);
    properties[key] = parseValue(key, value);
  }

  return {
    shape,
    properties,
    raw: line
  };
}

function parseMarkupText(text) {
  const lines = text.split(/\r?\n/);
  const items = [];

  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseMarkupLine(lines[i]);
    if (!parsed) {
      continue;
    }

    parsed.lineNumber = i + 1;
    items.push(parsed);
  }

  return items;
}

function parseMarkupFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return parseMarkupText(content);
}

module.exports = {
  parseMarkupFile,
  parseMarkupText
};
