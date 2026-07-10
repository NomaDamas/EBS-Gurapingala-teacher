import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const TRUSTED_MODEL_EVALUATION_REPOSITORY = "NomaDamas/EBS-Gurapingala-teacher";
export const TRUSTED_MODEL_EVALUATION_WORKFLOW = ".github/workflows/deploy.yml";
const SLSA_PROVENANCE_V1 = "https://slsa.dev/provenance/v1";

export function verifyModelEvaluationAttestation({
  evidenceFile,
  expectedHeadSha
}) {
  const failures = [];
  if (!evidenceFile) failures.push("MODEL_EVALUATION_EVIDENCE_FILE is required for attestation verification");
  if (!expectedHeadSha) failures.push("PR_HEAD_SHA is required for attestation verification");
  if (failures.length) return { ok: false, failures };

  let evidenceBytes;
  try {
    evidenceBytes = readFileSync(evidenceFile);
  } catch (error) {
    return {
      ok: false,
      failures: [`cannot read MODEL_EVALUATION_EVIDENCE_FILE for attestation verification: ${error.message}`]
    };
  }
  const sha256 = createHash("sha256").update(evidenceBytes).digest("hex");
  const result = spawnSync("gh", [
    "attestation",
    "verify",
    evidenceFile,
    "--repo",
    TRUSTED_MODEL_EVALUATION_REPOSITORY,
    "--format",
    "json"
  ], {
    encoding: "utf8",
    env: process.env
  });

  if (result.error) {
    return {
      ok: false,
      failures: [`GitHub attestation verification could not start: ${result.error.message}`]
    };
  }
  if (result.status !== 0) {
    const detail = clean(result.stderr || result.stdout);
    return {
      ok: false,
      failures: [
        "GitHub attestation verification failed; use a current gh CLI and an evidence artifact downloaded from the trusted Deploy workflow",
        ...(detail ? [detail] : [])
      ]
    };
  }

  let records;
  try {
    records = JSON.parse(result.stdout);
  } catch {
    return {
      ok: false,
      failures: ["GitHub attestation verification did not return JSON"]
    };
  }

  const candidates = Array.isArray(records) ? records : [records];
  for (const candidate of candidates) {
    const statement = candidate?.verificationResult?.statement || candidate?.statement;
    const details = validateStatement({
      statement,
      sha256,
      expectedHeadSha
    });
    if (details) {
      return {
        ok: true,
        schemaVersion: "model-evaluation-attestation/v1",
        repository: TRUSTED_MODEL_EVALUATION_REPOSITORY,
        workflowPath: TRUSTED_MODEL_EVALUATION_WORKFLOW,
        prHeadSha: expectedHeadSha,
        evidenceSha256: sha256,
        predicateType: details.predicateType,
        invocationId: details.invocationId
      };
    }
  }

  return {
    ok: false,
    failures: [
      "GitHub attestation must bind the current model evidence SHA-256 to the trusted Deploy workflow and PR_HEAD_SHA"
    ]
  };
}

function validateStatement({ statement, sha256, expectedHeadSha }) {
  if (!statement || statement.predicateType !== SLSA_PROVENANCE_V1) return null;
  const hasSubject = Array.isArray(statement.subject) &&
    statement.subject.some((subject) => clean(subject?.digest?.sha256).toLowerCase() === sha256);
  if (!hasSubject) return null;

  const predicate = statement.predicate || {};
  const buildDefinition = predicate.buildDefinition || {};
  const workflow = buildDefinition.externalParameters?.workflow || {};
  const normalizedWorkflowPath = clean(workflow.path).replace(/^\/+/, "");
  if (clean(workflow.repository) !== `https://github.com/${TRUSTED_MODEL_EVALUATION_REPOSITORY}` ||
    normalizedWorkflowPath !== TRUSTED_MODEL_EVALUATION_WORKFLOW) {
    return null;
  }
  if (buildDefinition.internalParameters?.github?.event_name !== "workflow_dispatch") return null;
  const sourceMatch = Array.isArray(buildDefinition.resolvedDependencies) &&
    buildDefinition.resolvedDependencies.some((dependency) =>
      clean(dependency?.uri).startsWith(`git+https://github.com/${TRUSTED_MODEL_EVALUATION_REPOSITORY}@`) &&
      clean(dependency?.digest?.gitCommit) === expectedHeadSha
    );
  if (!sourceMatch) return null;

  const builderId = clean(predicate.runDetails?.builder?.id);
  const invocationId = clean(predicate.runDetails?.metadata?.invocationId);
  if (builderId !== "https://github.com/actions/runner/github-hosted") return null;
  if (!invocationId.startsWith(`https://github.com/${TRUSTED_MODEL_EVALUATION_REPOSITORY}/actions/runs/`)) return null;

  return {
    predicateType: statement.predicateType,
    invocationId
  };
}

function clean(value) {
  return String(value || "").trim();
}
