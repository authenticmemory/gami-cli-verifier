# GAMI CLI

`gami` is the independent command-line verifier for GAMI Proof Records (GPRs).
It is distributed through npm, requires Node.js 20 or newer, and does not need
the GAMI web application, database, or API to inspect local records.

The verifier validates the structure of a local GPR, streams the document through
SHA-256, and independently verifies deployed raw-Ed25519 and WebAuthn/Merkle
signatures. Phase 3A can additionally verify current `did:web` authorization from
a caller-supplied DID document. Phase 4 verifies GAMI's raw OpenTimestamps proof
and can establish Bitcoin mainnet membership from an offline header-chain bundle
connected to a package-pinned checkpoint.

## Install and run

```sh
npm install --global @authenticmemory/gami
gami --help
gami version --json
gami inspect ./record.gpr.json
gami inspect ./record.gpr.json --json
gami verify ./document.pdf ./record.gpr.json
gami verify ./document.pdf ./record.gpr.json --did-evidence ./institution.did.json
gami verify ./document.pdf ./record.gpr.json --bitcoin-evidence ./bitcoin-evidence.json
gami verify ./document.pdf ./record.gpr.json --json
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

### `gami inspect <gpr>`

Parses a GPR JSON file and validates the frozen GPR v1 envelope and field
encodings. This is structural validation only; a structurally valid record may
still contain a false hash, invalid signature, unauthorized identity, or invalid
timestamp.

Options:

- `--json`: emit the versioned machine-readable result.

### `gami verify <document> <gpr>`

Streams and hashes the local document, compares it with `subject.file_hash`,
reconstructs the deployed v1 signing payload and any batch Merkle path, and
verifies the raw Ed25519 or WebAuthn Ed25519 signature.

Options:

- `--public-key <hex>`: override the embedded 32-byte Ed25519 key; the result
  reports the key source as `overridden`.
- `--did-evidence <path>`: verify the exact GPR signing key against
  `assertionMethod` in a caller-supplied current `did:web` document. No network,
  registry, API, or database lookup is performed.
- `--bitcoin-evidence <path>`: verify the raw OTS proof against offline Bitcoin
  headers connected to a checkpoint pinned by this package. No calendar, block
  explorer, Bitcoin node, or GAMI service is contacted.
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

Phase 3A can prove that the signing key is authorized in a supplied current
`did:web` document. It does not prove historical authorization at signing time.
Native `did:webvh` history remains pending. Bitcoin verification is offline and
depends on explicit evidence connected to a checkpoint pinned by the installed
CLI release.

Every JSON result includes the package version, Node.js version, and pinned
Bitcoin checkpoints. Releases are tested from the packed npm tarball and publish
checksums, a CycloneDX SBOM, npm provenance, and GitHub build attestations. See
[docs/RELEASING.md](docs/RELEASING.md) for the checkpoint-review and release
verification procedure.

## License

MIT
