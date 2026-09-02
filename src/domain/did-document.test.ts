import { describe, expect, it } from "@jest/globals";
import { authorizeDidKey } from "./did-document";

const did = "did:web:archive.example";
const keyId = `${did}#key-1`;
const keyHex = "25a4c7c5500d69118f6a67a6bec27a8a1759a759f7330dee7cce6c8d27477f6c";

function jwkDocument(x = Buffer.from(keyHex, "hex").toString("base64url")): unknown {
    return {
        "@context": ["https://www.w3.org/ns/did/v1"],
        id: did,
        verificationMethod: [
            {
                id: keyId,
                type: "JsonWebKey2020",
                controller: did,
                publicKeyJwk: { kty: "OKP", crv: "Ed25519", x },
            },
        ],
        assertionMethod: [keyId],
    };
}

function base58(bytes: Uint8Array): string {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const digits: number[] = [0];
    for (const byte of bytes) {
        let carry = byte;
        for (let index = 0; index < digits.length; index += 1) {
            carry += digits[index]! << 8;
            digits[index] = carry % 58;
            carry = Math.floor(carry / 58);
        }
        while (carry > 0) {
            digits.push(carry % 58);
            carry = Math.floor(carry / 58);
        }
    }
    let output = "";
    for (let index = 0; index < bytes.length - 1 && bytes[index] === 0; index += 1) output += "1";
    for (let index = digits.length - 1; index >= 0; index -= 1) output += alphabet[digits[index]!]!;
    return output;
}

describe("authorizeDidKey", () => {
    it("authorizes the exact assertionMethod JWK and matches the GPR key", () => {
        expect(authorizeDidKey(jwkDocument(), keyId, keyHex)).toMatchObject({
            status: "passed",
            did,
            keyId,
            publicKeyHex: keyHex,
            evidenceSource: "provided-current",
        });
    });

    it("supports an embedded assertionMethod using an Ed25519 multikey", () => {
        const multikey = `z${base58(Buffer.concat([Buffer.from([0xed, 0x01]), Buffer.from(keyHex, "hex")]))}`;
        const document = {
            id: did,
            assertionMethod: [
                {
                    id: "#key-1",
                    type: "Multikey",
                    controller: did,
                    publicKeyMultibase: multikey,
                },
            ],
        };
        expect(authorizeDidKey(document, keyId, keyHex)).toMatchObject({
            status: "passed",
            publicKeyHex: keyHex,
        });
    });

    it("rejects a key that exists but is not authorized for assertion", () => {
        const document = jwkDocument() as { assertionMethod: string[] };
        document.assertionMethod = [];
        expect(authorizeDidKey(document, keyId, keyHex)).toMatchObject({
            status: "failed",
            message: expect.stringContaining("not authorized by assertionMethod"),
        });
    });

    it("rejects a DID document for a different DID", () => {
        const document = jwkDocument() as { id: string };
        document.id = "did:web:attacker.example";
        expect(authorizeDidKey(document, keyId, keyHex)).toMatchObject({ status: "failed" });
    });

    it("rejects a DID-authorized key that differs from the embedded key", () => {
        expect(authorizeDidKey(jwkDocument(), keyId, "00".repeat(32))).toMatchObject({
            status: "failed",
            message: expect.stringContaining("embedded GPR key"),
        });
    });

    it("rejects duplicate definitions of the authorized key", () => {
        const document = jwkDocument() as {
            verificationMethod: Array<Record<string, unknown>>;
        };
        document.verificationMethod.push({ ...document.verificationMethod[0] });
        expect(authorizeDidKey(document, keyId, keyHex)).toMatchObject({
            status: "failed",
            message: expect.stringContaining("exactly one"),
        });
    });

    it("fails malformed supported key material but leaves unknown key types indeterminate", () => {
        const malformed = jwkDocument("not*base64url");
        expect(authorizeDidKey(malformed, keyId, keyHex)).toMatchObject({ status: "failed" });

        const unknown = jwkDocument() as {
            verificationMethod: Array<{ type: string }>;
        };
        unknown.verificationMethod[0]!.type = "FutureEd25519Key";
        expect(authorizeDidKey(unknown, keyId, keyHex)).toMatchObject({
            status: "indeterminate",
        });
    });

    it("rejects contradictory duplicate key encodings", () => {
        const document = jwkDocument() as {
            verificationMethod: Array<Record<string, unknown>>;
        };
        document.verificationMethod[0]!.publicKeyHex = "00".repeat(32);
        expect(authorizeDidKey(document, keyId, keyHex)).toMatchObject({
            status: "failed",
            message: expect.stringContaining("contradicts"),
        });
    });

    it("does not mistake a did:webvh snapshot for verified history", () => {
        const scid = "QmYwAPJzv5CZsnAzt8auVZRnGi2C19h1QSpL6Y6N7RZ6Z7";
        const webvhKey = `did:webvh:${scid}:archive.example#key-1`;
        expect(authorizeDidKey({}, webvhKey, keyHex)).toMatchObject({
            status: "indeterminate",
            message: expect.stringContaining("history"),
        });
    });
});
