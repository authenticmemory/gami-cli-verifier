import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { gprLifecycle, validateGpr } from "./gpr";

function fixture(name: string): unknown {
    return JSON.parse(
        readFileSync(join(process.cwd(), "test", "fixtures", name), "utf8"),
    ) as unknown;
}

describe("validateGpr", () => {
    it("accepts a structurally valid unsigned GPR v1", () => {
        const result = validateGpr(fixture("valid-unsigned.gpr.json"));
        expect(result.valid).toBe(true);
        if (result.valid)
            expect(result.value.id).toBe("urn:uuid:018f3f7a-6e3b-7c1a-8f2b-123456789abc");
    });

    it("rejects invalid encodings and unknown fields", () => {
        const result = validateGpr(fixture("invalid-unknown-field.gpr.json"));
        expect(result.valid).toBe(false);
        if (!result.valid) {
            expect(result.issues).toEqual(
                expect.arrayContaining([
                    {
                        path: "$.subject.file_hash",
                        message: "must use sha256:<64 lowercase hex> format",
                    },
                    { path: "$.proof.unexpected", message: "unknown field" },
                    { path: "$.proof.created", message: "must be an ISO-8601 timestamp" },
                ]),
            );
        }
    });

    it("requires both WebAuthn payload fields", () => {
        const value = fixture("valid-unsigned.gpr.json") as Record<string, unknown>;
        const proof = value.proof as Record<string, unknown>;
        proof.authenticator_data = "AQID";
        const result = validateGpr(value);
        expect(result.valid).toBe(false);
        if (!result.valid)
            expect(result.issues).toContainEqual({
                path: "$.proof",
                message: "authenticator_data and client_data_json must appear together",
            });
    });

    it("caps Merkle paths", () => {
        const value = fixture("valid-unsigned.gpr.json") as Record<string, unknown>;
        const proof = value.proof as Record<string, unknown>;
        proof.merkle_path = Array.from({ length: 129 }, () => ({
            hash: "c".repeat(64),
            position: "right",
        }));
        const result = validateGpr(value);
        expect(result.valid).toBe(false);
        if (!result.valid)
            expect(result.issues).toContainEqual({
                path: "$.proof.merkle_path",
                message: "must contain at most 128 steps",
            });
    });

    it("classifies each deployed GPR lifecycle stage", () => {
        const value = fixture("valid-unsigned.gpr.json") as Record<string, unknown>;
        const proof = value.proof as Record<string, unknown>;
        expect(gprLifecycle(value as never)).toBe("unsigned");
        proof.signature = `ed25519:${"d".repeat(128)}`;
        expect(gprLifecycle(value as never)).toBe("signed");
        proof.timestamp = {
            type: "opentimestamps",
            document_hash: `sha256:${"e".repeat(64)}`,
            upgraded: false,
        };
        expect(gprLifecycle(value as never)).toBe("stamped");
        (proof.timestamp as Record<string, unknown>).upgraded = true;
        expect(gprLifecycle(value as never)).toBe("upgraded");
    });
});
