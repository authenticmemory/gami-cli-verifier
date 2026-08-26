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
    for (const check of result.checks) {
        lines.push(`${marker(check)} ${check.name}: ${check.message}`);
        for (const detail of check.details ?? []) lines.push(`  ${detail.path}: ${detail.message}`);
    }
    lines.push("", "Structural inspection does not prove cryptographic authenticity.");
    return lines.join("\n");
}
