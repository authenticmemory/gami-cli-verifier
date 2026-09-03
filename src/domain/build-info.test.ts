import { verifierInfo } from "./build-info";

describe("verifierInfo", () => {
    it("discloses the package identity, runtime, and Bitcoin sources", () => {
        const info = verifierInfo();

        expect(info.name).toBe("@authenticmemory/gami");
        expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
        expect(info.node).toBe(process.version);
        expect(info.bitcoin_sources).toEqual(["bitcoin-core", "blockstream.info", "mempool.space"]);
    });
});
