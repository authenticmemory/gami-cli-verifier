import { describe, expect, it } from "@jest/globals";
import { validateBitcoinEvidence } from "./bitcoin";

const header965004 =
    "00200b209a386695a9e8beb51e2bd8d9f853829ad7b4cd43d0c900000000000000000000b1fee1b6eaae49ccf391224b89cab295a7b866d836aa69eb2f1b76a72ec8ca929b7f966ac13c0217b0f188c3";
const header965005 =
    "0000042095aeba651e04d5b857e191e3dc256ea5fd3c74d3600a02000000000000000000a20fb7654bcb4822dcbb2cdae44e85b6533584b26b41b5f0a2b26984beb08c365383966ac13c0217870c1e50";
const checkpointHash = "0000000000000000000176c1e042b4f8712d984f559e4db6ddb9b46a538611a0";

describe("validateBitcoinEvidence", () => {
    it("validates real proof of work and header linkage into a pinned checkpoint", () => {
        expect(
            validateBitcoinEvidence(
                {
                    version: 1,
                    network: "bitcoin-mainnet",
                    checkpoint: { height: 965005, hash: checkpointHash },
                    headers: [
                        { height: 965004, header: header965004 },
                        { height: 965005, header: header965005 },
                    ],
                },
                965004,
            ),
        ).toMatchObject({
            firstHeight: 965004,
            firstHash: "000000000000000000020a60d3743cfda56e25dce391e157b8d5041e65baae95",
            checkpointHeight: 965005,
            checkpointHash,
        });
    });

    it("rejects caller-invented checkpoints", () => {
        expect(() =>
            validateBitcoinEvidence(
                {
                    version: 1,
                    network: "bitcoin-mainnet",
                    checkpoint: { height: 965005, hash: "00".repeat(32) },
                    headers: [{ height: 965005, header: header965005 }],
                },
                965005,
            ),
        ).toThrow(/package-pinned/);
    });
});
