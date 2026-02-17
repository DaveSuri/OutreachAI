#!/usr/bin/env node

import { loadDotEnvFiles } from "./_env-loader.mjs";

loadDotEnvFiles("production");

const apiKey = (process.env.RESEND_API_KEY || "").trim();
const appUrl = (process.env.APP_URL || "").trim();
const webhookEvents = (process.env.RESEND_WEBHOOK_EVENTS || "email.received")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!apiKey) {
  console.error("RESEND_API_KEY is required.");
  process.exit(1);
}

if (!appUrl) {
  console.error("APP_URL is required.");
  process.exit(1);
}

if (webhookEvents.length === 0) {
  console.error("RESEND_WEBHOOK_EVENTS resolved to an empty list.");
  process.exit(1);
}

const targetUrl = `${appUrl.replace(/\/+$/, "")}/api/webhooks/resend`;
const baseUrl = "https://api.resend.com";

async function resendRequest(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  const bodyText = await response.text();
  let parsedBody = {};

  try {
    parsedBody = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    parsedBody = { raw: bodyText };
  }

  if (!response.ok) {
    throw new Error(`Resend API ${response.status}: ${JSON.stringify(parsedBody)}`);
  }

  return parsedBody;
}

const webhookBodyVariants = (target, events) => [{ endpoint: target, events }, { url: target, events }];

async function upsertWebhook(path, method, target, events) {
  let lastError = null;
  for (const payload of webhookBodyVariants(target, events)) {
    try {
      return await resendRequest(path, {
        method,
        body: JSON.stringify(payload)
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to configure webhook.");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sameEventSet(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) {
    return false;
  }
  for (const eventName of left) {
    if (!right.has(eventName)) {
      return false;
    }
  }
  return true;
}

async function main() {
  const listed = await resendRequest("/webhooks");
  const webhooks = asArray(listed.data);
  const existing = webhooks.find((item) => {
    const endpoint = typeof item?.endpoint === "string" ? item.endpoint : typeof item?.url === "string" ? item.url : "";
    return endpoint.replace(/\/+$/, "") === targetUrl;
  });

  if (!existing) {
    const created = await upsertWebhook("/webhooks", "POST", targetUrl, webhookEvents);

    const createdId = created?.data?.id || "unknown";
    console.log(`Created Resend webhook: ${createdId} -> ${targetUrl}`);
    return;
  }

  const existingId = existing.id;
  const existingEvents = asArray(existing.events).map((eventName) => String(eventName));
  const needsEventUpdate = !sameEventSet(existingEvents, webhookEvents);

  if (!existingId) {
    console.log(`Existing webhook found at ${targetUrl}, but it has no ID in list response. No changes applied.`);
    return;
  }

  if (!needsEventUpdate) {
    console.log(`Resend webhook already configured: ${existingId} -> ${targetUrl}`);
    return;
  }

  await upsertWebhook(`/webhooks/${existingId}`, "PATCH", targetUrl, webhookEvents);

  console.log(`Updated Resend webhook: ${existingId} -> ${targetUrl}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
