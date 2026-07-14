import { readFileSync } from "node:fs";

const env = process.env.DEPLOY_ENVIRONMENT || process.env.GITHUB_ENVIRONMENT || "production";
const isProduction = env === "production";
const required = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN"
];

if (isProduction) {
  required.push("WORKER_HEALTH_URL");
}

if (process.env.REQUIRE_TEACHER_TOKEN !== "false") {
  required.push("TEACHER_TOKEN");
}
if ((process.env.REQUIRE_OPENAI || "true") === "true") {
  required.push("OPENAI_API_KEY");
}

const failures = [];

const allowOldNodeForTests = process.env.DEPLOY_PREFLIGHT_ALLOW_OLD_NODE_FOR_TESTS === "true";
if (!allowOldNodeForTests && !isNode22OrNewer(process.versions.node)) {
  failures.push(`Node.js 22+ is required, current=${process.versions.node}`);
}

for (const name of required) {
  if (!process.env[name]) failures.push(`${name} is required for ${env} deploy preflight`);
}

const verifyRoom = normalizeRoomId(process.env.VERIFY_ROOM || "deploy-verify");
if (!isSafeVerifyRoom(verifyRoom)) {
  failures.push("VERIFY_ROOM must be deploy-verify or deploy-verify-<suffix>; never use a filming room for deploy verification");
}

if (isProduction) {
  for (const [name, expected] of [
    ["REQUIRE_OPENAI", "true"],
    ["REQUIRE_TEACHER_TOKEN", "true"],
    ["REQUIRE_CLOUDFLARE_EDGE", "true"]
  ]) {
    if (process.env[name] !== expected) failures.push(`${name}=true is required for production deploy preflight`);
  }
  if (!isHttpsWorkerUrl(process.env.WORKER_HEALTH_URL)) {
    failures.push("WORKER_HEALTH_URL must be an https Cloudflare Worker URL for production deploy preflight");
  }
  if (!process.env.EXPECTED_OPENAI_TIMEOUT_MS) {
    failures.push("EXPECTED_OPENAI_TIMEOUT_MS is required for production deploy preflight");
  }
}

const expectedTimeout = process.env.EXPECTED_OPENAI_TIMEOUT_MS || "15000";
if (!isValidTimeout(expectedTimeout)) {
  failures.push("EXPECTED_OPENAI_TIMEOUT_MS must be an integer between 1000 and 60000");
}

if ((process.env.REQUIRE_OPENAI || "true") === "true" && !process.env.EXPECTED_OPENAI_MODEL) {
  failures.push("EXPECTED_OPENAI_MODEL is required when REQUIRE_OPENAI=true");
}
if ((process.env.REQUIRE_OPENAI || "true") === "true" && !process.env.EXPECTED_OPENAI_VERIFIER_MODEL) {
  failures.push("EXPECTED_OPENAI_VERIFIER_MODEL is required when REQUIRE_OPENAI=true");
}
for (const name of ["EXPECTED_OPENAI_REASONING_EFFORT", "EXPECTED_OPENAI_VERIFIER_REASONING_EFFORT"]) {
  if (process.env[name] && !isValidReasoningEffort(process.env[name])) {
    failures.push(`${name} must be none, low, medium, or high when REQUIRE_OPENAI=true`);
  }
}

for (const name of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN", "OPENAI_API_KEY", "TEACHER_TOKEN"]) {
  if (process.env[name] && isPlaceholderValue(process.env[name])) {
    failures.push(`${name} must be the real value, not a placeholder`);
  }
}

const wrangler = readFileSync("wrangler.toml", "utf8");
for (const needle of [
  'name = "ebs-gurapingala-teacher"',
  'main = "src/worker.js"',
  "durable_objects.bindings",
  "ClassroomRoom"
]) {
  if (!wrangler.includes(needle)) failures.push(`wrangler.toml missing ${needle}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`deploy preflight failed: ${failures.length} issue(s)`);
  process.exit(1);
}

console.log(`deploy preflight passed for ${env}`);
console.log(`verifyRoom=${verifyRoom}`);
console.log(`expectedOpenAIModel=${process.env.EXPECTED_OPENAI_MODEL || "(not enforced)"}`);
console.log(`expectedOpenAIVerifierModel=${process.env.EXPECTED_OPENAI_VERIFIER_MODEL || "(not enforced)"}`);
console.log(`expectedOpenAIReasoningEffort=${process.env.EXPECTED_OPENAI_REASONING_EFFORT || "(not enforced)"}`);
console.log(`expectedOpenAIVerifierReasoningEffort=${process.env.EXPECTED_OPENAI_VERIFIER_REASONING_EFFORT || "(not enforced)"}`);
console.log(`expectedOpenAITimeoutMs=${Number(expectedTimeout)}`);

function isNode22OrNewer(version) {
  const [major] = String(version).split(".").map(Number);
  return Number.isFinite(major) && major >= 22;
}

function isValidTimeout(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1000 && n <= 60000;
}

function isValidReasoningEffort(value) {
  return ["none", "low", "medium", "high"].includes(String(value || "").trim().toLowerCase());
}

function isHttpsWorkerUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isPlaceholderValue(value) {
  const text = String(value || "").trim();
  return /^<.*>$/.test(text) || /^your[-_]/i.test(text) || /example/i.test(text);
}

function normalizeRoomId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function isSafeVerifyRoom(value) {
  return value === "deploy-verify" || value.startsWith("deploy-verify-");
}
