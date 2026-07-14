import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveOpenAIResponsesUrl } from "../src/domain/openai-endpoint.js";
import { probeVerifierAvailability } from "../src/domain/verifier-availability.js";

const outputPath = process.env.VERIFIER_PROBE_OUTPUT || "artifacts/verifier-availability-probe.json";
const timeoutMs = normalizeTimeout(process.env.VERIFIER_PROBE_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS);
const evidence = await probeVerifierAvailability({
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.VERIFIER_PROBE_MODEL || process.env.OPENAI_VERIFIER_MODEL,
  timeoutMs,
  responsesUrl: resolveOpenAIResponsesUrl(process.env)
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(
  `verifier probe ${evidence.status}: requested=${evidence.requestedModel || "missing"} ` +
  `observed=${evidence.observedModel || "none"} status=${evidence.httpStatus ?? "none"} ` +
  `latencyMs=${evidence.latencyMs}`
);
console.log(`wrote ${outputPath}`);

if (evidence.status !== "pass") {
  console.error(
    `FAIL ${evidence.error?.type || "unknown"} ` +
    `${evidence.error?.code || "unknown"}: ${evidence.error?.message || "Verifier probe failed."}`
  );
  process.exitCode = 1;
}

function normalizeTimeout(value) {
  const parsed = Number(value || 15000);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}
