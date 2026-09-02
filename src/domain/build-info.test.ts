import { PINNED_MAINNET_CHECKPOINTS } from "./bitcoin";
import { verifierInfo } from "./build-info";

describe("verifierInfo", () => {
    it("discloses the package identity, runtime, and exact pinned checkpoints", () => {
        const info = verifierInfo();

        expect(info.name).toBe("@authenticmemory/gami");
        expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(info.node).toBe(process.version);
        expect(info.bitcoin_checkpoints).toEqual(
            Object.entries(PINNED_MAINNET_CHECKPOINTS).map(([height, hash]) => ({
                height: Number(height),
                hash,
            })),
        );
    });
});
