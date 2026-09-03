import { describe, expect, it } from "@jest/globals";
import { resolveBitcoinEvidence } from "./bitcoin-network";

const header =
    "00000020d229f9a00185169a6c708060433ac47a02ebbefa7c8f01000000000000000000512384b4bc11b9874a8ce5446fe9c8b1a453cf899c86c5cf9e719cf04dafba2525f4976ac13c0217a4dd753d";
const hash = "000000000000000000020281c4cd2fed129dc478b05871379eaaf4ccfb58831e";

describe("public Bitcoin resolution", () => {
    it("requires two providers and returns their shared canonical header", async () => {
        const hosts = new Set<string>();
        const fetcher = async (input: string | URL | Request) => {
            const url = new URL(String(input));
            hosts.add(url.host);
            return new Response(url.pathname.includes("block-height") ? hash : header);
        };
        const result = await resolveBitcoinEvidence(
            965149,
            "public",
            undefined,
            fetcher as typeof fetch,
        );
        expect(hosts).toEqual(new Set(["blockstream.info", "mempool.space"]));
        expect(result.evidence).toMatchObject({
            height: 965149,
            blockHash: hash,
            source: "blockstream.info+mempool.space",
        });
    });

    it("rejects disagreement between providers", async () => {
        const fetcher = async (input: string | URL | Request) => {
            const url = new URL(String(input));
            if (url.pathname.includes("block-height"))
                return new Response(url.host === "blockstream.info" ? hash : "00".repeat(32));
            return new Response(header);
        };
        await expect(
            resolveBitcoinEvidence(965149, "public", undefined, fetcher as typeof fetch),
        ).rejects.toThrow();
    });
});
