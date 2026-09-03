import packageJson from "../../package.json";

export interface VerifierInfo {
    name: string;
    version: string;
    node: string;
    bitcoin_network: "bitcoin-mainnet";
    bitcoin_sources: string[];
}

export function verifierInfo(): VerifierInfo {
    return {
        name: packageJson.name,
        version: packageJson.version,
        node: process.version,
        bitcoin_network: "bitcoin-mainnet",
        bitcoin_sources: ["bitcoin-core", "blockstream.info", "mempool.space"],
    };
}
