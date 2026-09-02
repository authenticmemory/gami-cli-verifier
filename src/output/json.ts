import type { CommandResult } from "../domain/result";
import { verifierInfo } from "../domain/build-info";

export function renderJson(result: CommandResult): string {
    return JSON.stringify({ ...result, verifier: verifierInfo() }, null, 2);
}
