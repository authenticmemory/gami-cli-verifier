import { describe, expect, it } from "@jest/globals";
import { didWebDocumentUrl, resolveDidWebDocument } from "./did-web";

async function successfulFetch(_input: string | URL | Request, init?: RequestInit) {
    expect(init?.redirect).toBe("error");
    return new Response('{"id":"did:web:example.org"}', {
        status: 200,
        headers: { "content-type": "application/json" },
    });
}

describe("did:web resolution", () => {
    it("maps domain and path identifiers to HTTPS DID documents", () => {
        expect(didWebDocumentUrl("did:web:example.org#key-1")).toBe(
            "https://example.org/.well-known/did.json",
        );
        expect(didWebDocumentUrl("did:web:example.org:archives#key-1")).toBe(
            "https://example.org/archives/did.json",
        );
    });

    it("rejects IP and localhost targets, including encoded ports", () => {
        expect(() => didWebDocumentUrl("did:web:127.0.0.1%3A8080#key-1")).toThrow();
        expect(() => didWebDocumentUrl("did:web:localhost#key-1")).toThrow();
    });

    it("fetches a JSON document without following redirects", async () => {
        await expect(
            resolveDidWebDocument("did:web:example.org#key-1", successfulFetch as typeof fetch),
        ).resolves.toMatchObject({
            document: { id: "did:web:example.org" },
            url: "https://example.org/.well-known/did.json",
        });
    });
});
