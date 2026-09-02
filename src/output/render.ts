import type { CheckResult, CommandResult } from "../domain/result";

import { theme } from "../theme";

function marker(check: CheckResult): string {
    return check.status === "passed"
        ? theme.ok("PASS")
        : check.status === "failed"
          ? theme.err("FAIL")
          : check.status === "indeterminate"
            ? theme.warn("UNKNOWN")
            : "SKIP";
}

export function renderHuman(result: CommandResult): string {
    const lines = [theme.heading(`GAMI ${result.command}`)];
    if (result.lifecycle) lines.push(`Lifecycle: ${result.lifecycle}`);
    for (const check of result.checks) {
        lines.push(`${marker(check)} ${check.name}: ${check.message}`);
        for (const detail of check.details ?? []) lines.push(`  ${detail.path}: ${detail.message}`);
    }
    const identity = result.checks.find((check) => check.name === "institutional_identity");
    const timestamp = result.checks.find((check) => check.name === "bitcoin_timestamp");
    lines.push(
        "",
        result.command === "verify"
            ? identity?.status === "passed" && timestamp?.status === "passed"
                ? "File integrity, signature, supplied current DID authorization, and Bitcoin anchoring verified."
                : identity?.status === "passed"
                  ? "Local cryptography and supplied current DID authorization checked. Bitcoin anchoring is not yet verified."
                  : timestamp?.status === "passed"
                    ? "Local cryptography and Bitcoin anchoring checked. Institutional DID authorization is not verified."
                    : "Local cryptography checked. Institutional DID authorization and Bitcoin anchoring are not yet fully verified."
            : "Structural inspection does not prove cryptographic authenticity.",
    );
    return lines.join("\n");
}
