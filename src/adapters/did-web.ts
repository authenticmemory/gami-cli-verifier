import { isIP } from "node:net";
import { parseDidKeyId } from "../domain/did";
import { fetchDidFile, type FetchHop } from "./did-fetch";

const MAX_DID_DOCUMENT_BYTES = 1024 * 1024;
const DID_TIMEOUT_MS = 15_000;

export interface ResolvedDidDocument {
    document: unknown;
    url: string;
    /** Where the document was served; differs from `url` only after a followed redirect. */
    servedFrom: string;
}

export interface DidResolveOptions {
    followRedirects?: boolean;
    hop?: FetchHop;
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
    options: DidResolveOptions = {},
): Promise<ResolvedDidDocument> {
    const url = didWebDocumentUrl(keyId);
    const fetched = await fetchDidFile(
        url,
        {
            accept: "application/json",
            timeoutMs: DID_TIMEOUT_MS,
            maxBytes: MAX_DID_DOCUMENT_BYTES,
            followRedirects: options.followRedirects ?? false,
        },
        options.hop,
    );
    try {
        return { document: JSON.parse(fetched.text) as unknown, url, servedFrom: fetched.url };
    } catch {
        throw new Error("DID server did not return valid JSON");
    }
}
