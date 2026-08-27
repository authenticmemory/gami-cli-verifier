import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import { validateGpr } from "./gpr";
import { verifyLocal } from "./verify";

function fixture() {
    const parsed = JSON.parse(
        readFileSync(
            join(process.cwd(), "test", "fixtures", "production", "AGFl_AV.22.0787.gpr.json"),
            "utf8",
        ),
    ) as unknown;
    const validation = validateGpr(parsed);
    if (!validation.valid) throw new Error("invalid production fixture");
    return validation.value;
}

describe("verifyLocal", () => {
    it("keeps a successful Phase 2 result indeterminate", async () => {
        const gpr = fixture();
        const result = await verifyLocal(gpr.subject.file_hash, gpr);
        expect(result.status).toBe("indeterminate");
        expect(result.checks).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "document_hash", status: "passed" }),
                expect.objectContaining({ name: "signature_math", status: "passed" }),
                expect.objectContaining({ name: "institutional_identity", status: "skipped" }),
                expect.objectContaining({ name: "bitcoin_timestamp", status: "skipped" }),
            ]),
        );
    });

    it("fails when the document hash differs", async () => {
        const result = await verifyLocal(`sha256:${"0".repeat(64)}`, fixture());
        expect(result.status).toBe("failed");
        expect(result.checks).toContainEqual(
            expect.objectContaining({ name: "document_hash", status: "failed" }),
        );
    });
});
