# GAMI CLI

`gami` is the independent command-line verifier for GAMI Proof Records (GPRs).
It is distributed through npm, requires Node.js 20 or newer, and does not need
the GAMI web application, database, or API to inspect local records.

Phase 1 establishes the verifier's public contracts. It validates the structure
of a local GPR, produces stable human and JSON output, and uses documented exit
codes. It **does not yet claim cryptographic verification**. Hash, signature,
DID authorization, and Bitcoin verification are subsequent phases.

## Install and run

```sh
npm install --global @authenticmemory/gami
gami --help
gami inspect ./record.gpr.json
gami inspect ./record.gpr.json --json
```

During development:

```sh
pnpm install
pnpm start -- inspect test/fixtures/valid-unsigned.gpr.json
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

Do not use Phase 1 structural validation as proof that a document is authentic.
Until the later verification phases ship, use the GAMI web verifier for the
implemented cryptographic checks and account for its documented trust limits.

## License

MIT
