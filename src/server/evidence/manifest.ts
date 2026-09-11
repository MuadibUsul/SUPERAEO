import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from "node:crypto";

export const EVIDENCE_METHOD_VERSION = "2026-09-09.evidence.v1";
export const METRIC_METHOD_VERSION = "2026-09-09.metrics.v1";
export const DEFAULT_SHARE_DAYS = 30;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortValue(item)]),
    );
  }
  return value;
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashShareToken(token: string) {
  return sha256(token);
}

export function createShareToken() {
  return randomBytes(32).toString("base64url");
}

export function signingConfigured() {
  return Boolean(process.env.REPORT_SIGNING_PRIVATE_KEY && process.env.REPORT_SIGNING_KEY_ID);
}

function pem(value: string) {
  return value.replace(/\\n/g, "\n");
}

export function signManifest(value: unknown) {
  const privateKeyValue = process.env.REPORT_SIGNING_PRIVATE_KEY;
  const keyId = process.env.REPORT_SIGNING_KEY_ID;
  if (!privateKeyValue || !keyId) throw new Error("Report signing is not configured.");
  const canonical = canonicalJson(value);
  const privateKey = createPrivateKey(pem(privateKeyValue));
  return {
    canonical,
    contentHash: sha256(canonical),
    signature: sign(null, Buffer.from(canonical), privateKey).toString("base64url"),
    keyId,
    publicKey: createPublicKey(privateKey).export({ type: "spki", format: "pem" }).toString(),
  };
}

export function publicSigningKey(keyId = process.env.REPORT_SIGNING_KEY_ID) {
  const privateKeyValue = process.env.REPORT_SIGNING_PRIVATE_KEY;
  if (privateKeyValue && keyId === process.env.REPORT_SIGNING_KEY_ID) return createPublicKey(createPrivateKey(pem(privateKeyValue))).export({ type: "spki", format: "pem" }).toString();
  try {
    const keys = JSON.parse(process.env.REPORT_SIGNING_PUBLIC_KEYS ?? "{}") as Record<string, unknown>;
    return keyId && typeof keys[keyId] === "string" ? pem(keys[keyId] as string) : null;
  } catch { return null; }
}

export function verifyManifest(value: unknown, signature: string, publicKey: string) {
  return verify(null, Buffer.from(canonicalJson(value)), createPublicKey(publicKey), Buffer.from(signature, "base64url"));
}

export function publicReportProjection(snapshot: unknown) {
  const record = asRecord(snapshot);
  const metrics = asRecord(record.metrics);
  const metricValues = asRecord(metrics.metrics);
  const reliability = asRecord(metrics.reliability);
  const subject = asRecord(record.subject);
  const responses = Array.isArray(record.responses) ? record.responses : [];
  return {
    schemaVersion: "evidence-manifest.v1",
    methodVersion: EVIDENCE_METHOD_VERSION,
    metricMethodVersion: METRIC_METHOD_VERSION,
    generatedAt: stringValue(record.generatedAt),
    subject: { displayName: stringValue(subject.displayName) || stringValue(record.subjectName), entityType: stringValue(subject.entityType) },
    runId: stringValue(metrics.runId),
    sampleCount: numberValue(metrics.sampleCount),
    reliability: {
      sufficient: reliability.sufficient === true,
      minSamples: numberValue(reliability.minSamples, 20),
      scope: reliability.sufficient === true ? "corroborated" : "insufficient",
    },
    metrics: metricValues,
    confidence: asRecord(metrics.confidence),
    models: [...new Set(responses.map((item) => stringValue(asRecord(item).model)).filter(Boolean))],
    evidence: responses.slice(0, 12).map((item) => {
      const response = asRecord(item);
      return {
        id: stringValue(response.id),
        question: stringValue(response.queryText).slice(0, 500),
        excerpt: stringValue(response.normalizedAnswer).slice(0, 500),
        provider: stringValue(response.providerName) || stringValue(response.platform),
        model: stringValue(response.model),
        createdAt: stringValue(response.createdAt),
        responseHash: stringValue(response.responseHash),
      };
    }),
    limitations: [
      "This report describes sampled model outputs, not hidden model state or objective truth.",
      "Reachable citations and machine-assessed support do not independently prove factual correctness.",
    ],
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown, fallback = 0) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
