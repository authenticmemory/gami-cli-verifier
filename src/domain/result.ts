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
    lifecycle?: "unsigned" | "signed" | "stamped" | "upgraded";
    path?: string;
    evidence?: {
        document_hash?: string;
        recorded_hash?: string;
        signature_mode?: "raw-ed25519" | "webauthn-ed25519";
        key_source?: "embedded" | "overridden" | "did-evidence";
        signing_leaf?: string;
        signing_merkle_root?: string;
        webauthn_user_present?: boolean;
        webauthn_user_verified?: boolean;
        did?: string;
        did_key_id?: string;
        did_evidence_source?: "none" | "provided-current" | "resolved-current";
        did_authorization?: "passed" | "failed" | "indeterminate";
        timestamp_document_hash?: string;
        timestamp_ots_leaf?: string;
        timestamp_state?: "missing" | "pending" | "attested" | "verified" | "failed";
        bitcoin_height?: number;
        bitcoin_block_hash?: string;
        bitcoin_block_time?: number;
        bitcoin_source?: string;
    };
}

export const ExitCode = { Success: 0, Failed: 1, Indeterminate: 2, Usage: 3, Internal: 4 } as const;

export function exitCodeFor(result: CommandResult): number {
    return result.status === "passed"
        ? ExitCode.Success
        : result.status === "failed"
          ? ExitCode.Failed
          : ExitCode.Indeterminate;
}
