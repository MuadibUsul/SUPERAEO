"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { reloadCurrentPage } from "@/lib/client/reload";

export function SemanticJobAction({
  endpoint,
  label,
  disabled,
  latestJob,
  copy,
}: {
  endpoint: string;
  label: string;
  disabled?: boolean;
  latestJob?: {
    status: string;
    result?: unknown;
    error?: string | null;
  } | null;
  copy: {
    latestJob: string;
    latestStage: string;
  };
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setIsSubmitting(true);
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const payload = await response.json().catch(() => null);
    setIsSubmitting(false);

    if (!response.ok) {
      setError(payload?.error ?? "Request failed.");
      return;
    }

    reloadCurrentPage();
  }

  const result = latestJob?.result && typeof latestJob.result === "object" && !Array.isArray(latestJob.result)
    ? (latestJob.result as Record<string, unknown>)
    : {};

  return (
    <div className="space-y-2">
      <Button type="button" onClick={run} disabled={disabled || isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {label}
      </Button>
      {latestJob ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{copy.latestJob}</span>
          <Badge variant={latestJob.status === "failed" ? "destructive" : "secondary"}>{latestJob.status}</Badge>
          {typeof result.currentStage === "string" ? (
            <>
              <span>{copy.latestStage}</span>
              <Badge variant="outline">{result.currentStage}</Badge>
            </>
          ) : null}
        </div>
      ) : null}
      {latestJob?.error ? <p className="max-w-xl text-sm text-destructive">{latestJob.error}</p> : null}
      {error ? <p className="max-w-xl text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

