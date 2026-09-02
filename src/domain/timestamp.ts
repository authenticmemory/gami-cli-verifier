import {
    StreamDeserializationContext,
    Timestamp,
    verifyBitcoinAttestation,
    type BitcoinAttestation,
} from "@otskit/core";
import { validateBitcoinEvidence } from "./bitcoin";
import { canonicalForTimestamp } from "./canonical";
import type { Gpr } from "./gpr";
import { bytesToHex, hexToBytes, sha256Bytes } from "./hash";
import { foldMerklePath } from "./merkle";

export interface TimestampVerification {
    status: "missing" | "pending" | "attested" | "verified" | "failed";
    message: string;
    canonicalHash?: string;
    otsLeaf?: string;
    bitcoinHeight?: number;
    bitcoinBlockHash?: string;
    bitcoinBlockTime?: number;
    checkpointHeight?: number;
    pendingCalendars?: string[];
}

const MAX_OTS_BYTES = 1024 * 1024;

export function verifyTimestamp(gpr: Gpr, bitcoinEvidence?: unknown): TimestampVerification {
    const timestamp = gpr.proof.timestamp;
    if (!timestamp) return { status: "missing", message: "GPR has no timestamp evidence" };

    const canonical = canonicalForTimestamp(gpr);
    const canonicalHash = `sha256:${bytesToHex(sha256Bytes(new TextEncoder().encode(canonical)))}`;
    if (canonicalHash !== timestamp.document_hash) {
        return {
            status: "failed",
            message: "Timestamp document_hash does not match the canonical signed GPR",
            canonicalHash,
        };
    }

    const documentLeaf = hexToBytes(timestamp.document_hash.slice("sha256:".length));
    const folded = foldMerklePath(documentLeaf, timestamp.merkle_path ?? []);
    const foldedHex = bytesToHex(folded);
    if (timestamp.merkle_root && timestamp.merkle_root !== foldedHex) {
        return {
            status: "failed",
            message: "Timestamp Merkle path does not reconstruct timestamp.merkle_root",
            canonicalHash,
            otsLeaf: foldedHex,
        };
    }
    if ((timestamp.merkle_path?.length ?? 0) > 0 && !timestamp.merkle_root) {
        return {
            status: "failed",
            message: "Timestamp batch path is present without timestamp.merkle_root",
            canonicalHash,
            otsLeaf: foldedHex,
        };
    }
    const otsLeaf = timestamp.merkle_root ?? foldedHex;
    if (!timestamp.ots_data) {
        return {
            status: timestamp.upgraded ? "failed" : "pending",
            message: timestamp.upgraded
                ? "Timestamp is marked upgraded but contains no ots_data"
                : "Timestamp has no calendar proof yet",
            canonicalHash,
            otsLeaf,
        };
    }

    let tree: Timestamp;
    try {
        const raw = new Uint8Array(Buffer.from(timestamp.ots_data, "base64"));
        if (raw.length === 0 || raw.length > MAX_OTS_BYTES)
            throw new Error("raw OTS proof exceeds its size bounds");
        const context = new StreamDeserializationContext(raw);
        tree = Timestamp.deserialize(context, hexToBytes(otsLeaf));
        context.assertEof();
    } catch (error) {
        return {
            status: "failed",
            message: `Raw OTS proof is invalid: ${error instanceof Error ? error.message : String(error)}`,
            canonicalHash,
            otsLeaf,
        };
    }

    const attestations = tree.allAttestations();
    const bitcoin = attestations.filter(
        (item): item is { msg: Uint8Array; attestation: BitcoinAttestation } =>
            item.attestation.kind === "bitcoin",
    );
    const pendingCalendars = [
        ...new Set(
            attestations
                .filter((item) => item.attestation.kind === "pending")
                .map((item) => (item.attestation.kind === "pending" ? item.attestation.uri : "")),
        ),
    ].filter(Boolean);

    if (bitcoin.length === 0) {
        return {
            status: timestamp.upgraded ? "failed" : "pending",
            message: timestamp.upgraded
                ? "Timestamp is marked upgraded but has no Bitcoin attestation"
                : "OTS calendar proof is valid but Bitcoin confirmation is pending",
            canonicalHash,
            otsLeaf,
            pendingCalendars,
        };
    }
    const selected = bitcoin.reduce((lowest, item) =>
        item.attestation.height < lowest.attestation.height ? item : lowest,
    );
    if (!timestamp.upgraded) {
        return {
            status: "failed",
            message: "Timestamp contains a Bitcoin attestation but upgraded is false",
            canonicalHash,
            otsLeaf,
            bitcoinHeight: selected.attestation.height,
        };
    }
    if (bitcoinEvidence === undefined) {
        return {
            status: "attested",
            message: `OTS proof contains a Bitcoin attestation at height ${selected.attestation.height}, but no offline chain evidence was supplied`,
            canonicalHash,
            otsLeaf,
            bitcoinHeight: selected.attestation.height,
        };
    }

    try {
        const evidence = validateBitcoinEvidence(bitcoinEvidence, selected.attestation.height);
        const blockTime = verifyBitcoinAttestation(
            selected.msg,
            selected.attestation,
            evidence.firstHeader,
            evidence.firstHeight,
        );
        return {
            status: "verified",
            message: `OTS commitment is verified in Bitcoin block ${selected.attestation.height} and connected to a package-pinned mainnet checkpoint`,
            canonicalHash,
            otsLeaf,
            bitcoinHeight: selected.attestation.height,
            bitcoinBlockHash: evidence.firstHash,
            bitcoinBlockTime: blockTime,
            checkpointHeight: evidence.checkpointHeight,
        };
    } catch (error) {
        return {
            status: "failed",
            message: `Bitcoin evidence is invalid: ${error instanceof Error ? error.message : String(error)}`,
            canonicalHash,
            otsLeaf,
            bitcoinHeight: selected.attestation.height,
        };
    }
}
