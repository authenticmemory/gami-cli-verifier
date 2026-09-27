import { createPublicKey, verify as verifyWithNode } from "node:crypto";
import { isIP } from "node:net";
import { resolveDIDFromLog, type DIDLog, type Verifier } from "didwebvh-ts";
import { parseDidKeyId } from "../domain/did";

const MAX_DID_LOG_BYTES = 2 * 1024 * 1024;
const DID_TIMEOUT_MS = 15_000;

export interface ResolvedDidWebvhDocument {
    document: unknown;
    url: string;
    versionId: string;
    latestVersionId: string;
    signatureKeyStatus: "active" | "archived";
}

const nodeEd25519Verifier: Verifier = {
    async verify(
        signature: Uint8Array,
        message: Uint8Array,
        publicKey: Uint8Array,
    ): Promise<boolean> {
        try {
            const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
            const key = createPublicKey({
                key: Buffer.concat([spkiPrefix, Buffer.from(publicKey)]),
                format: "der",
                type: "spki",
            });
            return verifyWithNode(null, Buffer.from(message), key, Buffer.from(signature));
        } catch {
            return false;
        }
    },
};

export function didWebvhLogUrl(keyId: string): string {
    const parsed = parseDidKeyId(keyId);
    if (parsed.method !== "webvh")
        throw new Error(`did:webvh log resolution cannot resolve did:${parsed.method}`);
    const authority = parsed.port === undefined ? parsed.host : `${parsed.host}:${parsed.port}`;
    const path =
        parsed.path.length === 0
            ? "/.well-known/did.jsonl"
            : `/${parsed.path.map(encodeURIComponent).join("/")}/did.jsonl`;
    const url = new URL(`https://${authority}${path}`);
    if (isIP(url.hostname) || url.hostname === "localhost" || url.hostname.endsWith(".localhost"))
        throw new Error("did:webvh must identify a public DNS host");
    return url.href;
}

export async function resolveDidWebvhDocument(
    keyId: string,
    fetcher: typeof fetch = fetch,
): Promise<ResolvedDidWebvhDocument> {
    const parsed = parseDidKeyId(keyId);
    if (parsed.method !== "webvh") throw new Error("not a did:webvh key identifier");
    if (!parsed.versionId) {
        throw new Error(
            "did:webvh key identifiers must include ?versionId=; refusing HEAD resolution",
        );
    }

    const url = didWebvhLogUrl(keyId);
    const response = await fetcher(url, {
        headers: { accept: "application/jsonl, application/json-seq, text/plain" },
        redirect: "error",
        signal: AbortSignal.timeout(DID_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`DID log server returned HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DID_LOG_BYTES)
        throw new Error("DID log exceeds the size limit");
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_DID_LOG_BYTES)
        throw new Error("DID log exceeds the size limit");

    const log = parseDidLog(text);
    const latestVersionId = String(log.at(-1)?.versionId ?? "");
    const resolved = await resolveDIDFromLog(log, {
        versionId: parsed.versionId,
        scid: parsed.scid,
        requestedDid: parsed.did,
        verifier: nodeEd25519Verifier,
    });
    if (!resolved.doc) throw new Error("did:webvh resolver returned no DID document");
    if (resolved.meta.versionId !== parsed.versionId) {
        throw new Error(
            `did:webvh resolver returned ${resolved.meta.versionId}, expected ${parsed.versionId}`,
        );
    }
    return {
        document: resolved.doc,
        url,
        versionId: parsed.versionId,
        latestVersionId,
        signatureKeyStatus: parsed.versionId === latestVersionId ? "active" : "archived",
    };
}

function parseDidLog(text: string): DIDLog {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length === 0) throw new Error("DID log is empty");
    return lines.map((line, index) => {
        try {
            return JSON.parse(line) as DIDLog[number];
        } catch {
            throw new Error(`DID log line ${index + 1} is not valid JSON`);
        }
    });
}
