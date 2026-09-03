import { createHash } from "node:crypto";
import { hexToBytes } from "./hash";

export interface BitcoinBlockEvidence {
    height: number;
    header: Uint8Array;
    blockHash: string;
    blockTime: number;
    source: string;
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

function targetFromBits(bits: number): bigint {
    const exponent = bits >>> 24;
    const coefficient = bits & 0x007fffff;
    if ((bits & 0x00800000) !== 0 || coefficient === 0 || exponent < 3 || exponent > 32)
        throw new Error("Bitcoin header has invalid compact difficulty bits");
    return BigInt(coefficient) << (8n * BigInt(exponent - 3));
}

export function validateBitcoinHeader(
    height: number,
    headerHex: string,
    source: string,
    expectedHash?: string,
): BitcoinBlockEvidence {
    if (!Number.isSafeInteger(height) || height < 0) throw new Error("Bitcoin height is invalid");
    if (!/^[0-9a-f]{160}$/i.test(headerHex))
        throw new Error("Bitcoin header must be exactly 80 bytes of hexadecimal data");
    const header = hexToBytes(headerHex.toLowerCase());
    const digest = doubleSha256(header);
    const blockHash = reverseHex(digest);
    if (expectedHash && blockHash !== expectedHash.toLowerCase())
        throw new Error(
            "Bitcoin header hash does not match the canonical hash returned for its height",
        );
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    if (BigInt(`0x${reverseHex(digest)}`) > targetFromBits(view.getUint32(72, true)))
        throw new Error("Bitcoin header does not satisfy its proof-of-work target");
    return { height, header, blockHash, blockTime: view.getUint32(68, true), source };
}
