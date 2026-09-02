import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import type { Gpr } from "./gpr";
import { validateGpr } from "./gpr";
import { verifyTimestamp } from "./timestamp";

function jsonFixture(name: string): unknown {
    return JSON.parse(
        readFileSync(join(process.cwd(), "test", "fixtures", "production", name), "utf8"),
    ) as unknown;
}

function gprFixture(name: string): Gpr {
    const result = validateGpr(jsonFixture(name));
    if (!result.valid) throw new Error(`invalid fixture: ${JSON.stringify(result.issues)}`);
    return result.value;
}

describe("verifyTimestamp production vectors", () => {
    it("validates the real pending single-record calendar proof", () => {
        const result = verifyTimestamp(gprFixture("phase4-single-stamped.gpr.json"));
        expect(result).toMatchObject({
            status: "pending",
            canonicalHash:
                "sha256:6badeb6304f94e276d2e75f1cb313fa499db044032f862c27b3286514d1ce37c",
            otsLeaf: "6badeb6304f94e276d2e75f1cb313fa499db044032f862c27b3286514d1ce37c",
        });
        expect(result.pendingCalendars?.length).toBeGreaterThan(0);
    });

    it("finds the real upgraded Bitcoin attestation without overstating chain verification", () => {
        const result = verifyTimestamp(gprFixture("phase4-single-upgraded.gpr.json"));
        expect(result).toMatchObject({
            status: "attested",
            bitcoinHeight: 965005,
        });
    });

    it("verifies the upgraded proof against independently obtained checkpoint evidence", () => {
        const result = verifyTimestamp(
            gprFixture("phase4-single-upgraded.gpr.json"),
            jsonFixture("bitcoin-965005.evidence.json"),
        );
        expect(result).toMatchObject({
            status: "verified",
            bitcoinHeight: 965005,
            bitcoinBlockHash: "0000000000000000000176c1e042b4f8712d984f559e4db6ddb9b46a538611a0",
            bitcoinBlockTime: 1788248915,
            checkpointHeight: 965005,
        });
    });

    it("rejects timestamp canonicalization tampering", () => {
        const gpr = gprFixture("phase4-single-stamped.gpr.json");
        gpr.subject.metadata = { language: "tampered" };
        expect(verifyTimestamp(gpr)).toMatchObject({ status: "failed" });
    });

    it("rejects contradictory lifecycle and corrupted Bitcoin evidence", () => {
        const pending = gprFixture("phase4-single-stamped.gpr.json");
        pending.proof.timestamp!.upgraded = true;
        expect(verifyTimestamp(pending)).toMatchObject({ status: "failed" });

        const evidence = jsonFixture("bitcoin-965005.evidence.json") as {
            headers: Array<{ header: string }>;
        };
        evidence.headers[0]!.header = `${evidence.headers[0]!.header.slice(0, -1)}1`;
        expect(
            verifyTimestamp(gprFixture("phase4-single-upgraded.gpr.json"), evidence),
        ).toMatchObject({ status: "failed" });
    });

    it("reconstructs the shared OTS root for two real members of one timestamp batch", () => {
        const first = verifyTimestamp(gprFixture("phase4-batch-member-06.gpr.json"));
        const second = verifyTimestamp(gprFixture("phase4-batch-member-10.gpr.json"));
        expect(first).toMatchObject({
            status: "attested",
            canonicalHash:
                "sha256:e2967c0679305f44f9c821530234db40818991e6d6618435eb8cd480ffabefc3",
            otsLeaf: "f5fe46e244ff5089edcef529f9f17cad2f33daac5960c0a1e50e16c1aacafc03",
        });
        expect(second).toMatchObject({
            status: "attested",
            canonicalHash:
                "sha256:f9ae06e5d985cf59827db90d685804c5fa56f720b4ad50f0c9a8e88f288088ec",
            otsLeaf: first.otsLeaf,
            bitcoinHeight: first.bitcoinHeight,
        });
    });

    it("rejects a corrupted timestamp-batch inclusion path", () => {
        const gpr = gprFixture("phase4-batch-member-06.gpr.json");
        gpr.proof.timestamp!.merkle_path![0]!.hash = "00".repeat(32);
        expect(verifyTimestamp(gpr)).toMatchObject({ status: "failed" });
    });
});
