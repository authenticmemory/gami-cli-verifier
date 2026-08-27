import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";
import type { Gpr } from "./gpr";
import { validateGpr } from "./gpr";
import { canonicalForSigning } from "./canonical";
import { verifySignature } from "./signature";

function productionGpr(): Gpr {
    const value = JSON.parse(
        readFileSync(
            join(process.cwd(), "test", "fixtures", "production", "AGFl_AV.22.0787.gpr.json"),
            "utf8",
        ),
    ) as unknown;
    const validation = validateGpr(value);
    if (!validation.valid)
        throw new Error(`production fixture is invalid: ${JSON.stringify(validation.issues)}`);
    return validation.value;
}

describe("verifySignature production vector", () => {
    it("reproduces the deployed canonical leaf, batch root, and WebAuthn signature", async () => {
        const result = await verifySignature(productionGpr());
        expect(result).toMatchObject({
            valid: true,
            mode: "webauthn-ed25519",
            keySource: "embedded",
            leafHex: "c1050c35d539b70824b35fedf42882ac5386ae12e235d95fa9592da383386d51",
            merkleRootHex: "8ba4df58459a9f3dad20d4b0cf3a16bbf9d8a68eff3d062c99ba782746aa175f",
            userPresent: true,
            userVerified: true,
        });
    });

    it("rejects signed metadata tampering", async () => {
        const gpr = productionGpr();
        gpr.subject.metadata = { ...gpr.subject.metadata, title: "Tampered title" };
        const result = await verifySignature(gpr);
        expect(result.valid).toBe(false);
        expect(result.error).toBe(
            "WebAuthn challenge does not match the reconstructed Merkle root",
        );
    });

    it("rejects a forged stored batch root", async () => {
        const gpr = productionGpr();
        gpr.proof.merkle_root = "0".repeat(64);
        const result = await verifySignature(gpr);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("stored Merkle root does not match the reconstructed root");
    });

    it("labels an explicit matching key as overridden", async () => {
        const gpr = productionGpr();
        const result = await verifySignature(gpr, gpr.proof.public_key_hex);
        expect(result.valid).toBe(true);
        expect(result.keySource).toBe("overridden");
    });

    it("verifies the deployed legacy raw-Ed25519 payload rule", async () => {
        const gpr = productionGpr();
        delete gpr.proof.signature;
        delete gpr.proof.authenticator_data;
        delete gpr.proof.client_data_json;
        delete gpr.proof.batch_id;
        delete gpr.proof.merkle_root;
        delete gpr.proof.merkle_path;
        delete gpr.proof.timestamp;

        const { privateKey, publicKey } = generateKeyPairSync("ed25519");
        const publicDer = publicKey.export({ format: "der", type: "spki" });
        gpr.proof.public_key_hex = publicDer.subarray(publicDer.length - 32).toString("hex");
        const leaf = createHash("sha256").update(canonicalForSigning(gpr)).digest();
        gpr.proof.signature = `ed25519:${sign(null, leaf, privateKey).toString("hex")}`;

        const result = await verifySignature(gpr);
        expect(result).toMatchObject({
            valid: true,
            mode: "raw-ed25519",
            leafHex: leaf.toString("hex"),
        });
    });
});
