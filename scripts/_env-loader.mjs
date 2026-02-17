import fs from "node:fs";
import path from "node:path";

function parseEnvFile(filepath) {
  if (!fs.existsSync(filepath)) {
    return {};
  }

  const content = fs.readFileSync(filepath, "utf8");
  const parsed = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] || "";

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function loadDotEnvFiles(mode = process.env.NODE_ENV || "development") {
  const cwd = process.cwd();
  const layeredFiles = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
  const combined = {};
  const shellDefined = new Set(Object.keys(process.env));

  for (const filename of layeredFiles) {
    const parsed = parseEnvFile(path.join(cwd, filename));
    Object.assign(combined, parsed);
  }

  for (const [key, value] of Object.entries(combined)) {
    if (!shellDefined.has(key)) {
      process.env[key] = value;
    }
  }
}
