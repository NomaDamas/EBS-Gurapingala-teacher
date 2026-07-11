import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { EVALUATION_SET_50 } from "../src/domain/evaluation-set.js";

test("review:evidence writes structured approval evidence tied to a PR head", async () => {
  const dir = await mkdtemp(join(tmpdir(), "external-review-"));
  const file = join(dir, "external-review.json");
  const transcript = join(dir, "review.md");
  const ciEvidence = join(dir, "ci-evidence.json");
  const evaluationSetEvidence = join(dir, "evaluation-set-evidence.json");
  const modelEvaluationEvidence = join(dir, "model-evaluation-evidence.json");
  const deployEvidence = join(dir, "deploy-evidence.json");
  const classroomEvidence = join(dir, "classroom-config-1.json");
  const secondClassroomEvidence = join(dir, "classroom-config-2.json");
  await writeFile(transcript, "Review decision: APPROVE\nEvidence checked: all gates pass\n");
  await writeFile(ciEvidence, JSON.stringify(buildCiEvidence()));
  await writeFile(evaluationSetEvidence, JSON.stringify(buildEvaluationSetEvidence()));
  await writeFile(modelEvaluationEvidence, JSON.stringify(buildModelEvaluationEvidence()));
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
    EVALUATION_SET_EVIDENCE_FILE: evaluationSetEvidence,
    MODEL_EVALUATION_EVIDENCE_FILE: modelEvaluationEvidence,
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
  assert.equal(evidence.evidenceArtifacts.evaluationSet.file, evaluationSetEvidence);
  assert.match(evidence.evidenceArtifacts.evaluationSet.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.evidenceArtifacts.modelEvaluation.file, modelEvaluationEvidence);
  assert.match(evidence.evidenceArtifacts.modelEvaluation.sha256, /^[a-f0-9]{64}$/);
  assert.equal(evidence.evidenceArtifacts.modelEvaluation.attestation.ok, true);
  assert.equal(evidence.evidenceArtifacts.modelEvaluation.attestation.prHeadSha, "abc123");
  assert.equal(evidence.evidenceArtifacts.modelEvaluation.attestation.repository, "NomaDamas/EBS-Gurapingala-teacher");
  assert.equal(evidence.evidenceArtifacts.modelEvaluation.attestation.workflowPath, ".github/workflows/deploy.yml");
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
    EVALUATION_SET_EVIDENCE_FILE: artifacts.evaluationSetEvidence,
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

test("review:evidence requires evaluation set evidence artifact for approval", async () => {
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
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidence
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /EVALUATION_SET_EVIDENCE_FILE is required/);
});

test("review:evidence requires real model evaluation evidence artifact for approval", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    ...validApprovalEnv(artifacts),
    MODEL_EVALUATION_EVIDENCE_FILE: ""
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /MODEL_EVALUATION_EVIDENCE_FILE is required/);
});

test("review:evidence rejects model evaluation fallback and duplicate response IDs", async () => {
  const fallbackEvidence = buildModelEvaluationEvidence();
  fallbackEvidence.models[0].execution.fallbackTurns = 1;
  const fallbackArtifacts = await writeGateArtifacts({
    modelEvaluation: fallbackEvidence
  });
  const fallback = await runReviewEvidence(validApprovalEnv(fallbackArtifacts));

  assert.notEqual(fallback.code, 0);
  assert.match(fallback.stderr, /zero fallback or blocked turns/);

  const duplicateEvidence = buildModelEvaluationEvidence();
  duplicateEvidence.models[0].turns[1].provider.responseId =
    duplicateEvidence.models[0].turns[0].provider.responseId;
  const duplicateArtifacts = await writeGateArtifacts({
    modelEvaluation: duplicateEvidence
  });
  const duplicate = await runReviewEvidence(validApprovalEnv(duplicateArtifacts));

  assert.notEqual(duplicate.code, 0);
  assert.match(duplicate.stderr, /150 unique OpenAI response IDs/);
});

test("review:evidence rejects model evaluation evidence without trusted GitHub attestation provenance", async () => {
  const artifacts = await writeGateArtifacts();
  const result = await runReviewEvidence({
    ...validApprovalEnv(artifacts),
    TEST_ATTESTATION_HEAD_SHA: "forged-sha"
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /GitHub attestation must bind the current model evidence SHA-256 to the trusted Deploy workflow and PR_HEAD_SHA/);
});

test("review:evidence rejects model and deployment evidence mismatch", async () => {
  const deploy = buildDeployEvidence();
  deploy.expectedOpenAIModel = "gpt-other";
  deploy.expectedOpenAIVerifierModel = "gpt-other-verifier";
  deploy.health.openaiModel = "gpt-other";
  deploy.health.openaiVerifierModel = "gpt-other-verifier";
  const artifacts = await writeGateArtifacts({ deploy });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /expectedOpenAIModel must match MODEL_EVALUATION_EVIDENCE_FILE expectedGeneratorModel/);
  assert.match(result.stderr, /expectedOpenAIVerifierModel must match MODEL_EVALUATION_EVIDENCE_FILE expectedVerifierModel/);
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
      expectedOpenAIVerifierModel: "gpt-verifier-other",
      expectedOpenAITimeoutMs: 30000
    }
  });
  const result = await runReviewEvidence(validApprovalEnv(artifacts));

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE health\.openaiModel must match expectedOpenAIModel/);
  assert.match(result.stderr, /VERIFY_DEPLOY_EVIDENCE_FILE health\.openaiVerifierModel must match expectedOpenAIVerifierModel/);
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

async function runReviewEvidence(env) {
  const ghBin = await getFakeGhBin();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/write-external-review-evidence.js"], {
      cwd: process.cwd(),
      env: {
        PATH: `${dirname(ghBin)}${delimiter}${process.env.PATH || ""}`,
        MODEL_EVALUATION_EVIDENCE_FILE: env.MODEL_EVALUATION_EVIDENCE_FILE ??
          (env.EVALUATION_SET_EVIDENCE_FILE
            ? join(dirname(env.EVALUATION_SET_EVIDENCE_FILE), "model-evaluation-evidence.json")
            : undefined),
        ...env,
        GH_BIN: "/attacker/fake-gh-must-be-ignored",
        MODEL_EVALUATION_ATTESTATION_REPOSITORY: "attacker/forged-repository",
        MODEL_EVALUATION_ATTESTATION_WORKFLOW: ".github/workflows/forged.yml"
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

let fakeGhBinPromise;

function getFakeGhBin() {
  if (!fakeGhBinPromise) fakeGhBinPromise = createFakeGhBin();
  return fakeGhBinPromise;
}

async function createFakeGhBin() {
  const dir = await mkdtemp(join(tmpdir(), "external-review-fake-gh-"));
  const file = join(dir, "gh");
  await writeFile(file, `#!/usr/bin/env node
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const evidenceFile = args[2];
const repoIndex = args.indexOf("--repo");
const repository = repoIndex >= 0 ? args[repoIndex + 1] : "";
if (process.env.TEST_ATTESTATION_FAIL === "true") {
  process.stderr.write("attestation verification failed\\n");
  process.exit(1);
}
const sha256 = process.env.TEST_ATTESTATION_EVIDENCE_SHA ||
  createHash("sha256").update(readFileSync(evidenceFile)).digest("hex");
const headSha = process.env.TEST_ATTESTATION_HEAD_SHA || process.env.PR_HEAD_SHA || "";
const workflowPath = process.env.TEST_ATTESTATION_WORKFLOW || ".github/workflows/deploy.yml";
process.stdout.write(JSON.stringify([{
  verificationResult: {
    statement: {
      subject: [{ name: path.basename(evidenceFile), digest: { sha256 } }],
      predicateType: "https://slsa.dev/provenance/v1",
      predicate: {
        buildDefinition: {
          externalParameters: {
            workflow: {
              repository: "https://github.com/" + repository,
              path: workflowPath
            }
          },
          internalParameters: {
            github: { event_name: "workflow_dispatch" }
          },
          resolvedDependencies: [{
            uri: "git+https://github.com/" + repository + "@refs/heads/issue-3-llm-provider",
            digest: { gitCommit: headSha }
          }]
        },
        runDetails: {
          builder: {
            id: "https://github.com/NomaDamas/EBS-Gurapingala-teacher/.github/workflows/deploy.yml@refs/heads/issue-9-production-release"
          },
          metadata: {
            invocationId: "https://github.com/" + repository + "/actions/runs/123/attempts/1"
          }
        }
      }
    }
  }
}]));
`);
  await chmod(file, 0o755);
  return file;
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
    EVALUATION_SET_EVIDENCE_FILE: artifacts.evaluationSetEvidence,
    MODEL_EVALUATION_EVIDENCE_FILE: artifacts.modelEvaluationEvidence,
    VERIFY_DEPLOY_EVIDENCE_FILE: artifacts.deployEvidence,
    CLASSROOM_CONFIG_EVIDENCE_FILES: artifacts.classroomEvidenceFiles.join(","),
    EXPECTED_CLASSROOM_ROOMS: "2026-07-13-3-5,2026-07-16-3-1"
  };
}

async function writeGateArtifacts(overrides = {}) {
  const dir = await mkdtemp(join(tmpdir(), "external-review-gates-"));
  const ciEvidence = join(dir, "ci-evidence.json");
  const evaluationSetEvidence = join(dir, "evaluation-set-evidence.json");
  const modelEvaluationEvidence = join(dir, "model-evaluation-evidence.json");
  const deployEvidence = join(dir, "deploy-evidence.json");
  const classroomEvidence = join(dir, "classroom-config-1.json");
  const secondClassroomEvidence = join(dir, "classroom-config-2.json");
  await writeFile(ciEvidence, JSON.stringify(buildCiEvidence(overrides.ci)));
  await writeFile(evaluationSetEvidence, JSON.stringify(buildEvaluationSetEvidence(overrides.evaluationSet)));
  await writeFile(modelEvaluationEvidence, JSON.stringify(buildModelEvaluationEvidence(overrides.modelEvaluation)));
  await writeFile(deployEvidence, JSON.stringify(buildDeployEvidence(overrides.deploy)));
  await writeFile(classroomEvidence, JSON.stringify(buildClassroomEvidence("2026-07-13-3-5", overrides.classroom)));
  await writeFile(secondClassroomEvidence, JSON.stringify(buildClassroomEvidence("2026-07-16-3-1", { generatedAt: "2026-07-10T00:02:30.000Z", ...(overrides.classroomTwo || {}) })));
  return {
    ciEvidence,
    evaluationSetEvidence,
    modelEvaluationEvidence,
    deployEvidence,
    classroomEvidence,
    secondClassroomEvidence,
    classroomEvidenceFiles: [classroomEvidence, secondClassroomEvidence]
  };
}

function buildEvaluationSetEvidence(overrides = {}) {
  return {
    schemaVersion: "evaluation-set-evidence/v1",
    generatedAt: "2026-07-10T00:00:40.000Z",
    status: "pass",
    prHeadSha: "abc123",
    totalTurns: 50,
    teacherAuditIncluded: true,
    pressureTurnCount: 10,
    publicProjection: {
      items: Array.from({ length: 50 }, (_, index) => ({
        turn: index + 1,
        studentQuestion: `질문 ${index + 1}`,
        expectedLevel: (index % 4) + 1
      })),
      exposesTeacherAudit: false
    },
    byLevel: {
      1: { total: 13, passedPreflight: 13, turns: [] },
      2: { total: 13, passedPreflight: 13, turns: [] },
      3: { total: 12, passedPreflight: 12, turns: [] },
      4: { total: 12, passedPreflight: 12, turns: [] }
    },
    teacherReviewItems: Array.from({ length: 50 }, (_, index) => ({
      turn: index + 1,
      expectedLevel: (index % 4) + 1,
      studentQuestion: `질문 ${index + 1}`,
      correctAnswer: "정답",
      falseClaim: "거짓",
      whyFalse: "Level 근거",
      preflight: { approvedForStudent: true }
    })),
    ...overrides
  };
}

function buildModelEvaluationEvidence(overrides = {}) {
  const model = "gpt-5.5";
  const turns = EVALUATION_SET_50.map((item) => ({
    turn: item.turn,
    expectedLevel: item.expectedLevel,
    question: item.studentQuestion,
    shouldSendToStudent: true,
    provider: {
      name: "openai",
      model,
      responseId: `resp-generator-${item.turn}`,
      responseModel: model,
      verifier: {
        name: "openai",
        model,
        responseId: `resp-verifier-${item.turn}`,
        responseModel: model
      }
    },
    preflight: {
      approvedForStudent: true,
      verifierApproved: true,
      verdict: "PASS_LEVEL_CALIBRATED_FALSEHOOD"
    },
    judge: {
      provider: "openai",
      model,
      responseId: `resp-judge-${item.turn}`,
      responseModel: model,
      pass: true
    },
    studentVisibleAnswer: "진실 맥락과 섞인 미묘한 오류",
    correctAnswer: "교사용 정답",
    falseClaim: "검증된 거짓 주장",
    whyFalse: "교사용 거짓 근거",
    levelFitReason: `Level ${item.expectedLevel} 기준`
  }));
  return {
    schemaVersion: "model-evaluation-evidence/v1",
    startedAt: "2026-07-10T00:00:31.000Z",
    completedAt: "2026-07-10T00:00:38.000Z",
    generatedAt: "2026-07-10T00:00:39.000Z",
    status: "pass",
    prHeadSha: "abc123",
    requireOpenAIEvaluation: true,
    expectedGeneratorModel: model,
    expectedVerifierModel: model,
    expectedJudgeModel: model,
    totalTurnsPerModel: 50,
    pressureTurnCount: 10,
    evaluationSetSha256: createHash("sha256")
      .update(JSON.stringify(EVALUATION_SET_50))
      .digest("hex"),
    selectionCriteria: {
      minimums: {
        falsehoodRate: 1,
        levelFitRate: 1,
        truthLeakRate: 0,
        averageSubtletyScore: 0.6,
        teacherAuditQuality: 0.75
      }
    },
    recommendedModel: {
      model,
      eligible: true
    },
    models: [{
      model,
      total: 50,
      passed: 50,
      failed: 0,
      metrics: {
        falsehoodRate: 1,
        levelFitRate: 1,
        truthLeakRate: 0,
        averageSubtletyScore: 0.8,
        averageTeacherAuditQuality: 1
      },
      execution: {
        totalTurns: 50,
        openaiGeneratedTurns: 50,
        openaiVerifiedTurns: 50,
        openaiJudgedTurns: 50,
        fallbackTurns: 0,
        blockedTurns: 0
      },
      turns
    }],
    ...overrides
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
      openaiVerifierModel: "gpt-5.5",
      openaiTimeoutMs: 15000,
      teacherProtected: true
    },
    expectedOpenAIModel: "gpt-5.5",
    expectedOpenAIVerifierModel: "gpt-5.5",
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
    expectedResponseMode: "experiment",
    applyExpectedConfig: false,
    requireOpenAI: true,
    requireTeacherToken: true,
    expectedOpenAIModel: "gpt-5.5",
    expectedOpenAIVerifierModel: "gpt-5.5",
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
      openaiVerifierModel: "gpt-5.5",
      openaiTimeoutMs: 15000,
      teacherProtected: true
    },
    observedConfig: {
      level: 2,
      persona: "이순신 장군처럼 친절하게 설명한다.",
      responseMode: "experiment"
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
    verifier: {
      name: "openai",
      model: "gpt-5.5",
      approved: true
    },
    debriefRequired: true
  };
}
