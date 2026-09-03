import type { ArgumentsCamelCase, Argv } from "yargs";
import { hashDocument, readJsonFile } from "../adapters/files";
import { resolveBitcoinEvidence, type BitcoinSource } from "../adapters/bitcoin-network";
import { resolveDidWebDocument } from "../adapters/did-web";
import { InputError } from "../domain/error";
import { gprLifecycle, validateGpr } from "../domain/gpr";
import { ExitCode, OUTPUT_VERSION, exitCodeFor, type CommandResult } from "../domain/result";
import { verifyLocal } from "../domain/verify";
import { verifyTimestamp } from "../domain/timestamp";
import { renderJson } from "../output/json";
import { renderHuman } from "../output/render";

interface VerifyArguments {
    document: string;
    gpr: string;
    json: boolean;
    publicKey?: string;
    didEvidence?: string;
    bitcoinSource: BitcoinSource;
    bitcoinCli?: string;
    offline: boolean;
}

export const command = "verify <document> <gpr>";
export const describe = "Verify a local document against a deployed GPR v1 record";

export function builder(yargs: Argv): Argv<VerifyArguments> {
    return yargs
        .positional("document", {
            type: "string",
            demandOption: true,
            describe: "Path to the original document",
        })
        .positional("gpr", {
            type: "string",
            demandOption: true,
            describe: "Path to the complete .gpr.json file",
        })
        .option("public-key", {
            type: "string",
            describe: "Explicit 32-byte Ed25519 public key in hexadecimal (reported as overridden)",
        })
        .option("did-evidence", {
            type: "string",
            describe: "Path to an offline did:web DID document",
        })
        .option("bitcoin-source", {
            choices: ["auto", "core", "public", "none"] as const,
            default: "auto" as const,
            describe: "Bitcoin trust source: local Core first, two public APIs, or none",
        })
        .option("bitcoin-cli", {
            type: "string",
            describe: "Path to bitcoin-cli when it is not available on PATH",
        })
        .option("offline", {
            type: "boolean",
            default: false,
            describe: "Disable DID and Bitcoin network access",
        })
        .option("json", {
            type: "boolean",
            default: false,
            describe: "Emit versioned JSON output",
        }) as unknown as Argv<VerifyArguments>;
}

export async function handler(argv: ArgumentsCamelCase<VerifyArguments>): Promise<void> {
    try {
        if (argv.publicKey && !/^[0-9a-f]{64}$/i.test(argv.publicKey)) {
            throw new InputError("--public-key must be exactly 64 hexadecimal characters");
        }
        const validation = validateGpr(await readJsonFile(argv.gpr));
        if (!validation.valid) {
            const result: CommandResult = {
                output_version: OUTPUT_VERSION,
                command: "verify",
                status: "failed",
                checks: [
                    {
                        name: "gpr_format",
                        status: "failed",
                        message: "GPR v1 structure or encodings are invalid",
                        details: validation.issues,
                    },
                ],
            };
            console.log(argv.json ? renderJson(result) : renderHuman(result));
            process.exitCode = exitCodeFor(result);
            return;
        }

        let didDocument: unknown;
        let didEvidenceSource: "provided-current" | "resolved-current" | undefined;
        let didResolutionWarning: string | undefined;
        if (argv.didEvidence) {
            didDocument = await readJsonFile(argv.didEvidence, "DID evidence");
            didEvidenceSource = "provided-current";
        } else if (!argv.offline) {
            try {
                didDocument = (await resolveDidWebDocument(validation.value.proof.key_id)).document;
                didEvidenceSource = "resolved-current";
            } catch (error) {
                didResolutionWarning = `Live DID resolution unavailable; institutional identity is unconfirmed (${message(error)})`;
            }
        }

        let bitcoinEvidence;
        let bitcoinResolutionWarning: string | undefined;
        const timestamp = verifyTimestamp(validation.value);
        if (
            timestamp.bitcoinHeight !== undefined &&
            !argv.offline &&
            argv.bitcoinSource !== "none"
        ) {
            try {
                const resolved = await resolveBitcoinEvidence(
                    timestamp.bitcoinHeight,
                    argv.bitcoinSource,
                    argv.bitcoinCli,
                );
                bitcoinEvidence = resolved.evidence;
                bitcoinResolutionWarning = resolved.warning;
            } catch (error) {
                bitcoinResolutionWarning = `Bitcoin verification unavailable (${message(error)})`;
            }
        }
        const documentHash = await hashDocument(argv.document);
        const result = await verifyLocal(documentHash, validation.value, {
            publicKeyHex: argv.publicKey?.toLowerCase(),
            didDocument,
            didEvidenceSource,
            didResolutionWarning:
                argv.offline && !argv.didEvidence
                    ? "Offline mode: institutional identity was not checked"
                    : didResolutionWarning,
            bitcoinEvidence,
            bitcoinResolutionWarning:
                argv.offline || argv.bitcoinSource === "none"
                    ? "Bitcoin network verification was disabled"
                    : bitcoinResolutionWarning,
        });
        result.lifecycle = gprLifecycle(validation.value);
        console.log(argv.json ? renderJson(result) : renderHuman(result));
        process.exitCode = exitCodeFor(result);
    } catch (error) {
        if (error instanceof InputError) {
            console.error(error.message);
            process.exitCode = ExitCode.Usage;
            return;
        }
        throw error;
    }
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
