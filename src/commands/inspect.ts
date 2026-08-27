import type { ArgumentsCamelCase, Argv } from "yargs";
import { readJsonFile } from "../adapters/files";
import { InputError } from "../domain/error";
import { gprLifecycle, validateGpr } from "../domain/gpr";
import { ExitCode, OUTPUT_VERSION, exitCodeFor, type CommandResult } from "../domain/result";
import { renderJson } from "../output/json";
import { renderHuman } from "../output/render";
interface InspectArguments {
    gpr: string;
    json: boolean;
}
export const command = "inspect <gpr>";
export const describe = "Validate the structure and encodings of a local GPR v1 file";
export function builder(yargs: Argv): Argv<InspectArguments> {
    return yargs
        .positional("gpr", {
            type: "string",
            demandOption: true,
            describe: "Path to a .gpr.json file",
        })
        .option("json", {
            type: "boolean",
            default: false,
            describe: "Emit versioned JSON output",
        });
}
export async function handler(argv: ArgumentsCamelCase<InspectArguments>): Promise<void> {
    try {
        const validation = validateGpr(await readJsonFile(argv.gpr));
        const result: CommandResult = validation.valid
            ? {
                  output_version: OUTPUT_VERSION,
                  command: "inspect",
                  status: "passed",
                  gpr_id: validation.value.id,
                  lifecycle: gprLifecycle(validation.value),
                  checks: [
                      {
                          name: "gpr_format",
                          status: "passed",
                          message: "GPR v1 structure and encodings are valid",
                      },
                  ],
              }
            : {
                  output_version: OUTPUT_VERSION,
                  command: "inspect",
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
    } catch (error) {
        if (error instanceof InputError) {
            console.error(error.message);
            process.exitCode = ExitCode.Usage;
            return;
        }
        throw error;
    }
}
