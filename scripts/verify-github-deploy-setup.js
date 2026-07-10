import { spawnSync } from "node:child_process";

const requiredSecrets = [
  "CLOUDFLARE_ACCOUNT_ID",
  "CLOUDFLARE_API_TOKEN",
  "OPENAI_API_KEY",
  "TEACHER_TOKEN"
];
const requiredVariables = [
  "WORKER_HEALTH_URL",
  "EXPECTED_OPENAI_MODEL",
  "EXPECTED_OPENAI_VERIFIER_MODEL",
  "EXPECTED_OPENAI_TIMEOUT_MS"
];

const secrets = readNameSet({
  envName: "GITHUB_SECRET_NAMES",
  command: ["gh", "secret", "list"],
  label: "GitHub secrets"
});
const variables = readNameSet({
  envName: "GITHUB_VARIABLE_NAMES",
  command: ["gh", "variable", "list"],
  label: "GitHub Actions variables"
});

const missingSecrets = requiredSecrets.filter((name) => !secrets.names.has(name));
const missingVariables = requiredVariables.filter((name) => !variables.names.has(name));
const failures = [];

if (secrets.error) failures.push(secrets.error);
if (variables.error) failures.push(variables.error);
for (const name of missingSecrets) failures.push(`missing GitHub secret ${name}`);
for (const name of missingVariables) failures.push(`missing GitHub variable ${name}`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error("Required setup commands:");
  for (const name of missingSecrets) console.error(`  gh secret set ${name}`);
  for (const name of missingVariables) {
    const suffix = name === "WORKER_HEALTH_URL"
      ? " --body https://<worker-domain>"
      : name === "EXPECTED_OPENAI_MODEL" || name === "EXPECTED_OPENAI_VERIFIER_MODEL"
        ? " --body gpt-5.6-terra"
        : " --body 15000";
    console.error(`  gh variable set ${name}${suffix}`);
  }
  console.error(`github deploy setup verification failed: ${failures.length} issue(s)`);
  process.exit(1);
}

console.log("github deploy setup verified");
console.log(`requiredSecrets=${requiredSecrets.join(",")}`);
console.log(`requiredVariables=${requiredVariables.join(",")}`);
console.log("secretValuesPrinted=false");

function readNameSet({ envName, command, label }) {
  const fromEnv = process.env[envName];
  if (fromEnv !== undefined) {
    return {
      names: parseNameList(fromEnv),
      error: ""
    };
  }
  const result = spawnSync(command[0], command.slice(1), {
    encoding: "utf8",
    env: {
      ...process.env,
      GH_PROMPT_DISABLED: "1"
    }
  });
  if (result.error) {
    return {
      names: new Set(),
      error: `${label} could not be listed: ${result.error.message}`
    };
  }
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim().split("\n")[0] || `exit ${result.status}`;
    return {
      names: new Set(),
      error: `${label} could not be listed: ${detail}`
    };
  }
  return {
    names: parseGhListOutput(result.stdout),
    error: ""
  };
}

function parseNameList(value) {
  return new Set(String(value || "").split(/[\s,]+/).map((name) => name.trim()).filter(Boolean));
}

function parseGhListOutput(value) {
  const names = [];
  for (const line of String(value || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || /^name\s+/i.test(trimmed)) continue;
    const [name] = trimmed.split(/\s+/);
    if (name && /^[A-Z0-9_]+$/.test(name)) names.push(name);
  }
  return new Set(names);
}
