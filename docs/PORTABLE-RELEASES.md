# Portable verifier releases

The standalone executable is the existing verifier bundled with Node SEA.
It is not a second implementation. npm distribution remains supported.
End users do not install Node.js, npm or project dependencies.

## Build and test locally

Use Node 22 (CI pins 22.23.3) and pnpm 10.13.1:

```sh
pnpm install --frozen-lockfile
pnpm compile
pnpm lint
pnpm test --runInBand
pnpm build:standalone
pnpm test:standalone
pnpm package:standalone
```

The executable is `release/standalone/gami-verify.exe` on Windows or
`release/standalone/gami-verify` elsewhere. Archives, per-platform checksums and
CycloneDX inventories go into `release/downloads/`. Packaging downloads the
license for the exact embedded Node version from the official Node repository.
Archives include the project license and bundled dependency notices.

The smoke test copies only the executable into a temporary folder, removes
Node/npm from PATH, and checks help, version, JSON output, malformed input,
missing files, a real valid signature, a tampered signature, offline behavior,
and exit codes. It does not replace acceptance on a clean target machine.

## GitHub Actions setup (this repository)

Workflow: **Build standalone verifier**. Pull requests and manual branch runs
produce unsigned previews. Pushing a `test-v*` or `v*` tag runs signed Windows
and Linux builds. Manual runs selected on a tag also sign. Never move an existing
release tag to new code; push a fresh tag containing the workflow changes.

The matrix builds Windows x64, Linux x64/ARM64 and macOS Intel/Apple silicon.
Linux targets glibc systems, not Alpine/musl. macOS artifacts are explicitly
marked unsigned previews: ad-hoc signing lets them execute locally but is not
Developer ID signing or notarization. Do not advertise them as signed releases.

Configure these environments in **authenticmemory/gami-cli-verifier**, not only
in gami-hash. Protect both signing environments with tag rules `test-v*` and `v*`.
Keep `standalone-preview` free of signing secrets.

### Windows

Create `windows-signing` with environment variables `AZURE_CLIENT_ID`,
`AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`. Reuse the authorized Azure signing
identity only after adding its GitHub federated credential:

```text
Issuer: https://token.actions.githubusercontent.com
Subject: repo:authenticmemory@290849074/gami-cli-verifier@1347337260:environment:windows-signing
Audience: api://AzureADTokenExchange
```

The identity needs signing permission for the existing `gami-public-signing`
profile in `authenticmemorysigning`. The workflow signs `gami-verify.exe`, verifies the
full Authentic Memory legal organization and a timestamp, retests it, then
creates the ZIP and its checksums. Local builds are not organization-signed.

### Linux

Create `linux-signing` with:

| Kind     | Name                        | Value                                      |
| -------- | --------------------------- | ------------------------------------------ |
| Secret   | `LINUX_SIGNING_PRIVATE_KEY` | Entire armored secret-subkey export        |
| Secret   | `LINUX_SIGNING_PASSPHRASE`  | Exported signing subkey's passphrase       |
| Variable | `LINUX_SIGNING_FINGERPRINT` | `EC8558C864C9D2A41AC419B7FA5C4B8C1395EC9E` |

These can use the existing Linux release key. Do not put the private export in
the repository or website. The workflow signs the tarball, SBOM and checksum
file, verifies signatures in a separate public-only keyring, and includes the
public key and fingerprint. This is detached OpenPGP signing, not an APT/RPM
repository signature.

## Retrieve and publish

1. Push committed changes and a fresh test tag. Open **Actions → Build standalone
   verifier** and confirm every relevant platform job passed.
2. Download the matching workflow artifact. Inside that outer GitHub ZIP is the
   actual distribution ZIP/tarball, checksums, SBOM and (Linux) signatures.
3. Have an independent user test the archive on the target OS without Node/npm.
   Test an original document/GPR pair, a changed document, offline mode, and JSON
   output. Exit 2 is an incomplete verification, not a successful full proof.
4. Publish the approved archives to a public release or copy them into the
   website's `public/downloads/gami-verifier/` directory. The workflow deliberately
   does not race the existing npm release workflow or attach unsigned previews
   to a public release. Actions artifacts expire after 30 days.
5. Set the matching `archive`, `checksum`, and Linux `signature` URLs in
   `AuthenticMemory_Website/src/data/verifier-downloads.ts`. Use versioned URLs.
   Both Technology and For Institutions consume this single manifest. Null URLs
   keep unavailable builds unlinked. Do not link private Actions artifact URLs.
6. Build the website and confirm that the public links work without GitHub login.

## User installation and verification

### Windows

Download the ZIP and matching `.sha256` file into Downloads. In PowerShell:

```powershell
cd "$HOME\Downloads"
Get-FileHash .\gami-verify-0.2.0-windows-x64.zip -Algorithm SHA256
Get-Content .\gami-verify-0.2.0-windows-x64.sha256
```

Compare the entire hash with the line ending in `.zip` (case does not matter).
If different, stop. Right-click the ZIP → Extract All. Open PowerShell in the
extracted folder, then run:

```powershell
$signature = Get-AuthenticodeSignature .\gami-verify.exe
$signature.Status
$signature.SignerCertificate.Subject
$signature.TimeStamperCertificate.Subject
.\gami-verify.exe --help
.\gami-verify.exe verify "C:\Documents\original.pdf" "C:\Documents\record.gpr.json" --offline --json
$LASTEXITCODE
```

Status must be `Valid`, the signer must be Authentic Memory's legal organization,
and the timestamp certificate must be present. A SmartScreen reputation warning
can still appear for a new correctly signed executable.

### Linux

Obtain the public key from the Authentic Memory website and compare its primary
fingerprint with the one published independently on that website. With GnuPG:

```sh
gpg --show-keys --with-fingerprint gami-linux-signing-key.asc
gpg --import gami-linux-signing-key.asc
gpg --verify gami-verify-0.2.0-linux-x64.tar.gz.asc gami-verify-0.2.0-linux-x64.tar.gz
gpg --verify gami-verify-0.2.0-linux-x64.sha256.asc gami-verify-0.2.0-linux-x64.sha256
sha256sum --check gami-verify-0.2.0-linux-x64.sha256
mkdir gami-verifier
tar -xzf gami-verify-0.2.0-linux-x64.tar.gz -C gami-verifier
cd gami-verifier
./gami-verify --help
./gami-verify verify /path/to/original.pdf /path/to/record.gpr.json --offline --json
echo $?
```

Keep the SBOM alongside the archive when checking the checksum file. Substitute
`arm64` for `x64` on ARM64 Linux. A GnuPG trust warning means you still need to
authenticate the fingerprint; a bad signature means stop.

## Maintenance

The embedded Node runtime does not update itself. Rebuild and re-sign whenever
the runtime or bundled dependencies need a security update. Keep the runtime
pin reviewed. The bundled dependency inventory is not a complete native Node
component inventory; Node's license file includes its native third-party notices.
Native Linux/macOS execution and cloud signing must pass CI before public release.

Implementation reference: [Node single-executable applications](https://nodejs.org/download/release/latest-jod/docs/api/single-executable-applications.html).
