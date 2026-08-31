import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { InputError } from "../domain/error";

export const MAX_GPR_BYTES = 1024 * 1024;

export async function readJsonFile(path: string): Promise<unknown> {
    let info;

    try {
        info = await stat(path);
    } catch {
        throw new InputError(`Cannot read GPR file: ${path}`);
    }

    if (!info.isFile()) throw new InputError(`GPR path is not a file: ${path}`);

    if (info.size > MAX_GPR_BYTES)
        throw new InputError(`GPR file exceeds the ${MAX_GPR_BYTES}-byte safety limit`);

    let text: string;

    try {
        text = await readFile(path, "utf8");
    } catch {
        throw new InputError(`Cannot read GPR file: ${path}`);
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new InputError(`GPR file is not valid JSON: ${path}`);
    }
}

export async function hashDocument(path: string): Promise<string> {
    let info;
    try {
        info = await stat(path);
    } catch {
        throw new InputError(`Cannot read document: ${path}`);
    }
    if (!info.isFile()) throw new InputError(`Document path is not a file: ${path}`);

    const hash = createHash("sha256");
    try {
        for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    } catch {
        throw new InputError(`Cannot read document: ${path}`);
    }
    return `sha256:${hash.digest("hex")}`;
}
