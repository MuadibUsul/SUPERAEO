"use client";

import { Printer, Share2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ReportActions({ projectId, reportId, exportLabel, shareLabel, copiedLabel }: { projectId: string; reportId?: string; exportLabel: string; shareLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    if (!reportId) return;
    try {
      setError(null);
      const response = await fetch(`/api/projects/${projectId}/reports/${reportId}/shares`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ days: 30 }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to create a signed share link.");
      await navigator.clipboard.writeText(new URL(payload.url, window.location.origin).toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (caught) {
      setCopied(false);
      setError(caught instanceof Error ? caught.message : "Unable to share report.");
    }
  }

  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button type="button" variant="outline" size="sm" onClick={share} disabled={!reportId}>
        <Share2 className="h-4 w-4" />
        {copied ? copiedLabel : shareLabel}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
        <Printer className="h-4 w-4" />
        {exportLabel}
      </Button>
      {error ? <span className="basis-full text-xs text-danger">{error}</span> : null}
    </div>
  );
}
