export const OUTPUT_VERSION = "1" as const;
export type CheckStatus = "passed" | "failed" | "indeterminate" | "skipped";
export type CommandStatus = Exclude<CheckStatus, "skipped">;
export interface CheckResult {
    name: string;
    status: CheckStatus;
    message: string;
    details?: Array<{ path: string; message: string }>;
}
export interface CommandResult {
    output_version: typeof OUTPUT_VERSION;
    command: "inspect" | "verify";
    status: CommandStatus;
    checks: CheckResult[];
    gpr_id?: string;
}
export const ExitCode = { Success: 0, Failed: 1, Indeterminate: 2, Usage: 3, Internal: 4 } as const;
export function exitCodeFor(result: CommandResult): number {
    return result.status === "passed"
        ? ExitCode.Success
        : result.status === "failed"
          ? ExitCode.Failed
          : ExitCode.Indeterminate;
}
