import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { buildDebriefCsv } from "../src/domain/session-export.js";

test("verify-deploy validates a deployed Worker-compatible HTTP surface", async () => {
  const events = [];
  const purgedRooms = [];
  const config = {
    level: 2,
    persona: "기본 검증 도우미"
  };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const roomId = url.searchParams.get("room");
    if (roomId === "shoot-3-5" && url.pathname === "/api/purge") {
      res.statusCode = 409;
      return res.end("refusing to purge filming room");
    }
    if (roomId !== "deploy-verify") {
      res.statusCode = 400;
      return res.end("missing room");
    }
    if (url.pathname === "/") {
      return html(res, "질문의 온도 교사용 대시보드에 기록됩니다 이름 외 개인정보는 입력하지 마세요");
    }
    if (url.pathname === "/api/health") {
      return json(res, {
        ok: true,
        provider: "rules",
        openaiModel: "gpt-5.5",
        openaiTimeoutMs: 15000,
        openaiConfigured: false,
        teacherProtected: true
      });
    }
    if (url.pathname === "/api/evaluation-set") {
      return json(res, {
        schemaVersion: "evaluation-set-public/v1",
        items: Array.from({ length: 50 }, (_, index) => ({
          turn: index + 1,
          studentQuestion: `질문 ${index + 1}`,
          expectedLevel: (index % 4) + 1
        }))
      });
    }
    if (url.pathname === "/api/evaluation-set/full" && !isTeacherHeader(req)) {
      res.statusCode = 401;
      return res.end("Teacher token required");
    }
    if (url.pathname === "/api/evaluation-set/full" && isTeacherHeader(req)) {
      return json(res, {
        items: Array.from({ length: 50 }, (_, index) => ({
          turn: index + 1,
          audit: { correctAnswer: `정답 ${index + 1}` }
        }))
      });
    }
    if (url.pathname === "/api/config" && !isTeacherHeader(req)) {
      res.statusCode = 401;
      return res.end("Teacher token required");
    }
    if (url.pathname === "/api/config" && isTeacherHeader(req) && req.method === "POST") {
      return readJson(req).then((body) => {
        if (/정답|거짓|정정|ignore|reveal|correct answer/i.test(String(body.persona || ""))) {
          res.statusCode = 400;
          events.push({
            type: "teacher_config_rejected",
            sessionId: "teacher",
            studentName: "teacher",
            roomId: "deploy-verify",
            error: "unsafe_persona_instruction",
            message: "페르소나는 말투와 역할만 설정할 수 있습니다.",
            blockedPattern: "정답|거짓|정정",
            at: new Date().toISOString()
          });
          return json(res, {
            error: "unsafe_persona_instruction",
            message: "페르소나는 말투와 역할만 설정할 수 있습니다."
          });
        }
        config.level = Number(body.level) || 2;
        config.persona = String(body.persona || "기본 검증 도우미");
        config.updatedAt = new Date().toISOString();
        events.push({
          type: "teacher_config_updated",
          sessionId: "teacher",
          studentName: "teacher",
          roomId: "deploy-verify",
          level: config.level,
          persona: config.persona,
          config: { ...config },
          at: config.updatedAt
        });
        return json(res, config);
      });
    }
    if (url.pathname === "/api/config" && isTeacherHeader(req)) {
      return json(res, config);
    }
    if (url.pathname === "/api/join" && req.method === "POST") {
      return readJson(req).then((body) => {
        events.push({
          type: "student_joined",
          sessionId: body.sessionId,
          studentName: body.studentName
        });
        return json(res, { ok: true });
      });
    }
    if (url.pathname === "/api/chat" && req.method === "POST") {
      return readJson(req).then((body) => {
        events.push({
          type: "chat_turn",
          roomId: "deploy-verify",
          sessionId: body.sessionId,
          studentName: body.studentName,
          studentMessage: body.message,
          studentVisibleAnswer: "명량해전은 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 볼 수 있어.",
          latencyMs: 42,
          teacherAudit: {
            input: {
              appliedLevel: config.level,
              persona: config.persona
            },
            selectedCase: {
              topic: "명량해전 전력",
              verificationPrompt: "명량해전의 조선 수군 전력과 승리 요인을 교과서·자료에서 둘 이상 찾아보게 한다.",
              debriefNote: "승리는 지휘력뿐 아니라 조류·지형·전술·병사들의 역할이 결합된 결과로 정정한다."
            },
            correctAnswer: "명량해전에서 조선 수군은 매우 적은 전력으로 일본 수군과 싸웠다.",
            falseClaim: "이순신의 지휘력 하나만으로 승리했다.",
            whyFalse: "지형, 조류, 병사, 전술을 지워 Level 2/3 과장에 해당한다.",
            preflight: { verdict: "PASS_LEVEL_CALIBRATED_FALSEHOOD" },
            provider: { name: "rules" }
          }
        });
        return json(res, {
          answer: "명량해전은 사실상 이순신의 지휘력 하나만으로 승리한 전투라고 볼 수 있어.",
          roomId: "deploy-verify",
          latencyMs: 42
        });
      });
    }
    if (url.pathname === "/teacher" && !url.searchParams.has("token")) {
      res.statusCode = 401;
      return res.end("Teacher token required");
    }
    if (url.pathname === "/teacher" && url.searchParams.get("token") === "teacher-secret") {
      return html(res, "실시간 교실 관찰");
    }
    if (url.pathname === "/ws/teacher" && !isTeacherProtocol(req)) {
      res.statusCode = 401;
      return res.end("Teacher token required");
    }
    if (url.pathname === "/ws/teacher" && isTeacherProtocol(req)) {
      res.statusCode = 426;
      return res.end("Expected websocket");
    }
    if (url.pathname === "/api/debrief" && isTeacherHeader(req)) {
      return json(res, {
        schemaVersion: "debrief-table/v1",
        roomId: "deploy-verify",
        rows: events
          .filter((event) => event.type === "chat_turn")
          .map((event) => ({
            roomId: event.roomId,
            sessionId: event.sessionId,
            studentName: event.studentName,
            question: event.studentMessage,
            studentVisibleAnswer: event.studentVisibleAnswer,
            verificationPrompt: event.teacherAudit?.selectedCase?.verificationPrompt,
            debriefNote: event.teacherAudit?.selectedCase?.debriefNote,
            level: event.teacherAudit?.input?.appliedLevel,
            correctAnswer: event.teacherAudit?.correctAnswer,
            falseClaim: event.teacherAudit?.falseClaim,
            whyFalse: event.teacherAudit?.whyFalse,
            provider: event.teacherAudit?.provider?.name
          }))
      });
    }
    if (url.pathname === "/api/debrief.csv" && isTeacherHeader(req)) {
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", 'attachment; filename="deploy-verify-debrief-table.csv"');
      return res.end(buildDebriefCsv(events));
    }
    if (url.pathname === "/api/export" && isTeacherHeader(req)) {
      return json(res, {
        schemaVersion: "classroom-export/v1",
        roomId: "deploy-verify",
        events
      });
    }
    if (url.pathname === "/api/purge" && isTeacherHeader(req) && req.method === "POST") {
      if (req.headers["x-purge-room"] !== roomId) {
        res.statusCode = 409;
        return res.end("purge room confirmation required");
      }
      purgedRooms.push(roomId);
      events.length = 0;
      return json(res, { ok: true });
    }
    res.statusCode = 404;
    res.end("not found");
  });

  await listen(server);
  const address = server.address();
  const workerUrl = `http://127.0.0.1:${address.port}`;

  try {
    const result = await runNode(["scripts/verify-deploy.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      WORKER_ROOM: "shoot-3-5"
    });

    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /PASS student page loads/);
    assert.match(result.stdout, /PASS student join and chat endpoint works/);
    assert.match(result.stdout, /PASS teacher token is configured when required/);
    assert.match(result.stdout, /PASS full evaluation set requires teacher token/);
    assert.match(result.stdout, /PASS teacher config API controls generated audit level/);
    assert.match(result.stdout, /PASS teacher config rejects unsafe persona overrides/);
    assert.match(result.stdout, /PASS teacher page accepts token when provided/);
    assert.match(result.stdout, /PASS teacher websocket accepts subprotocol token without query token/);
    assert.match(result.stdout, /PASS debrief export is room aware/);
    assert.match(result.stdout, /PASS debrief csv export is room aware and complete/);
    assert.match(result.stdout, /PASS deploy verification telemetry is exportable/);
    assert.match(result.stdout, /PASS deploy verification telemetry can be purged/);
    assert.match(result.stdout, /PASS OpenAI provider is configured when required/);
    assert.match(result.stdout, /PASS OpenAI model matches expectation when provided/);
    assert.match(result.stdout, /PASS OpenAI timeout matches expectation when provided/);
    assert.match(result.stdout, /deploy verification passed: 18\/18/);
    assert.deepEqual(purgedRooms, ["deploy-verify"]);

    const strictResult = await runNode(["scripts/verify-deploy.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      WORKER_ROOM: "shoot-3-5",
      REQUIRE_OPENAI: "true"
    });

    assert.notEqual(strictResult.code, 0);
    assert.match(strictResult.stdout, /FAIL OpenAI provider is configured when required/);
    assert.deepEqual(purgedRooms, ["deploy-verify", "deploy-verify"]);

    const modelMismatchResult = await runNode(["scripts/verify-deploy.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      EXPECTED_OPENAI_MODEL: "gpt-other"
    });

    assert.notEqual(modelMismatchResult.code, 0);
    assert.match(modelMismatchResult.stdout, /FAIL OpenAI model matches expectation when provided/);
    assert.deepEqual(purgedRooms, ["deploy-verify", "deploy-verify", "deploy-verify"]);

    const timeoutMismatchResult = await runNode(["scripts/verify-deploy.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      EXPECTED_OPENAI_TIMEOUT_MS: "20000"
    });

    assert.notEqual(timeoutMismatchResult.code, 0);
    assert.match(timeoutMismatchResult.stdout, /FAIL OpenAI timeout matches expectation when provided/);
    assert.deepEqual(purgedRooms, ["deploy-verify", "deploy-verify", "deploy-verify", "deploy-verify"]);

    const missingTeacherTokenResult = await runNode(["scripts/verify-deploy.js"], {
      WORKER_URL: workerUrl,
      REQUIRE_TEACHER_TOKEN: "true"
    });

    assert.notEqual(missingTeacherTokenResult.code, 0);
    assert.match(missingTeacherTokenResult.stderr, /TEACHER_TOKEN is required/);
    assert.deepEqual(purgedRooms, ["deploy-verify", "deploy-verify", "deploy-verify", "deploy-verify"]);

    const unsafeResult = await runNode(["scripts/verify-deploy.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      VERIFY_ROOM: "shoot-3-5"
    });

    assert.notEqual(unsafeResult.code, 0);
    assert.match(unsafeResult.stderr, /VERIFY_ROOM must start with deploy-verify/);
    assert.deepEqual(purgedRooms, ["deploy-verify", "deploy-verify", "deploy-verify", "deploy-verify"]);
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

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      env: {
        ...process.env,
        ...env
      },
      cwd: process.cwd()
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

function html(res, body) {
  setSecurityHeaders(res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(body);
}

function json(res, body) {
  setSecurityHeaders(res);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function setSecurityHeaders(res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  res.setHeader("content-security-policy", "default-src 'self'; frame-ancestors 'none'; object-src 'none'");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
}

function isTeacherHeader(req) {
  return req.headers["x-teacher-token"] === "teacher-secret";
}

function isTeacherProtocol(req) {
  return req.headers["sec-websocket-protocol"] === encodeTeacherWebSocketProtocol("teacher-secret");
}

function encodeTeacherWebSocketProtocol(token) {
  const encoded = btoa(String(token)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `teacher-token.${encoded}`;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
