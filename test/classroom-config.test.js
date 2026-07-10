import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("rehearsal:config verifies classroom room config and writes evidence", async () => {
  const configs = new Map([
    ["2026-07-13-3-5", { level: 2, persona: "이순신 장군처럼 친절하게 설명한다." }],
    ["2026-07-16-3-1", { level: 1, persona: "초기값" }]
  ]);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const room = url.searchParams.get("room") || "default-classroom";
    if (url.pathname === "/") return html(res, "질문의 온도 교사용 대시보드에 기록됩니다 이름 외 개인정보는 입력하지 마세요");
    if (url.pathname === "/teacher") {
      if (url.searchParams.get("token") !== "teacher-secret") return text(res, "Teacher token required", 401);
      return html(res, "실시간 교실 관찰");
    }
    if (url.pathname === "/api/health") {
      return json(res, {
        ok: true,
        openaiConfigured: true,
        openaiModel: "gpt-5.5",
        teacherProtected: true
      });
    }
    if (url.pathname === "/api/config") {
      if (req.headers["x-teacher-token"] !== "teacher-secret") return text(res, "Teacher token required", 401);
      if (req.method === "POST") {
        const body = JSON.parse(await readBody(req));
        configs.set(room, { level: body.level, persona: body.persona });
        return json(res, configs.get(room));
      }
      return json(res, configs.get(room) || {});
    }
    return text(res, "not found", 404);
  });

  await listen(server);
  const workerUrl = `http://127.0.0.1:${server.address().port}`;
  const evidenceDir = await mkdtemp(join(tmpdir(), "classroom-config-"));
  const evidenceFile = join(evidenceDir, "classroom-config.json");

  try {
    const result = await runNode(["scripts/verify-classroom-config.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      CLASSROOM_ROOM: "2026-07-13-3-5",
      EXPECTED_FALSE_LEVEL: "2",
      EXPECTED_PERSONA: "이순신 장군처럼 친절하게 설명한다.",
      EXPECTED_OPENAI_MODEL: "gpt-5.5",
      PR_HEAD_SHA: "abc123",
      CLASSROOM_CONFIG_EVIDENCE_FILE: evidenceFile
    });

    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS classroom Level\/persona matches expected config/);
    assert.match(result.stdout, /classroom config verification passed/);
    const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
    assert.equal(evidence.schemaVersion, "classroom-config-evidence/v1");
    assert.equal(evidence.status, "pass");
    assert.equal(evidence.roomId, "2026-07-13-3-5");
    assert.equal(evidence.prHeadSha, "abc123");
    assert.equal(evidence.expectedLevel, 2);
    assert.deepEqual(evidence.observedHealth, {
      status: 200,
      ok: true,
      openaiConfigured: true,
      openaiModel: "gpt-5.5",
      teacherProtected: true
    });
    assert.equal(evidence.observedConfig.persona, "이순신 장군처럼 친절하게 설명한다.");

    const applyResult = await runNode(["scripts/verify-classroom-config.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      CLASSROOM_ROOM: "2026-07-16-3-1",
      EXPECTED_FALSE_LEVEL: "3",
      EXPECTED_PERSONA: "관점 왜곡 실험용 역사 도우미",
      APPLY_CLASSROOM_CONFIG: "true",
      REQUIRE_OPENAI: "true"
    });

    assert.equal(applyResult.code, 0, applyResult.stdout + applyResult.stderr);
    assert.match(applyResult.stdout, /PASS expected classroom Level\/persona can be applied/);
    assert.deepEqual(configs.get("2026-07-16-3-1"), {
      level: 3,
      persona: "관점 왜곡 실험용 역사 도우미"
    });

    const unsafeRoomResult = await runNode(["scripts/verify-classroom-config.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      CLASSROOM_ROOM: "deploy-verify",
      EXPECTED_FALSE_LEVEL: "2",
      EXPECTED_PERSONA: "검증"
    });

    assert.notEqual(unsafeRoomResult.code, 0);
    assert.match(unsafeRoomResult.stderr, /CLASSROOM_ROOM must be a filming\/rehearsal room/);

    const missingShaResult = await runNode(["scripts/verify-classroom-config.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      CLASSROOM_ROOM: "2026-07-13-3-5",
      EXPECTED_FALSE_LEVEL: "2",
      EXPECTED_PERSONA: "이순신 장군처럼 친절하게 설명한다.",
      GITHUB_SHA: "",
      CLASSROOM_CONFIG_EVIDENCE_FILE: evidenceFile
    });

    assert.notEqual(missingShaResult.code, 0);
    assert.match(missingShaResult.stderr, /PR_HEAD_SHA or GITHUB_SHA is required/);
  } finally {
    await close(server);
  }
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}

function json(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  res.end(JSON.stringify(body));
}

function html(res, body) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(body);
}

function text(res, body, status = 200) {
  res.statusCode = status;
  res.end(body);
}

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
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
