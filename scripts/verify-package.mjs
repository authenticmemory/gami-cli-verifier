import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const report = JSON.parse(
    execFileSync(npm, ["pack", "--dry-run", "--json"], {
        encoding: "utf8",
        shell: process.platform === "win32",
    }),
)[0];
const paths = report.files.map((file) => file.path).toSorted();
const required = ["LICENSE", "README.md", "bin/run", "dist/run.js", "package.json"];
for (const path of required) {
    if (!paths.includes(path)) throw new Error(`npm package is missing ${path}`);
}
for (const path of paths) {
    if (!required.includes(path) && !path.startsWith("dist/"))
        throw new Error(`npm package contains unexpected file ${path}`);
}
for (const [name, range] of Object.entries(packageJson.dependencies)) {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(range))
        throw new Error(`runtime dependency ${name} is not exactly pinned: ${range}`);
}
if (packageJson.bin?.gami !== "./bin/run") throw new Error("package exposes an unexpected CLI");
console.log(
    `Package check passed: ${report.filename} (${report.size} bytes, ${paths.length} files)`,
);
