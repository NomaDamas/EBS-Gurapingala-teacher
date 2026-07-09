const failures = [];

const externalReviewDecision = normalizeDecision(process.env.EXTERNAL_REVIEW_DECISION);
const verifyDeployStatus = normalizeStatus(process.env.VERIFY_DEPLOY_STATUS);
const workerUrl = String(process.env.WORKER_URL || process.env.WORKER_HEALTH_URL || "").trim();
const prHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const expectedHeadSha = String(process.env.EXPECTED_PR_HEAD_SHA || "").trim();
const ciStatus = normalizeStatus(process.env.CI_STATUS || process.env.GITHUB_CI_STATUS);
const requireOpenAI = process.env.REQUIRE_OPENAI !== "false";
const requireTeacherToken = process.env.REQUIRE_TEACHER_TOKEN !== "false";

if (externalReviewDecision !== "approve") {
  failures.push("EXTERNAL_REVIEW_DECISION=APPROVE is required before merge/release");
}

if (verifyDeployStatus !== "pass") {
  failures.push("VERIFY_DEPLOY_STATUS=pass is required after running npm run verify:deploy against the real Worker URL");
}

if (!isHttpsUrl(workerUrl)) {
  failures.push("WORKER_URL or WORKER_HEALTH_URL must be the real https Cloudflare Worker URL");
}

if (!prHeadSha) {
  failures.push("PR_HEAD_SHA or GITHUB_SHA is required so review/deploy evidence is tied to a commit");
}

if (expectedHeadSha && prHeadSha && expectedHeadSha !== prHeadSha) {
  failures.push("EXPECTED_PR_HEAD_SHA does not match PR_HEAD_SHA; rerun review/deploy verification on the latest commit");
}

if (ciStatus !== "pass" && ciStatus !== "success") {
  failures.push("CI_STATUS=pass or CI_STATUS=success is required for the latest PR head");
}

if (requireOpenAI && process.env.REQUIRE_OPENAI !== "true") {
  failures.push("REQUIRE_OPENAI=true must be recorded for production release verification");
}

if (requireTeacherToken && process.env.REQUIRE_TEACHER_TOKEN !== "true") {
  failures.push("REQUIRE_TEACHER_TOKEN=true must be recorded for production release verification");
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`release audit failed: ${failures.length} issue(s)`);
  process.exit(1);
}

console.log("release audit passed");
console.log(`prHeadSha=${prHeadSha}`);
console.log(`workerUrl=${workerUrl}`);
console.log(`externalReviewDecision=${externalReviewDecision}`);
console.log(`verifyDeployStatus=${verifyDeployStatus}`);

function normalizeDecision(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z_]/g, "");
}

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}
