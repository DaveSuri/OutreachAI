#!/usr/bin/env node

import { loadDotEnvFiles } from "./_env-loader.mjs";

const args = process.argv.slice(2);
const modeFlagIndex = args.indexOf("--mode");
const modeFromArg = modeFlagIndex >= 0 ? args[modeFlagIndex + 1] : undefined;
const mode = (modeFromArg || process.env.NODE_ENV || "development").toLowerCase();

const REQUIRED_ALL = ["DATABASE_URL", "APP_URL"];
const REQUIRED_PROD = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "EMAIL_FROM",
  "ALERT_EMAIL_TO",
  "OPENAI_API_KEY"
];
const RECOMMENDED_PROD = ["GOOGLE_GEMINI_API_KEY"];

loadDotEnvFiles(mode);

function valueOf(name) {
  return (process.env[name] || "").trim();
}

function hasValue(name) {
  return valueOf(name).length > 0;
}

function isPlaceholder(name) {
  const value = valueOf(name).toLowerCase();
  if (!value) {
    return false;
  }

  const genericPlaceholders = [
    "change-me",
    "changeme",
    "yourdomain.com",
    "example.com",
    "example.org",
    "example.net",
    "your-api-key"
  ];

  if (genericPlaceholders.some((item) => value.includes(item))) {
    return true;
  }

  if (name === "APP_URL" && value.includes("localhost")) {
    return true;
  }

  return false;
}

function checkUrl(name, expectedProtocol) {
  const value = valueOf(name);
  try {
    const parsed = new URL(value);
    if (expectedProtocol && parsed.protocol !== expectedProtocol) {
      return `${name} must use ${expectedProtocol} (received ${parsed.protocol})`;
    }
    return null;
  } catch {
    return `${name} is not a valid URL`;
  }
}

const failures = [];
const warnings = [];

for (const name of REQUIRED_ALL) {
  if (!hasValue(name)) {
    failures.push(`${name} is required`);
  }
}

if (mode === "production") {
  for (const name of REQUIRED_PROD) {
    if (!hasValue(name)) {
      failures.push(`${name} is required in production`);
      continue;
    }

    if (isPlaceholder(name)) {
      failures.push(`${name} looks like a placeholder value`);
    }
  }

  for (const name of RECOMMENDED_PROD) {
    if (!hasValue(name)) {
      warnings.push(`${name} not set (voice assistant will use fallback text output)`);
    }
  }
}

if (hasValue("DATABASE_URL") && !valueOf("DATABASE_URL").startsWith("postgres")) {
  failures.push("DATABASE_URL must use a PostgreSQL connection string");
}

if (hasValue("APP_URL")) {
  const urlError = checkUrl("APP_URL", mode === "production" ? "https:" : undefined);
  if (urlError) {
    failures.push(urlError);
  }
}

if (mode === "production") {
  if (isPlaceholder("APP_URL")) {
    failures.push("APP_URL cannot use localhost in production");
  }

  if (valueOf("EMAIL_FROM").includes("@yourdomain.com")) {
    failures.push("EMAIL_FROM must be a verified sender domain in Resend");
  }

  if (valueOf("ALERT_EMAIL_TO").includes("@yourdomain.com")) {
    failures.push("ALERT_EMAIL_TO must be a real inbox");
  }
}

console.log(`Environment checklist mode: ${mode}`);
console.log("");

if (failures.length === 0) {
  console.log("PASS: required environment checks passed.");
} else {
  console.log("FAIL: missing or invalid required environment values:");
  for (const failure of failures) {
    console.log(`- ${failure}`);
  }
}

if (warnings.length > 0) {
  console.log("");
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

process.exit(failures.length > 0 ? 1 : 0);
