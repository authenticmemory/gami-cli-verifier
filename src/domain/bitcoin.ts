import { createHash } from "node:crypto";
import { hexToBytes } from "./hash";

export interface BitcoinEvidenceHeader {
    height: number;
    header: string;
}

export interface BitcoinEvidence {
    version: 1;
    network: "bitcoin-mainnet";
    checkpoint: { height: number; hash: string };
    headers: BitcoinEvidenceHeader[];
}

export interface ValidatedBitcoinEvidence {
    firstHeader: Uint8Array;
    firstHeight: number;
    firstHash: string;
    blockTime: number;
    checkpointHeight: number;
    checkpointHash: string;
}

// Checkpoints are release trust material, independently obtained from Bitcoin mainnet.
export const PINNED_MAINNET_CHECKPOINTS: Readonly<Record<number, string>> = {
    965005: "0000000000000000000176c1e042b4f8712d984f559e4db6ddb9b46a538611a0",
};

function object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function doubleSha256(bytes: Uint8Array): Uint8Array {
    const once = createHash("sha256").update(bytes).digest();
    return new Uint8Array(createHash("sha256").update(once).digest());
}

function reverseHex(bytes: Uint8Array): string {
    let output = "";
    for (let index = bytes.length - 1; index >= 0; index -= 1)
        output += bytes[index]!.toString(16).padStart(2, "0");
    return output;
}

function headerHash(header: Uint8Array): string {
    return reverseHex(doubleSha256(header));
}

function targetFromBits(bits: number): bigint {
    const exponent = bits >>> 24;
    const coefficient = bits & 0x007fffff;
    if ((bits & 0x00800000) !== 0 || coefficient === 0 || exponent < 3 || exponent > 32)
        throw new Error("Bitcoin header has invalid compact difficulty bits");
    return BigInt(coefficient) << (8n * BigInt(exponent - 3));
}

function hashAsInteger(hash: Uint8Array): bigint {
    return BigInt(`0x${reverseHex(hash)}`);
}

function validateProofOfWork(header: Uint8Array): void {
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const bits = view.getUint32(72, true);
    if (hashAsInteger(doubleSha256(header)) > targetFromBits(bits))
        throw new Error("Bitcoin header does not satisfy its proof-of-work target");
}

function parseEvidence(value: unknown): BitcoinEvidence {
    if (!object(value) || value.version !== 1 || value.network !== "bitcoin-mainnet")
        throw new Error("Bitcoin evidence must use version 1 and bitcoin-mainnet");
    if (!object(value.checkpoint)) throw new Error("Bitcoin evidence checkpoint is missing");
    const height = value.checkpoint.height;
    const hash = value.checkpoint.hash;
    if (
        !Number.isSafeInteger(height) ||
        Number(height) < 0 ||
        typeof hash !== "string" ||
        !/^[0-9a-f]{64}$/.test(hash)
    )
        throw new Error("Bitcoin evidence checkpoint is invalid");
    if (
        !Array.isArray(value.headers) ||
        value.headers.length === 0 ||
        value.headers.length > 100_000
    )
        throw new Error("Bitcoin evidence must contain 1 to 100000 headers");
    const headers = value.headers.map((item, index) => {
        if (
            !object(item) ||
            !Number.isSafeInteger(item.height) ||
            typeof item.header !== "string" ||
            !/^[0-9a-f]{160}$/.test(item.header)
        )
            throw new Error(`Bitcoin evidence header ${index} is invalid`);
        return { height: Number(item.height), header: item.header };
    });
    return {
        version: 1,
        network: "bitcoin-mainnet",
        checkpoint: { height: Number(height), hash },
        headers,
    };
}

export function validateBitcoinEvidence(
    value: unknown,
    expectedHeight: number,
): ValidatedBitcoinEvidence {
    const evidence = parseEvidence(value);
    const pinned = PINNED_MAINNET_CHECKPOINTS[evidence.checkpoint.height];
    if (!pinned || pinned !== evidence.checkpoint.hash)
        throw new Error(
            "Bitcoin evidence does not terminate at a package-pinned mainnet checkpoint",
        );
    if (evidence.headers[0]!.height !== expectedHeight)
        throw new Error(
            `Bitcoin evidence starts at height ${evidence.headers[0]!.height}, expected ${expectedHeight}`,
        );
    if (evidence.headers.at(-1)!.height !== evidence.checkpoint.height)
        throw new Error("Bitcoin evidence does not end at its checkpoint height");

    let previousHash: string | undefined;
    let firstHeader: Uint8Array | undefined;
    let firstHash = "";
    let blockTime = 0;
    for (let index = 0; index < evidence.headers.length; index += 1) {
        const item = evidence.headers[index]!;
        if (item.height !== expectedHeight + index)
            throw new Error("Bitcoin evidence headers are not contiguous by height");
        const header = hexToBytes(item.header);
        validateProofOfWork(header);
        const hash = headerHash(header);
        if (previousHash) {
            const linkedPrevious = reverseHex(header.slice(4, 36));
            if (linkedPrevious !== previousHash)
                throw new Error(
                    `Bitcoin header at height ${item.height} does not link to its predecessor`,
                );
        }
        if (index === 0) {
            firstHeader = header;
            firstHash = hash;
            blockTime = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(
                68,
                true,
            );
        }
        previousHash = hash;
    }
    if (previousHash !== evidence.checkpoint.hash)
        throw new Error("Bitcoin evidence checkpoint header hash does not match the pinned hash");
    if (!firstHeader) throw new Error("Bitcoin evidence contains no headers");
    return {
        firstHeader,
        firstHeight: expectedHeight,
        firstHash,
        blockTime,
        checkpointHeight: evidence.checkpoint.height,
        checkpointHash: evidence.checkpoint.hash,
    };
}
