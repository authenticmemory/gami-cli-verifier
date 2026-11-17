import {
    copyFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
    existsSync,
    readdirSync,
} from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const pkg = JSON.parse(readFileSync("package.json"));
const platform = { win32: "windows", darwin: "macos", linux: "linux" }[process.platform];
if (!platform) throw new Error("Unsupported platform");
const stem = `gami-verify-${pkg.version}-${platform}-${process.arch}`;
const output = resolve("release/downloads");
const stage = resolve("release/packages", stem);
mkdirSync(output, { recursive: true });
mkdirSync(stage, { recursive: true });
const executable = process.platform === "win32" ? "gami-verify.exe" : "gami-verify";
copyFileSync(resolve("release/standalone", executable), join(stage, executable));
copyFileSync("LICENSE", join(stage, "LICENSE"));
const runtimeLicense = await fetch(
    `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`,
);
if (!runtimeLicense.ok) throw new Error(`Cannot retrieve Node license: ${runtimeLicense.status}`);
writeFileSync(join(stage, "NODE-LICENSE.txt"), await runtimeLicense.text());
const metadata = JSON.parse(readFileSync("release/standalone/bundle-metadata.json"));
const packages = new Map();
for (const input of Object.keys(metadata.inputs).filter((p) => p.includes("node_modules/"))) {
    let directory = dirname(resolve(input));
    while (directory !== dirname(directory)) {
        const manifest = join(directory, "package.json");
        if (existsSync(manifest)) {
            const dep = JSON.parse(readFileSync(manifest));
            if (dep.name && dep.version) {
                packages.set(`${dep.name}@${dep.version}`, { directory, dep });
                break;
            }
        }
        directory = dirname(directory);
    }
}
let notices = "";
for (const [name, { directory, dep }] of packages) {
    notices += `\n=== ${name} (${dep.license ?? "see package"}) ===\n`;
    let licenseDirectory = directory;
    let licenses = [];
    while (licenseDirectory !== dirname(licenseDirectory)) {
        licenses = readdirSync(licenseDirectory).filter((f) =>
            /^(license|licence|copying|notice)([.-]|$)/i.test(f),
        );
        if (licenses.length) break;
        if (basename(dirname(licenseDirectory)) === "node_modules") break;
        licenseDirectory = dirname(licenseDirectory);
    }
    if (!licenses.length) throw new Error(`No license text found for bundled dependency ${name}`);
    for (const file of licenses)
        notices += `${readFileSync(join(licenseDirectory, file), "utf8")}\n`;
}
writeFileSync(join(stage, "THIRD-PARTY-NOTICES.txt"), notices);
writeFileSync(
    join(stage, "README.txt"),
    `GAMI Verify ${pkg.version}\n\nNo Node.js or npm installation required.\nExtract the entire archive. Open a terminal in this folder.\n${platform === "windows" ? ".\\gami-verify.exe" : "./gami-verify"} --help\n${platform === "windows" ? ".\\gami-verify.exe" : "./gami-verify"} verify document.pdf record.gpr.json --offline --json\n\nOffline verification can return exit 2 (indeterminate) when identity or Bitcoin evidence is missing.\nExit codes: 0 passed, 1 failed, 2 indeterminate, 3 input error, 4 internal error.\n\nmacOS builds are ad-hoc signed for testing only until Developer ID signing and notarization are configured.\nLinux requires glibc (not Alpine/musl).\nSource: https://github.com/authenticmemory/gami-cli-verifier\n`,
);
const archive = join(output, `${stem}${platform === "windows" ? ".zip" : ".tar.gz"}`);
if (platform === "windows") {
    // Paths are supplied through environment variables, never interpolated as shell code.
    execFileSync(
        "powershell.exe",
        [
            "-NoProfile",
            "-Command",
            'Compress-Archive -Path (Join-Path $env:GAMI_PACKAGE_STAGE "*") -DestinationPath $env:GAMI_PACKAGE_ARCHIVE -Force',
        ],
        {
            env: { ...process.env, GAMI_PACKAGE_STAGE: stage, GAMI_PACKAGE_ARCHIVE: archive },
            stdio: "inherit",
        },
    );
} else execFileSync("tar", ["-czf", archive, "-C", stage, "."], { stdio: "inherit" });
const sbom = join(output, `${stem}.cdx.json`);
writeFileSync(
    sbom,
    JSON.stringify(
        {
            bomFormat: "CycloneDX",
            specVersion: "1.6",
            version: 1,
            metadata: { component: { type: "application", name: pkg.name, version: pkg.version } },
            components: [
                { type: "application", name: "node", version: process.versions.node },
                ...[...packages.values()].map(({ dep }) => ({
                    type: "library",
                    name: dep.name,
                    version: dep.version,
                })),
            ],
        },
        null,
        2,
    ),
);
writeFileSync(
    join(output, `${stem}.sha256`),
    [archive, sbom]
        .map(
            (file) =>
                `${createHash("sha256").update(readFileSync(file)).digest("hex")}  ${basename(file)}\n`,
        )
        .join(""),
);
console.log(`Packaged ${archive}`);
