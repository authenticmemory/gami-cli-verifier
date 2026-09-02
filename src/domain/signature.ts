import { createPublicKey, verify as verifyWithNode } from "node:crypto";
import { canonicalForSigning } from "./canonical";
import type { Gpr } from "./gpr";
import { bytesToHex, equalBytes, hexToBytes, sha256Bytes } from "./hash";
import { foldMerklePath } from "./merkle";

export type SignatureMode = "raw-ed25519" | "webauthn-ed25519";
export type KeySource = "embedded" | "overridden" | "did-evidence";

export interface SignatureVerification {
    valid: boolean;
    mode: SignatureMode;
    keySource: KeySource;
    canonical: string;
    leafHex: string;
    merkleRootHex: string;
    userPresent?: boolean;
    userVerified?: boolean;
    error?: string;
}

function base64ToBytes(value: string): Uint8Array {
    return new Uint8Array(Buffer.from(value, "base64"));
}

function base64UrlToBytes(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
        throw new Error("invalid base64url");
    const base64 = value
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return base64ToBytes(base64);
}

async function verifyEd25519(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
): Promise<boolean> {
    try {
        // RFC 8410 SubjectPublicKeyInfo prefix for a raw 32-byte Ed25519 key.
        const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
        const key = createPublicKey({
            key: Buffer.concat([spkiPrefix, Buffer.from(publicKey)]),
            format: "der",
            type: "spki",
        });
        return verifyWithNode(null, Buffer.from(message), key, Buffer.from(signature));
    } catch {
        return false;
    }
}

function signedBytes(authenticatorData: Uint8Array, clientDataJson: Uint8Array): Uint8Array {
    const output = new Uint8Array(authenticatorData.length + 32);
    output.set(authenticatorData);
    output.set(sha256Bytes(clientDataJson), authenticatorData.length);
    return output;
}

export async function verifySignature(
    gpr: Gpr,
    publicKeyOverride?: string,
    overrideSource: Exclude<KeySource, "embedded"> = "overridden",
): Promise<SignatureVerification> {
    const canonical = canonicalForSigning(gpr);
    const leaf = sha256Bytes(new TextEncoder().encode(canonical));
    const root = foldMerklePath(leaf, gpr.proof.merkle_path ?? []);
    const common = {
        canonical,
        leafHex: bytesToHex(leaf),
        merkleRootHex: bytesToHex(root),
        keySource: publicKeyOverride ? overrideSource : ("embedded" as const),
    };

    const signatureHex = gpr.proof.signature?.replace(/^ed25519:/, "");
    if (!signatureHex)
        return { ...common, mode: "raw-ed25519", valid: false, error: "record has no signature" };
    const publicKeyHex = publicKeyOverride?.toLowerCase() ?? gpr.proof.public_key_hex;
    if (!publicKeyHex)
        return {
            ...common,
            mode: "raw-ed25519",
            valid: false,
            error: "no embedded or overridden public key",
        };

    const signature = hexToBytes(signatureHex);
    const publicKey = hexToBytes(publicKeyHex);
    const hasWebAuthn = Boolean(gpr.proof.authenticator_data && gpr.proof.client_data_json);
    if (!hasWebAuthn) {
        const valid = await verifyEd25519(signature, leaf, publicKey);
        return {
            ...common,
            mode: "raw-ed25519",
            valid,
            error: valid ? undefined : "Ed25519 signature does not verify",
        };
    }

    const authenticatorData = base64ToBytes(gpr.proof.authenticator_data!);
    const clientDataJson = base64ToBytes(gpr.proof.client_data_json!);
    if (authenticatorData.length < 37) {
        return {
            ...common,
            mode: "webauthn-ed25519",
            valid: false,
            error: "WebAuthn authenticator data is shorter than 37 bytes",
        };
    }

    let clientData: { type?: unknown; challenge?: unknown };
    try {
        clientData = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(clientDataJson),
        ) as {
            type?: unknown;
            challenge?: unknown;
        };
    } catch {
        return {
            ...common,
            mode: "webauthn-ed25519",
            valid: false,
            error: "WebAuthn client data is not valid UTF-8 JSON",
        };
    }
    if (clientData.type !== "webauthn.get" || typeof clientData.challenge !== "string") {
        return {
            ...common,
            mode: "webauthn-ed25519",
            valid: false,
            error: "WebAuthn client data has an invalid type or challenge",
        };
    }
    let challenge: Uint8Array;
    try {
        challenge = base64UrlToBytes(clientData.challenge);
    } catch {
        return {
            ...common,
            mode: "webauthn-ed25519",
            valid: false,
            error: "WebAuthn challenge is not valid base64url",
        };
    }
    if (!equalBytes(challenge, root)) {
        return {
            ...common,
            mode: "webauthn-ed25519",
            valid: false,
            error: "WebAuthn challenge does not match the reconstructed Merkle root",
        };
    }
    if (gpr.proof.merkle_root && gpr.proof.merkle_root !== bytesToHex(root)) {
        return {
            ...common,
            mode: "webauthn-ed25519",
            valid: false,
            error: "stored Merkle root does not match the reconstructed root",
        };
    }

    const flags = authenticatorData[32]!;
    const valid = await verifyEd25519(
        signature,
        signedBytes(authenticatorData, clientDataJson),
        publicKey,
    );
    return {
        ...common,
        mode: "webauthn-ed25519",
        valid,
        userPresent: Boolean(flags & 0x01),
        userVerified: Boolean(flags & 0x04),
        error: valid ? undefined : "WebAuthn Ed25519 signature does not verify",
    };
}
