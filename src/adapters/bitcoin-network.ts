import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validateBitcoinHeader, type BitcoinBlockEvidence } from "../domain/bitcoin";

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 15_000;
const PROVIDERS = ["https://blockstream.info/api", "https://mempool.space/api"] as const;
export type BitcoinSource = "auto" | "core" | "public" | "none";

async function coreEvidence(
    height: number,
    executable = "bitcoin-cli",
): Promise<BitcoinBlockEvidence> {
    const hashResult = await execFileAsync(executable, ["getblockhash", String(height)], {
        timeout: TIMEOUT_MS,
        windowsHide: true,
    });
    const hash = hashResult.stdout.trim();
    const headerResult = await execFileAsync(executable, ["getblockheader", hash, "false"], {
        timeout: TIMEOUT_MS,
        windowsHide: true,
    });
    return validateBitcoinHeader(height, headerResult.stdout.trim(), "bitcoin-core", hash);
}

async function fetchText(url: string, fetcher: typeof fetch): Promise<string> {
    const response = await fetcher(url, {
        headers: { accept: "text/plain" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${new URL(url).host} returned HTTP ${response.status}`);
    const text = (await response.text()).trim();
    if (text.length > 1024) throw new Error(`${new URL(url).host} returned an oversized response`);
    return text;
}

async function providerEvidence(
    baseUrl: string,
    height: number,
    fetcher: typeof fetch,
): Promise<BitcoinBlockEvidence> {
    const hash = await fetchText(`${baseUrl}/block-height/${height}`, fetcher);
    const header = await fetchText(`${baseUrl}/block/${hash}/header`, fetcher);
    return validateBitcoinHeader(height, header, new URL(baseUrl).host, hash);
}

async function publicEvidence(
    height: number,
    fetcher: typeof fetch,
): Promise<BitcoinBlockEvidence> {
    const results = await Promise.all(
        PROVIDERS.map((provider) => providerEvidence(provider, height, fetcher)),
    );
    if (results[0]!.blockHash !== results[1]!.blockHash)
        throw new Error("public Bitcoin providers disagree about the canonical block hash");
    return { ...results[0]!, source: "blockstream.info+mempool.space" };
}

export async function resolveBitcoinEvidence(
    height: number,
    source: BitcoinSource,
    bitcoinCli?: string,
    fetcher: typeof fetch = fetch,
): Promise<{ evidence?: BitcoinBlockEvidence; warning?: string }> {
    if (source === "none") return {};
    if (source === "core") return { evidence: await coreEvidence(height, bitcoinCli) };
    if (source === "public") return { evidence: await publicEvidence(height, fetcher) };
    try {
        return { evidence: await coreEvidence(height, bitcoinCli) };
    } catch (coreError) {
        try {
            return { evidence: await publicEvidence(height, fetcher) };
        } catch (publicError) {
            return {
                warning: `Bitcoin Core unavailable (${message(coreError)}); public verification unavailable (${message(publicError)})`,
            };
        }
    }
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
