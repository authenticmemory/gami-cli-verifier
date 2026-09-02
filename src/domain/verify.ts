import type { Gpr } from "./gpr";
import { gprLifecycle } from "./gpr";
import { authorizeDidKey } from "./did-document";
import { OUTPUT_VERSION, type CheckResult, type CommandResult } from "./result";
import { verifySignature } from "./signature";
import { verifyTimestamp } from "./timestamp";

export interface LocalVerifyOptions {
    publicKeyHex?: string;
    didDocument?: unknown;
    bitcoinEvidence?: unknown;
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

    const authorization = authorizeDidKey(
        options.didDocument,
        gpr.proof.key_id,
        gpr.proof.public_key_hex,
        options.publicKeyHex,
    );
    const verificationKey = options.publicKeyHex ?? authorization.publicKeyHex;
    const verificationKeySource = options.publicKeyHex
        ? "overridden"
        : authorization.publicKeyHex
          ? "did-evidence"
          : undefined;

    let signatureFailed = false;
    let signatureResult;
    if (!gpr.proof.signature) {
        signatureFailed = true;
        checks.push({ name: "signature_math", status: "failed", message: "GPR has no signature" });
    } else if (!verificationKey && !gpr.proof.public_key_hex) {
        checks.push({
            name: "signature_math",
            status: "indeterminate",
            message: "No embedded public key; provide --public-key or perform DID resolution",
        });
    } else {
        signatureResult = await verifySignature(gpr, verificationKey, verificationKeySource);
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
        status: options.didDocument === undefined ? "skipped" : authorization.status,
        message: authorization.message,
    });
    const timestampResult = verifyTimestamp(gpr, options.bitcoinEvidence);
    checks.push({
        name: "bitcoin_timestamp",
        status:
            timestampResult.status === "verified"
                ? "passed"
                : timestampResult.status === "failed"
                  ? "failed"
                  : timestampResult.status === "missing"
                    ? "skipped"
                    : "indeterminate",
        message: timestampResult.message,
    });

    const failed =
        !hashMatches ||
        signatureFailed ||
        authorization.status === "failed" ||
        timestampResult.status === "failed";
    const complete = authorization.status === "passed" && timestampResult.status === "verified";
    return {
        output_version: OUTPUT_VERSION,
        command: "verify",
        status: failed ? "failed" : complete ? "passed" : "indeterminate",
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
            did: authorization.did,
            did_key_id: authorization.keyId,
            did_evidence_source: authorization.evidenceSource,
            did_authorization: authorization.status,
            timestamp_document_hash: timestampResult.canonicalHash,
            timestamp_ots_leaf: timestampResult.otsLeaf,
            timestamp_state: timestampResult.status,
            bitcoin_height: timestampResult.bitcoinHeight,
            bitcoin_block_hash: timestampResult.bitcoinBlockHash,
            bitcoin_block_time: timestampResult.bitcoinBlockTime,
            bitcoin_checkpoint_height: timestampResult.checkpointHeight,
        },
    };
}
