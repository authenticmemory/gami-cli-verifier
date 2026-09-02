import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const [tarballArgument, outputArgument = "release"] = process.argv.slice(2);
if (!tarballArgument)
    throw new Error("Usage: create-release-artifacts.mjs <tarball> [output-directory]");
const tarball = resolve(tarballArgument);
const output = resolve(outputArgument);
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const pnpmEntrypoint = process.env.npm_execpath;
if (!pnpmEntrypoint?.includes("pnpm"))
    throw new Error("Run this script through pnpm release:artifacts");
const pnpmIsExecutable = /\.exe$/i.test(pnpmEntrypoint);
const pnpmCommand = pnpmIsExecutable ? pnpmEntrypoint : process.execPath;
const pnpmArguments = [
    ...(pnpmIsExecutable ? [] : [pnpmEntrypoint]),
    "list",
    "--prod",
    "--json",
    "--depth",
    "Infinity",
];
const dependencyTree = JSON.parse(
    execFileSync(pnpmCommand, pnpmArguments, { encoding: "utf8" }),
)[0];

const components = new Map();
function npmPurl(name, version) {
    const encodedName = name.startsWith("@")
        ? `%40${name.slice(1).split("/").map(encodeURIComponent).join("/")}`
        : encodeURIComponent(name);
    return `pkg:npm/${encodedName}@${version}`;
}
function collect(dependencies = {}) {
    for (const [name, dependency] of Object.entries(dependencies)) {
        const key = `${name}@${dependency.version}`;
        components.set(key, {
            type: "library",
            name,
            version: dependency.version,
            purl: npmPurl(name, dependency.version),
        });
        collect(dependency.dependencies);
    }
}
collect(dependencyTree.dependencies);
mkdirSync(output, { recursive: true });
const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
        component: { type: "application", name: packageJson.name, version: packageJson.version },
    },
    components: Array.from(components.values()).toSorted((left, right) =>
        left.purl.localeCompare(right.purl),
    ),
};
const sbomPath = resolve(output, "gami.cdx.json");
writeFileSync(sbomPath, `${JSON.stringify(sbom, null, 2)}\n`);

const files = [tarball, sbomPath];
const checksums = files
    .map(
        (file) =>
            `${createHash("sha256").update(readFileSync(file)).digest("hex")}  ${basename(file)}`,
    )
    .join("\n");
writeFileSync(resolve(output, "SHA256SUMS"), `${checksums}\n`);
console.log(`Created SBOM and checksums in ${output}`);
