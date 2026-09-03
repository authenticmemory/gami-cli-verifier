import { parseDidKeyId } from "./did";
import { bytesToHex, equalBytes, hexToBytes } from "./hash";

type JsonObject = Record<string, unknown>;

export interface DidAuthorization {
    status: "passed" | "failed" | "indeterminate";
    message: string;
    did?: string;
    keyId?: string;
    publicKeyHex?: string;
    evidenceSource: "none" | "provided-current" | "resolved-current";
}

function isObject(value: unknown): value is JsonObject {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveDidUrl(value: string, did: string): string | undefined {
    if (value.startsWith("#")) return `${did}${value}`;
    return value.startsWith("did:") ? value : undefined;
}

function decodeBase64Url(value: string): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1)
        throw new Error("JWK x is not valid unpadded base64url");
    const canonical = value.replace(/-/g, "+").replace(/_/g, "/");
    return new Uint8Array(
        Buffer.from(canonical.padEnd(Math.ceil(canonical.length / 4) * 4, "="), "base64"),
    );
}

function decodeBase58(value: string): Uint8Array {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const bytes: number[] = [0];
    for (const character of value) {
        const digit = alphabet.indexOf(character);
        if (digit < 0) throw new Error("publicKeyMultibase contains invalid base58btc");
        let carry = digit;
        for (let index = 0; index < bytes.length; index += 1) {
            carry += bytes[index]! * 58;
            bytes[index] = carry & 0xff;
            carry >>= 8;
        }
        while (carry > 0) {
            bytes.push(carry & 0xff);
            carry >>= 8;
        }
    }
    for (let index = 0; index < value.length - 1 && value[index] === "1"; index += 1) bytes.push(0);
    return Uint8Array.from(bytes, (_, index) => bytes[bytes.length - 1 - index]!);
}

function decodeVerificationKey(method: JsonObject): Uint8Array {
    const finish = (key: Uint8Array): Uint8Array => {
        if (method.publicKeyHex !== undefined) {
            if (
                typeof method.publicKeyHex !== "string" ||
                !/^[0-9a-f]{64}$/i.test(method.publicKeyHex)
            )
                throw new Error("publicKeyHex must contain exactly 32 bytes of hexadecimal data");
            if (!equalBytes(key, hexToBytes(method.publicKeyHex)))
                throw new Error("publicKeyHex contradicts the standards-based DID key material");
        }
        return key;
    };
    const type = method.type;
    if (type === "JsonWebKey2020") {
        const jwk = method.publicKeyJwk;
        if (
            !isObject(jwk) ||
            jwk.kty !== "OKP" ||
            jwk.crv !== "Ed25519" ||
            typeof jwk.x !== "string"
        ) {
            throw new Error("JsonWebKey2020 must contain an OKP Ed25519 publicKeyJwk");
        }
        const key = decodeBase64Url(jwk.x);
        if (key.length !== 32) throw new Error("Ed25519 JWK must decode to 32 bytes");
        return finish(key);
    }

    if (type === "Multikey" || type === "Ed25519VerificationKey2020") {
        if (
            typeof method.publicKeyMultibase !== "string" ||
            !method.publicKeyMultibase.startsWith("z")
        ) {
            throw new Error(`${String(type)} must contain a base58btc publicKeyMultibase`);
        }
        const decoded = decodeBase58(method.publicKeyMultibase.slice(1));
        if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
            throw new Error("publicKeyMultibase must contain a multicodec Ed25519 public key");
        }
        return finish(decoded.slice(2));
    }

    throw new Error(`unsupported verification method type: ${String(type)}`);
}

function findAuthorizedMethod(
    document: JsonObject,
    did: string,
    keyId: string,
): JsonObject | undefined {
    if (!Array.isArray(document.assertionMethod)) return undefined;
    const methods = Array.isArray(document.verificationMethod)
        ? document.verificationMethod.filter(isObject)
        : [];

    const authorized: JsonObject[] = [];
    for (const entry of document.assertionMethod) {
        if (typeof entry === "string") {
            if (resolveDidUrl(entry, did) !== keyId) continue;
            const matches = methods.filter(
                (method) =>
                    typeof method.id === "string" && resolveDidUrl(method.id, did) === keyId,
            );
            if (matches.length !== 1)
                throw new Error(`${keyId} must have exactly one verificationMethod definition`);
            authorized.push(matches[0]!);
            continue;
        }
        if (
            isObject(entry) &&
            typeof entry.id === "string" &&
            resolveDidUrl(entry.id, did) === keyId
        ) {
            authorized.push(entry);
        }
    }
    if (authorized.length > 1)
        throw new Error(`${keyId} is ambiguously defined in assertionMethod`);
    return authorized[0];
}

export function authorizeDidKey(
    document: unknown | undefined,
    keyId: string,
    embeddedPublicKeyHex?: string,
    overriddenPublicKeyHex?: string,
    evidenceSource: "provided-current" | "resolved-current" = "provided-current",
): DidAuthorization {
    const parsed = parseDidKeyId(keyId);
    if (document === undefined) {
        return {
            status: "indeterminate",
            message: "No offline DID evidence was supplied",
            did: parsed.did,
            keyId,
            evidenceSource: "none",
        };
    }
    if (parsed.method === "webvh") {
        return {
            status: "indeterminate",
            message:
                "A did:webvh history log requires native history verification, which is pending",
            did: parsed.did,
            keyId,
            evidenceSource: "none",
        };
    }
    if (!isObject(document)) {
        return {
            status: "failed",
            message: "DID evidence must be a JSON object",
            evidenceSource,
        };
    }
    if (document.id !== parsed.did) {
        return {
            status: "failed",
            message: `DID document id does not match ${parsed.did}`,
            did: parsed.did,
            keyId,
            evidenceSource,
        };
    }
    let method: JsonObject | undefined;
    try {
        method = findAuthorizedMethod(document, parsed.did, keyId);
    } catch (error) {
        return {
            status: "failed",
            message: error instanceof Error ? error.message : "DID key definition is ambiguous",
            did: parsed.did,
            keyId,
            evidenceSource,
        };
    }
    if (!method) {
        return {
            status: "failed",
            message: `${keyId} is not authorized by assertionMethod`,
            did: parsed.did,
            keyId,
            evidenceSource,
        };
    }
    const controller =
        typeof method.controller === "string"
            ? resolveDidUrl(method.controller, parsed.did)
            : undefined;
    if (controller !== parsed.did) {
        return {
            status: "failed",
            message: `Authorized verification method controller does not match ${parsed.did}`,
            did: parsed.did,
            keyId,
            evidenceSource,
        };
    }

    let key: Uint8Array;
    try {
        key = decodeVerificationKey(method);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unsupported DID verification key";
        return {
            status: message.startsWith("unsupported verification method type:")
                ? "indeterminate"
                : "failed",
            message,
            did: parsed.did,
            keyId,
            evidenceSource,
        };
    }
    for (const [label, hex] of [
        ["embedded GPR key", embeddedPublicKeyHex],
        ["--public-key override", overriddenPublicKeyHex],
    ] as const) {
        if (hex && !equalBytes(key, hexToBytes(hex))) {
            return {
                status: "failed",
                message: `DID-authorized key does not match the ${label}`,
                did: parsed.did,
                keyId,
                publicKeyHex: bytesToHex(key),
                evidenceSource,
            };
        }
    }
    return {
        status: "passed",
        message: `${keyId} is authorized for assertion by the ${evidenceSource === "resolved-current" ? "live" : "supplied"} current did:web document`,
        did: parsed.did,
        keyId,
        publicKeyHex: bytesToHex(key),
        evidenceSource,
    };
}
