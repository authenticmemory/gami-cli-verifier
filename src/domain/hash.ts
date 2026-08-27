import { createHash } from "node:crypto";

export function sha256Bytes(data: Uint8Array): Uint8Array {
    return new Uint8Array(createHash("sha256").update(data).digest());
}

export function bytesToHex(data: Uint8Array): string {
    return Buffer.from(data).toString("hex");
}

export function hexToBytes(value: string): Uint8Array {
    const hex = value.replace(/^sha256:/, "");
    if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0)
        throw new Error("invalid hexadecimal value");
    return new Uint8Array(Buffer.from(hex, "hex"));
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) difference |= left[index]! ^ right[index]!;
    return difference === 0;
}
