#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { parseMarkupFile } = require("./parser");
const { renderSvg } = require("./renderer");
const { startServer } = require("./server");

function printHelp() {
  console.log([
    "Geometry Drawing Tools",
    "",
    "Commands:",
    "  draw <input> [-o output.svg] [--width 900] [--height 700] [--padding 40]",
    "  inspect <input>",
    "  serve [input] [--port 3000]",
    "",
    "Examples:",
    "  node src/cli.js draw Markup.txt -o drawing.svg",
    "  node src/cli.js inspect Markup.txt",
    "  node src/cli.js serve Markup.txt --port 3000"
  ].join("\n"));
}

function readOption(args, names, fallback) {
  for (let i = 0; i < args.length; i += 1) {
    if (names.includes(args[i]) && i + 1 < args.length) {
      return args[i + 1];
    }
  }
  return fallback;
}

function cmdDraw(args) {
  const input = args[0];
  if (!input) {
    throw new Error("Missing input markup file path for draw command.");
  }

  const output = readOption(args, ["-o", "--out"], "output.svg");
  const width = Number(readOption(args, ["--width"], "NaN"));
  const height = Number(readOption(args, ["--height"], "NaN"));
  const padding = Number(readOption(args, ["--padding"], "40"));

  const items = parseMarkupFile(input);
  const svg = renderSvg(items, {
    width: Number.isFinite(width) ? width : undefined,
    height: Number.isFinite(height) ? height : undefined,
    padding: Number.isFinite(padding) ? padding : 40
  });

  fs.writeFileSync(output, svg, "utf8");
  console.log(`Wrote ${output} with ${items.length} parsed items.`);
}

function cmdInspect(args) {
  const input = args[0];
  if (!input) {
    throw new Error("Missing input markup file path for inspect command.");
  }

  const items = parseMarkupFile(input);
  const counts = items.reduce((acc, item) => {
    acc[item.shape] = (acc[item.shape] || 0) + 1;
    return acc;
  }, {});

  console.log(`Input: ${path.resolve(input)}`);
  console.log(`Total items: ${items.length}`);
  console.log("By shape:");

  for (const key of Object.keys(counts).sort()) {
    console.log(`  ${key}: ${counts[key]}`);
  }
}

function cmdServe(args) {
  const input = args[0] && !args[0].startsWith("-") ? args[0] : "Markup.txt";
  const portValue = readOption(args, ["--port", "-p"], "3000");
  const port = Number(portValue);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${portValue}`);
  }

  startServer({
    rootDir: process.cwd(),
    defaultMarkupFile: path.resolve(process.cwd(), input),
    port
  });
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  const rest = args.slice(1);

  if (command === "draw") {
    cmdDraw(rest);
    return;
  }

  if (command === "inspect") {
    cmdInspect(rest);
    return;
  }

  if (command === "serve") {
    cmdServe(rest);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
