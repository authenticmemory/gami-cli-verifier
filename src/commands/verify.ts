import type { ArgumentsCamelCase, Argv } from "yargs";
import { hashDocument, MAX_BITCOIN_EVIDENCE_BYTES, readJsonFile } from "../adapters/files";
import { InputError } from "../domain/error";
import { gprLifecycle, validateGpr } from "../domain/gpr";
import { ExitCode, OUTPUT_VERSION, exitCodeFor, type CommandResult } from "../domain/result";
import { verifyLocal } from "../domain/verify";
import { renderJson } from "../output/json";
import { renderHuman } from "../output/render";

interface VerifyArguments {
    document: string;
    gpr: string;
    json: boolean;
    publicKey?: string;
    didEvidence?: string;
    bitcoinEvidence?: string;
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
        .option("bitcoin-evidence", {
            type: "string",
            describe: "Path to an offline Bitcoin header-chain evidence bundle",
        })
        .option("json", {
            type: "boolean",
            default: false,
            describe: "Emit versioned JSON output",
        });
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

        const didDocument = argv.didEvidence
            ? await readJsonFile(argv.didEvidence, "DID evidence")
            : undefined;
        const bitcoinEvidence = argv.bitcoinEvidence
            ? await readJsonFile(
                  argv.bitcoinEvidence,
                  "Bitcoin evidence",
                  MAX_BITCOIN_EVIDENCE_BYTES,
              )
            : undefined;
        const documentHash = await hashDocument(argv.document);
        const result = await verifyLocal(documentHash, validation.value, {
            publicKeyHex: argv.publicKey?.toLowerCase(),
            didDocument,
            bitcoinEvidence,
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
