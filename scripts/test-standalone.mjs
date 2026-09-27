import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "gami-portable-"));
const name = process.platform === "win32" ? "gami-verify.exe" : "gami-verify";
const binary = join(root, name);
try {
    copyFileSync(
        process.argv[2] ? resolve(process.argv[2]) : resolve("release/standalone", name),
        binary,
    );
    const fixtures = resolve("test/fixtures");
    const env = { ...process.env };
    for (const key of Object.keys(env)) {
        if (/^(path|node_path|node_options)$/i.test(key)) delete env[key];
    }
    env.PATH = root; // No node/npm, node_modules or source files beside the executable.
    const run = (args, expected) => {
        const result = spawnSync(binary, args, {
            cwd: root,
            env,
            encoding: "utf8",
            timeout: 30000,
        });
        assert.ifError(result.error);
        assert.equal(
            result.status,
            expected,
            `${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
        );
        return result.stdout;
    };
    assert.match(run(["--help"], 0), /gami-verify verify/);
    assert.equal(run(["--version"], 0).trim(), JSON.parse(readFileSync("package.json")).version);
    assert.equal(
        JSON.parse(run(["inspect", join(fixtures, "valid-unsigned.gpr.json"), "--json"], 0)).status,
        "passed",
    );
    assert.equal(
        JSON.parse(run(["inspect", join(fixtures, "invalid-unknown-field.gpr.json"), "--json"], 1))
            .status,
        "failed",
    );
    run(["inspect", join(root, "missing.json"), "--json"], 3);
    const record = join(fixtures, "production/phase4-single-upgraded.gpr.json");
    const result = JSON.parse(run(["verify", record, "--offline", "--json"], 2));
    assert.equal(result.status, "indeterminate");
    assert.ok(
        result.checks.some((c) => c.name === "signature_math" && c.status === "passed"),
        JSON.stringify(result),
    );
    const altered = JSON.parse(readFileSync(record));
    altered.proof.signature = `ed25519:${"00".repeat(64)}`;
    const bad = join(root, "tampered.gpr.json");
    writeFileSync(bad, JSON.stringify(altered));
    const tampered = JSON.parse(run(["verify", bad, "--offline", "--json"], 1));
    assert.ok(tampered.checks.some((c) => c.name === "gpr_format" && c.status === "passed"));
    assert.ok(tampered.checks.some((c) => c.name === "signature_math" && c.status === "failed"));
    console.log(
        "Standalone help, version, valid/invalid input, offline signature, tampering and exit-code tests passed without Node/npm on PATH.",
    );
} finally {
    rmSync(root, { recursive: true, force: true });
}
