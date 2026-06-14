"use client";

import { Loader2, Play, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { reloadCurrentPage } from "@/lib/client/reload";

export function CreateRunButton({
  projectId,
  disabled,
  disabledReason,
}: {
  projectId: string;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function createRun() {
    setError(null);
    setIsLoading(true);
    const response = await fetch(`/api/projects/${projectId}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runType: "baseline", sampleCountPerQuery: 1 }),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setIsLoading(false);
      setError(payload?.error ?? "Run could not be created.");
      return;
    }

    reloadCurrentPage();
  }

  return (
    <div className="space-y-2">
      <Button onClick={createRun} disabled={isLoading || disabled}>
        <span className="relative flex h-4 w-4 items-center justify-center">
          <Plus
            className={`absolute h-4 w-4 transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}
          />
          <Loader2
            className={`absolute h-4 w-4 transition-opacity ${isLoading ? "animate-spin opacity-100" : "opacity-0"}`}
          />
        </span>
        <span>Create baseline run</span>
      </Button>
      {disabled && disabledReason ? (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function ExecuteRunButton({
  runId,
  disabled,
  disabledReason,
}: {
  runId: string;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function executeRun() {
    setError(null);
    setIsLoading(true);
    const response = await fetch(`/api/runs/${runId}/execute`, { method: "POST" });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setIsLoading(false);
      setError(payload?.error ?? "Run execution failed.");
      return;
    }

    reloadCurrentPage();
  }

  return (
    <div className="space-y-2">
      <Button onClick={executeRun} disabled={isLoading || disabled} variant="secondary">
        <span className="relative flex h-4 w-4 items-center justify-center">
          <Play
            className={`absolute h-4 w-4 transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}
          />
          <Loader2
            className={`absolute h-4 w-4 transition-opacity ${isLoading ? "animate-spin opacity-100" : "opacity-0"}`}
          />
        </span>
        <span>Execute</span>
      </Button>
      {disabled && disabledReason ? (
        <p className="text-sm text-muted-foreground">{disabledReason}</p>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
