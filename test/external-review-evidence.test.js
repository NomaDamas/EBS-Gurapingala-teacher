import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("review:evidence writes structured approval evidence tied to a PR head", async () => {
  const dir = await mkdtemp(join(tmpdir(), "external-review-"));
  const file = join(dir, "external-review.json");
  const transcript = join(dir, "review.md");
  const ciEvidence = join(dir, "ci-evidence.json");
  const deployEvidence = join(dir, "deploy-evidence.json");
  const classroomEvidence = join(dir, "classroom-config-1.json");
  const secondClassroomEvidence = join(dir, "classroom-config-2.json");
  await writeFile(transcript, "Review decision: APPROVE\nEvidence checked: all gates pass\n");
  await writeFile(ciEvidence, JSON.stringify(buildCiEvidence()));
  await writeFile(deployEvidence, JSON.stringify(buildDeployEvidence()));
  await writeFile(classroomEvidence, JSON.stringify(buildClassroomEvidence("2026-07-13-3-5")));
  await writeFile(secondClassroomEvidence, JSON.stringify(buildClassroomEvidence("2026-07-16-3-1", { generatedAt: "2026-07-10T00:02:30.000Z" })));
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_FILE: file,
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_TRANSCRIPT_FILE: transcript,
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: `${classroomEvidence},${secondClassroomEvidence}`,
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1",
    RELEASE_AUDIT_STATUS: "not-run",
    NON_BLOCKING_RISKS: "실제 촬영 전 학생 기기 리허설 필요"
  });

  assert.equal(result.code, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /external review evidence written/);
  const evidence = JSON.parse(await readFile(file, "utf8"));
  assert.equal(evidence.schemaVersion, "external-review-evidence/v1");
  assert.equal(evidence.decision, "APPROVE");
  assert.equal(evidence.reviewer, "GPT-5.5 xhigh equivalent");
  assert.equal(evidence.source.transcriptFile, transcript);
  assert.match(evidence.source.transcriptSha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.source.transcriptBytes, 58);
  assert.equal(evidence.prHeadSha, "abc123");
  assert.equal(evidence.evidenceArtifacts.ci.file, ciEvidence);
  assert.match(evidence.evidenceArtifacts.ci.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.evidenceArtifacts.deployVerification.file, deployEvidence);
  assert.match(evidence.evidenceArtifacts.deployVerification.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.evidenceArtifacts.classroomConfigs[0].file, classroomEvidence);
  assert.equal(evidence.evidenceArtifacts.classroomConfigs[0].roomId, "2026-07-13-3-5");
  assert.equal(evidence.evidenceArtifacts.classroomConfigs[1].file, secondClassroomEvidence);
  assert.equal(evidence.evidenceArtifacts.classroomConfigs[1].roomId, "2026-07-16-3-1");
  assert.equal(evidence.evidenceChecked.ciStatus, "success");
  assert.equal(evidence.evidenceChecked.classroomConfigStatus, "pass");
  assert.deepEqual(evidence.blockingFindings, []);
  assert.deepEqual(evidence.nonBlockingRisks, ["실제 촬영 전 학생 기기 리허설 필요"]);
});

test("review:evidence rejects approval with blocking findings", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence,
    BLOCKING_FINDINGS: "src/worker.js:1 학생에게 정답 누출 가능"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /APPROVE evidence cannot include BLOCKING_FINDINGS/);
});

test("review:evidence fails closed when required verification statuses are missing", async () => {
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /TESTS_STATUS=pass or success is required/);
  assert.match(result.stderr, /EVAL_STATUS=pass or success is required/);
  assert.match(result.stderr, /READINESS_STATUS=pass or success is required/);
  assert.match(result.stderr, /SMOKE_STATUS=pass or success is required/);
  assert.match(result.stderr, /VERIFY_DEPLOY_STATUS=pass or success is required/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_STATUS=pass or success is required/);
});

test("review:evidence requires a concrete external review source artifact", async () => {
  const artifacts = await writeGateArtifacts();
  const missing = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence
  });

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /EXTERNAL_REVIEW_SOURCE_URL or EXTERNAL_REVIEW_TRANSCRIPT_FILE is required/);

  const invalidUrl = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "http://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence
  });

  assert.notEqual(invalidUrl.code, 0);
  assert.match(invalidUrl.stderr, /EXTERNAL_REVIEW_SOURCE_URL must be an https URL/);
});

test("review:evidence requires deployed and classroom evidence artifacts for approval", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE is required/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILES or CLASSROOM_CONFIG_EVIDENCE_FILE is required/);
});

test("review:evidence requires CI evidence artifact for approval", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CI_EVIDENCE_FILE is required/);
});

test("review:evidence rejects approval when CI evidence did not pass", async () => {
  const artifacts = await writeGateArtifacts({
    ci: { status: "fail" }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CI_EVIDENCE_FILE status must be pass/);
});

test("review:evidence rejects approval when CI evidence timestamps are invalid", async () => {
  const artifacts = await writeGateArtifacts({
    ci: {
      generatedAt: "2026-07-10T00:00:10.000Z",
      checkRun: {
        id: 101,
        name: "Verify product gates",
        status: "completed",
        conclusion: "success",
        startedAt: "2026-07-10T00:00:00Z",
        completedAt: "2026-07-10T00:00:20Z"
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CI_EVIDENCE_FILE generatedAt must be after checkRun\.completedAt/);
});

test("review:evidence rejects approval when deployed evidence is from a different PR head", async () => {
  const artifacts = await writeGateArtifacts({
    deploy: { prHeadSha: "old123" }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE prHeadSha must match PR_HEAD_SHA/);
});

test("review:evidence rejects approval when deploy evidence lacks production gates", async () => {
  const artifacts = await writeGateArtifacts({
    deploy: {
      requireOpenAI: false,
      requireTeacherToken: false,
      requireCloudflareEdge: false,
      cloudflareEdge: {
        present: false,
        headers: {}
      },
      health: {
        status: 200,
        ok: true,
        provider: "rules",
        openaiConfigured: false,
        openaiModel: "rules",
        openaiTimeoutMs: 0,
        teacherProtected: false
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must record requireOpenAI=true/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must record requireTeacherToken=true/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must record requireCloudflareEdge=true/);
  assert.match(result.stderr, /Cloudflare edge headers were present/);
  assert.match(result.stderr, /sanitized \/api\/health evidence snapshot/);
});

test("review:evidence rejects approval when deploy health mismatches expected OpenAI config", async () => {
  const artifacts = await writeGateArtifacts({
    deploy: {
      expectedOpenAIModel: "gpt-other",
      expectedOpenAITimeoutMs: 30000
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE health\.openaiModel must match expectedOpenAIModel/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE health\.openaiTimeoutMs must match expectedOpenAITimeoutMs/);
});

test("review:evidence rejects approval when deploy evidence lacks safe sharing URLs", async () => {
  const artifacts = await writeGateArtifacts({
    deploy: {
      sharingUrls: {
        studentUrl: "https://ebs-gurapingala-teacher.example.workers.dev/?room=deploy-verify&token=leaked",
        teacherUrlTemplate: "https://ebs-gurapingala-teacher.example.workers.dev/teacher?room=deploy-verify",
        studentUrlHasToken: true,
        teacherUrlRequiresToken: false
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE must include student\/teacher sharing URL evidence with no student token/);
});

test("review:evidence rejects approval when deploy evidence uses a filming room", async () => {
  const artifacts = await writeGateArtifacts({
    deploy: {
      verifyRoom: "2026-07-13-3-5",
      sharingUrls: {
        studentUrl: "https://ebs-gurapingala-teacher.example.workers.dev/?room=2026-07-13-3-5",
        teacherUrlTemplate: "https://ebs-gurapingala-teacher.example.workers.dev/teacher?room=2026-07-13-3-5&token=<TEACHER_TOKEN>",
        studentUrlHasToken: false,
        teacherUrlRequiresToken: true
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE verifyRoom must be a deploy verification room/);
});

test("review:evidence rejects approval when classroom evidence points to deploy verification room", async () => {
  const artifacts = await writeGateArtifacts({
    classroom: { roomId: "deploy-verify" }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* roomId must be a filming\/rehearsal room/);
});

test("review:evidence rejects approval when classroom evidence lacks production gates", async () => {
  const artifacts = await writeGateArtifacts({
    classroom: {
      workerUrl: "http://localhost:8787/",
      requireOpenAI: false,
      requireTeacherToken: false,
      expectedLevel: 0,
      expectedPersona: "",
      observedHealth: {
        status: 200,
        ok: true,
        openaiConfigured: false,
        openaiModel: "rules",
        openaiTimeoutMs: 0,
        teacherProtected: false
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* workerUrl must be an https URL/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* must record requireOpenAI=true/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* must record requireTeacherToken=true/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* expectedLevel must be 1, 2, 3, or 4/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* expectedPersona is required/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* sanitized \/api\/health evidence snapshot/);
});

test("review:evidence rejects approval when classroom Level persona or Worker URL mismatches", async () => {
  const artifacts = await writeGateArtifacts({
    classroom: {
      workerUrl: "https://other-worker.example.workers.dev/",
      expectedLevel: 3,
      expectedPersona: "이순신 장군처럼 친절하게 설명한다.",
      observedConfig: {
        level: 2,
        persona: "다른 페르소나"
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* workerUrl must match VERIFY_DEPLOY_EVIDENCE_FILE workerUrl/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* observedConfig must match expected Level\/persona/);
});

test("review:evidence rejects approval when optional classroom chat audit sample is invalid", async () => {
  const artifacts = await writeGateArtifacts({
    classroom: {
      verifyClassroomChat: true,
      sampleChat: {
        sessionId: "classroom-config-2026-07-13-3-5-test",
        studentVisibleAnswerLength: 42,
        auditInput: {
          appliedLevel: 1,
          persona: "다른 페르소나"
        },
        preflightVerdict: "PASS_LEVEL_CALIBRATED_FALSEHOOD",
        debriefRequired: true
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* sampleChat must prove \/api\/chat audit used expected Level\/persona/);
});

test("review:evidence can require classroom chat audit proof for every filming room", async () => {
  const missingProof = await writeGateArtifacts();
  const missing = await runReviewEvidence({
    ...validApprovalEnv(missingProof),
    REQUIRE_CLASSROOM_CHAT_PROOF: "true"
  });

  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /must record verifyClassroomChat=true when REQUIRE_CLASSROOM_CHAT_PROOF=true/);

  const withProof = await writeGateArtifacts({
    classroom: {
      verifyClassroomChat: true,
      sampleChat: buildSampleChatEvidence(2, "이순신 장군처럼 친절하게 설명한다.")
    },
    classroomTwo: {
      verifyClassroomChat: true,
      sampleChat: buildSampleChatEvidence(2, "이순신 장군처럼 친절하게 설명한다.")
    }
  });
  const proofOutputDir = await mkdtemp(join(tmpdir(), "external-review-proof-"));
  const proofOutputFile = join(proofOutputDir, "external-review.json");
  const approved = await runReviewEvidence({
    ...validApprovalEnv(withProof),
    EXTERNAL_REVIEW_FILE: proofOutputFile,
    REQUIRE_CLASSROOM_CHAT_PROOF: "true"
  });

  assert.equal(approved.code, 0, approved.stdout + approved.stderr);
  const evidence = JSON.parse(await readFile(proofOutputFile, "utf8"));
  assert.equal(evidence.requireClassroomChatProof, true);
});

test("review:evidence rejects approval when classroom OpenAI config mismatches health", async () => {
  const artifacts = await writeGateArtifacts({
    classroom: {
      expectedOpenAIModel: "gpt-other",
      expectedOpenAITimeoutMs: 30000
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* observedHealth\.openaiModel must match expectedOpenAIModel/);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* observedHealth\.openaiTimeoutMs must match expectedOpenAITimeoutMs/);
});

test("review:evidence rejects approval when classroom sharing URLs expose unsafe access", async () => {
  const artifacts = await writeGateArtifacts({
    classroom: {
      sharingUrls: {
        studentUrl: "https://ebs-gurapingala-teacher.example.workers.dev/?room=2026-07-13-3-5&token=secret-token",
        teacherUrlTemplate: "https://ebs-gurapingala-teacher.example.workers.dev/teacher?room=2026-07-13-3-5",
        studentUrlHasToken: true,
        teacherUrlRequiresToken: false
      }
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* sharing URL evidence with no student token/);
});

test("review:evidence rejects approval when classroom checks did not all pass", async () => {
  const artifacts = await writeGateArtifacts({
    classroom: {
      checks: [
        { name: "student URL loads for classroom room", passed: true },
        { name: "classroom Level/persona matches expected config", passed: false }
      ]
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILE .* checks must all pass/);
});

test("review:evidence rejects approval when expected classroom room evidence is missing", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    ...validApprovalEnv(artifacts),
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence,
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /CLASSROOM_CONFIG_EVIDENCE_FILES missing expected filming room 2026-07-16-3-1/);
});

test("review:evidence rejects approval when classroom room evidence is unexpected or duplicate", async () => {
  const unexpectedArtifacts = await writeGateArtifacts({
    classroomTwo: { roomId: "2026-07-18-extra" }
  });
  const unexpected = await runReviewEvidence(validApprovalEnv(unexpectedArtifacts));

  assert.notEqual(unexpected.code, 0);
  assert.match(unexpected.stderr, /missing expected filming room 2026-07-16-3-1/);
  assert.match(unexpected.stderr, /contains unexpected filming room 2026-07-18-extra/);

  const duplicateArtifacts = await writeGateArtifacts({
    classroomTwo: { roomId: "2026-07-13-3-5" }
  });
  const duplicate = await runReviewEvidence(validApprovalEnv(duplicateArtifacts));

  assert.notEqual(duplicate.code, 0);
  assert.match(duplicate.stderr, /contains duplicate filming room 2026-07-13-3-5/);
  assert.match(duplicate.stderr, /missing expected filming room 2026-07-16-3-1/);
});

function runReviewEvidence(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/write-external-review-evidence.js"], {
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

function validApprovalEnv(artifacts) {
  return {
    EXTERNAL_REVIEW_DECISION: "APPROVE",
    EXTERNAL_REVIEWER: "GPT-5.5 xhigh equivalent",
    EXTERNAL_REVIEW_SOURCE_URL: "https://reviews.example.com/ebs/1",
    PR_HEAD_SHA: "abc123",
    CI_STATUS: "success",
    TESTS_STATUS: "pass",
    EVAL_STATUS: "pass",
    READINESS_STATUS: "pass",
    SMOKE_STATUS: "pass",
    VERIFY_DEPLOY_STATUS: "pass",
    CLASSROOM_CONFIG_STATUS: "pass",
    CI_EVIDENCE_FILE: artifacts.ciEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  };
}

async function writeGateArtifacts(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "external-review-gates-"));
  const ciEvidence = join(dir, "ci-evidence.json");
  const deployEvidence = join(dir, "deploy-evidence.json");
  const classroomEvidence = join(dir, "classroom-config-1.json");
  const secondClassroomEvidence = join(dir, "classroom-config-2.json");
  await writeFile(ciEvidence, JSON.stringify(buildCiEvidence(overrides.ci)));
  await writeFile(deployEvidence, JSON.stringify(buildDeployEvidence(overrides.deploy)));
  await writeFile(classroomEvidence, JSON.stringify(buildClassroomEvidence("2026-07-13-3-5", overrides.classroom)));
  await writeFile(secondClassroomEvidence, JSON.stringify(buildClassroomEvidence("2026-07-16-3-1", { generatedAt: "2026-07-10T00:02:30.000Z", ...(overrides.classroomTwo || {}) })));
  return {
    ciEvidence,
    deployEvidence,
    classroomEvidence,
    secondClassroomEvidence,
    classroomEvidenceFiles: [classroomEvidence, secondClassroomEvidence]
  };
}

function buildDeployEvidence(overrides = {}) {
  const workerUrl = "https://ebs-gurapingala-teacher.example.workers.dev/";
  return {
    schemaVersion: "deploy-verification-evidence/v1",
    generatedAt: "2026-07-10T00:01:00.000Z",
    status: "pass",
    workerUrl,
    prHeadSha: "abc123",
    verifyRoom: "deploy-verify",
    requireOpenAI: true,
    requireTeacherToken: true,
    requireCloudflareEdge: true,
    cloudflareEdge: {
      present: true,
      headers: {
        cfRay: "test-ray"
      }
    },
    health: {
      status: 200,
      ok: true,
      provider: "openai",
      openaiConfigured: true,
      openaiModel: "gpt-5.5",
      openaiTimeoutMs: 15000,
      teacherProtected: true
    },
    expectedOpenAIModel: "gpt-5.5",
    expectedOpenAITimeoutMs: 15000,
    sharingUrls: {
      studentUrl: `${workerUrl}?room=deploy-verify`,
      teacherUrlTemplate: `${workerUrl}teacher?room=deploy-verify&token=<TEACHER_TOKEN>`,
      studentUrlHasToken: false,
      teacherUrlRequiresToken: true
    },
    passedChecks: 19,
    totalChecks: 19,
    ...overrides
  };
}

function buildCiEvidence(overrides = {}) {
  return {
    schemaVersion: "ci-evidence/v1",
    generatedAt: "2026-07-10T00:00:30.000Z",
    status: "pass",
    prHeadSha: "abc123",
    checkRun: {
      id: 101,
      name: "Verify product gates",
      status: "completed",
      conclusion: "success",
      startedAt: "2026-07-10T00:00:00Z",
      completedAt: "2026-07-10T00:00:20Z"
    },
    ...overrides
  };
}

function buildClassroomEvidence(roomId, overrides = {}) {
  const workerUrl = "https://ebs-gurapingala-teacher.example.workers.dev/";
  return {
    schemaVersion: "classroom-config-evidence/v1",
    generatedAt: "2026-07-10T00:02:00.000Z",
    status: "pass",
    workerUrl,
    prHeadSha: "abc123",
    roomId,
    expectedLevel: 2,
    expectedPersona: "이순신 장군처럼 친절하게 설명한다.",
    applyExpectedConfig: false,
    requireOpenAI: true,
    requireTeacherToken: true,
    expectedOpenAIModel: "gpt-5.5",
    expectedOpenAITimeoutMs: 15000,
    sharingUrls: {
      studentUrl: `${workerUrl}?room=${roomId}`,
      teacherUrlTemplate: `${workerUrl}teacher?room=${roomId}&token=<TEACHER_TOKEN>`,
      studentUrlHasToken: false,
      teacherUrlRequiresToken: true
    },
    observedHealth: {
      status: 200,
      ok: true,
      openaiConfigured: true,
      openaiModel: "gpt-5.5",
      openaiTimeoutMs: 15000,
      teacherProtected: true
    },
    observedConfig: {
      level: 2,
      persona: "이순신 장군처럼 친절하게 설명한다."
    },
    checks: [
      { name: "student URL loads for classroom room", passed: true },
      { name: "teacher URL requires token", passed: true },
      { name: "teacher URL accepts token", passed: true },
      { name: "health matches classroom requirements", passed: true },
      { name: "classroom Level/persona matches expected config", passed: true }
    ],
    ...overrides
  };
}

function buildSampleChatEvidence(level, persona) {
  return {
    sessionId: `classroom-config-${Date.now()}`,
    studentVisibleAnswerLength: 120,
    auditInput: {
      appliedLevel: level,
      persona
    },
    preflightVerdict: "PASS_LEVEL_CALIBRATED_FALSEHOOD",
    debriefRequired: true
  };
}
