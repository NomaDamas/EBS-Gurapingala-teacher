import test from "node:test";
import assert from "node:assert/strict";
import { isVerifierPolicyApproved } from "../src/domain/verifier-policy.js";

test("verifier policy accepts full verifier approval", () => {
  assert.equal(isVerifierPolicyApproved({
    checks: { verifierApproved: true }
  }), true);
});

test("verifier policy accepts a hard-approved quality warning", () => {
  assert.equal(isVerifierPolicyApproved({
    hardApproved: true,
    checks: {
      verifierApproved: false,
      acceptedByHardGatePolicy: true
    }
  }), true);
});

test("verifier policy rejects incomplete hard-gate evidence", () => {
  assert.equal(isVerifierPolicyApproved({
    hardApproved: true,
    checks: {
      verifierApproved: false,
      acceptedByHardGatePolicy: false
    }
  }), false);
  assert.equal(isVerifierPolicyApproved({
    hardApproved: false,
    checks: {
      acceptedByHardGatePolicy: true
    }
  }), false);
});
