# GAMI CLI

`gami` is the independent command-line verifier for GAMI Proof Records (GPRs).
It is distributed through npm, requires Node.js 20 or newer, and does not need
the GAMI web application, database, or API to inspect local records.

Phase 2 validates the structure of a local GPR, streams the document through
SHA-256, and independently verifies deployed raw-Ed25519 and WebAuthn/Merkle
signatures. DID authorization and Bitcoin verification are not implemented yet,
so locally successful verification is deliberately reported as indeterminate.

## Install and run

```sh
npm install --global @authenticmemory/gami
gami --help
gami inspect ./record.gpr.json
gami inspect ./record.gpr.json --json
gami verify ./document.pdf ./record.gpr.json
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
- `--json`: emit the versioned machine-readable result.

A successful Phase 2 run exits `2`, not `0`, because institutional DID
authorization and Bitcoin anchoring remain unverified. A local mismatch or bad
signature exits `1`.

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

Phase 2 proves local document integrity and signature mathematics. It does not
yet prove that the signing key was authorized by the named institution or that
the timestamp is anchored in Bitcoin.

## License

MIT
