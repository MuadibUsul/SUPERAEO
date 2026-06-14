"use client";

import { CheckCircle2, Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { reloadCurrentPage } from "@/lib/client/reload";

export type GenerateProgressStep = {
  key: string;
  label: string;
  detail: string;
  startAt: number;
};

const defaultProgressSteps: GenerateProgressStep[] = [
  {
    key: "prepare",
    label: "Preparing request",
    detail: "Collecting project context and assembling the prompt.",
    startAt: 0,
  },
  {
    key: "generate",
    label: "Waiting for the model",
    detail: "The provider is generating structured output.",
    startAt: 3,
  },
  {
    key: "validate",
    label: "Validating JSON",
    detail: "The result is checked against the schema before any write happens.",
    startAt: 9,
  },
  {
    key: "repair",
    label: "Repairing if needed",
    detail: "If the JSON is malformed, one repair pass may add a few more seconds.",
    startAt: 13,
  },
  {
    key: "persist",
    label: "Writing results",
    detail: "Validated output is being saved to the database.",
    startAt: 17,
  },
];

export function GenerateAction({
  endpoint,
  label,
  body,
  disabled,
  disabledReason,
  progressTitle,
  progressDescription,
  progressSteps = defaultProgressSteps,
  estimatedSeconds = 20,
  estimatedNote,
  delayedNote,
}: {
  endpoint: string;
  label: string;
  body?: Record<string, unknown>;
  disabled?: boolean;
  disabledReason?: string | null;
  progressTitle?: string;
  progressDescription?: string;
  progressSteps?: GenerateProgressStep[];
  estimatedSeconds?: number;
  estimatedNote?: string;
  delayedNote?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isFinishing, setIsFinishing] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds((Date.now() - startedAt) / 1000);
    }, 250);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  const activeStepIndex = useMemo(() => {
    const index = progressSteps.findLastIndex((step) => elapsedSeconds >= step.startAt);
    return index === -1 ? 0 : Math.min(index, progressSteps.length - 1);
  }, [elapsedSeconds, progressSteps]);

  const estimatedRemaining = Math.max(0, Math.ceil(estimatedSeconds - elapsedSeconds));
  const exceededEstimate = elapsedSeconds > estimatedSeconds + 3;
  const progressValue = useMemo(() => {
    if (isFinishing) {
      return 100;
    }

    const base = Math.min(elapsedSeconds / estimatedSeconds, 0.92);
    return Math.max(8, Math.round(base * 100));
  }, [elapsedSeconds, estimatedSeconds, isFinishing]);

  async function run() {
    setError(null);
    setElapsedSeconds(0);
    setIsLoading(true);
    setIsFinishing(false);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setIsLoading(false);
      setError(payload?.error ?? "Request failed.");
      return;
    }

    setIsFinishing(true);
    window.setTimeout(() => reloadCurrentPage(), 250);
  }

  return (
    <div className="space-y-2">
      <Button onClick={run} disabled={isLoading || disabled}>
        <span className="relative flex h-4 w-4 items-center justify-center">
          <Play
            className={`absolute h-4 w-4 transition-opacity ${isLoading ? "opacity-0" : "opacity-100"}`}
          />
          <Loader2
            className={`absolute h-4 w-4 transition-opacity ${isLoading ? "animate-spin opacity-100" : "opacity-0"}`}
          />
        </span>
        <span>{label}</span>
      </Button>
      {disabled && disabledReason ? (
        <p className="max-w-xl text-sm text-muted-foreground">{disabledReason}</p>
      ) : null}
      {error ? <p className="max-w-xl text-sm text-destructive">{error}</p> : null}
      <div
        className={`max-w-xl overflow-hidden rounded-2xl border bg-background/60 transition-all duration-200 ${
          isLoading
            ? "max-h-[32rem] border-border/70 p-4 opacity-100"
            : "max-h-0 border-transparent p-0 opacity-0"
        }`}
        aria-hidden={!isLoading}
      >
        {isLoading ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium">
                  {progressTitle ?? "Generation in progress"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {progressDescription ??
                    "You can watch each step while the system prepares, validates, and stores the output."}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <div>{elapsedSeconds.toFixed(1)}s elapsed</div>
                <div>
                  {estimatedRemaining > 0
                    ? `~${estimatedRemaining}s remaining`
                    : "Finishing validation"}
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-xl border border-border/60 bg-background/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {estimatedNote ??
                "This progress view is an estimated workflow path, not a live backend stage feed."}{" "}
              {exceededEstimate
                ? delayedNote ??
                  "When it lingers near the final step, the usual cause is slower model generation or a JSON repair pass, not the database write itself."
                : "Database writes for this step are usually quick; most waiting time comes from the provider response and JSON validation."}
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${progressValue}%` }}
              />
            </div>
            <div className="mt-4 space-y-3">
              {progressSteps.map((step, index) => {
                const isDone = index < activeStepIndex || (isFinishing && index <= activeStepIndex);
                const isActive = index === activeStepIndex && !isFinishing;

                return (
                  <div key={step.key} className="flex gap-3">
                    <div className="mt-0.5 flex h-5 w-5 items-center justify-center">
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : isActive ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      ) : (
                        <div className="h-2.5 w-2.5 rounded-full border border-border bg-transparent" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{step.label}</p>
                      <p className="text-xs leading-5 text-muted-foreground">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
