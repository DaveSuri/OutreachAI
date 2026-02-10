#!/usr/bin/env node

import { loadDotEnvFiles } from "./_env-loader.mjs";

loadDotEnvFiles("production");

const appUrl = (process.env.APP_URL || "").trim();

if (!appUrl) {
  console.error("APP_URL is required.");
  process.exit(1);
}

const endpoint = `${appUrl.replace(/\/+$/, "")}/api/inngest`;

async function main() {
  const response = await fetch(endpoint, {
    headers: {
      "user-agent": "inngest-js:v3.52.0"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Inngest endpoint check failed (${response.status}): ${text}`);
  }

  const payload = await response.json();
  const mode = payload?.mode;
  const hasEventKey = Boolean(payload?.has_event_key);
  const hasSigningKey = Boolean(payload?.has_signing_key);
  const functionCount = Number(payload?.function_count || 0);

  if (mode !== "cloud") {
    throw new Error(`Inngest endpoint is not in cloud mode (mode=${mode || "unknown"}).`);
  }

  if (!hasEventKey || !hasSigningKey) {
    throw new Error("Inngest endpoint is missing INNGEST_EVENT_KEY or INNGEST_SIGNING_KEY.");
  }

  if (functionCount < 1) {
    throw new Error("Inngest endpoint reported zero registered functions.");
  }

  console.log(`Inngest cloud endpoint healthy: ${endpoint}`);
  console.log(`Functions registered: ${functionCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
