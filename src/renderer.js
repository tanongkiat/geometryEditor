function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getColor(properties) {
  return properties.color || "#111111";
}

function getLabelSize(properties, fallback = 16) {
  const size = Number(properties.size);
  return Number.isFinite(size) ? Math.max(8, Math.min(120, Math.round(size))) : fallback;
}

function buildDataAttributes(item, itemIndex, interactive) {
  if (!interactive) {
    return "";
  }

  const attrs = [`data-item-index="${itemIndex}"`, `data-shape="${escapeXml(item.shape)}"`];
  if (item.properties.id !== undefined) {
    attrs.push(`data-item-id="${escapeXml(item.properties.id)}"`);
  }

  return ` ${attrs.join(" ")}`;
}

function isVisible(properties) {
  if (typeof properties.visible === "boolean") {
    return properties.visible;
  }

  if (typeof properties.visible === "number") {
    return properties.visible !== 0;
  }

  return true;
}

function computeBounds(items) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  function includePoint(x, y) {
    if (Number.isFinite(x) && Number.isFinite(y)) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  for (const item of items) {
    const p = item.properties;
    if (!isVisible(p)) {
      continue;
    }

    if (item.shape === "line") {
      includePoint(p.x1, p.y1);
      includePoint(p.x2, p.y2);
    } else if (item.shape === "point") {
      includePoint(p.x, p.y);
    } else if (item.shape === "circle") {
      includePoint(p.cx - p.r, p.cy - p.r);
      includePoint(p.cx + p.r, p.cy + p.r);
    } else if (item.shape === "parabola") {
      includePoint(p.vx, p.vy);
      includePoint(p.fx, p.fy);
    } else if (item.shape === "label") {
      const size = getLabelSize(p, p.type === "angle" ? 14 : 16);
      if (p.type === "angle" && Number.isFinite(Number(p.r))) {
        const extent = Math.max(1, Number(p.r)) + Math.max(36, size * 2);
        includePoint(Number(p.x) - extent, Number(p.y) - extent);
        includePoint(Number(p.x) + extent, Number(p.y) + extent);
      } else {
        const textWidth = String(p.text || "").length * size * 0.65;
        includePoint(Number(p.x), Number(p.y) - size);
        includePoint(Number(p.x) + textWidth, Number(p.y) + size);
      }
    }
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 800, maxY: 600 };
  }

  return { minX, minY, maxX, maxY };
}

function renderAngleLabel(properties, offsetX, offsetY, extraAttrs) {
  const x = Number(properties.x) + offsetX;
  const y = Number(properties.y) + offsetY;
  const a1 = Number(properties.ang1);
  const a2 = Number(properties.ang2);
  const text = properties.text || "";
  const color = getColor(properties);
  const size = getLabelSize(properties, 14);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(a1) || !Number.isFinite(a2)) {
    return "";
  }

  const requestedRadius = Number(properties.r);
  const arcRadius = Number.isFinite(requestedRadius) && requestedRadius >= 1 ? requestedRadius : 26;
  const textRadius = arcRadius + Math.max(20, size * 1.2);

  const sx = x + Math.cos(a1) * arcRadius;
  const sy = y + Math.sin(a1) * arcRadius;
  const ex = x + Math.cos(a2) * arcRadius;
  const ey = y + Math.sin(a2) * arcRadius;

  let delta = a2 - a1;
  if (delta < 0) {
    delta += Math.PI * 2;
  }

  const largeArc = delta > Math.PI ? 1 : 0;
  const mid = a1 + delta / 2;

  const tx = x + Math.cos(mid) * textRadius;
  const ty = y + Math.sin(mid) * textRadius;

  const parts = [
    `<path${extraAttrs} d="M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${arcRadius} ${arcRadius} 0 ${largeArc} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}" stroke="${color}" stroke-width="2" fill="none"/>`
  ];
  if (text) {
    parts.push(`<text${extraAttrs} x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" fill="${color}" font-size="${size}" font-family="Georgia, serif" text-anchor="middle" dominant-baseline="middle">${escapeXml(text)}</text>`);
  }
  return parts.join("\n");
}

function renderItem(item, offsetX, offsetY, itemIndex, interactive) {
  const p = item.properties;
  if (!isVisible(p)) {
    return "";
  }

  const dataAttrs = buildDataAttributes(item, itemIndex, interactive);

  if (item.shape === "line") {
    return `<line${dataAttrs} x1="${p.x1 + offsetX}" y1="${p.y1 + offsetY}" x2="${p.x2 + offsetX}" y2="${p.y2 + offsetY}" stroke="${getColor(p)}" stroke-width="3" stroke-linecap="round"/>`;
  }

  if (item.shape === "point") {
    return `<circle${dataAttrs} cx="${p.x + offsetX}" cy="${p.y + offsetY}" r="4" fill="${getColor(p)}"/>`;
  }

  if (item.shape === "circle") {
    return `<circle${dataAttrs} cx="${p.cx + offsetX}" cy="${p.cy + offsetY}" r="${p.r}" stroke="${getColor(p)}" stroke-width="3" fill="none"/>`;
  }

  if (item.shape === "parabola") {
    const vx = Number(p.vx);
    const vy = Number(p.vy);
    const fx = Number(p.fx);
    const fy = Number(p.fy);
    if (!Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isFinite(fx) || !Number.isFinite(fy)) {
      return "";
    }

    const dx = fx - vx;
    const dy = fy - vy;
    const focusDistance = Math.hypot(dx, dy);
    if (focusDistance < 1e-6) {
      return "";
    }

    const ux = dx / focusDistance;
    const uy = dy / focusDistance;
    const px = -uy;
    const py = ux;
    const span = Math.max(800, focusDistance * 160);
    const sampleCount = 160;
    const pathParts = [];
    for (let i = 0; i <= sampleCount; i += 1) {
      const t = -span + (2 * span * i) / sampleCount;
      const x = (t * t) / (4 * focusDistance);
      const wx = vx + ux * x + px * t;
      const wy = vy + uy * x + py * t;
      pathParts.push(`${i === 0 ? "M" : "L"} ${wx + offsetX} ${wy + offsetY}`);
    }

    return `<path${dataAttrs} d="${pathParts.join(" ")}" stroke="${getColor(p)}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  if (item.shape === "label") {
    if (p.type === "angle") {
      return renderAngleLabel(p, offsetX, offsetY, dataAttrs);
    }

    return `<text${dataAttrs} x="${p.x + offsetX}" y="${p.y + offsetY}" fill="${getColor(p)}" font-size="${getLabelSize(p)}" font-family="Georgia, serif">${escapeXml(p.text || "")}</text>`;
  }

  return "";
}

function renderSvg(items, options = {}) {
  const padding = Number.isFinite(options.padding) ? options.padding : 40;
  const interactive = options.interactive === true;
  const includeXmlDeclaration = options.includeXmlDeclaration !== false;
  const fixedViewport = options.fixedViewport === true;
  const bounds = fixedViewport
    ? { minX: 0, minY: 0, maxX: Number(options.width) || 1100, maxY: Number(options.height) || 700 }
    : computeBounds(items);

  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);

  const width = Number.isFinite(options.width) ? options.width : Math.ceil(contentWidth + padding * 2);
  const height = Number.isFinite(options.height) ? options.height : Math.ceil(contentHeight + padding * 2);

  const offsetX = fixedViewport ? 0 : padding - bounds.minX;
  const offsetY = fixedViewport ? 0 : padding - bounds.minY;

  const body = items
    .map((item, index) => renderItem(item, offsetX, offsetY, index, interactive))
    .filter(Boolean)
    .join("\n");

  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-offset-x="${offsetX}" data-offset-y="${offsetY}" data-padding="${padding}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`,
    body,
    `</svg>`
  ];

  if (includeXmlDeclaration) {
    lines.unshift(`<?xml version="1.0" encoding="UTF-8"?>`);
  }

  return lines.join("\n");
}

module.exports = {
  renderSvg
};
