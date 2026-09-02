import { canonicalize } from "json-canonicalize";
import type { Gpr } from "./gpr";

/**
 * Rebuild the deployed v1 signing object exactly. Batch fields are intentionally
 * absent: they are bound by the WebAuthn challenge and Merkle inclusion path.
 */
export function signingObject(gpr: Gpr): Record<string, unknown> {
    const subject: Record<string, unknown> = { file_hash: gpr.subject.file_hash };
    if (gpr.subject.filename) subject.filename = gpr.subject.filename;
    if (gpr.subject.metadata && Object.keys(gpr.subject.metadata).length > 0) {
        subject.metadata = gpr.subject.metadata;
    }

    const proof: Record<string, unknown> = {
        created: gpr.proof.created,
        key_id: gpr.proof.key_id,
    };
    if (gpr.proof.public_key_hex) proof.public_key_hex = gpr.proof.public_key_hex;

    return {
        "@context": gpr["@context"],
        type: gpr.type,
        schema: gpr.schema,
        id: gpr.id,
        subject,
        proof,
        parent: gpr.parent,
    };
}

export function canonicalForSigning(gpr: Gpr): string {
    return canonicalize(signingObject(gpr));
}

/** Rebuild the deployed v1 timestamp payload: the signed GPR without proof.timestamp. */
export function timestampObject(gpr: Gpr): Record<string, unknown> {
    const subject: Record<string, unknown> = { file_hash: gpr.subject.file_hash };
    if (gpr.subject.filename) subject.filename = gpr.subject.filename;
    if (gpr.subject.metadata && Object.keys(gpr.subject.metadata).length > 0)
        subject.metadata = gpr.subject.metadata;

    const proof: Record<string, unknown> = {
        created: gpr.proof.created,
        key_id: gpr.proof.key_id,
    };
    if (gpr.proof.public_key_hex) proof.public_key_hex = gpr.proof.public_key_hex;
    if (gpr.proof.signature) proof.signature = gpr.proof.signature;
    if (gpr.proof.authenticator_data) proof.authenticator_data = gpr.proof.authenticator_data;
    if (gpr.proof.client_data_json) proof.client_data_json = gpr.proof.client_data_json;
    if (gpr.proof.batch_id) proof.batch_id = gpr.proof.batch_id;
    if (gpr.proof.merkle_root) proof.merkle_root = gpr.proof.merkle_root;
    if (gpr.proof.merkle_path && gpr.proof.merkle_path.length > 0)
        proof.merkle_path = gpr.proof.merkle_path;

    return {
        "@context": gpr["@context"],
        type: gpr.type,
        schema: gpr.schema,
        id: gpr.id,
        subject,
        proof,
        parent: gpr.parent,
    };
}

export function canonicalForTimestamp(gpr: Gpr): string {
    return canonicalize(timestampObject(gpr));
}
