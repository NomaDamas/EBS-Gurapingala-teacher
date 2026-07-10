import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("verify:ci writes commit-bound CI evidence for successful PR check run", async () => {
  const server = await startGithubMock({
    headSha: "abc123",
    checkRuns: [
      {
        id: 101,
        name: "Verify product gates",
        status: "completed",
        conclusion: "success",
        html_url: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/actions/runs/1",
        details_url: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/actions/runs/1/job/2",
        started_at: "2026-07-10T00:00:00Z",
        completed_at: "2026-07-10T00:01:00Z"
      }
    ]
  });
  const dir = await mkdtemp(join(tmpdir(), "ci-evidence-"));
  const file = join(dir, "ci.json");
  const result = await runVerifyCi({
    GITHUB_API_BASE_URL: server.url,
    PR_URL: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1",
    PR_HEAD_SHA: "abc123",
    CI_EVIDENCE_FILE: file
  });
  await server.close();

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /ci evidence written/);
  const evidence = JSON.parse(await readFile(file, "utf8"));
  assert.equal(evidence.schemaVersion, "ci-evidence/v1");
  assert.equal(evidence.status, "pass");
  assert.equal(evidence.prHeadSha, "abc123");
  assert.equal(evidence.checkRun.name, "Verify product gates");
  assert.equal(evidence.checkRun.conclusion, "success");
});

test("verify:ci fails when PR head or check run does not match", async () => {
  const server = await startGithubMock({
    headSha: "old123",
    checkRuns: [
      {
        name: "Verify product gates",
        status: "completed",
        conclusion: "failure"
      }
    ]
  });
  const result = await runVerifyCi({
    GITHUB_API_BASE_URL: server.url,
    PR_URL: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/pull/1",
    PR_HEAD_SHA: "abc123"
  });
  await server.close();

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /GitHub PR head SHA must match PR_HEAD_SHA/);
  assert.match(result.stderr, /conclusion=success/);
});

function runVerifyCi(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/verify-ci.js"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        ...env
      }
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function startGithubMock({ headSha, checkRuns }) {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/repos/NomaDamas/EBS-Gurapingala-teacher/pulls/1") {
      res.end(JSON.stringify({ head: { sha: headSha } }));
      return;
    }
    if (req.url === `/repos/NomaDamas/EBS-Gurapingala-teacher/commits/abc123/check-runs`) {
      res.end(JSON.stringify({ total_count: checkRuns.length, check_runs: checkRuns }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ message: "not found" }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}
