# Release and checkpoint policy

The npm package is part of the verifier's trust boundary. Reviewing source code is
not enough: users must be able to connect the installed tarball to the reviewed
Git commit and see which Bitcoin checkpoint it trusts.

## Bitcoin checkpoints

`src/domain/bitcoin.ts` is the authoritative checkpoint list. A checkpoint may be
added only when all of these conditions are met:

1. its block header satisfies Bitcoin proof of work;
2. its hash and height agree across at least two independent data sources;
3. it has at least 100 confirmations when selected;
4. the pull request records the sources, observation date, and reviewer;
5. tests reject a changed hash and evidence that does not link to the checkpoint.

Checkpoint 965005 was observed on 2026-09-02. Blockstream and mempool.space both
returned `0000000000000000000176c1e042b4f8712d984f559e4db6ddb9b46a538611a0`.
The fixture additionally verifies the raw header's proof of work and chain links.

Agreement between websites is evidence, not absolute authority. For a production
release, a maintainer should also confirm the checkpoint using an independently
operated Bitcoin Core node:

```sh
bitcoin-cli getblockhash 965005
```

Checkpoint changes require ordinary code review. They must never be fetched or
silently replaced at runtime. `gami version --json` discloses the exact checkpoint
compiled into an installed release.

## Release procedure

1. Merge a reviewed commit only after CI passes on Node.js 20, 22, and 24 and on
   Linux, macOS, and Windows.
2. Set the package version and create a signed `v<version>` Git tag on that commit.
3. Push the tag. The release workflow rebuilds, tests, checks the npm contents,
   creates a CycloneDX SBOM and SHA-256 checksum list, and publishes with npm's
   OIDC provenance.
4. GitHub creates signed build-provenance attestations for the tarball, SBOM, and
   checksum file before publication.
5. Verify the public result from a clean directory.

```sh
npm view @authenticmemory/gami@0.1.0 dist.integrity
npm install --global @authenticmemory/gami@0.1.0
gami version --json
gh attestation verify gami-0.1.0.tgz --repo authenticmemory/gami-cli-verifier
sha256sum --check SHA256SUMS
```

The npm trusted publisher must be configured for the `npm` GitHub environment.
No long-lived npm token is required by the workflow. Manual workflow dispatch is
a dry run: it builds and attests artifacts but deliberately does not publish.

## Reproducibility boundary

Runtime dependencies use exact versions and the lockfile is installed frozen.
The tarball contains only `package.json`, `README.md`, `LICENSE`, `bin/run`, and
the compiled `dist` files. `pnpm package:check` enforces this allowlist.

Byte-for-byte reproduction requires the same Git commit, Node.js 24, pnpm
10.13.1, npm 12.0.2, and clean checkout. The signed provenance records the
official build; checksums detect any later byte change.
