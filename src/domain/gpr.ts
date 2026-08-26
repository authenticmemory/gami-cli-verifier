export interface GprMerkleStep {
    hash: string;
    position: "left" | "right";
}
export interface GprTimestamp {
    type: string;
    document_hash: string;
    merkle_root?: string;
    merkle_path?: GprMerkleStep[];
    calendar?: string;
    submitted_at?: string;
    ots_data?: string;
    upgraded: boolean;
}
export interface GprProof {
    created: string;
    key_id: string;
    public_key_hex?: string;
    signature?: string;
    authenticator_data?: string;
    client_data_json?: string;
    timestamp?: GprTimestamp;
    batch_id?: string;
    merkle_root?: string;
    merkle_path?: GprMerkleStep[];
}
export interface Gpr {
    "@context": "https://authenticmemory.org/schema/v1";
    type: "gami-proof";
    schema: "v1";
    id: string;
    subject: { filename?: string; file_hash: string; metadata?: Record<string, string> };
    proof: GprProof;
    parent: string | null;
}
export interface ValidationIssue {
    path: string;
    message: string;
}
export type GprValidation =
    | { valid: true; value: Gpr; issues: [] }
    | { valid: false; issues: ValidationIssue[] };

const HEX_32 = /^[0-9a-f]{64}$/;
const SHA256 = /^sha256:[0-9a-f]{64}$/;
const SIGNATURE = /^(?:ed25519:)?[0-9a-f]{128}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const URN_UUID =
    /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(
    value: Record<string, unknown>,
    allowed: readonly string[],
    path: string,
    issues: ValidationIssue[],
): void {
    for (const key of Object.keys(value))
        if (!allowed.includes(key))
            issues.push({ path: `${path}.${key}`, message: "unknown field" });
}
function requiredString(
    value: Record<string, unknown>,
    key: string,
    path: string,
    issues: ValidationIssue[],
): string | undefined {
    const item = value[key];
    if (typeof item !== "string" || item.length === 0) {
        issues.push({ path: `${path}.${key}`, message: "must be a non-empty string" });
        return undefined;
    }
    return item;
}
function optionalString(
    value: Record<string, unknown>,
    key: string,
    path: string,
    issues: ValidationIssue[],
): string | undefined {
    const item = value[key];
    if (item === undefined) return undefined;
    if (typeof item !== "string" || item.length === 0) {
        issues.push({ path: `${path}.${key}`, message: "must be a non-empty string when present" });
        return undefined;
    }
    return item;
}
function checkPattern(
    value: string | undefined,
    pattern: RegExp,
    path: string,
    message: string,
    issues: ValidationIssue[],
): void {
    if (value !== undefined && !pattern.test(value)) issues.push({ path, message });
}
function validateMerklePath(value: unknown, path: string, issues: ValidationIssue[]): void {
    if (!Array.isArray(value)) {
        issues.push({ path, message: "must be an array" });
        return;
    }
    if (value.length > 128) issues.push({ path, message: "must contain at most 128 steps" });
    value.forEach((step, index) => {
        const stepPath = `${path}[${index}]`;
        if (!object(step)) {
            issues.push({ path: stepPath, message: "must be an object" });
            return;
        }
        exactKeys(step, ["hash", "position"], stepPath, issues);
        checkPattern(
            requiredString(step, "hash", stepPath, issues),
            HEX_32,
            `${stepPath}.hash`,
            "must be 64 lowercase hexadecimal characters",
            issues,
        );
        if (step.position !== "left" && step.position !== "right")
            issues.push({ path: `${stepPath}.position`, message: 'must be "left" or "right"' });
    });
}
function validateTimestamp(value: unknown, issues: ValidationIssue[]): void {
    const path = "$.proof.timestamp";
    if (!object(value)) {
        issues.push({ path, message: "must be an object" });
        return;
    }
    exactKeys(
        value,
        [
            "type",
            "document_hash",
            "merkle_root",
            "merkle_path",
            "calendar",
            "submitted_at",
            "ots_data",
            "upgraded",
        ],
        path,
        issues,
    );
    requiredString(value, "type", path, issues);
    checkPattern(
        requiredString(value, "document_hash", path, issues),
        SHA256,
        `${path}.document_hash`,
        "must use sha256:<64 lowercase hex> format",
        issues,
    );
    checkPattern(
        optionalString(value, "merkle_root", path, issues),
        HEX_32,
        `${path}.merkle_root`,
        "must be 64 lowercase hexadecimal characters",
        issues,
    );
    if (value.merkle_path !== undefined)
        validateMerklePath(value.merkle_path, `${path}.merkle_path`, issues);
    optionalString(value, "calendar", path, issues);
    const submittedAt = optionalString(value, "submitted_at", path, issues);
    if (submittedAt !== undefined && !Number.isFinite(Date.parse(submittedAt)))
        issues.push({ path: `${path}.submitted_at`, message: "must be an ISO-8601 timestamp" });
    checkPattern(
        optionalString(value, "ots_data", path, issues),
        BASE64,
        `${path}.ots_data`,
        "must be canonical base64",
        issues,
    );
    if (typeof value.upgraded !== "boolean")
        issues.push({ path: `${path}.upgraded`, message: "must be a boolean" });
}

export function validateGpr(value: unknown): GprValidation {
    const issues: ValidationIssue[] = [];
    if (!object(value))
        return { valid: false, issues: [{ path: "$", message: "must be a JSON object" }] };
    exactKeys(
        value,
        ["@context", "type", "schema", "id", "subject", "proof", "parent"],
        "$",
        issues,
    );
    if (value["@context"] !== "https://authenticmemory.org/schema/v1")
        issues.push({ path: "$.@context", message: "must be the supported GPR v1 context" });
    if (value.type !== "gami-proof")
        issues.push({ path: "$.type", message: 'must be "gami-proof"' });
    if (value.schema !== "v1")
        issues.push({ path: "$.schema", message: 'must be the supported schema "v1"' });
    checkPattern(
        requiredString(value, "id", "$", issues),
        URN_UUID,
        "$.id",
        "must be a UUID URN",
        issues,
    );
    if (value.parent !== null && (typeof value.parent !== "string" || !URN_UUID.test(value.parent)))
        issues.push({ path: "$.parent", message: "must be null or a UUID URN" });

    if (!object(value.subject)) issues.push({ path: "$.subject", message: "must be an object" });
    else {
        exactKeys(value.subject, ["filename", "file_hash", "metadata"], "$.subject", issues);
        optionalString(value.subject, "filename", "$.subject", issues);
        checkPattern(
            requiredString(value.subject, "file_hash", "$.subject", issues),
            SHA256,
            "$.subject.file_hash",
            "must use sha256:<64 lowercase hex> format",
            issues,
        );
        if (value.subject.metadata !== undefined) {
            if (!object(value.subject.metadata))
                issues.push({
                    path: "$.subject.metadata",
                    message: "must be an object of string values",
                });
            else
                for (const [key, item] of Object.entries(value.subject.metadata))
                    if (typeof item !== "string")
                        issues.push({
                            path: `$.subject.metadata.${key}`,
                            message: "must be a string",
                        });
        }
    }

    if (!object(value.proof)) issues.push({ path: "$.proof", message: "must be an object" });
    else {
        const proof = value.proof;
        exactKeys(
            proof,
            [
                "created",
                "key_id",
                "public_key_hex",
                "signature",
                "authenticator_data",
                "client_data_json",
                "timestamp",
                "batch_id",
                "merkle_root",
                "merkle_path",
            ],
            "$.proof",
            issues,
        );
        const created = requiredString(proof, "created", "$.proof", issues);
        if (created !== undefined && !Number.isFinite(Date.parse(created)))
            issues.push({ path: "$.proof.created", message: "must be an ISO-8601 timestamp" });
        const keyId = requiredString(proof, "key_id", "$.proof", issues);
        if (keyId !== undefined && (!keyId.startsWith("did:web:") || !keyId.includes("#")))
            issues.push({
                path: "$.proof.key_id",
                message: "must be a did:web verification-method identifier",
            });
        checkPattern(
            optionalString(proof, "public_key_hex", "$.proof", issues),
            HEX_32,
            "$.proof.public_key_hex",
            "must be 64 lowercase hexadecimal characters",
            issues,
        );
        checkPattern(
            optionalString(proof, "signature", "$.proof", issues),
            SIGNATURE,
            "$.proof.signature",
            "must be an Ed25519 signature encoded as 128 lowercase hex characters",
            issues,
        );
        const authData = optionalString(proof, "authenticator_data", "$.proof", issues);
        const clientData = optionalString(proof, "client_data_json", "$.proof", issues);
        checkPattern(
            authData,
            BASE64,
            "$.proof.authenticator_data",
            "must be canonical base64",
            issues,
        );
        checkPattern(
            clientData,
            BASE64,
            "$.proof.client_data_json",
            "must be canonical base64",
            issues,
        );
        if ((authData === undefined) !== (clientData === undefined))
            issues.push({
                path: "$.proof",
                message: "authenticator_data and client_data_json must appear together",
            });
        optionalString(proof, "batch_id", "$.proof", issues);
        checkPattern(
            optionalString(proof, "merkle_root", "$.proof", issues),
            HEX_32,
            "$.proof.merkle_root",
            "must be 64 lowercase hexadecimal characters",
            issues,
        );
        if (proof.merkle_path !== undefined)
            validateMerklePath(proof.merkle_path, "$.proof.merkle_path", issues);
        if (proof.timestamp !== undefined) validateTimestamp(proof.timestamp, issues);
    }
    if (issues.length > 0) return { valid: false, issues };
    return { valid: true, value: value as unknown as Gpr, issues: [] };
}
