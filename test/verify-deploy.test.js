import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

test("verify-deploy validates a deployed Worker-compatible HTTP surface", async () => {
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.searchParams.get("room") !== "shoot-3-5") {
      res.statusCode = 400;
      return res.end("missing room");
    }
    if (url.pathname === "/") return html(res, "질문의 온도");
    if (url.pathname === "/api/health") {
      return json(res, {
        ok: true,
        provider: "rules",
        openaiConfigured: false,
        teacherProtected: true
      });
    }
    if (url.pathname === "/api/evaluation-set") {
      return json(res, { items: Array.from({ length: 50 }, (_, index) => ({ turn: index + 1 })) });
    }
    if (url.pathname === "/teacher" && !url.searchParams.has("token")) {
      res.statusCode = 401;
      return res.end("Teacher token required");
    }
    if (url.pathname === "/teacher" && url.searchParams.get("token") === "teacher-secret") {
      return html(res, "실시간 교실 관찰");
    }
    if (url.pathname === "/api/debrief" && url.searchParams.get("token") === "teacher-secret") {
      return json(res, {
        schemaVersion: "debrief-table/v1",
        roomId: "shoot-3-5",
        rows: []
      });
    }
    if (url.pathname === "/api/debrief.csv" && url.searchParams.get("token") === "teacher-secret") {
      res.setHeader("content-type", "text/csv; charset=utf-8");
      res.setHeader("content-disposition", 'attachment; filename="shoot-3-5-debrief-table.csv"');
      return res.end("roomId,sessionId\n");
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
    assert.match(result.stdout, /PASS teacher page accepts token when provided/);
    assert.match(result.stdout, /PASS debrief export is room aware/);
    assert.match(result.stdout, /PASS debrief csv filename is room aware/);
    assert.match(result.stdout, /PASS OpenAI provider is configured when required/);
    assert.match(result.stdout, /deploy verification passed: 8\/8/);

    const strictResult = await runNode(["scripts/verify-deploy.js"], {
      WORKER_URL: workerUrl,
      TEACHER_TOKEN: "teacher-secret",
      WORKER_ROOM: "shoot-3-5",
      REQUIRE_OPENAI: "true"
    });

    assert.notEqual(strictResult.code, 0);
    assert.match(strictResult.stdout, /FAIL OpenAI provider is configured when required/);
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
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(body);
}

function json(res, body) {
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
