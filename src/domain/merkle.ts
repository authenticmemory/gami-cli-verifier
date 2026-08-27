import type { GprMerkleStep } from "./gpr";
import { hexToBytes, sha256Bytes } from "./hash";

function parentHash(left: Uint8Array, right: Uint8Array): Uint8Array {
    const input = new Uint8Array(left.length + right.length);
    input.set(left);
    input.set(right, left.length);
    return sha256Bytes(input);
}

/** Fold a deployed-v1 leaf through its ordered sibling path. */
export function foldMerklePath(leaf: Uint8Array, path: GprMerkleStep[]): Uint8Array {
    let current = leaf;
    for (const step of path) {
        const sibling = hexToBytes(step.hash);
        if (sibling.length !== 32) throw new Error("Merkle sibling must be 32 bytes");
        current =
            step.position === "left" ? parentHash(sibling, current) : parentHash(current, sibling);
    }
    return current;
}
