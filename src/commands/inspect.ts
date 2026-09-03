import type { ArgumentsCamelCase, Argv } from "yargs";
import { readJsonFile } from "../adapters/files";
import { InputError } from "../domain/error";
import { gprLifecycle, validateGpr } from "../domain/gpr";
import { ExitCode, OUTPUT_VERSION, type CommandResult } from "../domain/result";
import { renderJson } from "../output/json";
import { renderHuman } from "../output/render";
interface InspectArguments {
    gpr: string[];
    json: boolean;
}
export const command = "inspect <gpr..>";
export const describe = "Validate one or more local GPR v1 files";
export function builder(yargs: Argv): Argv<InspectArguments> {
    return yargs
        .positional("gpr", {
            type: "string",
            array: true,
            demandOption: true,
            describe: "Paths to one or more .gpr.json files",
        })
        .option("json", {
            type: "boolean",
            default: false,
            describe: "Emit versioned JSON output",
        });
}
export async function handler(argv: ArgumentsCamelCase<InspectArguments>): Promise<void> {
    try {
        const results = await Promise.all(
            argv.gpr.map(async (path) => {
                const validation = validateGpr(await readJsonFile(path));
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
                return { path, result };
            }),
        );
        if (argv.json) {
            // NDJSON keeps every record independently versioned and stream-friendly.
            console.log(
                results.map(({ path, result }) => renderJson({ ...result, path })).join("\n"),
            );
        } else {
            console.log(
                results.map(({ path, result }) => `${path}\n${renderHuman(result)}`).join("\n\n"),
            );
        }
        process.exitCode = results.some(({ result }) => result.status === "failed")
            ? ExitCode.Failed
            : ExitCode.Success;
    } catch (error) {
        if (error instanceof InputError) {
            console.error(error.message);
            process.exitCode = ExitCode.Usage;
            return;
        }
        throw error;
    }
}
