import packageJson from "../../package.json";
import { PINNED_MAINNET_CHECKPOINTS } from "./bitcoin";

export interface VerifierInfo {
    name: string;
    version: string;
    node: string;
    bitcoin_network: "bitcoin-mainnet";
    bitcoin_checkpoints: Array<{ height: number; hash: string }>;
}

export function verifierInfo(): VerifierInfo {
    return {
        name: packageJson.name,
        version: packageJson.version,
        node: process.version,
        bitcoin_network: "bitcoin-mainnet",
        bitcoin_checkpoints: Object.entries(PINNED_MAINNET_CHECKPOINTS).map(([height, hash]) => ({
            height: Number(height),
            hash,
        })),
    };
}
