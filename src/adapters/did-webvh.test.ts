import { describe, expect, it } from "@jest/globals";
import { didWebvhLogUrl } from "./did-webvh";

describe("didWebvhLogUrl", () => {
    it("derives the did.jsonl URL from the did:webvh key id without using HEAD", () => {
        const scid = "QmdmPkUdYzbr9txmx8gM2rsHPgr5L6m3gHjJGAf4vUFoGE";
        const keyId = `did:webvh:${scid}:sarkazein.xyz:pr81-revocation-20260909?versionId=1-${"a".repeat(64)}#Nm8goDK4`;
        expect(didWebvhLogUrl(keyId)).toBe(
            "https://sarkazein.xyz/pr81-revocation-20260909/did.jsonl",
        );
    });
});
