import { domainToASCII } from "node:url";

export type SupportedDidMethod = "web" | "webvh";

export interface ParsedDidKeyId {
    method: SupportedDidMethod;
    did: string;
    fragment: string;
    host: string;
    port?: number;
    path: string[];
    scid?: string;
}

const BASE58BTC = /^[1-9A-HJ-NP-Za-km-z]{46}$/;
const ID_CHAR = /^[A-Za-z0-9._:%-]+$/;
const FRAGMENT_CHAR = /^(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9A-Fa-f]{2})+$/;

function decodeOnce(value: string, label: string): string {
    if (/%(?![0-9A-Fa-f]{2})/.test(value))
        throw new Error(`${label} contains invalid percent-encoding`);
    try {
        return decodeURIComponent(value);
    } catch {
        throw new Error(`${label} contains invalid UTF-8 percent-encoding`);
    }
}

function parseHost(value: string): { host: string; port?: number } {
    if (!ID_CHAR.test(value))
        throw new Error("DID domain contains characters not allowed by DID Core");
    const decoded = decodeOnce(value, "DID domain");
    const match = /^(.*?)(?::([0-9]{1,5}))?$/.exec(decoded);
    if (!match) throw new Error("DID domain is invalid");
    const rawHost = match[1] ?? "";
    const rawPort = match[2];
    if (!rawHost || rawHost.includes(":"))
        throw new Error("DID domain must be a domain name, not an IP literal");

    const host = domainToASCII(rawHost).toLowerCase();
    if (!host || host.length > 253 || !host.includes("."))
        throw new Error("DID domain must be a fully qualified domain name");
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))
        throw new Error("DID domain must not be an IPv4 address");
    for (const label of host.split(".")) {
        if (!label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
            throw new Error("DID domain contains an invalid DNS label");
        }
    }

    if (rawPort === undefined) return { host };
    if (!/%3a/i.test(value)) throw new Error("DID port separator must be percent-encoded as %3A");
    const port = Number(rawPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
        throw new Error("DID port must be between 1 and 65535");
    return { host, port };
}

function parsePath(segments: string[]): string[] {
    return segments.map((segment, index) => {
        if (!segment || !ID_CHAR.test(segment))
            throw new Error(`DID path segment ${index + 1} contains invalid characters`);
        const decoded = decodeOnce(segment, `DID path segment ${index + 1}`);
        const hasControlCharacter = [...decoded].some((character) => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint <= 31 || codePoint === 127;
        });
        if (
            !decoded ||
            decoded === "." ||
            decoded === ".." ||
            decoded.includes("/") ||
            decoded.trim() !== decoded ||
            hasControlCharacter
        ) {
            throw new Error(`DID path segment ${index + 1} is unsafe`);
        }
        return decoded;
    });
}

/** Parse the GAMI signing-key form: a did:web or did:webvh DID plus a fragment. */
export function parseDidKeyId(value: string): ParsedDidKeyId {
    const hashIndex = value.indexOf("#");
    if (hashIndex < 0 || hashIndex !== value.lastIndexOf("#"))
        throw new Error("DID key identifier must contain exactly one fragment");
    const did = value.slice(0, hashIndex);
    const fragment = value.slice(hashIndex + 1);
    if (!fragment || !FRAGMENT_CHAR.test(fragment)) throw new Error("DID key fragment is invalid");
    decodeOnce(fragment, "DID key fragment");
    if (did.includes("/") || did.includes("?") || did.includes("#"))
        throw new Error("GAMI key identifiers must reference the DID directly");

    if (did.startsWith("did:web:")) {
        const segments = did.slice("did:web:".length).split(":");
        if (!segments[0]) throw new Error("did:web identifier has no domain");
        const authority = parseHost(segments[0]);
        return { method: "web", did, fragment, ...authority, path: parsePath(segments.slice(1)) };
    }

    if (did.startsWith("did:webvh:")) {
        const segments = did.slice("did:webvh:".length).split(":");
        const scid = segments.shift() ?? "";
        if (!BASE58BTC.test(scid))
            throw new Error("did:webvh SCID must be a 46-character base58btc value");
        const domain = segments.shift();
        if (!domain) throw new Error("did:webvh identifier has no domain");
        const authority = parseHost(domain);
        return { method: "webvh", did, fragment, scid, ...authority, path: parsePath(segments) };
    }

    throw new Error("signing key must use did:web or did:webvh");
}
