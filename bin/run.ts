import yargs, { CommandModule } from "yargs";
import { hideBin } from "yargs/helpers";
import { commands } from "../src";
import packageJson from "../package.json";

const run = yargs(hideBin(process.argv));

run.scriptName("gami").usage("$0 <command> [options]").version(packageJson.version);

for (const command of commands) {
    run.command(command as unknown as CommandModule);
}

void run
    .demandCommand(1, "Choose a command. Run gami --help for usage.")
    .strict()
    .recommendCommands()
    .help()
    .parseAsync()
    .catch((error: unknown) => {
        process.exitCode = 4;
        console.error(error instanceof Error ? error.message : String(error));
    });
