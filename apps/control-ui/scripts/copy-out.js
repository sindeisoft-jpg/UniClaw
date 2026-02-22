#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const here = path.dirname(__filename);
const appRoot = path.resolve(here, "..");
const outDir = path.join(appRoot, "out");
const targetDir = path.resolve(appRoot, "../../dist/control-ui");

if (!fs.existsSync(outDir)) {
  console.error("Missing out/ - run next build first");
  process.exit(1);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (fs.existsSync(targetDir)) {
  fs.rmSync(targetDir, { recursive: true });
}
copyRecursive(outDir, targetDir);
console.log("Copied out/ to dist/control-ui");
