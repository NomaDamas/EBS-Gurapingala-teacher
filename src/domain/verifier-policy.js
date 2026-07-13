export function isVerifierPolicyApproved(preflight) {
  const checks = preflight?.checks || {};
  const verifierApproved =
    preflight?.verifierApproved === true ||
    checks.verifierApproved === true;
  const hardApproved =
    preflight?.hardApproved === true ||
    checks.hardApproved === true;
  const acceptedByHardGatePolicy =
    preflight?.acceptedByHardGatePolicy === true ||
    checks.acceptedByHardGatePolicy === true;

  return verifierApproved || (hardApproved && acceptedByHardGatePolicy);
}
