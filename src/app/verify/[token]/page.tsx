import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPublicVerification } from "@/server/evidence/evidence-service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "CIP Report Verification", robots: { index: false, follow: false } };

export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verification = await getPublicVerification(token);
  if (!verification) notFound();
  const manifest = verification.manifest as Record<string, unknown> | null;
  const valid = verification.status === "valid";
  return (
    <main className="evidence-paper min-h-screen px-4 py-12 text-foreground sm:py-20">
      <div className="mx-auto max-w-4xl">
      <div className="mb-10 flex items-start justify-between gap-4 border-b border-border pb-8">
        <div><div className="eyebrow text-primary">CIP Evidence Verification</div><h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{verification.reportTitle}</h1><p className="mt-3 font-mono text-xs text-muted-foreground">Issued {verification.issuedAt}</p></div>
        <Badge variant="outline" className={valid ? "border-success/30 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning"}>{verification.status.toUpperCase()}</Badge>
      </div>
      {!valid ? <Card><CardContent className="p-6 text-sm text-dim">This signed report was issued by CIP, but its public access is now {verification.status}. Its integrity metadata remains available below.</CardContent></Card> : null}
      {manifest ? <ManifestSummary manifest={manifest} /> : null}
      <Card className="mt-5"><CardHeader><CardTitle className="text-base">Integrity</CardTitle></CardHeader><CardContent className="space-y-2 font-mono text-xs text-dim"><p className="break-all">SHA-256: {verification.contentHash}</p><p>Algorithm: Ed25519</p><p>Key ID: {verification.keyId}</p><p>Method: {verification.methodVersion}</p><p>Expires: {verification.expiresAt}</p><p className="break-all">Signature: {verification.signature}</p></CardContent></Card>
      <p className="mt-6 text-xs leading-5 text-faint">A valid signature proves that this manifest has not changed since CIP issued it. It does not prove that a model answer or cited source is objectively true.</p>
      </div>
    </main>
  );
}

function ManifestSummary({ manifest }: { manifest: Record<string, unknown> }) {
  const subject = record(manifest.subject);
  const reliability = record(manifest.reliability);
  const metrics = record(manifest.metrics);
  const models = Array.isArray(manifest.models) ? manifest.models.filter((item): item is string => typeof item === "string") : [];
  const claims = Array.isArray(manifest.claims) ? manifest.claims.map(record) : [];
  return <div className="grid gap-5"><Card><CardHeader><CardTitle className="text-base">Scope</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3"><Fact label="Subject" value={String(subject.displayName ?? "—")} /><Fact label="Samples" value={String(manifest.sampleCount ?? 0)} /><Fact label="Evidence scope" value={String(reliability.scope ?? "insufficient")} /><Fact label="Models" value={models.join(", ") || "—"} /><Fact label="Generated" value={String(manifest.generatedAt ?? "—")} /><Fact label="Metric method" value={String(manifest.metricMethodVersion ?? "—")} /></CardContent></Card><Card><CardHeader><CardTitle className="text-base">Frozen metrics</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-3">{Object.entries(metrics).map(([key, value]) => <Fact key={key} label={key} value={typeof value === "number" ? String(value) : JSON.stringify(value)} />)}</CardContent></Card><Card><CardHeader><CardTitle className="text-base">Traceable claims</CardTitle></CardHeader><CardContent className="space-y-3">{claims.length ? claims.map((claim) => <div key={String(claim.id)} className="panel-inset p-3"><div className="flex flex-wrap gap-2 text-xs text-faint"><span>{String(claim.type)}</span><span>{String(claim.evidenceGrade)}</span><span>{String(claim.supportStatus)}</span></div><p className="mt-2 text-sm text-dim">{String(claim.statement)}</p></div>) : <p className="text-sm text-faint">No structured claims were attached.</p>}</CardContent></Card></div>;
}
function Fact({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-faint">{label}</div><div className="mt-1 font-mono text-sm">{value}</div></div>; }
function record(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
