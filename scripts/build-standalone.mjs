import { build } from "esbuild";
import { inject } from "postject";
import { mkdir, copyFile, readFile, writeFile, chmod, readdir, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const dir = resolve("release/standalone");
await mkdir(dir, { recursive: true });
const main = resolve(dir, "main.cjs");
await build({
    entryPoints: ["bin/run.ts"],
    outfile: main,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    metafile: true,
    define: { "import.meta.url": "seaModuleUrl" },
    banner: {
        js: 'const seaModuleUrl = require("node:url").pathToFileURL(process.execPath).href;',
    },
    logLevel: "info",
}).then(async (result) => {
    const external = Object.values(result.metafile.outputs)
        .flatMap((o) => o.imports)
        .filter(
            (i) => i.external && !i.path.startsWith("node:") && !process.getBuiltinModule(i.path),
        );
    if (external.length) throw new Error(`Unbundled dependencies: ${JSON.stringify(external)}`);
    await writeFile(resolve(dir, "bundle-metadata.json"), JSON.stringify(result.metafile, null, 2));
});
const blob = resolve(dir, "sea.blob");
const config = resolve(dir, "sea.json");
await writeFile(
    config,
    JSON.stringify({
        main,
        output: blob,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
    }),
);
execFileSync(process.execPath, ["--experimental-sea-config", config], { stdio: "inherit" });
const executable = resolve(dir, process.platform === "win32" ? "gami-verify.exe" : "gami-verify");
await copyFile(process.execPath, executable);
if (process.platform === "win32") {
    // Remove Node's Authenticode certificate before postject rewrites PE resources.
    // Leaving it in place can produce an executable that runs but cannot be signed.
    let signtool = process.env.SIGNTOOL_PATH;
    if (!signtool) {
        const sdk = resolve(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Windows Kits/10/bin");
        const versions = (await readdir(sdk)).filter((name) => /^10\./.test(name))
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
        for (const version of versions) {
            const candidate = resolve(sdk, version, process.arch, "signtool.exe");
            try { await access(candidate); signtool = candidate; break; } catch { /* Try another SDK. */ }
        }
    }
    if (!signtool) throw new Error("Install the Windows SDK or set SIGNTOOL_PATH before building the Windows executable");
    execFileSync(signtool, ["remove", "/s", executable], { stdio: "inherit" });
}
if (process.platform === "darwin") execFileSync("codesign", ["--remove-signature", executable]);
await inject(executable, "NODE_SEA_BLOB", await readFile(blob), {
    sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
    ...(process.platform === "darwin" ? { machoSegmentName: "NODE_SEA" } : {}),
});
await chmod(executable, 0o755);
if (process.platform === "darwin") execFileSync("codesign", ["--sign", "-", executable]);
console.log(`Built ${executable} with ${process.version} (${process.platform}/${process.arch})`);
