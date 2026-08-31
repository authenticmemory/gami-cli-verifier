import { describe, expect, it } from "@jest/globals";
import { parseDidKeyId } from "./did";

describe("parseDidKeyId", () => {
    it("parses the did:web form used by deployed GPRs", () => {
        expect(parseDidKeyId("did:web:gedenkstaette-flossenbuerg.de#key-1")).toEqual({
            method: "web",
            did: "did:web:gedenkstaette-flossenbuerg.de",
            fragment: "key-1",
            host: "gedenkstaette-flossenbuerg.de",
            path: [],
        });
    });

    it("parses did:web paths and percent-encoded ports", () => {
        expect(parseDidKeyId("did:web:example.com%3A3000:issuers:archive#key-1")).toMatchObject({
            method: "web",
            host: "example.com",
            port: 3000,
            path: ["issuers", "archive"],
        });
    });

    it("parses the published did:webvh key form", () => {
        const scid = "QmdmPkUdYzbr9txmx8gM2rsHPgr5L6m3gHjJGAf4vUFoGE";
        expect(parseDidKeyId(`did:webvh:${scid}:example.com:dids:issuer#key-1`)).toMatchObject({
            method: "webvh",
            scid,
            host: "example.com",
            path: ["dids", "issuer"],
        });
    });

    it.each([
        "did:web:127.0.0.1#key-1",
        "did:web:example.com:..#key-1",
        "did:web:example.com%3A70000#key-1",
        "did:web:example.com#",
        "did:key:z6MkExample#key-1",
        "did:webvh:not-a-scid:example.com#key-1",
    ])("rejects unsafe or unsupported key identifier %s", (value) => {
        expect(() => parseDidKeyId(value)).toThrow();
    });
});
