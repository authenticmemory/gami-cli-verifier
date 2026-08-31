import type { Gpr } from "./gpr";
import { gprLifecycle } from "./gpr";
import { OUTPUT_VERSION, type CheckResult, type CommandResult } from "./result";
import { verifySignature } from "./signature";

export interface LocalVerifyOptions {
    publicKeyHex?: string;
}

export async function verifyLocal(
    documentHash: string,
    gpr: Gpr,
    options: LocalVerifyOptions = {},
): Promise<CommandResult> {
    const checks: CheckResult[] = [
        {
            name: "gpr_format",
            status: "passed",
            message: "GPR v1 structure and encodings are valid",
        },
    ];

    const hashMatches = documentHash === gpr.subject.file_hash;
    checks.push({
        name: "document_hash",
        status: hashMatches ? "passed" : "failed",
        message: hashMatches
            ? "Document SHA-256 matches subject.file_hash"
            : `Document SHA-256 does not match subject.file_hash`,
    });

    let signatureFailed = false;
    let signatureResult;
    if (!gpr.proof.signature) {
        signatureFailed = true;
        checks.push({ name: "signature_math", status: "failed", message: "GPR has no signature" });
    } else if (!options.publicKeyHex && !gpr.proof.public_key_hex) {
        checks.push({
            name: "signature_math",
            status: "indeterminate",
            message: "No embedded public key; provide --public-key or perform DID resolution",
        });
    } else {
        signatureResult = await verifySignature(gpr, options.publicKeyHex);
        signatureFailed = !signatureResult.valid;
        checks.push({
            name: "signature_math",
            status: signatureResult.valid ? "passed" : "failed",
            message: signatureResult.valid
                ? `${signatureResult.mode} signature is mathematically valid using the ${signatureResult.keySource} key`
                : (signatureResult.error ?? "Signature does not verify"),
        });
    }

    checks.push({
        name: "institutional_identity",
        status: "skipped",
        message: "DID authorization is outside Phase 2 and has not been checked",
    });
    checks.push({
        name: "bitcoin_timestamp",
        status: "skipped",
        message: gpr.proof.timestamp
            ? "Timestamp evidence is present but Bitcoin verification is outside Phase 2"
            : "No timestamp evidence is present",
    });

    const failed = !hashMatches || signatureFailed;
    return {
        output_version: OUTPUT_VERSION,
        command: "verify",
        status: failed ? "failed" : "indeterminate",
        gpr_id: gpr.id,
        lifecycle: gprLifecycle(gpr),
        checks,
        evidence: {
            document_hash: documentHash,
            recorded_hash: gpr.subject.file_hash,
            signature_mode: signatureResult?.mode,
            key_source: signatureResult?.keySource,
            signing_leaf: signatureResult?.leafHex,
            signing_merkle_root: signatureResult?.merkleRootHex,
            webauthn_user_present: signatureResult?.userPresent,
            webauthn_user_verified: signatureResult?.userVerified,
        },
    };
}
