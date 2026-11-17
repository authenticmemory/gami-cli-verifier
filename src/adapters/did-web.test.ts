import { describe, expect, it } from "@jest/globals";
import { didWebDocumentUrl, resolveDidWebDocument } from "./did-web";
import type { FetchHop } from "./did-fetch";

const DOCUMENT_URL = "https://example.org/.well-known/did.json";
const WWW_DOCUMENT_URL = "https://www.example.org/.well-known/did.json";

const directHop: FetchHop = async (url) =>
    url === DOCUMENT_URL ? { status: 200, text: '{"id":"did:web:example.org"}' } : { status: 404 };

const wwwRedirectHop: FetchHop = async (url) =>
    url === DOCUMENT_URL
        ? { status: 301, location: WWW_DOCUMENT_URL }
        : url === WWW_DOCUMENT_URL
          ? { status: 200, text: '{"id":"did:web:example.org"}' }
          : { status: 404 };

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

    it("fetches a JSON document served directly", async () => {
        await expect(
            resolveDidWebDocument("did:web:example.org#key-1", { hop: directHop }),
        ).resolves.toEqual({
            document: { id: "did:web:example.org" },
            url: DOCUMENT_URL,
            servedFrom: DOCUMENT_URL,
        });
    });

    it("refuses a redirect unless the caller opts in", async () => {
        await expect(
            resolveDidWebDocument("did:web:example.org#key-1", { hop: wwwRedirectHop }),
        ).rejects.toThrow(/--follow-redirects/);
        await expect(
            resolveDidWebDocument("did:web:example.org#key-1", {
                hop: wwwRedirectHop,
                followRedirects: true,
            }),
        ).resolves.toMatchObject({ url: DOCUMENT_URL, servedFrom: WWW_DOCUMENT_URL });
    });
});
