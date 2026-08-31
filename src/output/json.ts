import type { CommandResult } from "../domain/result";

export function renderJson(result: CommandResult): string {
    return JSON.stringify(result, null, 2);
}
