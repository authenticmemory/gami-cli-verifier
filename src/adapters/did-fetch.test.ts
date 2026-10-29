import { describe, expect, it } from "@jest/globals";
import {
    RedirectRefusedError,
    fetchDidFile,
    isPublicAddress,
    redirectTarget,
    type FetchHop,
} from "./did-fetch";

const LOG_URL = "https://example.org/.well-known/did.jsonl";
const WWW_LOG_URL = "https://www.example.org/.well-known/did.jsonl";
const options = (followRedirects: boolean) => ({
    accept: "text/jsonl",
    timeoutMs: 5_000,
    maxBytes: 1024,
    followRedirects,
});

function fakeNetwork(table: Record<string, { status: number; location?: string; text?: string }>) {
    const seen: string[] = [];
    const hop: FetchHop = async (url) => {
        seen.push(url);
        return table[url] ?? { status: 404 };
    };
    return { hop, seen };
}

describe("DID file fetching", () => {
    it("returns a direct 200 with its own URL", async () => {
        const { hop } = fakeNetwork({ [LOG_URL]: { status: 200, text: "log" } });
        await expect(fetchDidFile(LOG_URL, options(false), hop)).resolves.toEqual({
            text: "log",
            url: LOG_URL,
        });
    });

    it("refuses a redirect by default without requesting the target", async () => {
        const { hop, seen } = fakeNetwork({ [LOG_URL]: { status: 301, location: WWW_LOG_URL } });
        await expect(fetchDidFile(LOG_URL, options(false), hop)).rejects.toThrow(
            RedirectRefusedError,
        );
        expect(seen).toEqual([LOG_URL]);
    });

    it("follows the www alias on the same path when opted in", async () => {
        const { hop } = fakeNetwork({
            [LOG_URL]: { status: 301, location: WWW_LOG_URL },
            [WWW_LOG_URL]: { status: 200, text: "log" },
        });
        await expect(fetchDidFile(LOG_URL, options(true), hop)).resolves.toEqual({
            text: "log",
            url: WWW_LOG_URL,
        });
        expect(redirectTarget(WWW_LOG_URL, WWW_LOG_URL, LOG_URL)).toBe(LOG_URL);
        expect(redirectTarget(LOG_URL, LOG_URL, "//www.example.org/.well-known/did.jsonl")).toBe(
            WWW_LOG_URL,
        );
    });

    it("refuses every other redirect even when opted in", () => {
        for (const location of [
            "http://www.example.org/.well-known/did.jsonl",
            "https://attacker.example/.well-known/did.jsonl",
            "https://cdn.example.org/.well-known/did.jsonl",
            "https://www.example.org.attacker.example/.well-known/did.jsonl",
            "https://www.example.org/other/did.jsonl",
            "https://www.example.org/.well-known/did.jsonl?x=1",
            "https://www.example.org:8443/.well-known/did.jsonl",
            "https://user@www.example.org/.well-known/did.jsonl",
            "https://10.0.0.1/.well-known/did.jsonl",
        ]) {
            expect(() => redirectTarget(LOG_URL, LOG_URL, location)).toThrow(RedirectRefusedError);
        }
        expect(() => redirectTarget(LOG_URL, LOG_URL, undefined)).toThrow(RedirectRefusedError);
        expect(() =>
            redirectTarget(
                LOG_URL,
                WWW_LOG_URL,
                "https://www.www.example.org/.well-known/did.jsonl",
            ),
        ).toThrow(RedirectRefusedError);
    });

    it("refuses a second redirect: one hop is the limit", async () => {
        const { hop, seen } = fakeNetwork({
            [LOG_URL]: { status: 302, location: WWW_LOG_URL },
            [WWW_LOG_URL]: { status: 302, location: LOG_URL },
        });
        await expect(fetchDidFile(LOG_URL, options(true), hop)).rejects.toThrow(/more than once/);
        expect(seen).toHaveLength(2);
    });

    it("accepts only public addresses at connect time", () => {
        for (const address of [
            "93.184.215.14",
            "1.1.1.1",
            "2606:2800:21f:cb07:6820:80da:af6b:8b2c",
        ])
            expect(isPublicAddress(address)).toBe(true);
        for (const address of [
            "127.0.0.1",
            "10.1.2.3",
            "172.16.0.1",
            "192.168.1.1",
            "169.254.169.254",
            "0.0.0.0",
            "100.64.0.1",
            "224.0.0.1",
            "::1",
            "::",
            "fe80::1",
            "fd12::1",
            "::ffff:127.0.0.1",
            "not-an-ip",
        ])
            expect(isPublicAddress(address)).toBe(false);
    });
});
