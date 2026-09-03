import { isIP } from "node:net";
import { parseDidKeyId } from "../domain/did";

const MAX_DID_DOCUMENT_BYTES = 1024 * 1024;
const DID_TIMEOUT_MS = 15_000;

export interface ResolvedDidDocument {
    document: unknown;
    url: string;
}

export function didWebDocumentUrl(keyId: string): string {
    const parsed = parseDidKeyId(keyId);
    if (parsed.method !== "web")
        throw new Error(`live resolution is unsupported for did:${parsed.method}`);
    const parts = parsed.did.slice("did:web:".length).split(":").map(decodeURIComponent);
    const host = parts.shift();
    if (!host) throw new Error("did:web must identify a DNS host");
    if (!/^[a-z0-9.-]+(?::[0-9]+)?$/i.test(host)) throw new Error("did:web host is invalid");
    const path =
        parts.length === 0
            ? "/.well-known/did.json"
            : `/${parts.map(encodeURIComponent).join("/")}/did.json`;
    const url = new URL(`https://${host}${path}`);
    if (isIP(url.hostname) || url.hostname === "localhost" || url.hostname.endsWith(".localhost"))
        throw new Error("did:web must identify a public DNS host");
    return url.href;
}

export async function resolveDidWebDocument(
    keyId: string,
    fetcher: typeof fetch = fetch,
): Promise<ResolvedDidDocument> {
    const url = didWebDocumentUrl(keyId);
    const response = await fetcher(url, {
        headers: { accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(DID_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`DID server returned HTTP ${response.status}`);
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_DID_DOCUMENT_BYTES)
        throw new Error("DID document exceeds the size limit");
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_DID_DOCUMENT_BYTES)
        throw new Error("DID document exceeds the size limit");
    try {
        return { document: JSON.parse(text) as unknown, url };
    } catch {
        throw new Error("DID server did not return valid JSON");
    }
}
