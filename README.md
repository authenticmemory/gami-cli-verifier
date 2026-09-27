# GAMI Verify

`gami-verify` is the independent command-line verifier for GAMI Proof Records (GPRs).
It supports npm installation (Node.js 20 or newer) and standalone executable
builds that include Node.js. Neither needs the GAMI web application, database,
or API to inspect local records. See [standalone downloads and signing](docs/PORTABLE-RELEASES.md)
for build, release and installation instructions.

The verifier validates the structure of a local GPR, streams the document through
SHA-256, and independently verifies deployed raw-Ed25519 and WebAuthn/Merkle
signatures. It verifies current `did:web` authorization using supplied evidence or
direct HTTPS resolution. It verifies pinned historical `did:webvh` authorization
from the `?versionId=` in `proof.key_id`; it does not resolve HEAD for those
records. It verifies OpenTimestamps anchors using a local Bitcoin Core node or
agreement between Blockstream and mempool.space. It never needs the GAMI
application or registry to validate a supplied GPR.

## Install and run

For a standalone release, extract the archive and open a terminal in its folder.
Run `.\gami-verify.exe --help` on Windows, or `./gami-verify --help` on Linux/macOS.
No separate Node.js or npm installation is required. Public download availability
depends on completion of the platform signing and acceptance gates.

The next release renames the executable from `gami` to `gami-verify`. Update any
scripts that invoke the old command. The npm package name stays `@authenticmemory/gami`.

For npm installation:

```sh
npm install --global @authenticmemory/gami
gami-verify --help
gami-verify version --json
gami-verify inspect ./first.gpr.json ./second.gpr.json
gami-verify inspect ./record.gpr.json --json
gami-verify verify ./document.pdf ./record.gpr.json
gami-verify verify ./document.pdf ./record.gpr.json --did-evidence ./institution.did.json
gami-verify verify ./document.pdf ./record.gpr.json --bitcoin-source core
gami-verify verify ./document.pdf ./record.gpr.json --bitcoin-source public
gami-verify verify ./document.pdf ./record.gpr.json --offline
gami-verify verify ./document.pdf ./record.gpr.json --json
gami-verify verify ./placeholder-record.gpr.json
```

During development:

```sh
pnpm install
pnpm start inspect test/fixtures/valid-unsigned.gpr.json
pnpm test
pnpm compile
pnpm build
```

## Commands

### `gami-verify inspect <gpr..>`

Parses a GPR JSON file and validates the frozen GPR v1 envelope and field
encodings. This is structural validation only; a structurally valid record may
still contain a false hash, invalid signature, unauthorized identity, or invalid
timestamp.

Options:

- `--json`: emit one versioned JSON object per input as newline-delimited JSON.

### `gami-verify verify <document> <gpr>`

Streams and hashes the local document, compares it with `subject.file_hash`,
reconstructs the deployed v1 signing payload and any batch Merkle path, and
verifies the raw Ed25519 or WebAuthn Ed25519 signature.

### `gami-verify verify <gpr>`

Verifies a GPR when no original file is available. The document hash check is
reported as skipped; signature, DID authorization, and timestamp checks still
run.

Options:

- `--public-key <hex>`: override the embedded 32-byte Ed25519 key; the result
  reports the key source as `overridden`.
- `--did-evidence <path>`: use a caller-supplied current `did:web` document.
  Without this option, the CLI resolves `did:web` documents directly from
  `proof.key_id`. For `did:webvh`, the CLI fetches `did.jsonl` and resolves the
  exact `?versionId=` in `proof.key_id`, never HEAD.
- `--bitcoin-source <auto|core|public|none>`: `auto` tries local Bitcoin Core and
  then requires Blockstream and mempool.space to agree; default `auto`.
- `--bitcoin-cli <path>`: path to `bitcoin-cli` when it is not on `PATH`.
- `--offline`: disable all DID and Bitcoin network access. Supplied DID evidence
  is still checked, but Bitcoin chain membership remains indeterminate.
- `--json`: emit the versioned machine-readable result.

A run exits `0` only when file integrity, signature mathematics, institutional
authorization, and Bitcoin anchoring all pass. Missing DID or Bitcoin evidence
returns `2`; malformed or contradictory evidence returns `1`.

## Exit codes

| Code | Meaning                                                                  |
| ---: | ------------------------------------------------------------------------ |
|    0 | Every check required by the command passed                               |
|    1 | The supplied evidence failed validation or verification                  |
|    2 | Verification was indeterminate because required evidence was unavailable |
|    3 | Invalid usage or unreadable input                                        |
|    4 | Internal verifier failure                                                |

The architecture, trust model, implementation phases, and release requirements
are documented in [docs/STANDALONE_VERIFIER.md](docs/STANDALONE_VERIFIER.md).

## Security

Current `did:web` resolution proves current authorization, not authorization at
the historical signing time. `did:webvh` records must carry `?versionId=` in
`proof.key_id`; the verifier resolves that historical DID log version and reports
the signature key as active or archived. Public Bitcoin verification reveals the
requested block height and the user's IP address to both providers; local Bitcoin
Core is the stronger and more private source.

Every JSON result includes the package version, Node.js version, and supported
Bitcoin sources. Releases are tested from the packed npm tarball and publish
checksums, a CycloneDX SBOM, npm provenance, and GitHub build attestations. See
[docs/RELEASING.md](docs/RELEASING.md) for the release
verification procedure.

## License

MIT
