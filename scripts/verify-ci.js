import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const prUrl = String(process.env.PR_URL || "https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1").trim();
const expectedHeadSha = String(process.env.PR_HEAD_SHA || process.env.GITHUB_SHA || "").trim();
const outputFile = String(process.env.CI_EVIDENCE_FILE || "artifacts/ci-evidence.json").trim();
const expectedCheckName = String(process.env.EXPECTED_CI_CHECK_NAME || "Verify product gates").trim();
const apiBaseUrl = String(process.env.GITHUB_API_BASE_URL || "https://api.github.com").replace(/\/+$/, "");

const target = parsePullRequestUrl(prUrl);
const failures = [];
if (!target) failures.push("PR_URL must be an https GitHub pull request URL");
if (!expectedHeadSha) failures.push("PR_HEAD_SHA or GITHUB_SHA is required");
if (!expectedCheckName) failures.push("EXPECTED_CI_CHECK_NAME is required");

if (failures.length) fail(failures);

const pull = await getJson(`/repos/${target.owner}/${target.repo}/pulls/${target.number}`);
const actualHeadSha = String(pull?.head?.sha || "").trim();
if (actualHeadSha !== expectedHeadSha) {
  failures.push("GitHub PR head SHA must match PR_HEAD_SHA");
}

const checkRuns = await getJson(`/repos/${target.owner}/${target.repo}/commits/${expectedHeadSha}/check-runs`);
const runs = Array.isArray(checkRuns?.check_runs) ? checkRuns.check_runs : [];
const matchingRuns = runs.filter((run) => run?.name === expectedCheckName);
const successfulRun = matchingRuns.find((run) => run?.status === "completed" && run?.conclusion === "success");
if (!successfulRun) {
  failures.push(`GitHub check-run "${expectedCheckName}" must be completed with conclusion=success for PR_HEAD_SHA`);
}

const generatedAt = new Date().toISOString();
if (successfulRun) {
  const startedAt = parseEvidenceTimestamp(successfulRun.started_at);
  const completedAt = parseEvidenceTimestamp(successfulRun.completed_at);
  const generatedAtMs = parseEvidenceTimestamp(generatedAt);
  if (!startedAt) {
    failures.push(`GitHub check-run "${expectedCheckName}" started_at must be a valid timestamp`);
  }
  if (!completedAt) {
    failures.push(`GitHub check-run "${expectedCheckName}" completed_at must be a valid timestamp`);
  }
  if (startedAt && completedAt && completedAt < startedAt) {
    failures.push(`GitHub check-run "${expectedCheckName}" completed_at must be after started_at`);
  }
  if (completedAt && generatedAtMs && generatedAtMs < completedAt) {
    failures.push("CI_EVIDENCE_FILE generatedAt must be after GitHub check-run completed_at");
  }
}

if (failures.length) fail(failures);

const evidence = {
  schemaVersion: "ci-evidence/v1",
  generatedAt,
  status: "pass",
  prUrl,
  repository: `${target.owner}/${target.repo}`,
  prNumber: Number(target.number),
  prHeadSha: expectedHeadSha,
  actualPrHeadSha: actualHeadSha,
  expectedCheckName,
  checkRun: {
    id: successfulRun.id,
    name: successfulRun.name,
    status: successfulRun.status,
    conclusion: successfulRun.conclusion,
    workflowName: successfulRun.check_suite?.app?.name || successfulRun.app?.name || "",
    htmlUrl: successfulRun.html_url,
    detailsUrl: successfulRun.details_url,
    startedAt: successfulRun.started_at,
    completedAt: successfulRun.completed_at
  },
  totalCheckRuns: runs.length
};

await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`ci evidence written: ${outputFile}`);
console.log(`prHeadSha=${expectedHeadSha}`);
console.log(`checkRun=${expectedCheckName}`);

async function getJson(path) {
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "ebs-gurapingala-teacher-ci-verifier"
  };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(`${apiBaseUrl}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API request failed ${response.status}: ${path}`);
  }
  return response.json();
}

function parsePullRequestUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "github.com") return null;
    const [, owner, repo, pull, number] = url.pathname.split("/");
    if (!owner || !repo || pull !== "pull" || !/^\d+$/.test(number)) return null;
    return { owner, repo, number };
  } catch {
    return null;
  }
}

function parseEvidenceTimestamp(value) {
  const timestamp = Date.parse(String(value || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function fail(items) {
  for (const item of items) console.error(`FAIL ${item}`);
  console.error(`ci verification failed: ${items.length} issue(s)`);
  process.exit(1);
}
