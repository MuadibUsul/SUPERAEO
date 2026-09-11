import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { EvidenceSourceClass, SourceVerificationStatus } from "@/generated/prisma/client";
import { storeObjectArtifact } from "@/server/external/object-storage";
import { getPrisma } from "@/server/db";

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 10_000;

export async function assertSafeSourceUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("unsafe_protocol");
  if (url.username || url.password) throw new Error("url_credentials_not_allowed");
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("unsafe_address");
  return url;
}

export function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const ipv4 = mapped ?? (isIP(normalized) === 4 ? normalized : null);
  if (!ipv4) return false;
  const [a, b] = ipv4.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export function classifySource(url: URL, subjectDomain?: string | null): EvidenceSourceClass {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const subject = subjectDomain?.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  if (subject && (host === subject || host.endsWith(`.${subject}`))) return "SUBJECT_OFFICIAL";
  if (/\.(gov|gov\.cn|mil)$/.test(host) || /(^|\.)(iso|w3|ietf)\.org$/.test(host)) return "GOVERNMENT_STANDARD";
  if (/\.(edu|ac\.[a-z]{2})$/.test(host) || /(^|\.)(doi|arxiv|pubmed)\./.test(host)) return "ACADEMIC";
  if (/(reddit|stackoverflow|zhihu|quora)\./.test(host)) return "COMMUNITY";
  if (/(reuters|apnews|bbc|nytimes|theguardian|ft|bloomberg|caixin|xinhuanet)\./.test(host)) return "PROFESSIONAL_MEDIA";
  if (/\.(com|io|ai|co)$/.test(host)) return "COMMERCIAL";
  return "UNKNOWN";
}

export async function verifyCitationSource(input: { projectId: string; citationSourceId: string; url: string; subjectDomain?: string | null }) {
  const prisma = getPrisma();
  let status: SourceVerificationStatus = "PENDING";
  let normalizedUrl = input.url;
  try {
    let url = await assertSafeSourceUrl(input.url);
    normalizedUrl = url.toString();
    if (await robotsDisallows(url)) {
      return prisma.sourceSnapshot.create({ data: { projectId: input.projectId, citationSourceId: input.citationSourceId, normalizedUrl, fetchedAt: new Date(), verificationStatus: "BLOCKED_BY_ROBOTS", sourceClass: classifySource(url, input.subjectDomain) } });
    }
    let response: Response | null = null;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        await assertSafeSourceUrl(url.toString());
        response = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "CIPSourceVerifier/1.0", Accept: "text/html,text/plain;q=0.9" } });
      } finally { clearTimeout(timer); }
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("redirect_limit");
      url = await assertSafeSourceUrl(new URL(location, url).toString());
      normalizedUrl = url.toString();
    }
    if (!response) throw new Error("fetch_failed");
    await assertSafeSourceUrl(normalizedUrl);
    if (response.status === 401 || response.status === 403) status = "LOGIN_REQUIRED";
    else if (!response.ok) status = "UNREACHABLE";
    else if (!/text\/html|application\/xhtml|text\/plain/i.test(response.headers.get("content-type") ?? "")) status = "FETCH_FAILED";
    else {
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES) throw new Error("response_too_large");
      const body = await readCapped(response);
      const hash = createHash("sha256").update(body).digest("hex");
      const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 500) ?? null;
      const excerpt = body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 1000);
      const prior = await prisma.sourceSnapshot.findFirst({ where: { citationSourceId: input.citationSourceId, contentHash: { not: null } }, orderBy: { createdAt: "desc" } });
      const artifact = await storeObjectArtifact({ projectId: input.projectId, artifactType: "crawl_snapshot", objectKey: `source-snapshots/${input.projectId}/${input.citationSourceId}-${Date.now()}.html`, body, contentType: response.headers.get("content-type") ?? "text/html" });
      status = prior?.contentHash && prior.contentHash !== hash ? "CONTENT_CHANGED" : artifact ? "SNAPSHOT_CREATED" : "VERIFIED_REACHABLE";
      return prisma.sourceSnapshot.create({ data: { projectId: input.projectId, citationSourceId: input.citationSourceId, objectArtifactId: artifact?.id, normalizedUrl, fetchedAt: new Date(), httpStatus: response.status, title, excerpt, contentHash: hash, verificationStatus: status, sourceClass: classifySource(url, input.subjectDomain), metadata: { snapshotStored: Boolean(artifact), automatedAssessment: true } } });
    }
    return prisma.sourceSnapshot.create({ data: { projectId: input.projectId, citationSourceId: input.citationSourceId, normalizedUrl, fetchedAt: new Date(), httpStatus: response.status, verificationStatus: status, sourceClass: classifySource(new URL(normalizedUrl), input.subjectDomain) } });
  } catch (error) {
    status = error instanceof Error && /unsafe_|credentials/.test(error.message) ? "UNSAFE_URL" : "FETCH_FAILED";
    return prisma.sourceSnapshot.create({ data: { projectId: input.projectId, citationSourceId: input.citationSourceId, normalizedUrl, fetchedAt: new Date(), verificationStatus: status, metadata: { error: error instanceof Error ? error.message : "fetch_failed" } } });
  }
}

async function robotsDisallows(url: URL) {
  const robotsUrl = new URL("/robots.txt", url.origin);
  await assertSafeSourceUrl(robotsUrl.toString());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(robotsUrl, { redirect: "manual", signal: controller.signal, headers: { "User-Agent": "CIPSourceVerifier/1.0", Accept: "text/plain" } });
    if (!response.ok) return false;
    const body = (await response.text()).slice(0, 200_000);
    let applies = false;
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      const [field, ...rest] = line.split(":");
      const entry = rest.join(":").trim();
      if (field?.trim().toLowerCase() === "user-agent") applies = entry === "*" || entry.toLowerCase().includes("cipsourceverifier");
      if (applies && field?.trim().toLowerCase() === "disallow" && entry && (entry === "/" || url.pathname.startsWith(entry))) return true;
    }
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return (await response.text()).slice(0, MAX_BYTES);
  const decoder = new TextDecoder();
  let output = "";
  let bytes = 0;
  while (bytes < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (bytes + value.byteLength > MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new Error("response_too_large");
    }
    bytes += value.byteLength;
    output += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return output + decoder.decode();
}
