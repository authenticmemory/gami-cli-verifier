import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { validateBitcoinHeader } from "./bitcoin";
import { canonicalForSigning, canonicalForTimestamp } from "./canonical";
import { validateGpr, type Gpr } from "./gpr";
import { bytesToHex, sha256Bytes } from "./hash";
import { verifySignature } from "./signature";
import { verifyTimestamp } from "./timestamp";

const ids = ["d54e3d8a-561a-45ad-9fe7-cbd6e5410009", "d5be2b39-8e9d-4547-a8ec-4067f17a2bca"];
const root = join(process.cwd(), "test", "fixtures", "production", "batch");

function load(id: string, state: "stamped" | "upgraded"): Gpr {
    const value = JSON.parse(
        readFileSync(join(root, `${id}-${state}`, `${id}.gpr.json`), "utf8"),
    ) as unknown;
    const validation = validateGpr(value);
    if (!validation.valid) throw new Error(JSON.stringify(validation.issues));
    return validation.value;
}

describe("genuine non-degenerate batch", () => {
    it("reconstructs one signing root from opposite path directions and verifies the shared signature", async () => {
        const records = ids.map((id) => load(id, "upgraded"));
        const signatures = await Promise.all(records.map((record) => verifySignature(record)));
        expect(signatures.map((result) => result.valid)).toEqual([true, true]);
        expect(signatures.map((result) => result.merkleRootHex)).toEqual([
            "26e6d60ad5abbf9586fc64ec9d955be55d957fa86f26bc4da3683bd0ccb5dd0f",
            "26e6d60ad5abbf9586fc64ec9d955be55d957fa86f26bc4da3683bd0ccb5dd0f",
        ]);
        expect(records[0]!.proof.signature).toBe(records[1]!.proof.signature);
    });

    it("keeps signing bytes stable while canonical timestamp bytes change only for the upgrade", () => {
        for (const id of ids) {
            const stamped = load(id, "stamped");
            const upgraded = load(id, "upgraded");
            expect(canonicalForSigning(stamped)).toBe(canonicalForSigning(upgraded));
            expect(canonicalForTimestamp(stamped)).toBe(canonicalForTimestamp(upgraded));
            const digest = bytesToHex(
                sha256Bytes(new TextEncoder().encode(canonicalForTimestamp(upgraded))),
            );
            expect(upgraded.proof.timestamp!.document_hash).toBe(`sha256:${digest}`);
        }
    });

    it("reports batched stamped records pending and verifies both upgraded records in block 965149", () => {
        const manifest = JSON.parse(
            readFileSync(join(root, `${ids[0]}-upgraded`, "MANIFEST.json"), "utf8"),
        ) as { bitcoin_evidence: { block_header_hex: string; block_hash: string } };
        const evidence = validateBitcoinHeader(
            965149,
            manifest.bitcoin_evidence.block_header_hex,
            "fixture",
            manifest.bitcoin_evidence.block_hash,
        );
        const stamped = ids.map((id) => verifyTimestamp(load(id, "stamped")));
        const upgraded = ids.map((id) => verifyTimestamp(load(id, "upgraded"), evidence));
        expect(stamped.map((result) => result.status)).toEqual(["pending", "pending"]);
        expect(upgraded.map((result) => result.status)).toEqual(["verified", "verified"]);
        expect(upgraded.map((result) => result.otsLeaf)).toEqual([
            "4fae6ef0c013b927b493a89fd7b3181a2773ac7e4ce3be263dd113a8291b2c52",
            "4fae6ef0c013b927b493a89fd7b3181a2773ac7e4ce3be263dd113a8291b2c52",
        ]);
    });
});
