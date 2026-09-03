import type { ArgumentsCamelCase, Argv } from "yargs";
import { verifierInfo } from "../domain/build-info";

interface VersionArguments {
    json: boolean;
}

export const command = "version";
export const describe = "Show the verifier version and supported Bitcoin sources";

export function builder(yargs: Argv): Argv<VersionArguments> {
    return yargs.option("json", {
        type: "boolean",
        default: false,
        describe: "Emit machine-readable JSON",
    });
}

export function handler(argv: ArgumentsCamelCase<VersionArguments>): void {
    const info = verifierInfo();
    if (argv.json) {
        console.log(JSON.stringify(info, null, 2));
        return;
    }
    console.log(`${info.name} ${info.version}`);
    console.log(`Node.js ${info.node}`);
    console.log(`Bitcoin sources: ${info.bitcoin_sources.join(", ")}`);
}
