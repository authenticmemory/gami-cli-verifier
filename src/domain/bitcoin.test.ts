import { describe, expect, it } from "@jest/globals";
import { validateBitcoinHeader } from "./bitcoin";

const header965005 =
    "0000042095aeba651e04d5b857e191e3dc256ea5fd3c74d3600a02000000000000000000a20fb7654bcb4822dcbb2cdae44e85b6533584b26b41b5f0a2b26984beb08c365383966ac13c0217870c1e50";
const hash965005 = "0000000000000000000176c1e042b4f8712d984f559e4db6ddb9b46a538611a0";

describe("validateBitcoinHeader", () => {
    it("validates a canonical hash and real proof of work", () => {
        expect(validateBitcoinHeader(965005, header965005, "test", hash965005)).toMatchObject({
            height: 965005,
            blockHash: hash965005,
            blockTime: 1788248915,
            source: "test",
        });
    });

    it("rejects a provider hash that contradicts the header", () => {
        expect(() => validateBitcoinHeader(965005, header965005, "test", "00".repeat(32))).toThrow(
            /canonical hash/,
        );
    });
});
