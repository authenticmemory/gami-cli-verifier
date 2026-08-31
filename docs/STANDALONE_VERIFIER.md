# Standalone GAMI Verifier

## Decision

For this project, **standalone** means installable through npm, requiring Node.js
20 or newer, and running without the GAMI web application, database, or API.

The executable is `gami`. The package may expose only that command; names such as
`gami-verify` and `gv` are deliberately avoided so the public interface remains
simple and can grow beyond one subcommand.

## Purpose

The CLI independently evaluates evidence in a GAMI Proof Record. It must hash
documents locally, never upload their bytes, and never turn a request to the GAMI
API into a hidden prerequisite. Optional network access may resolve a live DID
document or obtain Bitcoin evidence, but those dependencies must be visible in
the result.

The verifier reports separate conclusions for:

1. **Format** — the record uses a supported schema and valid encodings.
2. **Integrity** — the supplied document matches the recorded SHA-256 digest.
3. **Signature** — the canonical record or batch root has a valid signature.
4. **Identity** — the signing key is authorized by the claimed institution.
5. **Timestamp** — the commitment is independently anchored in Bitcoin.

Each check has one of four states: `passed`, `failed`, `indeterminate`, or
`skipped`. Network failure is not evidence that a signature is invalid, and an
embedded public key proves control of that key rather than institutional
authorization.

## Threat model

The CLI assumes all input files, GPR fields, DID responses, caches, timestamp
proofs, and remote server responses may be malicious. It must therefore:

- reject malformed or unsupported records before cryptographic work;
- cap input sizes, nesting, Merkle paths, redirects, and network timeouts;
- canonicalize using the frozen GPR v1 omission rules;
- verify WebAuthn challenges and Merkle paths rather than trusting stored roots;
- distinguish live DID authorization, archived evidence, embedded keys, and
  caller-provided overrides;
- validate timestamp commitments against Bitcoin evidence rather than trusting a
  claimed block height;
- avoid printing document contents or secrets;
- return deterministic machine output and stable exit codes.

The CLI does not protect a compromised host, malicious Node.js runtime, or a
malicious package installed in place of an authentic release. Reproducible
builds, release checksums, provenance, and signed release artifacts reduce those
distribution risks.

## Independence and parity

The CLI must not import the web verifier as its implementation. Sharing that code
would let both verifiers agree while reproducing the same defect. Instead, the
web app and CLI should share a frozen protocol specification and conformance
fixtures containing expected bytes and results.

The frozen production invariants are:

- RFC 8785/JCS canonical form and exact optional-field omission rules;
- signature payload construction for raw Ed25519 and WebAuthn assertions;
- Merkle leaf, fold, sibling order, and odd-node promotion rules;
- raw OpenTimestamps tree storage in `proof.timestamp.ots_data`;
- exact pinned OpenTimestamps dependency versions.

## Commands and policies

The target verification interface is:

```text
gami inspect record.gpr.json
gami verify document.pdf record.gpr.json
gami verify document.pdf record.gpr.json --offline
gami verify document.pdf record.gpr.json --strict
gami verify document.pdf record.gpr.json --json
```

`--offline` forbids network access and reports missing external evidence as
indeterminate. `--strict` treats any required indeterminate check as an
unsuccessful verification. Explicit public-key or evidence overrides must be
reported in output and must never masquerade as live institutional authorization.

## Stable exit codes

| Code | Meaning                                            |
| ---: | -------------------------------------------------- |
|    0 | Every check required by the selected policy passed |
|    1 | Structural or cryptographic verification failed    |
|    2 | Verification was indeterminate                     |
|    3 | Invalid CLI usage or unreadable input              |
|    4 | Internal verifier failure                          |

## Implementation phases

### Phase 1 — contracts and format safety

- Replace template branding, package metadata, and commands.
- Establish `gami` as the sole executable.
- Document the trust model, output contract, and exit codes.
- Define the strict supported GPR v1 shape and encoding constraints.
- Implement `gami inspect` without making cryptographic claims.
- Parse standards-conforming `did:web` and `did:webvh` signing-key identifiers.
- Report the deployed record lifecycle: unsigned, signed, stamped, or upgraded.
- Add valid and adversarial fixtures with meaningful automated tests.

### Phase 2 — local cryptographic verification

- Implemented: stream SHA-256 hashing so multi-gigabyte archival files remain practical.
- Implemented: reproduce frozen JCS canonical bytes and omission rules independently.
- Implemented: verify raw Ed25519 and WebAuthn assertion signatures.
- Implemented: recompute batch Merkle roots and validate inclusion paths.
- Implemented: lock a real deployed batch-WebAuthn record as a golden vector.

Until identity and Bitcoin phases are complete, successful local cryptography
returns `indeterminate` with exit code `2`; it never claims complete GAMI proof
validity.

### Phase 3 — identity verification

- Resolve `did:web` safely with strict URL, redirect, size, and timeout policy.
- Validate `verificationMethod` and `assertionMethod` authorization.
- Support caller-supplied DID documents and clearly labeled embedded-key fallback.
- Model historical key authorization instead of treating the current DID document
  as proof of past authorization.

### Phase 4 — independent Bitcoin verification

- Parse GAMI's raw OpenTimestamps tree format.
- Recompute timestamp Merkle commitments.
- Validate attestations against independently obtained Bitcoin block evidence.
- Support offline evidence bundles and explicit Bitcoin backends.

### Phase 5 — distribution hardening

- Pin and audit security-critical dependencies.
- Test supported Node.js and operating-system combinations.
- Publish npm provenance, checksums, an SBOM, and signed release artifacts.
- Document reproducible verification of the distributed package.

## Output contract

Machine output is versioned independently of the package:

```json
{
    "output_version": "1",
    "command": "inspect",
    "status": "passed",
    "checks": [
        {
            "name": "gpr_format",
            "status": "passed",
            "message": "GPR v1 structure and encodings are valid"
        }
    ]
}
```

Fields may be added compatibly, but existing meanings must not change within an
output version. Human-readable wording is not a machine interface.
