# Release policy

The npm package is part of the verifier's trust boundary. Reviewing source code is
not enough: users must be able to connect the installed tarball to the reviewed
Git commit and understand which external trust sources it can use.

## Bitcoin trust sources

The verifier first asks a caller-operated Bitcoin Core node for the canonical
block hash and header. If Core is unavailable, `auto` requires Blockstream and
mempool.space to return the same block hash and validates the returned header and
proof of work. Provider agreement is weaker than an independently operated node
and discloses the queried height and caller IP address.

```sh
bitcoin-cli getblockhash <height>
```

`gami version --json` discloses the supported sources. Provider additions or trust
policy changes require ordinary code review and a minor-version release.

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
npm view @authenticmemory/gami@0.2.0 dist.integrity
npm install --global @authenticmemory/gami@0.2.0
gami version --json
gh attestation verify gami-0.2.0.tgz --repo authenticmemory/gami-cli-verifier
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
