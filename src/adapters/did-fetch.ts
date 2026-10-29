/**
 * Fetches a DID document or DID log under the did:webvh v1.0 transport rules.
 *
 * did:webvh v1.0 § Resolver Transport Hardening: resolvers MUST NOT auto-follow HTTP 3xx responses,
 * and when redirect-following is an opt-in, every check MUST be re-applied at each target: HTTPS
 * only, no IP-literal host, no loopback/private/link-local address after DNS resolution, a size cap
 * and a timeout. did:web says nothing about redirects; it gets the same rules.
 *
 * Each hop is one `https.request` whose DNS lookup refuses non-public addresses at connect time, and
 * redirects are handled here one at a time. With `--follow-redirects`, only the www alias of the
 * host the DID names is followed (`example.org` <-> `www.example.org`), on the same path and port.
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

/** One hop: apex to www or back. A second redirect is not an alias any more. */
export const MAX_REDIRECTS = 1;

export class RedirectRefusedError extends Error {}

export interface DidFetchOptions {
    accept: string;
    timeoutMs: number;
    maxBytes: number;
    followRedirects: boolean;
}

export interface DidFetchResult {
    text: string;
    /** Where the file was served. Differs from the requested URL only after a followed redirect. */
    url: string;
}

export interface HopResult {
    status: number;
    location?: string;
    text?: string;
}

/** One request without redirect handling. Injectable so tests need no network. */
export type FetchHop = (
    url: string,
    options: DidFetchOptions,
    signal: AbortSignal,
) => Promise<HopResult>;

export async function fetchDidFile(
    url: string,
    options: DidFetchOptions,
    hop: FetchHop = fetchHop,
): Promise<DidFetchResult> {
    const signal = AbortSignal.timeout(options.timeoutMs);
    let current = url;
    for (let hops = 0; ; hops++) {
        const response = await hop(current, options, signal);
        if (response.status >= 300 && response.status < 400) {
            if (!options.followRedirects) {
                throw new RedirectRefusedError(
                    `${current} redirects to ${response.location ?? "another address"}; ` +
                        "DID resolution does not follow redirects unless --follow-redirects is set",
                );
            }
            if (hops >= MAX_REDIRECTS)
                throw new RedirectRefusedError(
                    `${url} redirected more than once; only one redirect is followed`,
                );
            current = redirectTarget(url, current, response.location);
            continue;
        }
        if (response.status < 200 || response.status >= 300 || response.text === undefined)
            throw new Error(`DID server returned HTTP ${response.status}`);
        return { text: response.text, url: current };
    }
}

/**
 * The next URL, if the redirect may be followed. Compared with the URL the DID names, not with the
 * previous hop, so a chain cannot walk away from the original host one alias at a time.
 */
export function redirectTarget(
    requested: string,
    current: string,
    location: string | undefined,
): string {
    if (!location)
        throw new RedirectRefusedError(`${current} answered with a redirect but named no target`);
    let target: URL;
    try {
        target = new URL(location, current);
    } catch {
        throw new RedirectRefusedError(`${current} redirects to an invalid address`);
    }
    target.hash = "";
    const origin = new URL(requested);
    if (target.protocol !== "https:")
        throw new RedirectRefusedError(
            `${current} redirects to ${target.href}, which is not HTTPS`,
        );
    if (isIP(target.hostname.replace(/^\[|\]$/g, "")))
        throw new RedirectRefusedError(`${current} redirects to an IP address`);
    const sameSite =
        bareHost(target.hostname) === bareHost(origin.hostname) &&
        target.port === origin.port &&
        target.pathname === origin.pathname &&
        !target.search &&
        !target.username &&
        !target.password;
    if (!sameSite) {
        throw new RedirectRefusedError(
            `${current} redirects to ${target.href}; only a redirect between ` +
                `${bareHost(origin.hostname)} and www.${bareHost(origin.hostname)} on the same path is followed`,
        );
    }
    return target.href;
}

function bareHost(host: string): string {
    return host.toLowerCase().replace(/^www\./, "");
}

// Loopback, private and link-local are the spec's list; the rest are ranges no public host uses.
// IPv4-mapped IPv6 is matched by prefix in isPublicAddress: a `::ffff:0:0/96` BlockList rule would
// also match every IPv4 address, because BlockList maps IPv4 into that range when checking.
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
] as const)
    NON_PUBLIC.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
    ["::", 128],
    ["::1", 128],
    ["fc00::", 7],
    ["fe80::", 10],
    ["ff00::", 8],
] as const)
    NON_PUBLIC.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string): boolean {
    const family = isIP(address);
    if (!family) return false;
    if (family === 6 && /^::ffff:/i.test(address)) return false;
    return !NON_PUBLIC.check(address, family === 4 ? "ipv4" : "ipv6");
}

type LookupCallback = (
    error: Error | null,
    address?: string | LookupAddress[],
    family?: number,
) => void;

/** Fails when ANY DNS answer is non-public, so the connection cannot pick a bad one. */
function publicOnlyLookup(
    hostname: string,
    options: { all?: boolean },
    callback: LookupCallback,
): void {
    dnsLookup(hostname, { all: true }, (error, addresses) => {
        if (error) return callback(error);
        const blocked = addresses.find((entry) => !isPublicAddress(entry.address));
        if (blocked) return callback(new Error(`${hostname} resolves to a non-public address`));
        const [first] = addresses;
        if (!first) return callback(new Error(`${hostname} has no address`));
        if (options.all) return callback(null, addresses);
        callback(null, first.address, first.family);
    });
}

export const fetchHop: FetchHop = (url, options, signal) =>
    new Promise<HopResult>((resolve, reject) => {
        const fail = (error: unknown) =>
            reject(signal.aborted ? new Error("DID server did not respond in time") : error);
        const req = request(
            url,
            {
                method: "GET",
                headers: { accept: options.accept },
                lookup: publicOnlyLookup as never,
                signal,
                agent: false,
            },
            (res) => {
                const status = res.statusCode ?? 0;
                if (status < 200 || status >= 300) {
                    res.resume();
                    return resolve({ status, location: res.headers.location });
                }
                const tooLarge = () => new Error("DID file exceeds the size limit");
                const declared = Number(res.headers["content-length"]);
                if (Number.isFinite(declared) && declared > options.maxBytes) {
                    res.destroy();
                    return reject(tooLarge());
                }
                const chunks: Buffer[] = [];
                let size = 0;
                res.on("data", (chunk: Buffer) => {
                    size += chunk.length;
                    if (size > options.maxBytes) {
                        res.destroy();
                        return reject(tooLarge());
                    }
                    chunks.push(chunk);
                });
                res.on("end", () =>
                    resolve({ status, text: Buffer.concat(chunks).toString("utf8") }),
                );
                res.on("error", fail);
            },
        );
        req.on("error", fail);
        req.end();
    });
