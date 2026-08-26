import { describe, expect, it } from "@jest/globals";
import { ExitCode, OUTPUT_VERSION, exitCodeFor, type CommandResult } from "./result";

const result = (status: CommandResult["status"]): CommandResult => ({
    output_version: OUTPUT_VERSION,
    command: "inspect",
    status,
    checks: [],
});

describe("exitCodeFor", () => {
    it("keeps the documented process contract stable", () => {
        expect(exitCodeFor(result("passed"))).toBe(ExitCode.Success);
        expect(exitCodeFor(result("failed"))).toBe(ExitCode.Failed);
        expect(exitCodeFor(result("indeterminate"))).toBe(ExitCode.Indeterminate);
    });
});
