# GAMI batch fixture — two records, one signature, one Bitcoin block

A genuine batch from GAMI staging: two records signed in a **single YubiKey touch** and
anchored with **one** OpenTimestamps submission. Both Merkle trees are non-degenerate, so
a verifier exercises the real thing rather than the empty-path shortcut.

    batch_id            urn:uuid:95e5a57b-f423-45ce-9653-9df436c7f919
    signing root        26e6d60ad5abbf9586fc…      (proof.merkle_root)
    timestamp root      4fae6ef0c013b927b493…      (proof.timestamp.merkle_root)
    Bitcoin block       965149, mined 2026-09-02T10:02:13Z

    original/gami-batch-test-a.txt   234 B  sha256:6384d0bd…e3c3a568
    original/gami-batch-test-b.txt   195 B  sha256:8c8f8f52…3988fa9d

Each member appears in **two states**:

    <uuid>-stamped/    signed + submitted to the calendar, no Bitcoin attestation yet
    <uuid>-upgraded/   the same record after the Bitcoin proof came back

The `-stamped/` copies are a bonus you did not ask for. They are the one combination you
had no fixture for — **batched AND pending** — where the `.ots` carries the synthesised
inclusion path but no Bitcoin attestation. A verifier must fold to the batch root and then
report *pending*: not an error, not a failure. `upgraded: false` there is the correct
answer, not a broken fixture.

## Per state

| File | What it is |
|---|---|
| `<uuid>.gpr.json` | the stored record, verbatim |
| `<uuid>.canonical.json` | JCS form the OTS proof commits to. SHA-256 == `proof.timestamp.document_hash` |
| `<uuid>.signing.json` | JCS form the signature covers |
| `<uuid>.ots` | DetachedTimestampFile for **this record's own** `document_hash` |
| `<uuid>.blockheader.hex` | the real 80-byte Bitcoin header (upgraded only) |
| `MANIFEST.json` | every derived digest, spelled out |

## The two Merkle trees, both non-empty here

This is the whole point of the fixture. They share field names and are otherwise unrelated.

| Field | Tree | This batch |
|---|---|---|
| `proof.merkle_path` / `proof.merkle_root` | **signing** — folds `SHA256(signing.json)` to the root that was signed, which is the WebAuthn challenge | a: `right`, b: `left`, root `26e6d60a…` |
| `proof.timestamp.merkle_path` / `.merkle_root` | **timestamp** — folds `document_hash` to the root submitted to the calendar | a: `right`, b: `left`, root `4fae6ef0…` |

A sits right and B sits left on both trees, so the pair exercises prepend and append in
each. Folding with the sides swapped will still produce a 32-byte value that simply is not
the root, which is the failure mode worth having a fixture for.

Note `proof.batch_id` and `proof.merkle_root` are **excluded** from `signing.json` and
**included** in `canonical.json`. Getting that backwards makes `document_hash`
irreproducible, and it is the single most common way to get this wrong.

## Verifying

**1. File hash.** `SHA256(original/…txt)` == `subject.file_hash`. Separate from the
timestamp: we timestamp the *record*, not your file. Your file's integrity rides in
`subject.file_hash` inside the record, and the record is what goes to Bitcoin.

**2. Signature — WebAuthn, and batched.**

    signed message = authenticator_data || SHA256(client_data_json)
    clientDataJSON.challenge == fold(SHA256(signing.json), proof.merkle_path)

The fold is non-trivial here: `proof.merkle_path` has one step, so the challenge is the
signing root `26e6d60a…`, not `SHA256(signing.json)`. Both members carry the *same*
signature — one touch sealed both — and each proves its own membership via its own path.

**3. OpenTimestamps.**

    ots verify <uuid>.canonical.json <uuid>.ots

This works for these batched records. The `.ots` starts at the record's own
`document_hash` and the inclusion path to the batch root is inside it as native OTS
operations (prepend/append + SHA256), so stock tooling proves the whole chain with nothing
GAMI-specific. On the `-stamped/` copies expect "pending".

**4. Bitcoin, fully offline.** `<uuid>.blockheader.hex` is the real 80-byte header:

    double-SHA256(header), byte-reversed        == bitcoin_evidence.block_hash
    header bytes 36..68, byte-reversed          == the merkle root the .ots folds to
    header bytes 68..72, little-endian uint32   == block time

Both members' proofs fold to the merkle root of block **965149**. Take the **lowest**
Bitcoin attestation in the tree, not the first — proofs routinely carry several. And
reverse the root: OTS carries it in Bitcoin's internal order, explorers print the opposite,
and unreversed they never match.

Prefer the header's own time over `submitted_at`. The first is the chain's clock; the
second is ours.

## Caveats

* `key_id` is `did:web:acre-ultimatum-repaying.ngrok-free.dev#key-1`, a **temporary
  tunnel**. While it is up you get real DID resolution and key authorization. When it is
  down, fall back to the embedded `proof.public_key_hex` and report the key as
  unauthenticated rather than failing the record — both paths are worth testing.
* Staging records. Cryptographically real — real YubiKey, real signature, real block — but
  not an archival record of anything.
